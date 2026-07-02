from __future__ import annotations

import json
from datetime import datetime

from Backend.extensions import db


class CrawlTask(db.Model):
    __tablename__ = "crawl_tasks"
    __table_args__ = (
        db.Index("idx_crawl_task_status", "status"),
        db.Index("idx_crawl_task_source", "source"),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(128), nullable=False)
    source = db.Column(db.String(32), nullable=False)
    mode = db.Column(db.String(32), nullable=False, default="manual")
    districts_json = db.Column(db.Text, nullable=False, default="[]")
    max_pages = db.Column(db.Integer, nullable=False, default=1)
    max_workers = db.Column(db.Integer, nullable=False, default=3)
    status = db.Column(db.String(32), nullable=False, default="pending")
    total_pages = db.Column(db.Integer, nullable=False, default=0)
    success_pages = db.Column(db.Integer, nullable=False, default=0)
    failed_pages = db.Column(db.Integer, nullable=False, default=0)
    total_found = db.Column(db.Integer, nullable=False, default=0)
    inserted_count = db.Column(db.Integer, nullable=False, default=0)
    updated_count = db.Column(db.Integer, nullable=False, default=0)
    unchanged_count = db.Column(db.Integer, nullable=False, default=0)
    snapshot_count = db.Column(db.Integer, nullable=False, default=0)
    run_id = db.Column(db.String(64))
    evidence_json = db.Column(db.Text)
    error_message = db.Column(db.Text)
    started_at = db.Column(db.DateTime)
    finished_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    logs = db.relationship("CrawlLog", back_populates="task", cascade="all, delete-orphan", order_by="CrawlLog.created_at.desc()")

    @property
    def districts(self) -> list[str]:
        try:
            value = json.loads(self.districts_json or "[]")
            return value if isinstance(value, list) else []
        except json.JSONDecodeError:
            return []

    def set_districts(self, districts: list[str]) -> None:
        self.districts_json = json.dumps(districts, ensure_ascii=False)

    @property
    def progress(self) -> int:
        if self.total_pages <= 0:
            return 0 if self.status in {"pending", "failed"} else 100
        done = self.success_pages + self.failed_pages
        return min(100, int(done / self.total_pages * 100))

    @property
    def duration_seconds(self) -> float | None:
        if not self.started_at:
            return None
        end = self.finished_at or datetime.utcnow()
        return round(max(0.0, (end - self.started_at).total_seconds()), 2)

    @property
    def listings_per_minute(self) -> float | None:
        duration = self.duration_seconds
        if not duration:
            return None
        return round(self.total_found / duration * 60, 2)

    @property
    def pages_per_minute(self) -> float | None:
        duration = self.duration_seconds
        if not duration:
            return None
        done = self.success_pages + self.failed_pages
        return round(done / duration * 60, 2)

    @property
    def evidence(self) -> dict:
        try:
            value = json.loads(self.evidence_json or "{}")
            return value if isinstance(value, dict) else {}
        except json.JSONDecodeError:
            return {}

    def set_evidence(self, evidence: dict | None) -> None:
        self.evidence_json = json.dumps(evidence or {}, ensure_ascii=False)

    def _fallback_recent_logs(self, limit: int = 8) -> list[dict]:
        rows = (
            CrawlLog.query.filter_by(task_id=self.id)
            .order_by(CrawlLog.created_at.desc(), CrawlLog.id.desc())
            .limit(limit)
            .all()
        )
        return [item.to_dict() for item in reversed(rows)]

    def _fallback_log_summary(self) -> str:
        return (
            f"任务状态 {self.status}；采集房源 {int(self.total_found or 0)}，"
            f"新增 {int(self.inserted_count or 0)}，价格变化 {int(self.updated_count or 0)}，"
            f"未变 {int(self.unchanged_count or 0)}，新增快照 {int(self.snapshot_count or 0)}，"
            f"失败页 {int(self.failed_pages or 0)}。"
        )

    def evidence_with_fallback(self) -> dict:
        data = dict(self.evidence)
        computed_snapshot_count = max(int(self.snapshot_count or 0), int(data.get("new_snapshot_count") or 0))
        if self.run_id and not data.get("run_id"):
            data["run_id"] = self.run_id
        if self.started_at and not data.get("started_at"):
            data["started_at"] = self.started_at.isoformat(sep=" ")
        if self.finished_at and not data.get("finished_at"):
            data["finished_at"] = self.finished_at.isoformat(sep=" ")
        data.setdefault("inserted_count", int(self.inserted_count or 0))
        data.setdefault("updated_count", int(self.updated_count or 0))
        data.setdefault("unchanged_count", int(self.unchanged_count or 0))
        data["new_snapshot_count"] = computed_snapshot_count
        data.setdefault("failed_pages", int(self.failed_pages or 0))
        data.setdefault("total_found", int(self.total_found or 0))
        if not data.get("log_summary"):
            data["log_summary"] = self._fallback_log_summary()
        if not data.get("recent_logs"):
            data["recent_logs"] = self._fallback_recent_logs()
        return data

    @property
    def failure_rate(self) -> float:
        if self.total_pages <= 0:
            return 0.0
        return round(self.failed_pages / self.total_pages, 4)

    def to_dict(self, include_logs: bool = False) -> dict:
        evidence = self.evidence_with_fallback()
        snapshot_count = max(int(self.snapshot_count or 0), int(evidence.get("new_snapshot_count") or 0))
        data = {
            "id": self.id,
            "name": self.name,
            "source": self.source,
            "mode": self.mode,
            "districts": self.districts,
            "max_pages": self.max_pages,
            "max_workers": self.max_workers,
            "status": self.status,
            "total_pages": self.total_pages,
            "success_pages": self.success_pages,
            "failed_pages": self.failed_pages,
            "total_found": self.total_found,
            "inserted_count": self.inserted_count,
            "updated_count": self.updated_count,
            "unchanged_count": self.unchanged_count,
            "snapshot_count": snapshot_count,
            "run_id": self.run_id,
            "evidence": evidence,
            "progress": self.progress,
            "duration_seconds": self.duration_seconds,
            "listings_per_minute": self.listings_per_minute,
            "pages_per_minute": self.pages_per_minute,
            "failure_rate": self.failure_rate,
            "error_message": self.error_message,
            "started_at": self.started_at.isoformat(sep=" ") if self.started_at else None,
            "finished_at": self.finished_at.isoformat(sep=" ") if self.finished_at else None,
            "created_at": self.created_at.isoformat(sep=" ") if self.created_at else None,
            "updated_at": self.updated_at.isoformat(sep=" ") if self.updated_at else None,
        }
        if include_logs:
            data["logs"] = [log.to_dict() for log in self.logs[:100]]
        return data


class CrawlLog(db.Model):
    __tablename__ = "crawl_logs"
    __table_args__ = (db.Index("idx_crawl_log_task_time", "task_id", "created_at"),)

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    task_id = db.Column(db.Integer, db.ForeignKey("crawl_tasks.id"), nullable=False)
    level = db.Column(db.String(16), nullable=False, default="INFO")
    message = db.Column(db.Text, nullable=False)
    url = db.Column(db.String(512))
    district = db.Column(db.String(64))
    page = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    task = db.relationship("CrawlTask", back_populates="logs")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "task_id": self.task_id,
            "level": self.level,
            "message": self.message,
            "url": self.url,
            "district": self.district,
            "page": self.page,
            "created_at": self.created_at.isoformat(sep=" ") if self.created_at else None,
        }

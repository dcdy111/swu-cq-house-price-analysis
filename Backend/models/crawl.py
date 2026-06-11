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

    def to_dict(self, include_logs: bool = False) -> dict:
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
            "snapshot_count": self.snapshot_count,
            "progress": self.progress,
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

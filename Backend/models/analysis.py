from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.dialects.mysql import LONGTEXT

from Backend.extensions import db


def _loads_json(text: str | None, default: Any):
    if not text:
        return default
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return default


class AnalysisJob(db.Model):
    __tablename__ = "analysis_jobs"
    __table_args__ = (
        db.Index("idx_analysis_job_status", "status"),
        db.Index("idx_analysis_job_type", "job_type"),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(128))
    job_type = db.Column(db.String(32), nullable=False, default="all")
    status = db.Column(db.String(32), nullable=False, default="pending")
    sample_count = db.Column(db.Integer, nullable=False, default=0)
    train_count = db.Column(db.Integer, nullable=False, default=0)
    test_count = db.Column(db.Integer, nullable=False, default=0)
    error_message = db.Column(db.Text)
    started_at = db.Column(db.DateTime)
    finished_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    results = db.relationship(
        "ModelResult",
        back_populates="job",
        cascade="all, delete-orphan",
        order_by="ModelResult.id.asc()",
    )

    def to_dict(self, include_results: bool = True) -> dict:
        data = {
            "id": self.id,
            "name": self.display_name,
            "job_type": self.job_type,
            "status": self.status,
            "sample_count": self.sample_count,
            "train_count": self.train_count,
            "test_count": self.test_count,
            "error_message": self.error_message,
            "started_at": self.started_at.isoformat(sep=" ") if self.started_at else None,
            "finished_at": self.finished_at.isoformat(sep=" ") if self.finished_at else None,
            "created_at": self.created_at.isoformat(sep=" ") if self.created_at else None,
            "updated_at": self.updated_at.isoformat(sep=" ") if self.updated_at else None,
        }
        if include_results:
            data["results"] = [result.to_dict() for result in self.results]
        return data

    @property
    def display_name(self) -> str:
        if self.name:
            return self.name
        labels = {
            "all": "全量分析",
            "eda": "EDA 探索",
            "regression": "挂牌价回归",
            "tune": "参数搜索",
            "cluster": "价值分层",
            "anomaly": "异常检测",
        }
        return labels.get(self.job_type, self.job_type or "分析任务")


class ModelResult(db.Model):
    __tablename__ = "model_results"
    __table_args__ = (
        db.Index("idx_model_result_job_type", "job_id", "result_type"),
        db.Index("idx_model_result_type", "result_type"),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    job_id = db.Column(db.Integer, db.ForeignKey("analysis_jobs.id"), nullable=False)
    result_type = db.Column(db.String(32), nullable=False)
    model_name = db.Column(db.String(128), nullable=False)
    summary = db.Column(db.Text)
    metrics_json = db.Column(db.Text)
    artifacts_json = db.Column(db.Text().with_variant(LONGTEXT, "mysql"))
    evidence_json = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    job = db.relationship("AnalysisJob", back_populates="results")

    @property
    def metrics(self) -> dict:
        return _loads_json(self.metrics_json, {})

    @property
    def artifacts(self) -> dict:
        return _loads_json(self.artifacts_json, {})

    @property
    def evidence(self) -> dict:
        return _loads_json(self.evidence_json, {})

    def set_payloads(self, metrics: dict | None = None, artifacts: dict | None = None, evidence: dict | None = None) -> None:
        self.metrics_json = json.dumps(metrics or {}, ensure_ascii=False)
        self.artifacts_json = json.dumps(artifacts or {}, ensure_ascii=False)
        self.evidence_json = json.dumps(evidence or {}, ensure_ascii=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "job_id": self.job_id,
            "result_type": self.result_type,
            "model_name": self.model_name,
            "summary": self.summary,
            "metrics": self.metrics,
            "artifacts": self.artifacts,
            "evidence": self.evidence,
            "created_at": self.created_at.isoformat(sep=" ") if self.created_at else None,
        }

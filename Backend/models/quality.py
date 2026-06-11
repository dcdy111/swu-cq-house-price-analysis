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


class DataQualityReport(db.Model):
    __tablename__ = "data_quality_reports"
    __table_args__ = (
        db.Index("idx_quality_report_created", "created_at"),
        db.Index("idx_quality_report_type", "report_type"),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    report_type = db.Column(db.String(32), nullable=False, default="daily")
    total_count = db.Column(db.Integer, nullable=False, default=0)
    valid_count = db.Column(db.Integer, nullable=False, default=0)
    analysis_ready_count = db.Column(db.Integer, nullable=False, default=0)
    avg_quality = db.Column(db.Float, nullable=False, default=0)
    missing_count = db.Column(db.Integer, nullable=False, default=0)
    extreme_count = db.Column(db.Integer, nullable=False, default=0)
    low_quality_count = db.Column(db.Integer, nullable=False, default=0)
    snapshot_count = db.Column(db.Integer, nullable=False, default=0)
    summary_json = db.Column(db.Text().with_variant(LONGTEXT, "mysql"))
    detail_json = db.Column(db.Text().with_variant(LONGTEXT, "mysql"))
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    @property
    def summary(self) -> dict:
        return _loads_json(self.summary_json, {})

    @property
    def detail(self) -> dict:
        return _loads_json(self.detail_json, {})

    def set_payloads(self, summary: dict | None = None, detail: dict | None = None) -> None:
        self.summary_json = json.dumps(summary or {}, ensure_ascii=False)
        self.detail_json = json.dumps(detail or {}, ensure_ascii=False)

    def to_dict(self, include_detail: bool = True) -> dict:
        data = {
            "id": self.id,
            "report_type": self.report_type,
            "total_count": self.total_count,
            "valid_count": self.valid_count,
            "analysis_ready_count": self.analysis_ready_count,
            "avg_quality": self.avg_quality,
            "missing_count": self.missing_count,
            "extreme_count": self.extreme_count,
            "low_quality_count": self.low_quality_count,
            "snapshot_count": self.snapshot_count,
            "summary": self.summary,
            "created_at": self.created_at.isoformat(sep=" ") if self.created_at else None,
        }
        if include_detail:
            data["detail"] = self.detail
        return data

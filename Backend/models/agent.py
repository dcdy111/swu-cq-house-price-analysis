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


class AgentToolCall(db.Model):
    __tablename__ = "agent_tool_calls"
    __table_args__ = (
        db.Index("idx_agent_tool_call_session", "session_id"),
        db.Index("idx_agent_tool_call_name", "tool_name"),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    session_id = db.Column(db.String(64), nullable=False)
    question = db.Column(db.Text, nullable=False)
    tool_name = db.Column(db.String(64), nullable=False)
    tool_args_json = db.Column(db.Text().with_variant(LONGTEXT, "mysql"))
    tool_result_json = db.Column(db.Text().with_variant(LONGTEXT, "mysql"))
    status = db.Column(db.String(16), nullable=False, default="success")
    duration_ms = db.Column(db.Integer, nullable=False, default=0)
    error_message = db.Column(db.Text)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    @property
    def tool_args(self) -> dict:
        return _loads_json(self.tool_args_json, {})

    @property
    def tool_result(self) -> dict:
        return _loads_json(self.tool_result_json, {})

    def set_payloads(self, tool_args: dict | None = None, tool_result: dict | None = None) -> None:
        self.tool_args_json = json.dumps(tool_args or {}, ensure_ascii=False)
        self.tool_result_json = json.dumps(tool_result or {}, ensure_ascii=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "question": self.question,
            "tool_name": self.tool_name,
            "tool_args": self.tool_args,
            "tool_result": self.tool_result,
            "status": self.status,
            "duration_ms": self.duration_ms,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat(sep=" ") if self.created_at else None,
        }


class GeneratedReport(db.Model):
    __tablename__ = "generated_reports"
    __table_args__ = (db.Index("idx_generated_report_session", "session_id"),)

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    session_id = db.Column(db.String(64), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    question = db.Column(db.Text, nullable=False)
    content = db.Column(db.Text().with_variant(LONGTEXT, "mysql"), nullable=False)
    evidence_json = db.Column(db.Text().with_variant(LONGTEXT, "mysql"))
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    @property
    def evidence(self) -> dict:
        return _loads_json(self.evidence_json, {})

    def set_evidence(self, evidence: dict | None) -> None:
        self.evidence_json = json.dumps(evidence or {}, ensure_ascii=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "session_id": self.session_id,
            "title": self.title,
            "question": self.question,
            "content": self.content,
            "evidence": self.evidence,
            "created_at": self.created_at.isoformat(sep=" ") if self.created_at else None,
        }

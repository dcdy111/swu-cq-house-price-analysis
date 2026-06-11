from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.dialects.mysql import LONGTEXT

from Backend.extensions import db


class SystemSetting(db.Model):
    __tablename__ = "system_settings"
    __table_args__ = (db.UniqueConstraint("setting_key", name="uq_system_setting_key"),)

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    setting_key = db.Column(db.String(128), nullable=False)
    value_json = db.Column(db.Text().with_variant(LONGTEXT, "mysql"))
    is_secret = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def value(self) -> Any:
        if not self.value_json:
            return None
        try:
            return json.loads(self.value_json)
        except json.JSONDecodeError:
            return None

    def set_value(self, value: Any) -> None:
        self.value_json = json.dumps(value, ensure_ascii=False)

    def to_dict(self, include_secret: bool = False) -> dict:
        return {
            "id": self.id,
            "setting_key": self.setting_key,
            "value": self.value if include_secret or not self.is_secret else None,
            "is_secret": self.is_secret,
            "created_at": self.created_at.isoformat(sep=" ") if self.created_at else None,
            "updated_at": self.updated_at.isoformat(sep=" ") if self.updated_at else None,
        }

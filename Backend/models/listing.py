from __future__ import annotations

import json
from datetime import datetime

from Backend.extensions import db


class Listing(db.Model):
    __tablename__ = "listings"
    __table_args__ = (
        db.UniqueConstraint("source", "fingerprint", name="uq_listing_source_fingerprint"),
        db.Index("idx_listing_district", "district"),
        db.Index("idx_listing_price", "total_price"),
        db.Index("idx_listing_updated", "updated_at"),
    )

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    source = db.Column(db.String(32), nullable=False)
    source_listing_id = db.Column(db.String(128))
    title = db.Column(db.String(255), nullable=False)
    link = db.Column(db.String(512), nullable=False)
    district = db.Column(db.String(64), nullable=False, default="待复核")
    community = db.Column(db.String(128))
    address = db.Column(db.String(255))
    total_price = db.Column(db.Float)
    unit_price = db.Column(db.Float)
    area = db.Column(db.Float)
    layout = db.Column(db.String(64))
    rooms = db.Column(db.Integer)
    halls = db.Column(db.Integer)
    orientation = db.Column(db.String(64))
    decoration = db.Column(db.String(64))
    floor_text = db.Column(db.String(128))
    floor_level = db.Column(db.String(32))
    build_year = db.Column(db.Integer)
    house_age = db.Column(db.Integer)
    tags_json = db.Column(db.Text)
    fingerprint = db.Column(db.String(64), nullable=False)
    data_quality_score = db.Column(db.Integer, nullable=False, default=100)
    status = db.Column(db.String(32), nullable=False, default="active")
    first_seen_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    last_seen_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    snapshots = db.relationship("ListingSnapshot", back_populates="listing", cascade="all, delete-orphan")

    @property
    def tags(self) -> list[str]:
        if not self.tags_json:
            return []
        try:
            value = json.loads(self.tags_json)
            return value if isinstance(value, list) else []
        except json.JSONDecodeError:
            return []

    def set_tags(self, tags: list[str] | None) -> None:
        self.tags_json = json.dumps(tags or [], ensure_ascii=False)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "source": self.source,
            "source_listing_id": self.source_listing_id,
            "title": self.title,
            "link": self.link,
            "district": self.district,
            "community": self.community,
            "address": self.address,
            "total_price": self.total_price,
            "unit_price": self.unit_price,
            "area": self.area,
            "layout": self.layout,
            "rooms": self.rooms,
            "halls": self.halls,
            "orientation": self.orientation,
            "decoration": self.decoration,
            "floor_text": self.floor_text,
            "floor_level": self.floor_level,
            "build_year": self.build_year,
            "house_age": self.house_age,
            "tags": self.tags,
            "fingerprint": self.fingerprint,
            "data_quality_score": self.data_quality_score,
            "status": self.status,
            "first_seen_at": self.first_seen_at.isoformat(sep=" ") if self.first_seen_at else None,
            "last_seen_at": self.last_seen_at.isoformat(sep=" ") if self.last_seen_at else None,
            "created_at": self.created_at.isoformat(sep=" ") if self.created_at else None,
            "updated_at": self.updated_at.isoformat(sep=" ") if self.updated_at else None,
        }


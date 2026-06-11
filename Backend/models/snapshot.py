from __future__ import annotations

from datetime import datetime

from Backend.extensions import db


class ListingSnapshot(db.Model):
    __tablename__ = "listing_snapshots"
    __table_args__ = (db.Index("idx_snapshot_listing_time", "listing_id", "snapshot_at"),)

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    listing_id = db.Column(db.Integer, db.ForeignKey("listings.id"), nullable=False)
    total_price = db.Column(db.Float)
    unit_price = db.Column(db.Float)
    status = db.Column(db.String(32), nullable=False, default="active")
    source = db.Column(db.String(32), nullable=False)
    snapshot_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    task_id = db.Column(db.Integer, db.ForeignKey("crawl_tasks.id"))
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    listing = db.relationship("Listing", back_populates="snapshots")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "listing_id": self.listing_id,
            "total_price": self.total_price,
            "unit_price": self.unit_price,
            "status": self.status,
            "source": self.source,
            "snapshot_at": self.snapshot_at.isoformat(sep=" ") if self.snapshot_at else None,
            "task_id": self.task_id,
        }


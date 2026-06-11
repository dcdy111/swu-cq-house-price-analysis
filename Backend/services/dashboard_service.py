from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import case

from Backend.extensions import db
from Backend.models.crawl import CrawlTask
from Backend.models.listing import Listing
from Backend.models.snapshot import ListingSnapshot


VALID_STATUSES = ("active", "valid")

DISTRICT_ALIASES = {
    "渝中": "渝中区",
    "江北": "江北区",
    "南岸": "南岸区",
    "渝北": "渝北区",
    "九龙坡": "九龙坡区",
    "沙坪坝": "沙坪坝区",
    "大渡口": "大渡口区",
    "巴南": "巴南区",
    "北碚": "北碚区",
    "璧山": "璧山区",
    "江津": "江津区",
    "永川": "永川区",
    "合川": "合川区",
    "长寿": "长寿区",
    "铜梁": "铜梁区",
    "荣昌": "荣昌区",
    "大足": "大足区",
    "涪陵": "涪陵区",
    "綦江": "綦江区",
    "南川": "南川区",
    "万州": "万州区",
    "潼南": "潼南区",
    "梁平": "梁平区",
    "开州": "开州区",
    "黔江": "黔江区",
    "武隆": "武隆区",
    "两江": "两江新区",
}


def _round(value: Any, digits: int = 2) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


def _safe_int(value: Any) -> int:
    return int(value or 0)


def normalize_district_name(name: str | None) -> str:
    if not name:
        return "待复核"
    text = str(name).strip()
    if not text:
        return "待复核"
    if text in DISTRICT_ALIASES:
        return DISTRICT_ALIASES[text]
    if text.endswith(("区", "县", "自治县", "新区")):
        return text
    return text


def _valid_listing_condition():
    return db.and_(
        Listing.status.in_(VALID_STATUSES),
        Listing.unit_price.isnot(None),
        Listing.unit_price > 0,
        Listing.total_price.isnot(None),
        Listing.total_price > 0,
        Listing.area.isnot(None),
        Listing.area > 0,
    )


def _analysis_ready_condition():
    return db.and_(
        _valid_listing_condition(),
        Listing.data_quality_score >= 80,
        Listing.total_price.between(5, 5000),
        Listing.unit_price.between(1000, 100000),
        Listing.area.between(10, 500),
    )


class DashboardService:
    @staticmethod
    def overview() -> dict:
        total_count = _safe_int(db.session.query(db.func.count(Listing.id)).scalar())
        active_count = _safe_int(
            db.session.query(db.func.count(Listing.id)).filter(Listing.status.in_(VALID_STATUSES)).scalar()
        )
        latest_updated_at = db.session.query(db.func.max(Listing.updated_at)).scalar()
        seven_days_ago = datetime.utcnow() - timedelta(days=7)

        row = db.session.query(
            db.func.coalesce(db.func.avg(Listing.unit_price), 0).label("avg_unit_price"),
            db.func.coalesce(db.func.avg(Listing.total_price), 0).label("avg_total_price"),
            db.func.coalesce(db.func.avg(Listing.data_quality_score), 0).label("avg_quality"),
            db.func.count(db.func.distinct(Listing.district)).label("district_count"),
            db.func.sum(case((_analysis_ready_condition(), 1), else_=0)).label("analysis_ready_count"),
            db.func.sum(case((Listing.last_seen_at >= seven_days_ago, 1), else_=0)).label("recent_seen_count"),
        ).one()

        complete_count = _safe_int(db.session.query(db.func.count(Listing.id)).filter(_valid_listing_condition()).scalar())
        snapshot_count = _safe_int(db.session.query(db.func.count(ListingSnapshot.id)).scalar())
        top_districts = DashboardService.district_price(limit=1)["items"]

        return {
            "kpis": {
                "total_count": total_count,
                "active_count": active_count,
                "avg_unit_price": _round(row.avg_unit_price, 2) or 0,
                "avg_total_price": _round(row.avg_total_price, 2) or 0,
                "avg_quality": _round(row.avg_quality, 2) or 0,
                "data_complete_rate": round((complete_count / total_count * 100), 2) if total_count else 0,
                "district_count": _safe_int(row.district_count),
                "analysis_ready_count": _safe_int(row.analysis_ready_count),
                "recent_seen_count": _safe_int(row.recent_seen_count),
                "snapshot_count": snapshot_count,
                "latest_updated_at": latest_updated_at.isoformat(sep=" ") if latest_updated_at else None,
            },
            "top_district": top_districts[0] if top_districts else None,
            "source_summary": DashboardService.source_summary(),
            "status_summary": DashboardService.status_summary(),
            "crawl_status": DashboardService.crawl_status(),
        }

    @staticmethod
    def district_price(limit: int = 20) -> dict:
        rows = (
            db.session.query(
                Listing.district.label("district"),
                db.func.count(Listing.id).label("listing_count"),
                db.func.sum(Listing.unit_price).label("unit_price_sum"),
                db.func.sum(Listing.total_price).label("total_price_sum"),
                db.func.sum(Listing.data_quality_score).label("quality_sum"),
                db.func.min(Listing.unit_price).label("min_unit_price"),
                db.func.max(Listing.unit_price).label("max_unit_price"),
            )
            .filter(_valid_listing_condition())
            .group_by(Listing.district)
            .all()
        )

        merged: dict[str, dict] = {}
        for row in rows:
            display_name = normalize_district_name(row.district)
            bucket = merged.setdefault(
                display_name,
                {
                    "district": display_name,
                    "raw_districts": [],
                    "listing_count": 0,
                    "unit_price_sum": 0.0,
                    "total_price_sum": 0.0,
                    "quality_sum": 0.0,
                    "min_unit_price": None,
                    "max_unit_price": None,
                },
            )
            count = _safe_int(row.listing_count)
            bucket["raw_districts"].append(row.district)
            bucket["listing_count"] += count
            bucket["unit_price_sum"] += float(row.unit_price_sum or 0)
            bucket["total_price_sum"] += float(row.total_price_sum or 0)
            bucket["quality_sum"] += float(row.quality_sum or 0)
            if row.min_unit_price is not None:
                bucket["min_unit_price"] = (
                    float(row.min_unit_price)
                    if bucket["min_unit_price"] is None
                    else min(float(bucket["min_unit_price"]), float(row.min_unit_price))
                )
            if row.max_unit_price is not None:
                bucket["max_unit_price"] = (
                    float(row.max_unit_price)
                    if bucket["max_unit_price"] is None
                    else max(float(bucket["max_unit_price"]), float(row.max_unit_price))
                )

        items = []
        for bucket in merged.values():
            count = max(1, bucket["listing_count"])
            items.append(
                {
                    "district": bucket["district"],
                    "raw_districts": bucket["raw_districts"],
                    "listing_count": bucket["listing_count"],
                    "avg_unit_price": round(bucket["unit_price_sum"] / count, 2),
                    "avg_total_price": round(bucket["total_price_sum"] / count, 2),
                    "avg_quality": round(bucket["quality_sum"] / count, 2),
                    "min_unit_price": _round(bucket["min_unit_price"], 2),
                    "max_unit_price": _round(bucket["max_unit_price"], 2),
                    "change": 0,
                }
            )

        items.sort(key=lambda item: (item["avg_unit_price"], item["listing_count"]), reverse=True)
        limit = min(100, max(1, int(limit or 20)))
        for index, item in enumerate(items[:limit], start=1):
            item["rank"] = index
        return {"items": items[:limit]}

    @staticmethod
    def district_map() -> dict:
        chart_items = DashboardService.district_price(limit=100)["items"]
        items = [
            {
                "name": item["district"],
                "district": item["district"],
                "raw_districts": item["raw_districts"],
                "avgPrice": round(float(item["avg_unit_price"] or 0)),
                "avg_unit_price": item["avg_unit_price"],
                "avg_total_price": item["avg_total_price"],
                "count": _safe_int(item["listing_count"]),
                "listing_count": _safe_int(item["listing_count"]),
                "quality": _round(item["avg_quality"], 1) or 0,
                "avg_quality": item["avg_quality"],
                "min_unit_price": item["min_unit_price"],
                "max_unit_price": item["max_unit_price"],
                "change": item["change"],
                "rank": item.get("rank"),
            }
            for item in chart_items
            if item["district"] != "待复核"
        ]
        total_count = sum(item["count"] for item in items)
        latest_updated_at = db.session.query(db.func.max(Listing.updated_at)).scalar()
        return {
            "items": items,
            "total_count": total_count,
            "district_count": len(items),
            "latest_updated_at": latest_updated_at.isoformat(sep=" ") if latest_updated_at else None,
            "metric_fields": {
                "avgPrice": "区县平均挂牌单价，单位：元/㎡",
                "count": "区县有效房源样本量，单位：套",
                "quality": "区县平均数据质量分，满分 100",
            },
        }

    @staticmethod
    def price_distribution() -> dict:
        bins = [
            (None, 50, "50万以下"),
            (50, 100, "50-100万"),
            (100, 150, "100-150万"),
            (150, 200, "150-200万"),
            (200, 300, "200-300万"),
            (300, 500, "300-500万"),
            (500, None, "500万以上"),
        ]
        total = _safe_int(db.session.query(db.func.count(Listing.id)).filter(_valid_listing_condition()).scalar())
        items = []
        for lower, upper, label in bins:
            condition = _valid_listing_condition()
            if lower is not None:
                condition = db.and_(condition, Listing.total_price >= lower)
            if upper is not None:
                condition = db.and_(condition, Listing.total_price < upper)
            count = _safe_int(db.session.query(db.func.count(Listing.id)).filter(condition).scalar())
            items.append(
                {
                    "label": label,
                    "lower": lower,
                    "upper": upper,
                    "count": count,
                    "ratio": round(count / total * 100, 2) if total else 0,
                }
            )
        return {"items": items, "total": total, "metric": "total_price"}

    @staticmethod
    def price_trend(months: int = 12) -> dict:
        months = min(36, max(1, int(months or 12)))
        rows = (
            db.session.query(
                db.func.date_format(ListingSnapshot.snapshot_at, "%Y-%m").label("month"),
                db.func.coalesce(db.func.avg(ListingSnapshot.unit_price), 0).label("avg_unit_price"),
                db.func.coalesce(db.func.avg(ListingSnapshot.total_price), 0).label("avg_total_price"),
                db.func.count(ListingSnapshot.id).label("snapshot_count"),
            )
            .filter(ListingSnapshot.unit_price.isnot(None), ListingSnapshot.unit_price > 0)
            .group_by(db.func.date_format(ListingSnapshot.snapshot_at, "%Y-%m"))
            .order_by(db.func.date_format(ListingSnapshot.snapshot_at, "%Y-%m").desc())
            .limit(months)
            .all()
        )

        if not rows:
            rows = (
                db.session.query(
                    db.func.date_format(Listing.updated_at, "%Y-%m").label("month"),
                    db.func.coalesce(db.func.avg(Listing.unit_price), 0).label("avg_unit_price"),
                    db.func.coalesce(db.func.avg(Listing.total_price), 0).label("avg_total_price"),
                    db.func.count(Listing.id).label("snapshot_count"),
                )
                .filter(_valid_listing_condition())
                .group_by(db.func.date_format(Listing.updated_at, "%Y-%m"))
                .order_by(db.func.date_format(Listing.updated_at, "%Y-%m").desc())
                .limit(months)
                .all()
            )

        items = [
            {
                "month": row.month,
                "avg_unit_price": _round(row.avg_unit_price, 2) or 0,
                "avg_total_price": _round(row.avg_total_price, 2) or 0,
                "listing_count": _safe_int(row.snapshot_count),
            }
            for row in reversed(rows)
        ]
        return {"items": items}

    @staticmethod
    def area_price_scatter(limit: int = 500) -> dict:
        limit = min(1000, max(20, int(limit or 500)))
        rows = (
            Listing.query.filter(_valid_listing_condition())
            .order_by(Listing.updated_at.desc(), Listing.id.desc())
            .limit(limit)
            .all()
        )
        return {
            "items": [
                {
                    "id": item.id,
                    "title": item.title,
                    "district": normalize_district_name(item.district),
                    "raw_district": item.district,
                    "area": _round(item.area, 2) or 0,
                    "unit_price": _round(item.unit_price, 2) or 0,
                    "total_price": _round(item.total_price, 2) or 0,
                    "quality": item.data_quality_score,
                }
                for item in rows
            ]
        }

    @staticmethod
    def layout_distribution(limit: int = 8) -> dict:
        rows = (
            db.session.query(Listing.layout, db.func.count(Listing.id).label("count"))
            .filter(_valid_listing_condition(), Listing.layout.isnot(None), Listing.layout != "")
            .group_by(Listing.layout)
            .order_by(db.func.count(Listing.id).desc())
            .limit(min(20, max(1, int(limit or 8))))
            .all()
        )
        total = sum(_safe_int(row.count) for row in rows)
        return {
            "items": [
                {
                    "name": row.layout,
                    "count": _safe_int(row.count),
                    "value": round((_safe_int(row.count) / total * 100), 2) if total else 0,
                }
                for row in rows
            ],
            "total": total,
        }

    @staticmethod
    def source_summary() -> list[dict]:
        rows = (
            db.session.query(
                Listing.source,
                db.func.count(Listing.id).label("listing_count"),
                db.func.coalesce(db.func.avg(Listing.unit_price), 0).label("avg_unit_price"),
                db.func.coalesce(db.func.avg(Listing.data_quality_score), 0).label("avg_quality"),
            )
            .group_by(Listing.source)
            .order_by(db.func.count(Listing.id).desc())
            .all()
        )
        return [
            {
                "source": row.source,
                "listing_count": _safe_int(row.listing_count),
                "avg_unit_price": _round(row.avg_unit_price, 2) or 0,
                "avg_quality": _round(row.avg_quality, 2) or 0,
            }
            for row in rows
        ]

    @staticmethod
    def status_summary() -> list[dict]:
        rows = db.session.query(Listing.status, db.func.count(Listing.id).label("count")).group_by(Listing.status).all()
        return [{"status": row.status, "count": _safe_int(row.count)} for row in rows]

    @staticmethod
    def crawl_status() -> dict:
        summary_rows = db.session.query(CrawlTask.status, db.func.count(CrawlTask.id)).group_by(CrawlTask.status).all()
        summary = {
            "running": 0,
            "success": 0,
            "failed": 0,
            "partial_failed": 0,
            "pending": 0,
        }
        for status, count in summary_rows:
            summary[status] = _safe_int(count)

        tasks = CrawlTask.query.order_by(CrawlTask.updated_at.desc(), CrawlTask.id.desc()).limit(5).all()
        return {
            "summary": summary,
            "items": [
                {
                    "id": task.id,
                    "name": task.name,
                    "source": task.source,
                    "status": task.status,
                    "progress": task.progress,
                    "total_found": task.total_found,
                    "failed_pages": task.failed_pages,
                    "updated_at": task.updated_at.isoformat(sep=" ") if task.updated_at else None,
                }
                for task in tasks
            ],
        }

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import case

from Backend.extensions import db
from Backend.models.crawl import CrawlTask
from Backend.models.listing import Listing
from Backend.models.snapshot import ListingSnapshot


VALID_STATUSES = ("active", "valid")
REAL_SOURCES = ("fang", "anjuke_mobile", "lianjia")
OFFICIAL_DISTRICT_NAMES = {
    "万州区",
    "涪陵区",
    "渝中区",
    "大渡口区",
    "江北区",
    "沙坪坝区",
    "九龙坡区",
    "南岸区",
    "北碚区",
    "綦江区",
    "大足区",
    "渝北区",
    "巴南区",
    "黔江区",
    "长寿区",
    "江津区",
    "合川区",
    "永川区",
    "南川区",
    "璧山区",
    "铜梁区",
    "潼南区",
    "荣昌区",
    "开州区",
    "梁平区",
    "武隆区",
    "城口县",
    "丰都县",
    "垫江县",
    "忠县",
    "云阳县",
    "奉节县",
    "巫山县",
    "巫溪县",
    "石柱土家族自治县",
    "秀山土家族苗族自治县",
    "酉阳土家族苗族自治县",
    "彭水苗族土家族自治县",
}

DISTRICT_ALIASES = {
    "yubei": "渝北区",
    "yuzhong": "渝中区",
    "jiangbei": "江北区",
    "nanan": "南岸区",
    "nanana": "南岸区",
    "nan'an": "南岸区",
    "jiulongpo": "九龙坡区",
    "shapingba": "沙坪坝区",
    "dadukou": "大渡口区",
    "banan": "巴南区",
    "beibei": "北碚区",
    "bishan": "璧山区",
    "jiangjin": "江津区",
    "yongchuan": "永川区",
    "hechuan": "合川区",
    "changshou": "长寿区",
    "tongliang": "铜梁区",
    "rongchang": "荣昌区",
    "dazu": "大足区",
    "fuling": "涪陵区",
    "qijiang": "綦江区",
    "nanchuan": "南川区",
    "wanzhou": "万州区",
    "tongnan": "潼南区",
    "liangping": "梁平区",
    "kaizhou": "开州区",
    "qianjiang": "黔江区",
    "wulong": "武隆区",
    "chengkou": "城口县",
    "fengdu": "丰都县",
    "dianjiang": "垫江县",
    "dianjiangxian": "垫江县",
    "dainjiangxian": "垫江县",
    "zhongxian": "忠县",
    "yunyang": "云阳县",
    "fengjie": "奉节县",
    "wushan": "巫山县",
    "wuxi": "巫溪县",
    "shizhu": "石柱土家族自治县",
    "xiushan": "秀山土家族苗族自治县",
    "youyang": "酉阳土家族苗族自治县",
    "pengshui": "彭水苗族土家族自治县",
    "wansheng": "万盛",
    "liangjiang": "两江新区",
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
    "城口": "城口县",
    "丰都": "丰都县",
    "垫江": "垫江县",
    "云阳": "云阳县",
    "奉节": "奉节县",
    "巫山": "巫山县",
    "巫溪": "巫溪县",
    "石柱": "石柱土家族自治县",
    "秀山": "秀山土家族苗族自治县",
    "酉阳": "酉阳土家族苗族自治县",
    "彭水": "彭水苗族土家族自治县",
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
    lower_text = text.lower()
    if lower_text in DISTRICT_ALIASES:
        return DISTRICT_ALIASES[lower_text]
    if text in DISTRICT_ALIASES:
        return DISTRICT_ALIASES[text]
    if text.endswith(("区", "县", "自治县", "新区")):
        return text
    return text


def is_official_district_name(name: str | None) -> bool:
    return normalize_district_name(name) in OFFICIAL_DISTRICT_NAMES


def _valid_listing_condition():
    return db.and_(
        Listing.source.in_(REAL_SOURCES),
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
        total_count = _safe_int(
            db.session.query(db.func.count(Listing.id)).filter(Listing.source.in_(REAL_SOURCES)).scalar()
        )
        active_count = _safe_int(
            db.session.query(db.func.count(Listing.id))
            .filter(Listing.source.in_(REAL_SOURCES), Listing.status.in_(VALID_STATUSES))
            .scalar()
        )
        latest_updated_at = (
            db.session.query(db.func.max(Listing.updated_at)).filter(Listing.source.in_(REAL_SOURCES)).scalar()
        )
        seven_days_ago = datetime.utcnow() - timedelta(days=7)

        district_map = DashboardService.district_map()
        top_districts = sorted(
            district_map["items"],
            key=lambda item: (item["avg_unit_price"], item["listing_count"]),
            reverse=True,
        )

        row = db.session.query(
            db.func.coalesce(db.func.avg(Listing.unit_price), 0).label("avg_unit_price"),
            db.func.coalesce(db.func.avg(Listing.total_price), 0).label("avg_total_price"),
            db.func.coalesce(db.func.avg(Listing.data_quality_score), 0).label("avg_quality"),
            db.func.sum(case((_analysis_ready_condition(), 1), else_=0)).label("analysis_ready_count"),
            db.func.sum(case((Listing.last_seen_at >= seven_days_ago, 1), else_=0)).label("recent_seen_count"),
        ).filter(Listing.source.in_(REAL_SOURCES)).one()

        complete_count = _safe_int(
            db.session.query(db.func.count(Listing.id)).filter(_valid_listing_condition()).scalar()
        )
        snapshot_count = _safe_int(
            db.session.query(db.func.count(ListingSnapshot.id)).filter(ListingSnapshot.source.in_(REAL_SOURCES)).scalar()
        )

        return {
            "kpis": {
                "total_count": total_count,
                "active_count": active_count,
                "avg_unit_price": _round(row.avg_unit_price, 2) or 0,
                "avg_total_price": _round(row.avg_total_price, 2) or 0,
                "avg_quality": _round(row.avg_quality, 2) or 0,
                "data_complete_rate": round((complete_count / total_count * 100), 2) if total_count else 0,
                "district_count": district_map["district_count"],
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
    def district_value_profile(limit: int = 8) -> dict:
        district_items = DashboardService.district_price(limit=100)["items"]
        if not district_items:
            return {
                "items": [],
                "methodology": DashboardService._district_value_methodology(),
            }

        avg_prices = [float(item["avg_unit_price"] or 0) for item in district_items if item["avg_unit_price"]]
        counts = [int(item["listing_count"] or 0) for item in district_items]
        qualities = [float(item["avg_quality"] or 0) for item in district_items if item["avg_quality"]]
        spreads = [
            float((item["max_unit_price"] or item["avg_unit_price"] or 0) - (item["min_unit_price"] or item["avg_unit_price"] or 0))
            for item in district_items
        ]

        def min_max(value: float, values: list[float], reverse: bool = False) -> float:
            if not values:
                return 0.0
            low = min(values)
            high = max(values)
            if high == low:
                score = 100.0
            else:
                score = (value - low) / (high - low) * 100
            return 100.0 - score if reverse else score

        layout_rows = (
            db.session.query(
                Listing.district.label("district"),
                Listing.layout.label("layout"),
                db.func.count(Listing.id).label("count"),
            )
            .filter(_valid_listing_condition(), Listing.layout.isnot(None), Listing.layout != "")
            .group_by(Listing.district, Listing.layout)
            .all()
        )
        layout_map: dict[str, list[dict]] = {}
        for row in layout_rows:
            district = normalize_district_name(row.district)
            layout_map.setdefault(district, []).append({"layout": row.layout, "count": _safe_int(row.count)})

        items = []
        for item in district_items:
            district = item["district"]
            avg_price = float(item["avg_unit_price"] or 0)
            count = int(item["listing_count"] or 0)
            quality = float(item["avg_quality"] or 0)
            spread = float((item["max_unit_price"] or avg_price) - (item["min_unit_price"] or avg_price))
            price_score = min_max(avg_price, avg_prices, reverse=True)
            sample_score = min_max(float(count), [float(value) for value in counts])
            quality_score = min_max(quality, qualities)
            stability_score = min_max(spread, spreads, reverse=True)
            value_index = round(
                price_score * 0.40
                + sample_score * 0.20
                + quality_score * 0.25
                + stability_score * 0.15,
                2,
            )
            top_layouts = sorted(layout_map.get(district, []), key=lambda row: row["count"], reverse=True)[:3]
            reasons = []
            if price_score >= 70:
                reasons.append("挂牌单价相对更低")
            if sample_score >= 70:
                reasons.append("样本量充足")
            if quality_score >= 70:
                reasons.append("平均质量分较高")
            if stability_score >= 70:
                reasons.append("价格区间相对集中")
            if not reasons:
                reasons.append("综合指标处于中等水平，适合作为对照区域")

            items.append(
                {
                    "district": district,
                    "value_index": value_index,
                    "rank": 0,
                    "avg_unit_price": round(avg_price, 2),
                    "listing_count": count,
                    "avg_quality": round(quality, 2),
                    "price_stability_score": round(stability_score, 2),
                    "sample_score": round(sample_score, 2),
                    "price_score": round(price_score, 2),
                    "quality_score": round(quality_score, 2),
                    "dominant_layouts": top_layouts,
                    "reasons": reasons[:3],
                    "note": "区域性价比指数是基于挂牌价、样本量、质量分和价格稳定性的相对排序，不代表成交价或投资建议。",
                }
            )

        items.sort(key=lambda row: (row["value_index"], row["listing_count"]), reverse=True)
        limit = min(20, max(1, int(limit or 8)))
        for index, item in enumerate(items[:limit], start=1):
            item["rank"] = index
        return {
            "items": items[:limit],
            "methodology": DashboardService._district_value_methodology(),
        }

    @staticmethod
    def _district_value_methodology() -> dict:
        return {
            "name": "区域性价比指数",
            "version": "district-value-v1",
            "formula": "0.40*价格优势 + 0.20*样本量 + 0.25*质量分 + 0.15*价格稳定性",
            "price_advantage": "区县平均挂牌单价越低，价格优势越高。",
            "sample_score": "样本量按区县 min-max 标准化，样本越多越稳定。",
            "quality_score": "区县平均数据质量分按 min-max 标准化。",
            "stability_score": "区县挂牌单价最高值与最低值差距越小，稳定性越高。",
            "boundary": "该指数只用于区域对比和答辩展示，不代表成交价、不构成购房或投资建议。",
        }

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
            if item["district"] != "待复核" and is_official_district_name(item["district"])
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
        month_rows = (
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

        rows = month_rows
        date_format = "%Y-%m"
        if len(month_rows) <= 1:
            day_limit = min(45, max(7, months * 3))
            day_rows = (
                db.session.query(
                    db.func.date_format(ListingSnapshot.snapshot_at, "%Y-%m-%d").label("month"),
                    db.func.coalesce(db.func.avg(ListingSnapshot.unit_price), 0).label("avg_unit_price"),
                    db.func.coalesce(db.func.avg(ListingSnapshot.total_price), 0).label("avg_total_price"),
                    db.func.count(ListingSnapshot.id).label("snapshot_count"),
                )
                .filter(ListingSnapshot.unit_price.isnot(None), ListingSnapshot.unit_price > 0)
                .group_by(db.func.date_format(ListingSnapshot.snapshot_at, "%Y-%m-%d"))
                .order_by(db.func.date_format(ListingSnapshot.snapshot_at, "%Y-%m-%d").desc())
                .limit(day_limit)
                .all()
            )
            if len(day_rows) > 1:
                rows = day_rows
                date_format = "%Y-%m-%d"

        if date_format == "%Y-%m-%d" and len(rows) <= 2:
            hour_limit = min(96, max(12, months * 8))
            hour_rows = (
                db.session.query(
                    db.func.date_format(ListingSnapshot.snapshot_at, "%Y-%m-%d %H:00").label("month"),
                    db.func.coalesce(db.func.avg(ListingSnapshot.unit_price), 0).label("avg_unit_price"),
                    db.func.coalesce(db.func.avg(ListingSnapshot.total_price), 0).label("avg_total_price"),
                    db.func.count(ListingSnapshot.id).label("snapshot_count"),
                )
                .filter(ListingSnapshot.unit_price.isnot(None), ListingSnapshot.unit_price > 0)
                .group_by(db.func.date_format(ListingSnapshot.snapshot_at, "%Y-%m-%d %H:00"))
                .order_by(db.func.date_format(ListingSnapshot.snapshot_at, "%Y-%m-%d %H:00").desc())
                .limit(hour_limit)
                .all()
            )
            if len(hour_rows) > len(rows):
                rows = hour_rows
                date_format = "%Y-%m-%d %H:00"

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
            date_format = "%Y-%m"

        items = [
            {
                "month": row.month,
                "avg_unit_price": _round(row.avg_unit_price, 2) or 0,
                "avg_total_price": _round(row.avg_total_price, 2) or 0,
                "listing_count": _safe_int(row.snapshot_count),
                "granularity": (
                    "hour"
                    if date_format == "%Y-%m-%d %H:00"
                    else "day" if date_format == "%Y-%m-%d" else "month"
                ),
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
            .filter(Listing.source.in_(REAL_SOURCES))
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

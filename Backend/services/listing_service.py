from __future__ import annotations

import csv
import hashlib
import io
import re
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

from sqlalchemy import or_

from Backend.extensions import db
from Backend.models.listing import Listing
from Backend.models.snapshot import ListingSnapshot
from Backend.services.dashboard_service import normalize_district_name


CURRENT_YEAR = datetime.now().year
LIANGJIANG_NEW_AREA = "两江新区"
LIANGJIANG_DISTRICT_ALIASES = (
    LIANGJIANG_NEW_AREA,
    "渝北",
    "渝北区",
    "江北",
    "江北区",
)

DISPLAY_DISTRICT_ALIASES = {
    "nanan": "南岸区",
    "nanana": "南岸区",
    "nan'an": "南岸区",
    "dianjiang": "垫江县",
    "dianjiangxian": "垫江县",
    "dainjiangxian": "垫江县",
    "wansheng": "万盛",
    "万盛经开区": "万盛",
}


def parse_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value)
    match = re.search(r"\d+(?:\.\d+)?", text.replace(",", ""))
    return float(match.group(0)) if match else None


def parse_int(value: Any) -> int | None:
    number = parse_float(value)
    return int(number) if number is not None else None


def parse_rooms_halls(layout: str | None) -> tuple[int | None, int | None]:
    if not layout:
        return None, None
    match = re.search(r"(\d+)\s*室\s*(\d+)?\s*厅?", layout)
    if not match:
        return None, None
    rooms = int(match.group(1))
    halls = int(match.group(2)) if match.group(2) else None
    return rooms, halls


def clean_text(value: Any, limit: int | None = None) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    if not text or text == "未知":
        return None
    if limit and len(text) > limit:
        return text[:limit]
    return text


# 房天下 a058 板块在页面入口上会出现“江北/两江新区”两种写法，
# 这里统一收束为“两江新区”，避免同一板块在入库和分析阶段被拆成两个口径。
FANG_A058_DISTRICT_CANONICAL = {
    "江北": "两江新区",
    "两江新区": "两江新区",
}


def canonicalize_display_district(value: Any) -> str:
    text = clean_text(value, 64) or "待复核"
    text = DISPLAY_DISTRICT_ALIASES.get(text.lower(), DISPLAY_DISTRICT_ALIASES.get(text, text))
    normalized = normalize_district_name(text)
    if normalized != text:
        text = normalized
    if text in LIANGJIANG_DISTRICT_ALIASES:
        return LIANGJIANG_NEW_AREA
    return text


def expand_district_filter_values(value: Any) -> list[str]:
    text = clean_text(value, 64)
    if not text:
        return []
    text = DISPLAY_DISTRICT_ALIASES.get(text.lower(), DISPLAY_DISTRICT_ALIASES.get(text, text))
    if text in LIANGJIANG_DISTRICT_ALIASES:
        return list(LIANGJIANG_DISTRICT_ALIASES)
    normalized = normalize_district_name(text)
    values = [text]
    if normalized and normalized not in values:
        values.append(normalized)
    if normalized.endswith("区") and normalized[:-1] not in values:
        values.append(normalized[:-1])
    if normalized.endswith("县") and normalized[:-1] not in values:
        values.append(normalized[:-1])
    return values


def normalize_source_district(source: str | None, district: Any) -> str:
    text = clean_text(district, 64) or "待复核"
    if str(source or "").strip() == "fang":
        return FANG_A058_DISTRICT_CANONICAL.get(text, text)
    return text


def normalize_listing_address(
    source: str | None,
    district: str | None,
    community: str | None,
    address: Any,
    title: str | None = None,
) -> str | None:
    text = clean_text(address, 255)
    if not text:
        if community and district:
            return clean_text(f"{district} {community}", 255) or clean_text(community, 255) or clean_text(district, 255)
        return clean_text(community, 255) or clean_text(district, 255) or "待复核"

    source_key = str(source or "").strip()
    contaminated_markers = (
        "元/㎡",
        "元/平",
        "万",
        "㎡",
        "VR看房",
        "经纪人力荐",
        "房东直卖",
        "满五年",
        "近地铁",
        "电梯房",
    )
    looks_contaminated = len(text) > 80 or any(marker in text for marker in contaminated_markers)
    if source_key == "anjuke_mobile" and looks_contaminated:
        fallback_parts = [clean_text(district, 64), clean_text(community, 128)]
        fallback = " ".join(part for part in fallback_parts if part)
        if fallback:
            return fallback
        return "待复核"
    if title and clean_text(title, 255) and clean_text(title, 255) in text and looks_contaminated:
        fallback_parts = [clean_text(district, 64), clean_text(community, 128)]
        fallback = " ".join(part for part in fallback_parts if part)
        if fallback:
            return fallback
        return "待复核"
    return text


def normalize_floor_level(floor_text: str | None) -> str:
    if not floor_text:
        return "unknown"
    if "低" in floor_text:
        return "low"
    if "中" in floor_text:
        return "mid"
    if "高" in floor_text:
        return "high"
    return "unknown"


def parse_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if not text:
        return None
    if text in {"1", "true", "yes", "y", "有", "是"}:
        return True
    if text in {"0", "false", "no", "n", "无", "否"}:
        return False
    return None


def extract_total_floors(floor_text: str | None) -> int | None:
    text = str(floor_text or "")
    match = re.search(r"[（(]\s*共?\s*(\d+)\s*层\s*[)）]", text)
    if match:
        return int(match.group(1))
    match = re.search(r"共\s*(\d+)\s*层", text)
    return int(match.group(1)) if match else None


def extract_metro_distance(value: Any, tags: list[str] | None = None) -> int | None:
    texts = [str(value or "")]
    texts.extend(str(item or "") for item in (tags or []))
    for text in texts:
        match = re.search(r"距.{0,40}?(\d+(?:\.\d+)?)\s*(米|m|km|公里)", text, re.IGNORECASE)
        if not match:
            continue
        distance = float(match.group(1))
        unit = match.group(2).lower()
        return int(round(distance * 1000)) if unit in {"km", "公里"} else int(round(distance))
    return None


def extract_building_type(value: Any, tags: list[str] | None = None, title: Any = None) -> str | None:
    candidates = [str(value or "")]
    candidates.extend(str(item or "") for item in (tags or []))
    for text in candidates:
        for keyword in ("板楼", "塔楼", "别墅", "洋房", "平房", "商住楼", "板塔结合"):
            if keyword in text:
                return keyword
    return None


def extract_has_elevator(value: Any, tags: list[str] | None = None) -> bool | None:
    candidates = [str(value or "")]
    candidates.extend(str(item or "") for item in (tags or []))
    for text in candidates:
        if "无电梯" in text:
            return False
        if "有电梯" in text or "电梯房" in text:
            return True
    return None


def normalize_url(url: str | None) -> str:
    if not url:
        return ""
    parsed = urlparse(url.strip())
    if not parsed.netloc:
        return url.strip()
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}".rstrip("/")


def build_fingerprint(raw: dict) -> str:
    source_listing_id = str(raw.get("source_listing_id") or "").strip()
    if source_listing_id:
        base = f"id:{source_listing_id}"
    else:
        # 注意：fingerprint 不包含价格，价格变化写 snapshot。
        parts = [
            normalize_url(raw.get("link")),
            str(raw.get("district") or "").strip(),
            str(raw.get("community") or "").strip(),
            str(raw.get("title") or "").strip(),
            str(raw.get("layout") or "").strip(),
            str(raw.get("area") or "").strip(),
        ]
        base = "|".join(parts)
    return hashlib.sha1(base.encode("utf-8")).hexdigest()


def quality_score(raw: dict) -> int:
    dimensions = quality_dimensions(raw)
    weights = {
        "completeness": 0.25,
        "uniqueness": 0.15,
        "consistency": 0.15,
        "timeliness": 0.15,
        "validity": 0.20,
        "verifiability": 0.10,
    }
    score = sum(dimensions[name] * weight for name, weight in weights.items())
    return max(0, min(100, round(score)))


def quality_dimensions(raw: dict) -> dict[str, float]:
    """计算入库阶段的六维质量分。

    verifiability 只表示来源与字段可核验性，不能替代源页面抽查或跨来源验证。
    数据集层的唯一性和及时性由 QualityService 使用数据库全量统计重新计算。
    """
    required = ["title", "link", "district", "total_price", "unit_price", "area"]
    populated = sum(1 for field in required if raw.get(field) not in (None, "", "未知"))
    completeness = populated / len(required) * 100

    total_price = parse_float(raw.get("total_price"))
    unit_price = parse_float(raw.get("unit_price"))
    area = parse_float(raw.get("area"))
    build_year = parse_int(raw.get("build_year"))
    link = normalize_url(str(raw.get("link") or ""))
    district = str(raw.get("district") or "").strip()

    validity_checks = [
        total_price is not None and 5 <= total_price <= 5000,
        unit_price is not None and 1000 <= unit_price <= 100000,
        area is not None and 10 <= area <= 500,
        district not in {"", "未知", "待复核"},
        link.startswith(("http://", "https://")),
    ]
    if build_year is not None:
        validity_checks.append(1950 <= build_year <= CURRENT_YEAR)
    validity = sum(validity_checks) / len(validity_checks) * 100

    price_consistent = False
    if total_price and unit_price and area:
        derived_unit_price = total_price * 10000 / area
        price_consistent = abs(derived_unit_price - unit_price) / max(unit_price, 1) <= 0.12
    layout = clean_text(raw.get("layout"), 64)
    rooms, _ = parse_rooms_halls(layout)
    layout_consistent = layout is None or rooms is not None
    year_consistent = build_year is None or 1950 <= build_year <= CURRENT_YEAR
    consistency_checks = [price_consistent, layout_consistent, year_consistent]
    consistency = sum(consistency_checks) / len(consistency_checks) * 100

    has_stable_identity = bool(str(raw.get("source_listing_id") or "").strip() or link)
    uniqueness = 100.0 if has_stable_identity else 0.0
    timeliness = 100.0

    trace_checks = [
        bool(str(raw.get("source") or "").strip()),
        bool(str(raw.get("source_listing_id") or "").strip()),
        link.startswith(("http://", "https://")),
        price_consistent,
    ]
    verifiability = sum(trace_checks) / len(trace_checks) * 100
    return {
        "completeness": round(completeness, 2),
        "uniqueness": round(uniqueness, 2),
        "consistency": round(consistency, 2),
        "timeliness": round(timeliness, 2),
        "validity": round(validity, 2),
        "verifiability": round(verifiability, 2),
    }


class ListingService:
    @staticmethod
    def listing_options() -> dict:
        districts = [
            row[0]
            for row in db.session.query(Listing.district)
            .filter(Listing.district.isnot(None))
            .distinct()
            .order_by(Listing.district.asc())
            .all()
        ]
        sources = [
            row[0]
            for row in db.session.query(Listing.source)
            .filter(Listing.source.isnot(None))
            .distinct()
            .order_by(Listing.source.asc())
            .all()
        ]

        normalized_districts: list[str] = []
        seen: set[str] = set()
        for district in districts:
            label = canonicalize_display_district(district)
            if label in seen:
                continue
            seen.add(label)
            normalized_districts.append(label)

        return {"districts": normalized_districts, "sources": sources}

    @staticmethod
    def recommend_for_buyer(params: dict) -> dict:
        budget_max = parse_float(params.get("budget_max"))
        budget_min = parse_float(params.get("budget_min"))
        area_min = parse_float(params.get("area_min"))
        area_max = parse_float(params.get("area_max"))
        district = clean_text(params.get("district"), 64)
        district_label = canonicalize_display_district(district) if district else None
        district_values = expand_district_filter_values(district)
        keyword = clean_text(params.get("keyword"), 64)
        prefer_metro = bool(params.get("prefer_metro"))
        commute_mode = clean_text(params.get("commute_mode"), 32) or ("metro_priority" if prefer_metro else "balanced")
        limit = min(10, max(1, int(params.get("limit") or 5)))

        query = Listing.query.filter(
            Listing.status.in_(("active", "valid")),
            Listing.total_price.isnot(None),
            Listing.total_price > 0,
            Listing.unit_price.isnot(None),
            Listing.unit_price > 0,
            Listing.area.isnot(None),
            Listing.area > 0,
        )

        if budget_min is not None:
            query = query.filter(Listing.total_price >= budget_min)
        if budget_max is not None:
            query = query.filter(Listing.total_price <= budget_max)
        if area_min is not None:
            query = query.filter(Listing.area >= area_min)
        if area_max is not None:
            query = query.filter(Listing.area <= area_max)
        if district and district not in {"全部区县", "all"}:
            query = query.filter(Listing.district.in_(district_values or [district]))
        if keyword:
            like = f"%{keyword}%"
            query = query.filter(
                or_(
                    Listing.title.like(like),
                    Listing.community.like(like),
                    Listing.layout.like(like),
                    Listing.address.like(like),
                )
            )

        rows = query.order_by(Listing.data_quality_score.desc(), Listing.updated_at.desc()).limit(300).all()
        if not rows:
            return {
                "query": {
                    "budget_min": budget_min,
                    "budget_max": budget_max,
                    "area_min": area_min,
                    "area_max": area_max,
                    "district": district_label,
                    "prefer_metro": prefer_metro,
                    "commute_mode": commute_mode,
                    "keyword": keyword,
                },
                "items": [],
                "summary": {
                    "matched_count": 0,
                    "price_note": "所有价格均为挂牌价/报价，不代表成交价。",
                    "commute_note": "当前通勤便利度优先使用地铁距离字段，缺失时再退回近地铁/地铁标签代理，不代表真实通勤时间。",
                },
            }

        scored_items = []
        for row in rows:
            total_price = float(row.total_price or 0)
            unit_price = float(row.unit_price or 0)
            area = float(row.area or 0)
            quality = float(row.data_quality_score or 0)
            tags = row.tags
            metro_distance = row.metro_distance
            has_metro_tag = any("地铁" in str(tag) for tag in tags)
            if metro_distance is not None:
                metro_score = max(40.0, min(100.0, 100 - metro_distance / 30))
            else:
                metro_score = 100 if has_metro_tag else 55

            budget_score = 80
            if budget_max is not None and budget_max > 0:
                budget_score = max(0.0, min(100.0, 100 - max(0.0, (total_price / budget_max - 1) * 180)))
            elif budget_min is not None and budget_min > 0:
                budget_score = max(0.0, min(100.0, 70 + min(30.0, (total_price / budget_min) * 10)))

            area_score = 70
            if area_min is not None and area_max is not None and area_max > area_min:
                if area < area_min:
                    area_score = max(0.0, 100 - (area_min - area) * 3)
                elif area > area_max:
                    area_score = max(0.0, 100 - (area - area_max) * 2)
                else:
                    target_area = (area_min + area_max) / 2
                    area_score = max(70.0, 100 - abs(area - target_area) / max(1.0, target_area) * 40)
            elif area_min is not None:
                area_score = 100 if area >= area_min else max(0.0, 100 - (area_min - area) * 3)

            age_score = 70
            if row.house_age is not None:
                age_score = max(30.0, min(100.0, 100 - float(row.house_age) * 1.6))

            value_score = max(0.0, min(100.0, 100 - unit_price / 300))

            if commute_mode == "metro_priority":
                total_score = 0.3 * budget_score + 0.15 * area_score + 0.3 * metro_score + 0.1 * age_score + 0.15 * quality
            elif commute_mode == "value_priority":
                total_score = 0.25 * budget_score + 0.15 * area_score + 0.1 * metro_score + 0.25 * value_score + 0.25 * quality
            else:
                total_score = 0.28 * budget_score + 0.18 * area_score + 0.2 * metro_score + 0.12 * age_score + 0.22 * quality

            reasons = []
            if budget_max is not None and total_price <= budget_max:
                reasons.append("挂牌总价在预算内")
            if area_min is not None and area >= area_min:
                reasons.append("面积满足偏好")
            if metro_distance is not None:
                reasons.append(f"地铁距离约 {metro_distance} 米")
            elif has_metro_tag:
                reasons.append("带有近地铁/地铁标签")
            if quality >= 85:
                reasons.append("数据质量分较高")
            if row.house_age is not None and row.house_age <= 10:
                reasons.append("房龄相对较新")
            if not reasons:
                reasons.append("挂牌单价与面积组合较均衡")

            scored_items.append(
                {
                    "listing": row.to_dict(),
                    "recommendation_score": round(total_score, 2),
                    "score_breakdown": {
                        "budget_fit": round(budget_score, 2),
                        "area_fit": round(area_score, 2),
                        "commute_proxy": round(metro_score, 2),
                        "value_proxy": round(value_score, 2),
                        "quality": round(quality, 2),
                    },
                    "commute_proxy": {
                        "mode": commute_mode,
                        "metro_distance": metro_distance,
                        "has_metro_tag": has_metro_tag,
                        "label": (
                            f"地铁距离约 {metro_distance} 米"
                            if metro_distance is not None
                            else "近地铁友好"
                            if has_metro_tag
                            else "未识别到近地铁标签"
                        ),
                    },
                    "reasons": reasons[:4],
                }
            )

        scored_items.sort(
            key=lambda item: (
                item["recommendation_score"],
                float(item["listing"].get("data_quality_score") or 0),
                -float(item["listing"].get("total_price") or 0),
            ),
            reverse=True,
        )
        district_mix = sorted({str(item["listing"].get("district") or "") for item in scored_items[:limit] if item["listing"].get("district")})
        return {
            "query": {
                "budget_min": budget_min,
                "budget_max": budget_max,
                "area_min": area_min,
                "area_max": area_max,
                "district": district_label,
                "prefer_metro": prefer_metro,
                "commute_mode": commute_mode,
                "keyword": keyword,
            },
            "items": scored_items[:limit],
            "summary": {
                "matched_count": len(scored_items),
                "district_mix": district_mix,
                "price_note": "所有价格均为挂牌价/报价，不代表成交价。",
                "commute_note": "当前通勤便利度优先使用地铁距离字段，缺失时再退回近地铁/地铁标签代理，不代表真实通勤时间。",
            },
        }

    @staticmethod
    def query_listings(params: dict) -> dict:
        page = max(1, int(params.get("page", 1)))
        page_size_raw = int(params.get("page_size", 20))
        # CSV 导出场景允许一次性拉较大批量，UI 列表保持 100 上限。
        page_size = min(10000 if params.get("export_mode") else 100, max(1, page_size_raw))

        query = Listing.query
        district = clean_text(params.get("district"), 64)
        district_values = expand_district_filter_values(district)
        source = params.get("source")
        status = params.get("status")
        keyword = params.get("keyword")

        if district and district not in {"全部区县", "all"}:
            query = query.filter(Listing.district.in_(district_values or [district]))
        if source and source not in {"全部来源", "all"}:
            query = query.filter(Listing.source == source)
        if status and status not in {"全部状态", "all"}:
            query = query.filter(Listing.status == status)

        price_min = parse_float(params.get("price_min"))
        price_max = parse_float(params.get("price_max"))
        area_min = parse_float(params.get("area_min"))
        area_max = parse_float(params.get("area_max"))
        if price_min is not None:
            query = query.filter(Listing.total_price >= price_min)
        if price_max is not None:
            query = query.filter(Listing.total_price <= price_max)
        if area_min is not None:
            query = query.filter(Listing.area >= area_min)
        if area_max is not None:
            query = query.filter(Listing.area <= area_max)
        if keyword:
            like = f"%{keyword.strip()}%"
            query = query.filter(
                or_(
                    Listing.title.like(like),
                    Listing.community.like(like),
                    Listing.address.like(like),
                    Listing.link.like(like),
                )
            )

        pagination = query.order_by(Listing.id.asc()).paginate(
            page=page, per_page=page_size, error_out=False
        )
        return {
            "items": [item.to_dict() for item in pagination.items],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": pagination.total,
                "pages": pagination.pages,
                "has_next": pagination.has_next,
                "has_prev": pagination.has_prev,
            },
        }

    @staticmethod
    def get_listing(listing_id: int) -> Listing | None:
        return db.session.get(Listing, listing_id)

    @staticmethod
    def upsert_listing(raw: dict, task_id: int | None = None, seen_at: datetime | None = None) -> str:
        now = seen_at or datetime.utcnow()
        source = str(raw.get("source") or "").strip()
        if not source:
            raise ValueError("source 不能为空")
        title = clean_text(raw.get("title"), 255) or ""
        link = clean_text(raw.get("link"), 512) or ""
        if not title or not link:
            raise ValueError("title/link 不能为空")

        district = normalize_source_district(source, raw.get("district"))
        normalized_raw = {**raw, "district": district}

        total_price = parse_float(normalized_raw.get("total_price"))
        unit_price = parse_float(normalized_raw.get("unit_price"))
        area = parse_float(normalized_raw.get("area"))
        build_year = parse_int(normalized_raw.get("build_year"))
        layout = clean_text(normalized_raw.get("layout"), 64)
        rooms, halls = parse_rooms_halls(layout)
        floor_text = clean_text(normalized_raw.get("floor_text") or normalized_raw.get("floor"), 128)
        tags = normalized_raw.get("tags") or []
        # 结构增强字段只接受爬虫明确解析出的值；未知就保留为空。
        # 不从标题、地址、标签二次推断，避免把后处理猜测写成真实采集字段。
        total_floors = parse_int(normalized_raw.get("total_floors"))
        metro_distance = parse_int(normalized_raw.get("metro_distance"))
        building_type = clean_text(normalized_raw.get("building_type"), 64)
        has_elevator = parse_bool(normalized_raw.get("has_elevator"))
        fingerprint = normalized_raw.get("fingerprint") or build_fingerprint(normalized_raw)
        house_age = CURRENT_YEAR - build_year if build_year else None
        score = quality_score(normalized_raw)
        status = normalized_raw.get("status") or ("active" if score >= 60 else "abnormal")

        listing = Listing.query.filter_by(source=source, fingerprint=fingerprint).first()
        if listing is None:
            listing = Listing(
                source=source,
                fingerprint=fingerprint,
                first_seen_at=now,
                created_at=now,
            )
            db.session.add(listing)
            action = "inserted"
        else:
            price_changed = (
                total_price is not None
                and listing.total_price is not None
                and abs(float(listing.total_price) - total_price) > 0.001
            )
            unit_price_changed = (
                unit_price is not None
                and listing.unit_price is not None
                and abs(float(listing.unit_price) - unit_price) > 0.001
            )
            action = "snapshot" if price_changed or unit_price_changed else "unchanged"

        listing.source_listing_id = clean_text(raw.get("source_listing_id"), 128)
        listing.title = title
        listing.link = link
        listing.district = district
        listing.community = clean_text(normalized_raw.get("community"), 128)
        listing.address = normalize_listing_address(
            source,
            listing.district,
            listing.community,
            normalized_raw.get("address"),
            title=listing.title,
        )
        listing.total_price = total_price
        listing.unit_price = unit_price
        listing.area = area
        listing.layout = layout
        listing.rooms = rooms
        listing.halls = halls
        listing.orientation = clean_text(normalized_raw.get("orientation"), 64)
        listing.decoration = clean_text(normalized_raw.get("decoration"), 64)
        listing.floor_text = floor_text
        listing.floor_level = normalize_floor_level(floor_text)
        listing.total_floors = total_floors if total_floors is not None else listing.total_floors
        listing.build_year = build_year
        listing.house_age = house_age
        listing.metro_distance = metro_distance if metro_distance is not None else listing.metro_distance
        listing.building_type = building_type if building_type is not None else listing.building_type
        listing.has_elevator = has_elevator if has_elevator is not None else listing.has_elevator
        listing.data_quality_score = score
        listing.status = status
        listing.last_seen_at = now
        listing.updated_at = now
        listing.set_tags(tags)

        db.session.flush()
        if action in {"inserted", "snapshot"}:
            db.session.add(
                ListingSnapshot(
                    listing_id=listing.id,
                    total_price=listing.total_price,
                    unit_price=listing.unit_price,
                    status=listing.status,
                    source=listing.source,
                    snapshot_at=now,
                    task_id=task_id,
                )
            )
        elif action == "unchanged":
            action = "updated"
        return action

    @staticmethod
    def export_csv(params: dict) -> str:
        export_params = {**params, "page": 1, "page_size": 10000, "export_mode": "1"}
        result = ListingService.query_listings(export_params)
        items = result.get("items", [])
        output = io.StringIO()
        writer = csv.writer(output)
        # 列顺序与前端 ListingsPage 表格一致：ID、房源标题、区县、户型、面积、总价、单价、来源、质量分、状态、最近采集。
        # 第二行标题为参考用主键，二级标题保留原始字段。
        writer.writerow([
            "系统ID", "房源标题", "区县", "户型", "面积(㎡)",
            "总价(万)", "单价(元/㎡)", "来源", "质量分", "状态", "最近采集", "小区", "链接",
        ])
        for item in items:
            writer.writerow(
                [
                    item["id"],
                    item["title"],
                    item["district"],
                    item["layout"] or "",
                    item["area"] or "",
                    item["total_price"] or "",
                    item["unit_price"] or "",
                    item["source"],
                    item["data_quality_score"],
                    item["status"],
                    item.get("last_seen_at") or item.get("updated_at") or "",
                    item.get("community") or "",
                    item.get("link") or "",
                ]
            )
        return output.getvalue()

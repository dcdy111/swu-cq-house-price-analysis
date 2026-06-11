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


CURRENT_YEAR = datetime.now().year


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
    score = 100
    required = ["title", "link", "district", "total_price", "unit_price", "area"]
    missing = sum(1 for field in required if raw.get(field) in (None, "", "未知"))
    score -= missing * 10

    total_price = parse_float(raw.get("total_price"))
    unit_price = parse_float(raw.get("unit_price"))
    area = parse_float(raw.get("area"))
    build_year = parse_int(raw.get("build_year"))

    if total_price is not None and not (5 <= total_price <= 5000):
        score -= 15
    if unit_price is not None and not (1000 <= unit_price <= 100000):
        score -= 15
    if area is not None and not (10 <= area <= 500):
        score -= 15
    if build_year is not None and not (1950 <= build_year <= CURRENT_YEAR):
        score -= 10
    return max(0, min(100, score))


class ListingService:
    @staticmethod
    def query_listings(params: dict) -> dict:
        page = max(1, int(params.get("page", 1)))
        page_size = min(100, max(1, int(params.get("page_size", 20))))

        query = Listing.query
        district = params.get("district")
        source = params.get("source")
        status = params.get("status")
        keyword = params.get("keyword")

        if district and district not in {"全部区县", "all"}:
            query = query.filter(Listing.district == district)
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

        pagination = query.order_by(Listing.updated_at.desc(), Listing.id.desc()).paginate(
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

        total_price = parse_float(raw.get("total_price"))
        unit_price = parse_float(raw.get("unit_price"))
        area = parse_float(raw.get("area"))
        build_year = parse_int(raw.get("build_year"))
        layout = clean_text(raw.get("layout"), 64)
        rooms, halls = parse_rooms_halls(layout)
        floor_text = clean_text(raw.get("floor_text") or raw.get("floor"), 128)
        fingerprint = raw.get("fingerprint") or build_fingerprint(raw)
        house_age = CURRENT_YEAR - build_year if build_year else None
        score = quality_score(raw)
        status = raw.get("status") or ("active" if score >= 60 else "abnormal")

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
        listing.district = clean_text(raw.get("district"), 64) or "待复核"
        listing.community = clean_text(raw.get("community"), 128)
        listing.address = clean_text(raw.get("address"), 255)
        listing.total_price = total_price
        listing.unit_price = unit_price
        listing.area = area
        listing.layout = layout
        listing.rooms = rooms
        listing.halls = halls
        listing.orientation = clean_text(raw.get("orientation"), 64)
        listing.decoration = clean_text(raw.get("decoration"), 64)
        listing.floor_text = floor_text
        listing.floor_level = normalize_floor_level(floor_text)
        listing.build_year = build_year
        listing.house_age = house_age
        listing.data_quality_score = score
        listing.status = status
        listing.last_seen_at = now
        listing.updated_at = now
        listing.set_tags(raw.get("tags") or [])

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
        result = ListingService.query_listings({**params, "page": 1, "page_size": 100})
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ID", "来源", "标题", "区县", "小区", "总价(万)", "单价(元/㎡)", "面积(㎡)", "户型", "链接"])
        for item in result["items"]:
            writer.writerow(
                [
                    item["id"],
                    item["source"],
                    item["title"],
                    item["district"],
                    item["community"] or "",
                    item["total_price"] or "",
                    item["unit_price"] or "",
                    item["area"] or "",
                    item["layout"] or "",
                    item["link"],
                ]
            )
        return output.getvalue()

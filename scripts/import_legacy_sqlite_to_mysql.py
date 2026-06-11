from __future__ import annotations

import argparse
import sqlite3
import sys
import re
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from Backend.app import create_app  # noqa: E402
from Backend.extensions import db  # noqa: E402
from Backend.services.listing_service import ListingService  # noqa: E402


def infer_source(link: str | None, default: str) -> str:
    value = (link or "").lower()
    if "lianjia.com" in value:
        return "lianjia_legacy"
    if "anjuke.com" in value or "58.com" in value:
        return "anjuke_legacy"
    if "fang.com" in value:
        return "fang_legacy"
    return default


def clean_text(value):
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    if not text or text == "未知":
        return None
    return text


def parse_legacy_layout(row: sqlite3.Row) -> dict:
    layout = clean_text(row["layout"])
    area = row["area"]
    orientation = clean_text(row["orientation"])
    decoration = clean_text(row["decoration"])
    community = None

    if layout and "/" in layout:
        parts = [clean_text(part) for part in layout.split("/") if clean_text(part)]
        if len(parts) >= 2:
            community = parts[0]
            layout = parts[1]
        if len(parts) >= 3 and area is None:
            area_match = re.search(r"\d+(?:\.\d+)?", parts[2])
            area = float(area_match.group(0)) if area_match else None
        if len(parts) >= 4 and not orientation:
            orientation = parts[3]
        if len(parts) >= 5 and not decoration:
            decoration = parts[4]

    return {
        "community": community,
        "layout": layout,
        "area": area,
        "orientation": orientation,
        "decoration": decoration,
    }


def parse_time(value) -> datetime | None:
    text = clean_text(value)
    if not text:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def iter_rows(sqlite_path: Path, limit: int | None):
    conn = sqlite3.connect(str(sqlite_path))
    conn.row_factory = sqlite3.Row
    sql = "SELECT * FROM houses ORDER BY id"
    if limit:
        sql += f" LIMIT {int(limit)}"
    try:
        for row in conn.execute(sql):
            yield row
    finally:
        conn.close()


def convert_row(row: sqlite3.Row, default_source: str) -> dict:
    link = row["link"]
    parsed = parse_legacy_layout(row)
    return {
        "source": infer_source(link, default_source),
        "source_listing_id": str(row["id"]),
        "title": row["title"],
        "link": link,
        "district": row["district"],
        "community": parsed["community"],
        "address": None,
        "total_price": row["total_price"],
        "unit_price": row["unit_price"],
        "area": parsed["area"],
        "layout": parsed["layout"],
        "orientation": parsed["orientation"],
        "decoration": parsed["decoration"],
        "floor_text": row["floor"],
        "build_year": row["build_year"],
        "tags": ["旧库冷启动"],
        "status": "active",
        "seen_at": parse_time(row["crawl_time"]),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="将 2025 旧 SQLite 房源库一次性导入当前 SQLAlchemy 数据库。")
    parser.add_argument("--source-db", required=True, help="旧 SQLite 数据库路径，例如 ../2025学年设计/pythonProject1/data/lianjia_houses.db")
    parser.add_argument("--database-url", help="覆盖 DATABASE_URL，正式演示应填写 MySQL 连接串")
    parser.add_argument("--default-source", default="legacy_2025", help="无法从链接识别来源时使用的 source")
    parser.add_argument("--limit", type=int, help="调试时限制导入条数")
    args = parser.parse_args()

    sqlite_path = Path(args.source_db).resolve()
    if not sqlite_path.exists():
        raise SystemExit(f"旧库不存在: {sqlite_path}")

    test_config = {"SQLALCHEMY_DATABASE_URI": args.database_url} if args.database_url else None
    app = create_app(test_config)
    inserted = updated = snapshot = failed = total = 0
    with app.app_context():
        db.create_all()
        for row in iter_rows(sqlite_path, args.limit):
            total += 1
            try:
                raw = convert_row(row, args.default_source)
                action = ListingService.upsert_listing(raw, seen_at=raw.get("seen_at"))
                if action == "inserted":
                    inserted += 1
                    snapshot += 1
                elif action == "snapshot":
                    snapshot += 1
                else:
                    updated += 1
                if total % 1000 == 0:
                    db.session.commit()
                    print(f"已处理 {total} 条，新增 {inserted}，更新/未变 {updated}，快照 {snapshot}")
            except Exception as exc:
                db.session.rollback()
                failed += 1
                print(f"导入失败 row_id={row['id']}: {exc}")
        db.session.commit()
    print(f"导入完成：总计 {total}，新增 {inserted}，更新/未变 {updated}，快照 {snapshot}，失败 {failed}")


if __name__ == "__main__":
    main()

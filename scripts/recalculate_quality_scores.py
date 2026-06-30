from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> int:
    parser = argparse.ArgumentParser(description="按六维规则重算 listings.data_quality_score。")
    parser.add_argument("--database-url", help="可选，覆盖 DATABASE_URL。默认读取 .env / 环境变量。")
    parser.add_argument("--batch-size", type=int, default=1000, help="批量提交大小，默认 1000。")
    parser.add_argument("--dry-run", action="store_true", help="只统计，不写回数据库。")
    parser.add_argument("--evidence-json", help="可选，输出重算统计 JSON。")
    args = parser.parse_args()

    if args.database_url:
        os.environ["DATABASE_URL"] = args.database_url

    from Backend.app import create_app
    from Backend.extensions import db
    from Backend.models.listing import Listing
    from Backend.services.listing_service import quality_score

    app = create_app({"SCHEDULER_ENABLED": False, "AUTH_REQUIRED": False})

    with app.app_context():
        batch_size = max(100, int(args.batch_size))
        last_id = 0
        scanned = 0
        changed = 0
        score_buckets = {"90+": 0, "80-89": 0, "70-79": 0, "<70": 0}

        while True:
            rows = (
                Listing.query.filter(Listing.id > last_id)
                .order_by(Listing.id.asc())
                .limit(batch_size)
                .all()
            )
            if not rows:
                break

            for row in rows:
                scanned += 1
                raw = {
                    "source": row.source,
                    "source_listing_id": row.source_listing_id,
                    "title": row.title,
                    "link": row.link,
                    "district": row.district,
                    "total_price": row.total_price,
                    "unit_price": row.unit_price,
                    "area": row.area,
                    "layout": row.layout,
                    "build_year": row.build_year,
                }
                next_score = int(quality_score(raw))
                if next_score != int(row.data_quality_score or 0):
                    changed += 1
                    row.data_quality_score = next_score
                if next_score >= 90:
                    score_buckets["90+"] += 1
                elif next_score >= 80:
                    score_buckets["80-89"] += 1
                elif next_score >= 70:
                    score_buckets["70-79"] += 1
                else:
                    score_buckets["<70"] += 1
                last_id = row.id

            if args.dry_run:
                db.session.rollback()
            else:
                db.session.commit()

        evidence = {
            "verified_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "dry_run": args.dry_run,
            "scanned": scanned,
            "changed": changed,
            "score_buckets": score_buckets,
        }
        print(json.dumps(evidence, ensure_ascii=False, indent=2))

        if args.evidence_json:
            evidence_path = Path(args.evidence_json).expanduser().resolve()
            evidence_path.parent.mkdir(parents=True, exist_ok=True)
            evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"[evidence] {evidence_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

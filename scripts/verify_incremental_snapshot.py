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
    parser = argparse.ArgumentParser(description="验证增量 upsert：重复数据不新增主表，价格变化新增快照。")
    parser.add_argument("--database-url", help="可选，覆盖 DATABASE_URL。默认读取 .env / 环境变量。")
    parser.add_argument("--keep", action="store_true", help="保留本次验收样本；默认验证后清理。")
    parser.add_argument("--evidence-json", help="可选，把检查项、前后计数和清理状态写入 JSON 证据文件。")
    args = parser.parse_args()

    if args.database_url:
        os.environ["DATABASE_URL"] = args.database_url

    from Backend.app import create_app
    from Backend.extensions import db
    from Backend.models.listing import Listing
    from Backend.models.snapshot import ListingSnapshot
    from Backend.services.listing_service import ListingService, build_fingerprint

    app = create_app({"SCHEDULER_ENABLED": False, "AUTH_REQUIRED": False})
    stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    source_listing_id = f"local-incremental-{stamp}"
    raw = {
        "source": "local_acceptance",
        "source_listing_id": source_listing_id,
        "title": "本地增量验收样本 3室2厅",
        "link": f"https://local.acceptance/listings/{source_listing_id}",
        "district": "渝北",
        "community": "本地验收小区",
        "total_price": 120,
        "unit_price": 12000,
        "area": 100,
        "layout": "3室2厅",
        "floor_text": "中层",
        "build_year": 2018,
        "status": "active",
    }
    fingerprint = build_fingerprint(raw)

    with app.app_context():
        db.create_all()
        before_total = db.session.query(db.func.count(Listing.id)).scalar() or 0
        before_snapshots = db.session.query(db.func.count(ListingSnapshot.id)).scalar() or 0

        action_insert = ListingService.upsert_listing(raw)
        db.session.commit()
        after_insert_total = db.session.query(db.func.count(Listing.id)).scalar() or 0

        action_duplicate = ListingService.upsert_listing(raw)
        db.session.commit()
        after_duplicate_total = db.session.query(db.func.count(Listing.id)).scalar() or 0

        changed = {**raw, "total_price": 125, "unit_price": 12500}
        action_snapshot = ListingService.upsert_listing(changed)
        db.session.commit()

        listing = Listing.query.filter_by(source=raw["source"], fingerprint=fingerprint).first()
        if listing is None:
            raise RuntimeError("验收样本未入库")
        listing_snapshot_count = ListingSnapshot.query.filter_by(listing_id=listing.id).count()
        after_total = db.session.query(db.func.count(Listing.id)).scalar() or 0
        after_snapshots = db.session.query(db.func.count(ListingSnapshot.id)).scalar() or 0

        checks = {
            "insert_action_is_inserted": action_insert == "inserted",
            "duplicate_action_is_updated": action_duplicate == "updated",
            "price_change_action_is_snapshot": action_snapshot == "snapshot",
            "insert_adds_one_listing": after_insert_total == before_total + 1,
            "duplicate_does_not_add_listing": after_duplicate_total == after_insert_total,
            "final_listing_count_stable": after_total == after_insert_total,
            "listing_has_two_snapshots": listing_snapshot_count == 2,
            "global_snapshot_increased_by_two": after_snapshots == before_snapshots + 2,
        }

        for name, passed in checks.items():
            print(f"[{'ok' if passed else 'fail'}] {name}")
        print(f"[data] listing_id={listing.id} fingerprint={fingerprint}")
        print(f"[data] listing_count: {before_total} -> {after_total}")
        print(f"[data] snapshot_count: {before_snapshots} -> {after_snapshots}")

        if not all(checks.values()):
            raise RuntimeError("增量快照验收失败")

        cleanup_performed = False
        if not args.keep:
            db.session.delete(listing)
            db.session.commit()
            cleanup_performed = True
            print("[cleanup] 已清理本地验收样本。需要保留证据时请加 --keep。")

        if args.evidence_json:
            evidence_path = Path(args.evidence_json).expanduser().resolve()
            evidence_path.parent.mkdir(parents=True, exist_ok=True)
            final_total = db.session.query(db.func.count(Listing.id)).scalar() or 0
            final_snapshots = db.session.query(db.func.count(ListingSnapshot.id)).scalar() or 0
            evidence = {
                "verified_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                "checks": checks,
                "sample": {
                    "source": raw["source"],
                    "source_listing_id": source_listing_id,
                    "listing_id": listing.id,
                    "fingerprint": fingerprint,
                },
                "observed_counts": {
                    "listings_before": int(before_total),
                    "listings_after_insert": int(after_insert_total),
                    "listings_after_duplicate": int(after_duplicate_total),
                    "listings_after_price_change": int(after_total),
                    "snapshots_before": int(before_snapshots),
                    "snapshots_after_price_change": int(after_snapshots),
                    "sample_snapshot_count": int(listing_snapshot_count),
                },
                "cleanup": {
                    "performed": cleanup_performed,
                    "final_listing_count": int(final_total),
                    "final_snapshot_count": int(final_snapshots),
                },
            }
            evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"[evidence] {evidence_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

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


def count_state(db, CrawlTask, CrawlLog, Listing, ListingSnapshot) -> dict:
    db.session.remove()
    return {
        "crawl_tasks": int(db.session.query(db.func.count(CrawlTask.id)).scalar() or 0),
        "crawl_logs": int(db.session.query(db.func.count(CrawlLog.id)).scalar() or 0),
        "listings": int(db.session.query(db.func.count(Listing.id)).scalar() or 0),
        "snapshots": int(db.session.query(db.func.count(ListingSnapshot.id)).scalar() or 0),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="走真实定时处理函数，验证 scheduled_incremental 任务、日志和计数证据。")
    parser.add_argument("--database-url", help="可选，覆盖 DATABASE_URL。默认读取 .env / 环境变量。")
    parser.add_argument("--source", default="fang", help="定时增量数据源，默认 fang。")
    parser.add_argument("--district", default="渝中", help="定时增量区县，默认 渝中。")
    parser.add_argument("--max-pages", type=int, default=1, help="每区页数，默认 1。")
    parser.add_argument("--max-workers", type=int, default=1, help="并发数，默认 1。")
    parser.add_argument("--evidence-json", required=True, help="证据 JSON 输出路径。")
    args = parser.parse_args()

    if args.database_url:
        os.environ["DATABASE_URL"] = args.database_url

    from Backend.app import create_app
    from Backend.extensions import db
    from Backend.models.crawl import CrawlLog, CrawlTask
    from Backend.models.listing import Listing
    from Backend.models.snapshot import ListingSnapshot
    from Backend.tasks.scheduler import run_scheduled_incremental_crawl

    app = create_app({"SCHEDULER_ENABLED": False, "AUTH_REQUIRED": False})

    with app.app_context():
        db.create_all()
        before = count_state(db, CrawlTask, CrawlLog, Listing, ListingSnapshot)
        run_scheduled_incremental_crawl(
            app,
            overrides={
                "name": "定时增量验收任务",
                "incremental_crawl_source": args.source,
                "districts": [args.district],
                "incremental_crawl_max_pages": max(1, int(args.max_pages)),
                "incremental_crawl_max_workers": max(1, int(args.max_workers)),
                "mode": "scheduled_incremental",
            },
        )
        task_id = int(db.session.query(db.func.max(CrawlTask.id)).scalar() or 0)
        task_row = db.session.get(CrawlTask, task_id)
        if task_row is None:
            raise RuntimeError("scheduled_incremental 任务未落库")

        logs = (
            CrawlLog.query.filter_by(task_id=task_row.id)
            .order_by(CrawlLog.id.asc())
            .limit(30)
            .all()
        )
        after = count_state(db, CrawlTask, CrawlLog, Listing, ListingSnapshot)
        checks = {
            "task_created": after["crawl_tasks"] == before["crawl_tasks"] + 1,
            "mode_is_scheduled_incremental": task_row.mode == "scheduled_incremental",
            "task_finished": task_row.finished_at is not None,
            "logs_persisted": len(logs) > 0 and after["crawl_logs"] > before["crawl_logs"],
            "status_is_terminal": task_row.status in {"success", "partial_failed", "failed", "canceled"},
        }
        evidence = {
            "verified_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "overrides": {
                "source": args.source,
                "district": args.district,
                "max_pages": max(1, int(args.max_pages)),
                "max_workers": max(1, int(args.max_workers)),
            },
            "checks": checks,
            "before": before,
            "after": after,
            "task": task_row.to_dict(include_logs=True),
            "logs_preview": [item.to_dict() for item in logs],
        }
        evidence_path = Path(args.evidence_json).expanduser().resolve()
        evidence_path.parent.mkdir(parents=True, exist_ok=True)
        evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")

        print(f"[task] id={task_row.id} status={task_row.status} mode={task_row.mode}")
        print(f"[counts] crawl_tasks {before['crawl_tasks']} -> {after['crawl_tasks']}")
        print(f"[counts] crawl_logs {before['crawl_logs']} -> {after['crawl_logs']}")
        print(f"[counts] listings {before['listings']} -> {after['listings']}")
        print(f"[counts] snapshots {before['snapshots']} -> {after['snapshots']}")
        print(f"[evidence] {evidence_path}")

        if not all(checks.values()) or task_row.status == "failed":
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

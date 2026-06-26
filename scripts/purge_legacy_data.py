from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


LEGACY_SOURCES = ["anjuke_legacy", "lianjia_legacy"]


def parse_sources(raw: str | None) -> list[str]:
    values = [item.strip() for item in (raw or "").split(",") if item.strip()]
    return values or list(LEGACY_SOURCES)


def count_by_source(model, sources: list[str]) -> dict[str, int]:
    from Backend.extensions import db

    rows = (
        db.session.query(model.source, db.func.count(model.id))
        .filter(model.source.in_(sources))
        .group_by(model.source)
        .order_by(model.source)
        .all()
    )
    return {source: int(count) for source, count in rows}


def purge_sources(sources: list[str], dry_run: bool, clear_crawl_history: bool = False) -> dict:
    from Backend.extensions import db
    from Backend.models.analysis import AnalysisJob, ModelResult
    from Backend.models.crawl import CrawlLog, CrawlTask
    from Backend.models.listing import Listing
    from Backend.models.quality import DataQualityReport
    from Backend.models.snapshot import ListingSnapshot

    before = {
        "listings": count_by_source(Listing, sources),
        "snapshots": count_by_source(ListingSnapshot, sources),
        "analysis_jobs": int(db.session.query(db.func.count(AnalysisJob.id)).scalar() or 0),
        "model_results": int(db.session.query(db.func.count(ModelResult.id)).scalar() or 0),
        "quality_reports": int(db.session.query(db.func.count(DataQualityReport.id)).scalar() or 0),
        "crawl_tasks": int(db.session.query(db.func.count(CrawlTask.id)).scalar() or 0),
        "crawl_logs": int(db.session.query(db.func.count(CrawlLog.id)).scalar() or 0),
    }
    if dry_run:
        return {"dry_run": True, "sources": sources, "before": before}

    # 这些结果通常是基于旧全库生成的。清理冷启动数据后先删掉，避免展示过期模型结论。
    deleted = {
        "model_results": db.session.query(ModelResult).delete(synchronize_session=False),
        "analysis_jobs": db.session.query(AnalysisJob).delete(synchronize_session=False),
        "quality_reports": db.session.query(DataQualityReport).delete(synchronize_session=False),
        "snapshots": db.session.query(ListingSnapshot).filter(ListingSnapshot.source.in_(sources)).delete(synchronize_session=False),
        "listings": db.session.query(Listing).filter(Listing.source.in_(sources)).delete(synchronize_session=False),
    }
    if clear_crawl_history:
        deleted["crawl_logs"] = db.session.query(CrawlLog).delete(synchronize_session=False)
        deleted["crawl_tasks"] = db.session.query(CrawlTask).delete(synchronize_session=False)
    db.session.commit()
    after = {
        "listings": count_by_source(Listing, sources),
        "snapshots": count_by_source(ListingSnapshot, sources),
        "crawl_tasks": int(db.session.query(db.func.count(CrawlTask.id)).scalar() or 0),
        "crawl_logs": int(db.session.query(db.func.count(CrawlLog.id)).scalar() or 0),
    }
    return {"dry_run": False, "sources": sources, "before": before, "deleted": deleted, "after": after}


def main() -> int:
    parser = argparse.ArgumentParser(description="清理冷启动旧数据源，保留真实运行期新爬数据。")
    parser.add_argument("--sources", default=",".join(LEGACY_SOURCES), help="要清理的来源，逗号分隔")
    parser.add_argument("--dry-run", action="store_true", help="只统计，不删除")
    parser.add_argument("--clear-crawl-history", action="store_true", help="同时清理采集任务与日志历史")
    args = parser.parse_args()

    from Backend.app import create_app

    app = create_app({"SCHEDULER_ENABLED": False, "AUTH_REQUIRED": False})
    with app.app_context():
        result = purge_sources(
            parse_sources(args.sources),
            dry_run=args.dry_run,
            clear_crawl_history=args.clear_crawl_history,
        )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

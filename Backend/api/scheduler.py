from __future__ import annotations

from flask import Blueprint, current_app, request

from Backend.services.crawl_service import CrawlService
from Backend.services.quality_service import QualityService
from Backend.tasks.scheduler import scheduler_status
from Backend.utils.response import api_error, api_success


bp = Blueprint("scheduler", __name__, url_prefix="/api/scheduler")


@bp.get("/status")
def status():
    return api_success(scheduler_status())


@bp.post("/run-quality-report")
def run_quality_report():
    item = QualityService.save_report(report_type="manual_scheduler")
    return api_success(item.to_dict(include_detail=True), status_code=201)


@bp.post("/run-incremental-crawl")
def run_incremental_crawl():
    payload = request.get_json(silent=True) or {}
    try:
        task = CrawlService.create_task(
            {
                "name": payload.get("name") or "手动增量采集任务",
                "source": payload.get("source") or current_app.config.get("INCREMENTAL_CRAWL_SOURCE", "fang"),
                "districts": payload.get("districts") or [],
                "max_pages": int(payload.get("max_pages") or current_app.config.get("INCREMENTAL_CRAWL_MAX_PAGES", 1)),
                "max_workers": int(
                    payload.get("max_workers") or current_app.config.get("INCREMENTAL_CRAWL_MAX_WORKERS", 3)
                ),
                "mode": "manual_incremental",
            }
        )
        if payload.get("run_now", True):
            task = CrawlService.run_task(task.id)
        return api_success(task.to_dict(include_logs=True), status_code=201)
    except ValueError as exc:
        return api_error(str(exc), status_code=400)

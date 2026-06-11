from __future__ import annotations

from flask import Flask, current_app

from Backend.services.crawl_service import CrawlService
from Backend.services.quality_service import QualityService


def init_scheduler(app: Flask):
    if app.config.get("TESTING") or not app.config.get("SCHEDULER_ENABLED"):
        app.extensions["scheduler"] = None
        return None
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
    except ImportError as exc:
        app.extensions["scheduler"] = None
        app.logger.warning("APScheduler 未安装，后台调度未启动: %s", exc)
        return None

    scheduler = BackgroundScheduler(timezone=app.config.get("SCHEDULER_TIMEZONE", "Asia/Shanghai"))
    if app.config.get("QUALITY_REPORT_JOB_ENABLED"):
        scheduler.add_job(
            func=lambda: run_scheduled_quality_report(app),
            trigger="interval",
            hours=max(1, int(app.config.get("QUALITY_REPORT_INTERVAL_HOURS", 24))),
            id="quality_report_snapshot",
            name="定期生成数据质量报告",
            replace_existing=True,
            max_instances=1,
        )
    if app.config.get("INCREMENTAL_CRAWL_JOB_ENABLED"):
        scheduler.add_job(
            func=lambda: run_scheduled_incremental_crawl(app),
            trigger="interval",
            hours=max(1, int(app.config.get("INCREMENTAL_CRAWL_INTERVAL_HOURS", 24))),
            id="incremental_crawl",
            name="定期增量采集",
            replace_existing=True,
            max_instances=1,
        )
    scheduler.start()
    app.extensions["scheduler"] = scheduler
    app.logger.info("后台调度已启动，任务数=%s", len(scheduler.get_jobs()))
    return scheduler


def scheduler_status() -> dict:
    scheduler = current_app.extensions.get("scheduler")
    if scheduler is None:
        return {
            "enabled": bool(current_app.config.get("SCHEDULER_ENABLED")),
            "running": False,
            "jobs": [],
            "note": "调度器未启动；测试环境或 SCHEDULER_ENABLED=false 时属于预期。",
        }
    return {
        "enabled": True,
        "running": scheduler.running,
        "jobs": [
            {
                "id": job.id,
                "name": job.name,
                "next_run_time": job.next_run_time.isoformat(sep=" ") if job.next_run_time else None,
                "trigger": str(job.trigger),
            }
            for job in scheduler.get_jobs()
        ],
    }


def run_scheduled_quality_report(app: Flask):
    with app.app_context():
        return QualityService.save_report(report_type="scheduled")


def run_scheduled_incremental_crawl(app: Flask):
    with app.app_context():
        districts = [
            item.strip()
            for item in str(app.config.get("INCREMENTAL_CRAWL_DISTRICTS") or "").split(",")
            if item.strip()
        ]
        task = CrawlService.create_task(
            {
                "name": "定时增量采集任务",
                "source": app.config.get("INCREMENTAL_CRAWL_SOURCE", "fang"),
                "districts": districts,
                "max_pages": int(app.config.get("INCREMENTAL_CRAWL_MAX_PAGES", 1)),
                "max_workers": int(app.config.get("INCREMENTAL_CRAWL_MAX_WORKERS", 3)),
                "mode": "scheduled_incremental",
            }
        )
        return CrawlService.run_task(task.id)

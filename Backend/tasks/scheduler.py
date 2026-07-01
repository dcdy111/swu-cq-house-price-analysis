from __future__ import annotations

from flask import Flask, current_app

from Backend.services.crawl_service import CrawlService
from Backend.services.quality_service import QualityService
from Backend.services.settings_service import SettingsService


def _resolve_incremental_districts(settings: dict) -> list[str]:
    districts = [
        item.strip()
        for item in str(settings.get("incremental_crawl_districts") or "").split(",")
        if item.strip()
    ]
    if isinstance(settings.get("districts"), list):
        districts = [str(item).strip() for item in settings.get("districts") or [] if str(item).strip()]
    if not districts:
        return ["全部"]
    return districts


def init_scheduler(app: Flask):
    if app.config.get("TESTING"):
        app.extensions["scheduler"] = None
        return None
    with app.app_context():
        settings = SettingsService.scheduler_settings()
    if not settings.get("enabled"):
        app.extensions["scheduler"] = None
        return None
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
    except ImportError as exc:
        app.extensions["scheduler"] = None
        app.logger.warning("APScheduler 未安装，后台调度未启动: %s", exc)
        return None

    scheduler = BackgroundScheduler(timezone=settings.get("timezone") or app.config.get("SCHEDULER_TIMEZONE", "Asia/Shanghai"))
    if settings.get("quality_report_job_enabled"):
        scheduler.add_job(
            func=lambda: run_scheduled_quality_report(app),
            trigger="interval",
            hours=max(1, int(settings.get("quality_report_interval_hours") or 24)),
            id="quality_report_snapshot",
            name="定期生成数据质量报告",
            replace_existing=True,
            max_instances=1,
        )
    if settings.get("incremental_crawl_job_enabled"):
        scheduler.add_job(
            func=lambda: run_scheduled_incremental_crawl(app),
            trigger="interval",
            hours=max(1, int(settings.get("incremental_crawl_interval_hours") or 24)),
            id="incremental_crawl",
            name="定期增量采集",
            replace_existing=True,
            max_instances=1,
        )
    scheduler.start()
    app.extensions["scheduler"] = scheduler
    app.logger.info("后台调度已启动，任务数=%s", len(scheduler.get_jobs()))
    return scheduler


def reconfigure_scheduler(app: Flask):
    existing = app.extensions.get("scheduler")
    if existing is not None:
        try:
            existing.shutdown(wait=False)
        except Exception as exc:  # pragma: no cover - 调度器关闭失败时仅记录，不阻断设置保存。
            app.logger.warning("后台调度关闭失败，继续重建: %s", exc)
    app.extensions["scheduler"] = None
    return init_scheduler(app)


def scheduler_status() -> dict:
    scheduler = current_app.extensions.get("scheduler")
    settings = SettingsService.scheduler_settings()
    if scheduler is None:
        return {
            "enabled": bool(settings.get("enabled")),
            "running": False,
            "jobs": [],
            "settings": settings,
            "note": "调度器未启动；测试环境或 SCHEDULER_ENABLED=false 时属于预期。",
        }
    return {
        "enabled": True,
        "running": scheduler.running,
        "settings": settings,
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


def run_scheduled_incremental_crawl(app: Flask, overrides: dict | None = None):
    with app.app_context():
        settings = {**SettingsService.scheduler_settings(), **(overrides or {})}
        districts = _resolve_incremental_districts(settings)
        task = CrawlService.create_task(
            {
                "name": settings.get("name") or "定时增量采集任务",
                "source": settings.get("incremental_crawl_source") or "fang",
                "districts": districts,
                "max_pages": int(settings.get("incremental_crawl_max_pages") or 1),
                "max_workers": int(settings.get("incremental_crawl_max_workers") or 3),
                "mode": settings.get("mode") or "scheduled_incremental",
            }
        )
        return CrawlService.run_task(task.id)

from __future__ import annotations

import os
from datetime import datetime, timedelta
from pathlib import Path

from flask import Flask, current_app

from Backend.services.crawl_service import CrawlService
from Backend.services.quality_service import QualityService
from Backend.services.settings_service import SettingsService

try:  # pragma: no cover - Python 3.9+ 标准库
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None

try:  # pragma: no cover - Windows 本地环境没有 fcntl，生产 Linux 环境会使用文件锁。
    import fcntl
except ImportError:  # pragma: no cover
    fcntl = None


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


def _scheduler_lock_path(app: Flask) -> Path:
    return Path(app.root_path).resolve().parent / "data" / ".scheduler.lock"


def _acquire_scheduler_lock(app: Flask):
    if fcntl is None:
        return None
    lock_path = _scheduler_lock_path(app)
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = lock_path.open("a+", encoding="utf-8")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        return None
    handle.seek(0)
    handle.truncate()
    handle.write(str(os.getpid()))
    handle.flush()
    return handle


def _release_scheduler_lock(handle) -> None:
    if handle is None:
        return
    try:
        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    finally:
        handle.close()


def _read_scheduler_lock_owner(app: Flask) -> int | None:
    lock_path = _scheduler_lock_path(app)
    if not lock_path.exists():
        return None
    try:
        content = lock_path.read_text(encoding="utf-8").strip()
        owner_pid = int(content)
    except (OSError, ValueError):
        return None
    try:
        os.kill(owner_pid, 0)
    except OSError:
        return None
    return owner_pid


def _read_scheduler_lock_started_at(app: Flask, timezone_name: str | None) -> datetime | None:
    lock_path = _scheduler_lock_path(app)
    if not lock_path.exists():
        return None
    try:
        stat = lock_path.stat()
    except OSError:
        return None
    if ZoneInfo is not None:
        try:
            tzinfo = ZoneInfo(timezone_name or "Asia/Shanghai")
        except Exception:  # pragma: no cover - 非法时区名退回系统本地时间
            tzinfo = None
        if tzinfo is not None:
            return datetime.fromtimestamp(stat.st_mtime, tzinfo)
    return datetime.fromtimestamp(stat.st_mtime)


def _build_configured_jobs(settings: dict, started_at: datetime | None = None) -> list[dict]:
    scheduler_enabled = bool(settings.get("enabled"))
    jobs: list[dict] = []
    if scheduler_enabled and settings.get("quality_report_job_enabled"):
        interval_hours = max(1, int(settings.get("quality_report_interval_hours") or 24))
        jobs.append(
            {
                "id": "quality_report_snapshot",
                "name": "定期生成数据质量报告",
                "next_run_time": (started_at + timedelta(hours=interval_hours)).isoformat(sep=" ") if started_at else None,
                "trigger": f"interval[{interval_hours}h]",
            }
        )
    if scheduler_enabled and settings.get("incremental_crawl_job_enabled"):
        interval_hours = max(1, int(settings.get("incremental_crawl_interval_hours") or 24))
        jobs.append(
            {
                "id": "incremental_crawl",
                "name": "定期增量采集",
                "next_run_time": (started_at + timedelta(hours=interval_hours)).isoformat(sep=" ") if started_at else None,
                "trigger": f"interval[{interval_hours}h]",
            }
        )
    return jobs


def init_scheduler(app: Flask):
    if app.config.get("TESTING"):
        app.extensions["scheduler"] = None
        return None
    with app.app_context():
        settings = SettingsService.scheduler_settings()
    if not settings.get("enabled"):
        app.extensions["scheduler"] = None
        _release_scheduler_lock(app.extensions.pop("scheduler_lock", None))
        return None
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
    except ImportError as exc:
        app.extensions["scheduler"] = None
        app.logger.warning("APScheduler 未安装，后台调度未启动: %s", exc)
        return None

    lock_handle = _acquire_scheduler_lock(app)
    if fcntl is not None and lock_handle is None:
        app.extensions["scheduler"] = None
        app.extensions["scheduler_lock"] = None
        app.logger.info("检测到其他进程已持有调度锁，当前 worker 跳过 APScheduler 启动")
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
    app.extensions["scheduler_lock"] = lock_handle
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
    _release_scheduler_lock(app.extensions.pop("scheduler_lock", None))
    return init_scheduler(app)


def scheduler_status() -> dict:
    scheduler = current_app.extensions.get("scheduler")
    settings = SettingsService.scheduler_settings()
    lock_owner = _read_scheduler_lock_owner(current_app)
    scheduler_enabled = bool(settings.get("enabled"))
    configured_jobs = _build_configured_jobs(
        settings,
        started_at=_read_scheduler_lock_started_at(current_app, settings.get("timezone")),
    )
    if scheduler is None:
        if not scheduler_enabled:
            note = "调度器总开关已关闭，当前不会自动执行定时任务。"
        elif lock_owner:
            note = f"当前请求命中非持锁 worker；APScheduler 正由 PID {lock_owner} 运行。"
        else:
            note = "调度器尚未启动；请检查服务启动日志、锁文件和 APScheduler 依赖。"
        return {
            "enabled": scheduler_enabled,
            "running": scheduler_enabled and bool(lock_owner),
            "lock_held": False,
            "lock_owner_pid": lock_owner,
            "jobs": configured_jobs,
            "settings": settings,
            "note": note,
        }
    return {
        "enabled": True,
        "running": scheduler.running,
        "lock_held": current_app.extensions.get("scheduler_lock") is not None,
        "lock_owner_pid": lock_owner,
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

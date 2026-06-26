from __future__ import annotations

from copy import deepcopy
from typing import Any

from flask import current_app
from sqlalchemy.exc import SQLAlchemyError

from Backend.extensions import db
from Backend.models.setting import SystemSetting


APP_SETTINGS_KEY = "app_settings"
DEEPSEEK_API_KEY = "deepseek_api_key"


def _bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).lower() in {"1", "true", "yes", "on"}


def _mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"


class SettingsService:
    @staticmethod
    def defaults() -> dict:
        return {
            "crawler": {
                "max_workers": int(current_app.config.get("CRAWL_MAX_WORKERS", 4)),
                "max_pages_per_district": int(current_app.config.get("CRAWL_MAX_PAGES_PER_DISTRICT", 200)),
                "request_timeout": int(current_app.config.get("CRAWL_REQUEST_TIMEOUT", 15)),
                "retry_times": int(current_app.config.get("CRAWL_RETRY_TIMES", 2)),
                "interval_min": float(current_app.config.get("CRAWL_INTERVAL_MIN", 1.0)),
                "interval_max": float(current_app.config.get("CRAWL_INTERVAL_MAX", 3.0)),
                "sources": {
                    "fang": {"enabled": True},
                    "anjuke_mobile": {"enabled": True},
                    "lianjia": {"enabled": False},
                },
            },
            "scheduler": {
                "enabled": _bool(current_app.config.get("SCHEDULER_ENABLED")),
                "timezone": current_app.config.get("SCHEDULER_TIMEZONE", "Asia/Shanghai"),
                "quality_report_job_enabled": _bool(current_app.config.get("QUALITY_REPORT_JOB_ENABLED")),
                "quality_report_interval_hours": int(current_app.config.get("QUALITY_REPORT_INTERVAL_HOURS", 24)),
                "incremental_crawl_job_enabled": _bool(current_app.config.get("INCREMENTAL_CRAWL_JOB_ENABLED")),
                "incremental_crawl_interval_hours": int(current_app.config.get("INCREMENTAL_CRAWL_INTERVAL_HOURS", 24)),
                "incremental_crawl_source": current_app.config.get("INCREMENTAL_CRAWL_SOURCE", "fang"),
                "incremental_crawl_districts": current_app.config.get("INCREMENTAL_CRAWL_DISTRICTS", ""),
                "incremental_crawl_max_pages": int(current_app.config.get("INCREMENTAL_CRAWL_MAX_PAGES", 1)),
                "incremental_crawl_max_workers": int(current_app.config.get("INCREMENTAL_CRAWL_MAX_WORKERS", 3)),
            },
            "deepseek": {
                "enabled": _bool(current_app.config.get("DEEPSEEK_ENABLED")),
                "base_url": current_app.config.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
                "model": current_app.config.get("DEEPSEEK_MODEL", "deepseek-v4-flash"),
                "timeout": int(current_app.config.get("DEEPSEEK_TIMEOUT", 30)),
            },
        }

    @staticmethod
    def public_settings() -> dict:
        settings = SettingsService.effective_settings(include_secret=False)
        secret = SettingsService._get_secret()
        settings["deepseek"]["api_key_configured"] = bool(secret or current_app.config.get("DEEPSEEK_API_KEY"))
        settings["deepseek"]["api_key_masked"] = _mask_secret(secret or current_app.config.get("DEEPSEEK_API_KEY"))
        return settings

    @staticmethod
    def effective_settings(include_secret: bool = False) -> dict:
        settings = SettingsService.defaults()
        stored = SettingsService._get_app_settings()
        SettingsService._deep_merge(settings, stored)
        if include_secret:
            settings["deepseek"]["api_key"] = SettingsService._get_secret() or current_app.config.get("DEEPSEEK_API_KEY", "")
        return settings

    @staticmethod
    def update_settings(payload: dict) -> dict:
        current = SettingsService.effective_settings(include_secret=False)
        incoming = deepcopy(payload or {})
        deepseek_payload = incoming.get("deepseek") or {}
        api_key = deepseek_payload.pop("api_key", None)
        clear_key = bool(deepseek_payload.pop("clear_api_key", False))
        SettingsService._deep_merge(current, incoming)
        SettingsService._sanitize(current)

        record = SystemSetting.query.filter_by(setting_key=APP_SETTINGS_KEY).first()
        if record is None:
            record = SystemSetting(setting_key=APP_SETTINGS_KEY, is_secret=False)
            db.session.add(record)
        record.set_value(current)

        if clear_key:
            SettingsService._set_secret("")
        elif isinstance(api_key, str) and api_key.strip() and not api_key.startswith("****"):
            SettingsService._set_secret(api_key.strip())

        db.session.commit()
        return SettingsService.public_settings()

    @staticmethod
    def test_deepseek_connection() -> dict:
        from Backend.agent.deepseek_client import DeepSeekClient

        return DeepSeekClient.test_connection()

    @staticmethod
    def source_enabled(source: str, default: bool = True) -> bool:
        settings = SettingsService.effective_settings(include_secret=False)
        source_settings = settings.get("crawler", {}).get("sources", {}).get(source)
        if source_settings is None:
            return default
        return bool(source_settings.get("enabled", default))

    @staticmethod
    def scheduler_settings() -> dict:
        return SettingsService.effective_settings(include_secret=False)["scheduler"]

    @staticmethod
    def deepseek_settings() -> dict:
        return SettingsService.effective_settings(include_secret=True)["deepseek"]

    @staticmethod
    def _get_app_settings() -> dict:
        try:
            record = SystemSetting.query.filter_by(setting_key=APP_SETTINGS_KEY).first()
            value = record.value if record else {}
            return value if isinstance(value, dict) else {}
        except SQLAlchemyError:
            db.session.rollback()
            return {}

    @staticmethod
    def _get_secret() -> str:
        try:
            record = SystemSetting.query.filter_by(setting_key=DEEPSEEK_API_KEY).first()
            value = record.value if record else ""
            return str(value or "")
        except SQLAlchemyError:
            db.session.rollback()
            return ""

    @staticmethod
    def _set_secret(value: str) -> None:
        record = SystemSetting.query.filter_by(setting_key=DEEPSEEK_API_KEY).first()
        if record is None:
            record = SystemSetting(setting_key=DEEPSEEK_API_KEY, is_secret=True)
            db.session.add(record)
        record.is_secret = True
        record.set_value(value)

    @staticmethod
    def _deep_merge(target: dict, source: dict) -> None:
        for key, value in (source or {}).items():
            if isinstance(value, dict) and isinstance(target.get(key), dict):
                SettingsService._deep_merge(target[key], value)
            elif key in target:
                target[key] = value

    @staticmethod
    def _sanitize(settings: dict) -> None:
        crawler = settings["crawler"]
        crawler["max_workers"] = min(8, max(1, int(crawler.get("max_workers") or 4)))
        crawler["max_pages_per_district"] = min(500, max(1, int(crawler.get("max_pages_per_district") or 200)))
        crawler["request_timeout"] = min(60, max(5, int(crawler.get("request_timeout") or 15)))
        crawler["retry_times"] = min(5, max(0, int(crawler.get("retry_times") or 2)))
        crawler["interval_min"] = max(0.0, float(crawler.get("interval_min") or 0))
        crawler["interval_max"] = max(crawler["interval_min"], float(crawler.get("interval_max") or crawler["interval_min"]))

        scheduler = settings["scheduler"]
        scheduler["quality_report_interval_hours"] = min(168, max(1, int(scheduler.get("quality_report_interval_hours") or 24)))
        scheduler["incremental_crawl_interval_hours"] = min(168, max(1, int(scheduler.get("incremental_crawl_interval_hours") or 24)))
        scheduler["incremental_crawl_max_pages"] = min(50, max(1, int(scheduler.get("incremental_crawl_max_pages") or 1)))
        scheduler["incremental_crawl_max_workers"] = min(8, max(1, int(scheduler.get("incremental_crawl_max_workers") or 3)))

        deepseek = settings["deepseek"]
        deepseek["timeout"] = min(120, max(5, int(deepseek.get("timeout") or 30)))

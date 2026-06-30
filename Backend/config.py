from __future__ import annotations

import os
from pathlib import Path


def load_local_env() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_local_env()


class BaseConfig:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-me")
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "mysql+pymysql://root:root@127.0.0.1:3306/real_estate?charset=utf8mb4",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JSON_AS_ASCII = False

    CRAWL_MAX_WORKERS = int(os.getenv("CRAWL_MAX_WORKERS", "4"))
    CRAWL_MAX_PAGES_PER_DISTRICT = int(os.getenv("CRAWL_MAX_PAGES_PER_DISTRICT", "200"))
    CRAWL_REQUEST_TIMEOUT = int(os.getenv("CRAWL_REQUEST_TIMEOUT", "15"))
    CRAWL_RETRY_TIMES = int(os.getenv("CRAWL_RETRY_TIMES", "2"))
    CRAWL_INTERVAL_MIN = float(os.getenv("CRAWL_INTERVAL_MIN", "1.0"))
    CRAWL_INTERVAL_MAX = float(os.getenv("CRAWL_INTERVAL_MAX", "3.0"))
    CRAWL_USER_AGENT = os.getenv(
        "CRAWL_USER_AGENT",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    )

    DEEPSEEK_ENABLED = os.getenv("DEEPSEEK_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
    DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
    DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash")
    DEEPSEEK_TIMEOUT = int(os.getenv("DEEPSEEK_TIMEOUT", "30"))

    SCHEDULER_ENABLED = os.getenv("SCHEDULER_ENABLED", "false").lower() in {"1", "true", "yes", "on"}
    SCHEDULER_TIMEZONE = os.getenv("SCHEDULER_TIMEZONE", "Asia/Shanghai")
    QUALITY_REPORT_JOB_ENABLED = os.getenv("QUALITY_REPORT_JOB_ENABLED", "true").lower() in {"1", "true", "yes", "on"}
    QUALITY_REPORT_INTERVAL_HOURS = int(os.getenv("QUALITY_REPORT_INTERVAL_HOURS", "24"))
    INCREMENTAL_CRAWL_JOB_ENABLED = os.getenv("INCREMENTAL_CRAWL_JOB_ENABLED", "false").lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    INCREMENTAL_CRAWL_INTERVAL_HOURS = int(os.getenv("INCREMENTAL_CRAWL_INTERVAL_HOURS", "24"))
    INCREMENTAL_CRAWL_SOURCE = os.getenv("INCREMENTAL_CRAWL_SOURCE", "fang")
    INCREMENTAL_CRAWL_DISTRICTS = os.getenv("INCREMENTAL_CRAWL_DISTRICTS", "")
    INCREMENTAL_CRAWL_MAX_PAGES = int(os.getenv("INCREMENTAL_CRAWL_MAX_PAGES", "1"))
    INCREMENTAL_CRAWL_MAX_WORKERS = int(os.getenv("INCREMENTAL_CRAWL_MAX_WORKERS", "3"))

    AUTH_REQUIRED = os.getenv("AUTH_REQUIRED", "false").lower() in {"1", "true", "yes", "on"}
    AUTH_ADMIN_USERNAME = os.getenv("AUTH_ADMIN_USERNAME", "admin")
    AUTH_ADMIN_PASSWORD = os.getenv("AUTH_ADMIN_PASSWORD", "swu@2026")
    AUTH_TOKEN_EXPIRES_SECONDS = int(os.getenv("AUTH_TOKEN_EXPIRES_SECONDS", "28800"))


class TestingConfig(BaseConfig):
    TESTING = True
    AUTH_REQUIRED = False
    DEEPSEEK_ENABLED = False
    SCHEDULER_ENABLED = False
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "TEST_DATABASE_URL",
        "mysql+pymysql://root:root@127.0.0.1:3306/real_estate_test?charset=utf8mb4",
    )
    CRAWL_INTERVAL_MIN = 0.0
    CRAWL_INTERVAL_MAX = 0.0

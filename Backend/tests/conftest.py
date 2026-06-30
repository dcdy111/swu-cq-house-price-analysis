from __future__ import annotations

from uuid import uuid4
from urllib.parse import parse_qs, urlparse
from urllib.parse import urlunparse

import pymysql
import pytest

from Backend.app import create_app
from Backend.config import TestingConfig
from Backend.extensions import db


def ensure_mysql_database(database_url: str) -> None:
    parsed = urlparse(database_url)
    if not parsed.scheme.startswith("mysql"):
        raise RuntimeError("后端测试必须使用 MySQL，请设置 TEST_DATABASE_URL")

    database = parsed.path.lstrip("/")
    if not database:
        raise RuntimeError("TEST_DATABASE_URL 必须包含数据库名")

    charset = parse_qs(parsed.query).get("charset", ["utf8mb4"])[0]
    conn = pymysql.connect(
        host=parsed.hostname or "127.0.0.1",
        port=parsed.port or 3306,
        user=parsed.username,
        password=parsed.password or "",
        charset=charset,
        autocommit=True,
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute(
                f"CREATE DATABASE IF NOT EXISTS `{database}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
    finally:
        conn.close()


def unique_mysql_database_url(database_url: str) -> str:
    parsed = urlparse(database_url)
    database = parsed.path.lstrip("/")
    if not database:
        raise RuntimeError("TEST_DATABASE_URL 必须包含数据库名")
    unique_name = f"{database}_{uuid4().hex[:8]}"
    return urlunparse(parsed._replace(path=f"/{unique_name}"))


@pytest.fixture()
def app():
    test_database_url = unique_mysql_database_url(TestingConfig.SQLALCHEMY_DATABASE_URI)
    ensure_mysql_database(test_database_url)
    app = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": test_database_url,
            "CRAWL_INTERVAL_MIN": 0.0,
            "CRAWL_INTERVAL_MAX": 0.0,
            # 测试必须可离线、可重复，不能因本地 .env 开启 DeepSeek 而发起真实计费请求。
            "DEEPSEEK_ENABLED": False,
            "DEEPSEEK_API_KEY": "",
            "SCHEDULER_ENABLED": False,
        }
    )
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()
    parsed = urlparse(test_database_url)
    conn = pymysql.connect(
        host=parsed.hostname or "127.0.0.1",
        port=parsed.port or 3306,
        user=parsed.username,
        password=parsed.password or "",
        charset=parse_qs(parsed.query).get("charset", ["utf8mb4"])[0],
        autocommit=True,
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute(f"DROP DATABASE IF EXISTS `{parsed.path.lstrip('/')}`")
    finally:
        conn.close()


@pytest.fixture()
def client(app):
    return app.test_client()

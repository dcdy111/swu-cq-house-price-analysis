from __future__ import annotations

from urllib.parse import parse_qs, urlparse

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


@pytest.fixture()
def app():
    ensure_mysql_database(TestingConfig.SQLALCHEMY_DATABASE_URI)
    app = create_app(
        {
            "TESTING": True,
            "SQLALCHEMY_DATABASE_URI": TestingConfig.SQLALCHEMY_DATABASE_URI,
            "CRAWL_INTERVAL_MIN": 0.0,
            "CRAWL_INTERVAL_MAX": 0.0,
        }
    )
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()

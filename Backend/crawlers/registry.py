from __future__ import annotations

from flask import current_app

from Backend.crawlers.anjuke_mobile import AnjukeMobileCrawler
from Backend.crawlers.fang import FangCrawler
from Backend.crawlers.lianjia import LianjiaCrawler
from Backend.services.settings_service import SettingsService


CRAWLER_CLASSES = {
    "fang": FangCrawler,
    "anjuke_mobile": AnjukeMobileCrawler,
    "lianjia": LianjiaCrawler,
}


def get_crawler(source: str):
    crawler_cls = CRAWLER_CLASSES.get(source)
    if crawler_cls is None:
        return None
    crawler_settings = SettingsService.effective_settings(include_secret=False).get("crawler", {})
    crawler = crawler_cls(
        timeout=int(crawler_settings.get("request_timeout") or current_app.config["CRAWL_REQUEST_TIMEOUT"]),
        user_agent=current_app.config["CRAWL_USER_AGENT"],
        interval=(
            float(crawler_settings.get("interval_min") or current_app.config["CRAWL_INTERVAL_MIN"]),
            float(crawler_settings.get("interval_max") or current_app.config["CRAWL_INTERVAL_MAX"]),
        ),
        retry_times=int(crawler_settings.get("retry_times") or current_app.config["CRAWL_RETRY_TIMES"]),
    )
    crawler.enabled_override = SettingsService.source_enabled(source, default=crawler.enabled)
    return crawler


def list_sources() -> list[dict]:
    sources = []
    for key in CRAWLER_CLASSES:
        crawler = get_crawler(key)
        sources.append(crawler.metadata())
    return sources

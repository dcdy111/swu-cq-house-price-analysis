from __future__ import annotations

from flask import current_app

from Backend.crawlers.anjuke_mobile import AnjukeMobileCrawler
from Backend.crawlers.fang import FangCrawler
from Backend.crawlers.lianjia import LianjiaCrawler
from Backend.crawlers.anjuke_playwright import AnjukePlaywrightCrawler
from Backend.crawlers.lianjia_playwright import LianjiaPlaywrightCrawler
from Backend.crawlers.beike_playwright import BeikePlaywrightCrawler
from Backend.services.settings_service import SettingsService


CRAWLER_CLASSES = {
    "fang": FangCrawler,
    "anjuke_mobile": AnjukeMobileCrawler,
    "lianjia": LianjiaCrawler,
    "anjuke_playwright": AnjukePlaywrightCrawler,
    "lianjia_playwright": LianjiaPlaywrightCrawler,
    "beike_playwright": BeikePlaywrightCrawler,
}


def get_crawler(source: str):
    crawler_cls = CRAWLER_CLASSES.get(source)
    if crawler_cls is None:
        return None
    crawler_settings = SettingsService.effective_settings(include_secret=False).get("crawler", {})
    request_timeout = int(crawler_settings.get("request_timeout") or current_app.config["CRAWL_REQUEST_TIMEOUT"])

    # Playwright 爬虫使用不同的初始化方式
    if "playwright" in source:
        crawler = crawler_cls(
            timeout=request_timeout * 1000,  # Playwright 用毫秒
            retry_times=int(crawler_settings.get("retry_times") or current_app.config["CRAWL_RETRY_TIMES"]),
        )
        crawler.enabled_override = SettingsService.source_enabled(source, default=crawler.enabled)
        return crawler

    # 普通 requests 爬虫
    crawler = crawler_cls(
        timeout=request_timeout,
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

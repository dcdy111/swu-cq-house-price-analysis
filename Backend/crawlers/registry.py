from __future__ import annotations

from flask import current_app

from Backend.crawlers.anjuke_mobile import AnjukeMobileCrawler
from Backend.crawlers.fang import FangCrawler
from Backend.crawlers.lianjia import LianjiaCrawler


CRAWLER_CLASSES = {
    "fang": FangCrawler,
    "anjuke_mobile": AnjukeMobileCrawler,
    "lianjia": LianjiaCrawler,
}


def get_crawler(source: str):
    crawler_cls = CRAWLER_CLASSES.get(source)
    if crawler_cls is None:
        return None
    return crawler_cls(
        timeout=current_app.config["CRAWL_REQUEST_TIMEOUT"],
        user_agent=current_app.config["CRAWL_USER_AGENT"],
        interval=(current_app.config["CRAWL_INTERVAL_MIN"], current_app.config["CRAWL_INTERVAL_MAX"]),
    )


def list_sources() -> list[dict]:
    sources = []
    for key in CRAWLER_CLASSES:
        crawler = get_crawler(key)
        sources.append(crawler.metadata())
    return sources

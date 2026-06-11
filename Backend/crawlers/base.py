from __future__ import annotations

import random
import time
import os
from abc import ABC, abstractmethod
from urllib.parse import urljoin

import requests

from Backend.crawlers.schemas import PageCrawlResult


class BaseCrawler(ABC):
    source_key = "base"
    source_name = "基础爬虫"
    enabled = True
    description = ""
    base_url = ""
    district_map: dict[str, str] = {}
    cookie_env_key: str | None = None

    def __init__(
        self,
        timeout: int = 15,
        user_agent: str | None = None,
        interval: tuple[float, float] = (1.0, 3.0),
    ):
        self.timeout = timeout
        self.user_agent = user_agent or (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        )
        self.interval = interval
        self.enabled_override: bool | None = None

    @property
    def is_enabled(self) -> bool:
        if self.enabled_override is False:
            return False
        if self.cookie_env_key:
            return bool(os.getenv(self.cookie_env_key))
        if self.enabled_override is not None:
            return self.enabled_override
        return self.enabled

    def metadata(self) -> dict:
        return {
            "key": self.source_key,
            "name": self.source_name,
            "enabled": self.is_enabled,
            "description": self.description,
            "districts": list(self.district_map.keys()),
        }

    def headers(self) -> dict:
        headers = {
            "User-Agent": self.user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Connection": "keep-alive",
        }
        if self.cookie_env_key and os.getenv(self.cookie_env_key):
            headers["Cookie"] = os.getenv(self.cookie_env_key, "")
        return headers

    def sleep(self) -> None:
        low, high = self.interval
        if high <= 0:
            return
        time.sleep(random.uniform(low, high))

    def absolute_url(self, href: str | None) -> str:
        if not href:
            return ""
        return urljoin(self.base_url, href)

    @abstractmethod
    def build_url(self, district: str, page: int) -> str:
        raise NotImplementedError

    @abstractmethod
    def parse(self, html: str, district: str, url: str) -> list[dict]:
        raise NotImplementedError

    def crawl_page(self, district: str, page: int) -> PageCrawlResult:
        if not self.is_enabled:
            return PageCrawlResult(
                source=self.source_key,
                district=district,
                page=page,
                url="",
                ok=False,
                message=f"{self.source_name} 当前未启用",
            )
        if district not in self.district_map:
            return PageCrawlResult(
                source=self.source_key,
                district=district,
                page=page,
                url="",
                ok=False,
                message=f"未配置区县映射: {district}",
            )

        url = self.build_url(district, page)
        try:
            self.sleep()
            response = requests.get(url, headers=self.headers(), timeout=self.timeout)
            response.raise_for_status()
            blocked_reason = self.detect_blocked(response.url, response.text)
            if blocked_reason:
                return PageCrawlResult(
                    source=self.source_key,
                    district=district,
                    page=page,
                    url=response.url,
                    ok=False,
                    message=blocked_reason,
                )
            listings = self.parse(response.text, district, url)
            if not listings:
                return PageCrawlResult(
                    source=self.source_key,
                    district=district,
                    page=page,
                    url=url,
                    ok=False,
                    message="页面可访问，但未解析到房源列表",
                )
            return PageCrawlResult(
                source=self.source_key,
                district=district,
                page=page,
                url=url,
                ok=True,
                listings=listings,
                message=f"解析到 {len(listings)} 条房源",
            )
        except requests.RequestException as exc:
            return PageCrawlResult(
                source=self.source_key,
                district=district,
                page=page,
                url=url,
                ok=False,
                message=f"请求失败: {exc}",
            )

    def detect_blocked(self, final_url: str, html: str) -> str | None:
        url = (final_url or "").lower()
        text = (html or "").lower()
        blocked_url_markers = [
            "captcha",
            "verifycode",
            "antibot",
            "esfcommon-captcha",
            "hip.lianjia.com",
            "clogin.lianjia.com/login",
        ]
        blocked_text_markers = [
            "@@xxzlgatewayurl",
            "antibot/verifycode",
        ]
        if any(marker in url for marker in blocked_url_markers):
            return "页面被登录、验证码或反爬网关拦截"
        if any(marker in text for marker in blocked_text_markers):
            return "页面被登录、验证码或反爬网关拦截"
        return None

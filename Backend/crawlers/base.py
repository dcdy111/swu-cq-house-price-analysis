from __future__ import annotations

import random
import time
import os
import json
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
    headers_env_key: str | None = None

    def __init__(
        self,
        timeout: int = 15,
        user_agent: str | None = None,
        interval: tuple[float, float] = (1.0, 3.0),
        retry_times: int = 2,
    ):
        self.timeout = timeout
        self.user_agent = user_agent or (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
        )
        self.interval = interval
        self.retry_times = max(0, retry_times)
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

    def default_headers(self) -> dict:
        return {
            "User-Agent": self.user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Connection": "keep-alive",
        }

    def headers(self) -> dict:
        return self.apply_runtime_headers(self.default_headers())

    def apply_runtime_headers(self, headers: dict) -> dict:
        headers = dict(headers)
        for env_key in self._headers_env_names():
            headers.update(self._parse_headers_env(os.getenv(env_key, "")))
        cookie = self._runtime_cookie()
        if cookie:
            headers["Cookie"] = cookie
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
        attempts = self.retry_times + 1
        last_error = ""
        with requests.Session() as session:
            session.headers.update(self.headers())
            for attempt in range(1, attempts + 1):
                started = time.perf_counter()
                status_code = None
                html_bytes = None
                final_url = url
                try:
                    self.sleep()
                    response = session.get(url, timeout=self.timeout)
                    elapsed_ms = int((time.perf_counter() - started) * 1000)
                    status_code = response.status_code
                    final_url = response.url
                    html_bytes = len(response.content or b"")
                    if not response.encoding or response.encoding.lower() == "iso-8859-1":
                        response.encoding = response.apparent_encoding or response.encoding
                    if response.status_code in {429, 500, 502, 503, 504} and attempt < attempts:
                        last_error = f"HTTP {response.status_code}"
                        continue
                    response.raise_for_status()
                    blocked_reason = self.detect_blocked(response.url, response.text)
                    if blocked_reason:
                        return PageCrawlResult(
                            source=self.source_key,
                            district=district,
                            page=page,
                            url=url,
                            final_url=response.url,
                            status_code=response.status_code,
                            elapsed_ms=elapsed_ms,
                            html_bytes=html_bytes,
                            attempts=attempt,
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
                            final_url=response.url,
                            status_code=response.status_code,
                            elapsed_ms=elapsed_ms,
                            html_bytes=html_bytes,
                            attempts=attempt,
                            ok=False,
                            message="页面可访问，但未解析到房源列表",
                        )
                    return PageCrawlResult(
                        source=self.source_key,
                        district=district,
                        page=page,
                        url=url,
                        final_url=response.url,
                        status_code=response.status_code,
                        elapsed_ms=elapsed_ms,
                        html_bytes=html_bytes,
                        attempts=attempt,
                        ok=True,
                        listings=listings,
                        message=f"解析到 {len(listings)} 条房源",
                    )
                except requests.RequestException as exc:
                    elapsed_ms = int((time.perf_counter() - started) * 1000)
                    last_error = str(exc)
                    if attempt < attempts:
                        continue
                    return PageCrawlResult(
                        source=self.source_key,
                        district=district,
                        page=page,
                        url=url,
                        final_url=final_url,
                        status_code=status_code,
                        elapsed_ms=elapsed_ms,
                        html_bytes=html_bytes,
                        attempts=attempt,
                        ok=False,
                        message=f"请求失败: {last_error}",
                    )

        return PageCrawlResult(
            source=self.source_key,
            district=district,
            page=page,
            url=url,
            ok=False,
            attempts=attempts,
            message=f"请求失败: {last_error or '未知错误'}",
        )

    def detect_blocked(self, final_url: str, html: str) -> str | None:
        url = (final_url or "").lower()
        text = (html or "").lower()
        blocked_url_markers = [
            "captcha",
            "verifycode",
            "antibot",
            "check.3g.fang.com",
            "check.html",
            "esfcommon-captcha",
            "hip.lianjia.com",
            "clogin.lianjia.com/login",
        ]
        blocked_text_markers = [
            "@@xxzlgatewayurl",
            "antibot/verifycode",
            "checkyzm",
            "请完成下列验证",
        ]
        if any(marker in url for marker in blocked_url_markers):
            return "页面被登录、验证码或反爬网关拦截"
        if any(marker in text for marker in blocked_text_markers):
            return "页面被登录、验证码或反爬网关拦截"
        return None

    def _source_env_prefixes(self) -> list[str]:
        raw = self.source_key.upper()
        prefixes = [raw]
        first = raw.split("_", 1)[0]
        if first not in prefixes:
            prefixes.append(first)
        return prefixes

    def _headers_env_names(self) -> list[str]:
        names = ["CRAWL_HEADERS_RAW", "CRAWL_HEADERS_JSON"]
        if self.headers_env_key:
            names.append(self.headers_env_key)
        for prefix in self._source_env_prefixes():
            names.extend([f"{prefix}_HEADERS_RAW", f"{prefix}_HEADERS_JSON"])
        return names

    def _cookie_env_names(self) -> list[str]:
        names = []
        if self.cookie_env_key:
            names.append(self.cookie_env_key)
        for prefix in self._source_env_prefixes():
            names.append(f"{prefix}_COOKIE")
        return names

    def _runtime_cookie(self) -> str:
        for env_key in self._cookie_env_names():
            value = os.getenv(env_key, "").strip()
            if value:
                return value
        return ""

    @staticmethod
    def _parse_headers_env(raw: str) -> dict:
        raw = (raw or "").strip()
        if not raw:
            return {}
        ignored = {"host", "content-length", "connection"}
        headers: dict[str, str] = {}
        if raw.startswith("{"):
            try:
                value = json.loads(raw)
            except json.JSONDecodeError:
                return {}
            if not isinstance(value, dict):
                return {}
            items = value.items()
        else:
            text = raw.replace("\\n", "\n").replace(";;", "\n")
            items = []
            for line in text.splitlines():
                if ":" not in line:
                    continue
                key, value = line.split(":", 1)
                items.append((key, value))
        for key, value in items:
            header = str(key).strip()
            if not header or header.startswith(":"):
                continue
            if header.lower() in ignored:
                continue
            text_value = str(value).strip()
            if text_value:
                headers[header] = text_value
        return headers

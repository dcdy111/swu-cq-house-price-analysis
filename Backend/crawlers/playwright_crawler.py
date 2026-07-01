"""
Backend/crawlers/playwright_crawler.py
=====================================
基于 Playwright 的智能爬虫基类。
支持：
- 隐藏 webdriver 特征
- 随机等待与鼠标移动
- Cookie 持久化
- 智能重试与降级
"""

from __future__ import annotations

import json
import random
import time
import logging
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page, TimeoutError as PlaywrightTimeout
from bs4 import BeautifulSoup

from Backend.crawlers.schemas import PageCrawlResult

logger = logging.getLogger(__name__)

# 随机 User-Agent 池
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    # 移动端 UA（安居客移动端反爬较弱）
    "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
]


class PlaywrightCrawler:
    """
    Playwright 智能爬虫基类

    使用方式：
        crawler = PlaywrightAnjukeCrawler()
        result = crawler.crawl_page("渝北", 1)
    """

    source_key = "playwright_base"
    source_name = "Playwright爬虫基类"
    enabled = True
    base_url = ""
    district_map: dict[str, str] = {}
    description = ""

    def __init__(
        self,
        headless: bool = True,
        timeout: int = 30000,
        retry_times: int = 2,
        cookie_path: str | None = None,
    ):
        self.headless = headless
        self.timeout = timeout
        self.retry_times = retry_times
        self.cookie_path = cookie_path
        self.enabled_override: bool | None = None
        self.playwright = None
        self.browser: Browser | None = None
        self.context: BrowserContext | None = None

    def metadata(self) -> dict:
        return {
            "key": self.source_key,
            "name": self.source_name,
            "enabled": self.is_enabled,
            "description": self.description,
            "districts": list(self.district_map.keys()),
        }

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

    def start(self):
        """启动 Playwright 浏览器"""
        self.playwright = sync_playwright().start()
        self.browser = self.playwright.chromium.launch(
            headless=self.headless,
            args=[
                "--disable-blink-features=AutomationControlled",  # 隐藏 webdriver
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process",
                "--window-size=1920,1080",
            ],
        )
        # 加载持久化 Cookie（如果存在）
        storage_state = self._load_cookies() if self.cookie_path else None
        self.context = self.browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent=random.choice(USER_AGENTS),
            locale="zh-CN",
            timezone_id="Asia/Shanghai",
            permissions=["geolocation"],
            storage_state=storage_state,
        )
        # 隐藏 navigator.webdriver
        self.context.add_init_script(
            """
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            """
        )
        logger.info(f"[{self.source_key}] Playwright 浏览器已启动（headless={self.headless}）")

    def close(self):
        """关闭浏览器并保存 Cookie"""
        if self.cookie_path and self.context:
            self._save_cookies()
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()
        logger.info(f"[{self.source_key}] Playwright 浏览器已关闭")

    def new_page(self) -> Page:
        """创建新页面"""
        if not self.context:
            raise RuntimeError("请先调用 start()")
        page = self.context.new_page()
        # 随机化 webdriver 特征
        page.add_init_script(
            """
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['zh-CN', 'zh', 'en'] });
            """
        )
        return page

    def fetch_page(self, url: str, wait_selector: str | None = None, wait_time: int = 2000) -> tuple[str, Page]:
        """
        获取页面内容

        Args:
            url: 目标 URL
            wait_selector: 等待某个 CSS 选择器出现
            wait_time: 基础等待时间（毫秒）

        Returns:
            (html_content, page)
        """
        page = self.new_page()
        try:
            # 模拟人类行为：先随机移动鼠标
            page.mouse.move(random.randint(100, 800), random.randint(100, 600))
            page.goto(url, wait_until="domcontentloaded", timeout=self.timeout)
            time.sleep(random.uniform(1, 2))  # 等待页面基本加载

            if wait_selector:
                try:
                    page.wait_for_selector(wait_selector, timeout=5000)
                except PlaywrightTimeout:
                    logger.warning(f"[{self.source_key}] 等待选择器超时: {wait_selector}")

            # 随机滚动页面，模拟人类浏览行为
            self._human_like_scroll(page)

            time.sleep(random.uniform(wait_time / 1000 - 0.5, wait_time / 1000 + 0.5))
            html = page.content()
            return html, page

        except PlaywrightTimeout:
            logger.warning(f"[{self.source_key}] 页面加载超时: {url}")
            return page.content() if page else "", page
        except Exception as e:
            logger.error(f"[{self.source_key}] 页面抓取失败: {url}, 错误: {e}")
            return "", page

    def _human_like_scroll(self, page: Page):
        """模拟人类滚动行为"""
        for _ in range(random.randint(1, 3)):
            scroll_amount = random.randint(300, 800)
            page.mouse.wheel(0, scroll_amount)
            time.sleep(random.uniform(0.3, 0.8))

    def _load_cookies(self) -> dict | None:
        """从文件加载 Cookie"""
        if not self.cookie_path:
            return None
        path = Path(self.cookie_path)
        if not path.exists():
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"[{self.source_key}] 加载 Cookie 失败: {e}")
            return None

    def _save_cookies(self):
        """保存 Cookie 到文件"""
        if not self.cookie_path or not self.context:
            return
        try:
            storage = self.context.storage_state()
            path = Path(self.cookie_path)
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(storage, f, ensure_ascii=False, indent=2)
            logger.info(f"[{self.source_key}] Cookie 已保存到: {self.cookie_path}")
        except Exception as e:
            logger.error(f"[{self.source_key}] 保存 Cookie 失败: {e}")

    def detect_blocked(self, page: Page, html: str) -> str | None:
        """检测是否被反爬拦截"""
        url = page.url.lower()
        text = html.lower()

        blocked_url_markers = [
            "captcha", "verifycode", "antibot", "verification",
            "hip.lianjia.com", "clogin.lianjia.com",
            "cloud_an", "xxzlgatewayurl",
        ]
        blocked_text_markers = [
            "请完成验证", "人机验证", "验证异常", "访问异常",
            "系统繁忙", "请稍后再试",
        ]

        if any(m in url for m in blocked_url_markers):
            return "页面被反爬拦截（URL 特征）"
        if any(m in text for m in blocked_text_markers):
            return "页面被反爬拦截（内容特征）"

        # 检查是否跳转到登录页
        if "登录" in html and "captcha" in html.lower():
            return "需要登录或验证码"

        return None

    # ─────────────────────────────────────────────────────────────────────────
    # 子类需要实现的方法
    # ─────────────────────────────────────────────────────────────────────────

    def build_url(self, district: str, page: int) -> str:
        """构建目标 URL"""
        raise NotImplementedError

    def parse(self, html: str, district: str, url: str) -> list[dict]:
        """解析 HTML，提取房源列表"""
        raise NotImplementedError

    def crawl_page(self, district: str, page: int) -> PageCrawlResult:
        """抓取单页（带重试机制）"""
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
        last_error = ""

        for attempt in range(1, self.retry_times + 2):
            try:
                started = time.perf_counter()
                html, page_obj = self.fetch_page(url, wait_selector=".house-list, .property, li.item-wrap", wait_time=3000)
                elapsed_ms = int((time.perf_counter() - started) * 1000)

                if not html:
                    last_error = "页面内容为空"
                    continue

                blocked_reason = self.detect_blocked(page_obj, html)
                if blocked_reason:
                    logger.warning(f"[{self.source_key}] 第 {attempt} 次尝试被拦截: {blocked_reason}")
                    if attempt < self.retry_times + 1:
                        time.sleep(random.uniform(5, 10))  # 等待后重试
                        continue
                    return PageCrawlResult(
                        source=self.source_key,
                        district=district,
                        page=page,
                        url=url,
                        ok=False,
                        attempts=attempt,
                        message=blocked_reason,
                    )

                listings = self.parse(html, district, url)
                if not listings:
                    return PageCrawlResult(
                        source=self.source_key,
                        district=district,
                        page=page,
                        url=url,
                        ok=False,
                        attempts=attempt,
                        elapsed_ms=elapsed_ms,
                        message="页面可访问，但未解析到房源列表",
                    )

                return PageCrawlResult(
                    source=self.source_key,
                    district=district,
                    page=page,
                    url=url,
                    ok=True,
                    attempts=attempt,
                    elapsed_ms=elapsed_ms,
                    listings=listings,
                    message=f"解析到 {len(listings)} 条房源",
                )

            except Exception as e:
                last_error = str(e)
                logger.error(f"[{self.source_key}] 第 {attempt} 次尝试失败: {e}")
                if attempt < self.retry_times + 1:
                    time.sleep(random.uniform(3, 6))
                    continue

        return PageCrawlResult(
            source=self.source_key,
            district=district,
            page=page,
            url=url,
            ok=False,
            message=f"抓取失败: {last_error}",
        )

    @property
    def is_enabled(self) -> bool:
        if self.enabled_override is False:
            return False
        if self.enabled_override is not None:
            return self.enabled_override
        return self.enabled

"""
Backend/crawlers/beike_playwright.py
====================================
贝壳找房 Playwright 爬虫

贝壳和链家同属一个集团，反爬机制类似：
- hip.ke.com 人机验证
- Cookie/Session 追踪
- IP 请求频率限制

使用 Playwright 模拟浏览器行为来绕过反爬。
"""

from __future__ import annotations

import hashlib
import json
import random
import re
import time
import logging
from pathlib import Path

from bs4 import BeautifulSoup

from Backend.crawlers.playwright_crawler import PlaywrightCrawler
from Backend.crawlers.schemas import PageCrawlResult

logger = logging.getLogger(__name__)


class BeikePlaywrightCrawler(PlaywrightCrawler):
    """
    贝壳找房 Playwright 爬虫

    贝壳和链家使用相同的反爬系统，但 URL 不同：
    - 链家: m.lianjia.com
    - 贝壳: m.ke.com
    """

    source_key = "beike_playwright"
    source_name = "贝壳(Playwright)"
    enabled = True
    base_url = "https://m.ke.com"

    district_map = {
        # ── 主城核心九区 ───────────────────────────────────────────────────────
        "渝中": "/cq/ershoufang/yuzhong/",
        "江北": "/cq/ershoufang/jiangbei/",
        "沙坪坝": "/cq/ershoufang/shapingba/",
        "九龙坡": "/cq/ershoufang/jiulongpo/",
        "南岸": "/cq/ershoufang/nanan/",
        "北碚": "/cq/ershoufang/beibei/",
        "渝北": "/cq/ershoufang/yubei/",
        "巴南": "/cq/ershoufang/banan/",
        "大渡口": "/cq/ershoufang/dadukou/",
        # ── 璧山区 ───────────────────────────────────────────────────────────
        "璧山": "/cq/ershoufang/bishan/",
        # ── 主城新区 ─────────────────────────────────────────────────────────
        "永川": "/cq/ershoufang/yongchuan/",
        "合川": "/cq/ershoufang/hechuan/",
        "江津": "/cq/ershoufang/jiangjin/",
        "铜梁": "/cq/ershoufang/tongliang/",
        "潼南": "/cq/ershoufang/tongnan/",
        "大足": "/cq/ershoufang/dazu/",
        "荣昌": "/cq/ershoufang/rongchang/",
        "綦江": "/cq/ershoufang/qijiang/",
        "南川": "/cq/ershoufang/nanchuan/",
        "长寿": "/cq/ershoufang/changshou/",
        "万盛": "/cq/ershoufang/wansheng/",
        # ── 区域副中心 ───────────────────────────────────────────────────────
        "万州": "/cq/ershoufang/wanzhou/",
        "涪陵": "/cq/ershoufang/fuling/",
        "黔江": "/cq/ershoufang/qianjiang/",
        "武隆": "/cq/ershoufang/wulong/",
        # ── 县（自治县）───────────────────────────────────────────────────
        "开州": "/cq/ershoufang/kaizhou/",
        "垫江": "/cq/ershoufang/dianjiang/",
        "梁平": "/cq/ershoufang/liangping/",
        "丰都": "/cq/ershoufang/fengdu/",
        "奉节": "/cq/ershoufang/fengjie/",
        "云阳": "/cq/ershoufang/yunyang/",
        "巫山": "/cq/ershoufang/wushan/",
        "巫溪": "/cq/ershoufang/wuxi/",
        "城口": "/cq/ershoufang/chengkou/",
        "石柱": "/cq/ershoufang/shizhu/",
        "秀山": "/cq/ershoufang/xiushan/",
        "忠县": "/cq/ershoufang/zhongxian/",
        "彭水": "/cq/ershoufang/pengshui/",
        "酉阳": "/cq/ershoufang/youyang/",
    }

    def __init__(self, cookie_dir: str | None = None, **kwargs):
        if cookie_dir is None:
            cookie_dir = str(Path(__file__).parent.parent.parent / "data" / "cookies")
        Path(cookie_dir).mkdir(parents=True, exist_ok=True)
        cookie_path = str(Path(cookie_dir) / "beike_cookies.json")
        kwargs.setdefault("headless", True)
        kwargs.setdefault("timeout", 30000)
        kwargs.setdefault("retry_times", 3)

        super().__init__(
            cookie_path=cookie_path,
            **kwargs,
        )

    def build_url(self, district: str, page: int) -> str:
        """构建贝壳移动端 URL"""
        path = self.district_map.get(district, self.district_map["全部"])
        if page <= 1:
            return self.absolute_url(path)
        return self.absolute_url(path.rstrip("/") + f"/pg{page}/")

    def absolute_url(self, href: str) -> str:
        if href.startswith("http"):
            return href
        return self.base_url.rstrip("/") + "/" + href.lstrip("/")

    def parse(self, html: str, district: str, url: str) -> list[dict]:
        """解析贝壳页面（与链家类似）"""
        # 策略1：JSON 解析
        results = self._parse_json_state(html, district)
        if results:
            return self._dedupe(results)

        # 策略2：HTML 解析
        soup = BeautifulSoup(html, "html.parser")
        results = self._parse_html_cards(soup, district, url)
        return self._dedupe(results)

    def _parse_json_state(self, html: str, district: str) -> list[dict]:
        """从页面预加载数据提取 JSON"""
        try:
            # 查找 __INITIAL_STATE__ 或 __PRELOADED_STATE__
            patterns = [
                r'window\.__PRELOADED_STATE__\s*=\s*(\{.*?\})\s*;?\s*$',
                r'window\.__INITIAL_STATE__\s*=\s*(\{.*?\})\s*;?\s*$',
            ]

            for pattern in patterns:
                match = re.search(pattern, html, re.DOTALL | re.MULTILINE)
                if match:
                    data = json.loads(match.group(1))
                    # 尝试多种数据结构
                    list_data = (
                        data.get("ershoufangList", {})
                        .get("listData", {})
                        .get("list", [])
                    )
                    if not list_data:
                        list_data = data.get("list", [])

                    if isinstance(list_data, list) and list_data:
                        results = []
                        for item in list_data:
                            if not isinstance(item, dict):
                                continue
                            results.append(self._parse_json_item(item, district))
                        return results
        except Exception as e:
            logger.warning(f"[{self.source_key}] JSON 解析失败: {e}")
        return []

    def _parse_json_item(self, item: dict, district: str) -> dict:
        """解析单条 JSON 房源"""
        title = item.get("title") or item.get("name", "")
        desc = item.get("desc") or item.get("subTitle", "")
        desc_parts = [p.strip() for p in str(desc).split("/") if p.strip()]

        link = item.get("jumpUrl") or item.get("url") or item.get("detailUrl", "")
        house_code = str(item.get("houseCode") or item.get("id") or "").strip()

        return {
            "source": self.source_key,
            "source_listing_id": house_code,
            "title": title[:120],
            "link": self.absolute_url(link) if link else f"https://m.ke.com/cq/ershoufang/{house_code}.html",
            "district": district,
            "community": desc_parts[3] if len(desc_parts) > 3 else None,
            "address": desc,
            "total_price": self._extract_float(str(item.get("totalPrice") or "")),
            "unit_price": self._extract_float(str(item.get("unitPrice") or "").replace(",", "")),
            "area": self._extract_float(desc_parts[1] if len(desc_parts) > 1 else ""),
            "layout": desc_parts[0] if desc_parts else None,
            "orientation": desc_parts[2] if len(desc_parts) > 2 else None,
            "decoration": None,
            "floor_text": None,
            "tags": self._parse_tags(item.get("tags")),
            "status": "active",
            "fingerprint": self._make_fingerprint(house_code, district),
        }

    def _parse_html_cards(self, soup: BeautifulSoup, district: str, url: str) -> list[dict]:
        """解析 HTML 房源卡片"""
        results = []

        selectors = [
            ".sellListContent li",
            "[class*=house-item]",
            "[class*=list-item]",
        ]

        for selector in selectors:
            cards = soup.select(selector)
            if cards:
                for card in cards:
                    parsed = self._parse_card(card, district, url)
                    if parsed:
                        results.append(parsed)
                if results:
                    break

        return results

    def _parse_card(self, card, district: str, url: str) -> dict | None:
        """解析单个房源卡片"""
        try:
            title_elem = card.select_one(".title a, a[href*='/ershoufang/']")
            title = title_elem.get_text(" ", strip=True) if title_elem else ""
            link = self.absolute_url(title_elem.get("href")) if title_elem and title_elem.get("href") else url

            total_elem = card.select_one(".totalPrice span")
            total_price = self._extract_float(total_elem.get_text(" ", strip=True) if total_elem else "")
            unit_elem = card.select_one(".unitPrice")
            unit_price = self._extract_float(unit_elem.get("data-price") if unit_elem else "")

            if not title:
                return None

            return {
                "source": self.source_key,
                "source_listing_id": self._source_id_from_link(link),
                "title": title[:120],
                "link": link,
                "district": district,
                "community": None,
                "address": None,
                "total_price": total_price,
                "unit_price": unit_price,
                "area": None,
                "layout": None,
                "orientation": None,
                "decoration": None,
                "floor_text": None,
                "tags": [],
                "status": "active",
                "fingerprint": self._make_fingerprint(self._source_id_from_link(link), district),
            }
        except Exception as e:
            logger.warning(f"[{self.source_key}] 卡片解析失败: {e}")
            return None

    def _parse_tags(self, tags) -> list[str]:
        """解析标签"""
        if not tags:
            return []
        if isinstance(tags, list):
            if tags and isinstance(tags[0], dict):
                return [t.get("name") or t.get("text", "") for t in tags if t.get("name") or t.get("text")]
            return [str(t) for t in tags if t]
        return []

    def _extract_float(self, text: str) -> float | None:
        match = re.search(r"(\d+(?:\.\d+)?)", (text or "").replace(",", ""))
        return float(match.group(1)) if match else None

    def _source_id_from_link(self, link: str) -> str | None:
        match = re.search(r"(\d{6,})", link)
        return match.group(1) if match else None

    def _make_fingerprint(self, source_id: str, district: str) -> str:
        raw = f"{source_id}|{district}"
        return hashlib.md5(raw.encode("utf-8")).hexdigest()

    def _dedupe(self, items: list[dict]) -> list[dict]:
        seen = set()
        output = []
        for item in items:
            key = item.get("source_listing_id") or item.get("link")
            if key in seen:
                continue
            seen.add(key)
            output.append(item)
        return output

    def detect_blocked(self, page, html: str) -> str | None:
        """贝壳专属反爬检测"""
        url = page.url.lower() if hasattr(page, 'url') else ""
        text = html.lower()

        # 贝壳专属标记
        beike_markers = [
            "hip.ke.com",
            "captcha.ke.com",
            "login.ke.com",
            "clogin.ke.com",
        ]

        if any(m in url for m in beike_markers):
            return "贝壳人机验证页面"

        if "captcha" in text and ("验证" in html or "人机" in html):
            return "需要完成人机验证"

        return super().detect_blocked(page, html) if hasattr(super(), 'detect_blocked') else None


def test_crawl():
    """测试贝壳爬虫"""
    print("=" * 60)
    print("贝壳找房 Playwright 爬虫测试")
    print("=" * 60)

    crawler = BeikePlaywrightCrawler()

    try:
        crawler.start()
        result = crawler.crawl_page("渝北", 1)
        print(f"\n抓取结果: {result.message}")
        print(f"房源数量: {len(result.listings) if result.listings else 0}")

        if result.listings:
            print("\n前 3 条房源:")
            for i, listing in enumerate(result.listings[:3], 1):
                print(f"\n  [{i}] {listing.get('title', 'N/A')}")
                print(f"      价格: {listing.get('total_price')}万")

    except Exception as e:
        print(f"测试失败: {e}")
    finally:
        crawler.close()

    print("\n" + "=" * 60)


if __name__ == "__main__":
    test_crawl()

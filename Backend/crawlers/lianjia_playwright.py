"""
Backend/crawlers/lianjia_playwright.py
======================================
链家 Playwright 爬虫 - 使用浏览器自动化绕过反爬

链家/贝壳的反爬机制非常严格（hip.lianjia.com 人机验证），
使用 Playwright 模拟真实浏览器行为：
- 支持 Cookie 持久化（登录后可降低验证频率）
- 随机化鼠标轨迹和滚动
- 智能检测人机验证页面
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


class LianjiaPlaywrightCrawler(PlaywrightCrawler):
    """
    链家 Playwright 爬虫

    链家的反爬机制：
    1. hip.lianjia.com - 人机验证页面
    2. Cookie/Session 追踪
    3. IP 请求频率限制
    4. UA 检测

    应对策略：
    1. Playwright 模拟真实浏览器
    2. Cookie 持久化（模拟已登录状态）
    3. 随机延迟和滚动
    4. 多次重试机制
    """

    source_key = "lianjia_playwright"
    source_name = "链家(Playwright)"
    enabled = True
    base_url = "https://m.lianjia.com"

    district_map = {
        # 主城核心九区
        "渝北": "/cq/ershoufang/yubei/",
        "渝中": "/cq/ershoufang/yuzhong/",
        "江北": "/cq/ershoufang/jiangbei/",
        "南岸": "/cq/ershoufang/nanan/",
        "沙坪坝": "/cq/ershoufang/shapingba/",
        "九龙坡": "/cq/ershoufang/jiulongpo/",
        "大渡口": "/cq/ershoufang/dadukou/",
        "北碚": "/cq/ershoufang/beibei/",
        "巴南": "/cq/ershoufang/banan/",
        # 主城新区
        "璧山": "/cq/ershoufang/bishan/",
        "永川": "/cq/ershoufang/yongchuan/",
        "合川": "/cq/ershoufang/hechuan/",
        "江津": "/cq/ershoufang/jiangjin/",
        "铜梁": "/cq/ershoufang/tongliang/",
        "大足": "/cq/ershoufang/dazu/",
        "荣昌": "/cq/ershoufang/rongchang/",
        "綦江": "/cq/ershoufang/qijiang/",
        "南川": "/cq/ershoufang/nanchuan/",
        "长寿": "/cq/ershoufang/changshou/",
        "万盛": "/cq/ershoufang/wansheng/",
        # 区域副中心
        "万州": "/cq/ershoufang/wanzhou/",
        "涪陵": "/cq/ershoufang/fuling/",
        "黔江": "/cq/ershoufang/qianjiang/",
        "武隆": "/cq/ershoufang/wulong/",
        # 县
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
        cookie_path = str(Path(cookie_dir) / "lianjia_cookies.json")
        kwargs.setdefault("headless", True)
        kwargs.setdefault("timeout", 30000)
        kwargs.setdefault("retry_times", 3)

        super().__init__(
            cookie_path=cookie_path,
            **kwargs,
        )

    def build_url(self, district: str, page: int) -> str:
        """构建链家移动端 URL"""
        path = self.district_map.get(district)
        if path is None:
            raise KeyError(f"未知区县: {district}")
        if page <= 1:
            return self.absolute_url(path)
        return self.absolute_url(path.rstrip("/") + f"/pg{page}/")

    def absolute_url(self, href: str) -> str:
        if href.startswith("http"):
            return href
        return self.base_url.rstrip("/") + "/" + href.lstrip("/")

    def parse(self, html: str, district: str, url: str) -> list[dict]:
        """解析链家页面"""
        # 策略1：JSON 解析（优先）
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
            # 查找 __PRELOADED_STATE__
            match = re.search(r'window\.__PRELOADED_STATE__\s*=\s*(\{.*?\})\s*;?\s*$', html, re.DOTALL | re.MULTILINE)
            if not match:
                return []

            data = json.loads(match.group(1))
            list_data = data.get("ershoufangList", {}).get("listData", {})
            raw_items = list_data.get("list") or []

            if not isinstance(raw_items, list):
                return []

            results = []
            for item in raw_items:
                if not isinstance(item, dict):
                    continue

                title = item.get("title") or item.get("name", "")
                desc = item.get("desc") or item.get("subTitle", "")
                desc_parts = [p.strip() for p in str(desc).split("/") if p.strip()]

                link = item.get("jumpUrl") or item.get("url") or item.get("detailUrl", "")
                house_code = str(item.get("houseCode") or item.get("id") or "").strip()

                results.append({
                    "source": self.source_key,
                    "source_listing_id": house_code,
                    "title": title[:120],
                    "link": self.absolute_url(link) if link else f"https://m.lianjia.com/cq/ershoufang/{house_code}.html",
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
                })
            return results
        except Exception as e:
            logger.warning(f"[{self.source_key}] JSON 解析失败: {e}")
            return []

    def _parse_html_cards(self, soup: BeautifulSoup, district: str, url: str) -> list[dict]:
        """解析 HTML 房源卡片"""
        results = []

        # 链家移动端卡片选择器
        selectors = [
            ".sellListContent li",
            ".kem__house-tile-ershou",
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
            # 标题和链接
            title_elem = card.select_one(".title a, .house-title a, a[href*='/ershoufang/']")
            title = title_elem.get_text(" ", strip=True) if title_elem else ""
            link = self.absolute_url(title_elem.get("href")) if title_elem and title_elem.get("href") else url

            # 价格
            total_elem = card.select_one(".totalPrice span, .price-total")
            total_price = self._extract_float(total_elem.get_text(" ", strip=True) if total_elem else "")
            unit_elem = card.select_one(".unitPrice, .price-unit")
            unit_price = self._extract_float(unit_elem.get("data-price") if unit_elem else "")

            # 房屋信息
            info_elem = card.select_one(".houseInfo, .info-wrap")
            if info_elem:
                info_text = info_elem.get_text("|", strip=True)
                parts = [p.strip() for p in info_text.split("|") if p.strip()]
            else:
                parts = []

            layout = parts[0] if len(parts) > 0 else None
            area = self._extract_float(parts[1] if len(parts) > 1 else "")
            orientation = parts[2] if len(parts) > 2 else None
            decoration = parts[3] if len(parts) > 3 else None

            # 小区和地址
            community_elem = card.select_one(".positionInfo a, .community-name")
            community = community_elem.get_text(" ", strip=True) if community_elem else None

            # 标签
            tags = [t.get_text(" ", strip=True) for t in card.select(".tag span, .house-tags .tag") if t.get_text(strip=True)]

            if not title:
                return None

            return {
                "source": self.source_key,
                "source_listing_id": self._source_id_from_link(link),
                "title": title[:120],
                "link": link,
                "district": district,
                "community": community,
                "address": None,
                "total_price": total_price,
                "unit_price": unit_price,
                "area": area,
                "layout": layout,
                "orientation": orientation,
                "decoration": decoration,
                "floor_text": None,
                "tags": tags[:8],
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
        """链家专属反爬检测"""
        url = page.url.lower() if hasattr(page, 'url') else ""
        text = html.lower()

        # 链家专属标记
        lianjia_markers = [
            "hip.lianjia.com",
            "clogin.lianjia.com",
            "lianjia.com/captcha",
            "login.lianjia.com",
        ]

        if any(m in url for m in lianjia_markers):
            return "链家人机验证页面（hip.lianjia.com）"

        if "captcha" in text and "验证" in html:
            return "需要完成人机验证"

        return super().detect_blocked(page, html) if hasattr(super(), 'detect_blocked') else None


def test_crawl():
    """测试链家爬虫"""
    print("=" * 60)
    print("链家 Playwright 爬虫测试")
    print("=" * 60)

    crawler = LianjiaPlaywrightCrawler()

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
                print(f"      面积: {listing.get('area')}㎡")

    except Exception as e:
        print(f"测试失败: {e}")
    finally:
        crawler.close()

    print("\n" + "=" * 60)


if __name__ == "__main__":
    test_crawl()

"""
Backend/crawlers/anjuke_playwright.py
======================================
安居客 Playwright 爬虫 - 使用浏览器自动化绕过反爬

安居客移动端（m.anjuke.com）的反爬相对较弱，
本爬虫使用 Playwright 模拟浏览器行为，支持：
- 隐藏 webdriver 特征
- Cookie 持久化
- 智能重试与等待
"""

from __future__ import annotations

import hashlib
import json
import random
import re
import time
import logging
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

from Backend.crawlers.playwright_crawler import PlaywrightCrawler
from Backend.crawlers.schemas import PageCrawlResult

logger = logging.getLogger(__name__)


class AnjukePlaywrightCrawler(PlaywrightCrawler):
    """
    安居客 Playwright 爬虫

    特点：
    1. 优先使用移动端 URL（反爬较弱）
    2. 支持 Cookie 持久化
    3. 自动检测反爬拦截并重试
    """

    source_key = "anjuke_playwright"
    source_name = "安居客(Playwright)"
    enabled = True
    base_url = "https://m.anjuke.com"

    district_map = {
        # 主城核心六区
        "渝中": "/cq/sale/yuzhong/",
        "江北": "/cq/sale/jiangbei/",
        "沙坪坝": "/cq/sale/shapingba/",
        "九龙坡": "/cq/sale/jiulongpo/",
        "南岸": "/cq/sale/nanana/",
        "北碚": "/cq/sale/beibei/",
        "渝北": "/cq/sale/yubei/",
        "巴南": "/cq/sale/banan/",
        "大渡口": "/cq/sale/dadukou/",
        # 主城新区
        "璧山": "/cq/sale/bishanqu/",
        "永川": "/cq/sale/yongchuanqu/",
        "合川": "/cq/sale/hechuanqu/",
        "江津": "/cq/sale/jiangjinqu/",
        "铜梁": "/cq/sale/tongliangqu/",
        "潼南": "/cq/sale/tongnanqu/",
        "大足": "/cq/sale/dazhuqu/",
        "荣昌": "/cq/sale/rongchangqu/",
        "綦江": "/cq/sale/qijiangqu/",
        "南川": "/cq/sale/nanchuanqu/",
        "长寿": "/cq/sale/changshouqu/",
        "万盛": "/cq/sale/wansheng/",
        # 区域副中心
        "万州": "/cq/sale/wanzhouqu/",
        "涪陵": "/cq/sale/fulingqu/",
        "黔江": "/cq/sale/qianjiangqu/",
        "武隆": "/cq/sale/wulongxian/",
        # 县
        "开州": "/cq/sale/kaizhouqukaixian/",
        "垫江": "/cq/sale/dainjiangxian/",
        "梁平": "/cq/sale/liangpingxian/",
        "丰都": "/cq/sale/fengduxian/",
        "奉节": "/cq/sale/fengjiexian/",
        "云阳": "/cq/sale/yunyangxian/",
        "巫山": "/cq/sale/cqwushanxian/",
        "巫溪": "/cq/sale/wuxixian/",
        "城口": "/cq/sale/chengkouxian/",
        "石柱": "/cq/sale/shizhutujiazuzizhixian/",
        "秀山": "/cq/sale/xiushantujiazumiaozuzizhixian/",
        "忠县": "/cq/sale/zhongxian/",
        "彭水": "/cq/sale/pengshuimiaozutujiazuzizhixian/",
        "酉阳": "/cq/sale/youyangtujiazumiaozuzizhixian/",
        # pinyin 别名
        "yubei": "/cq/sale/yubei/",
        "yuzhong": "/cq/sale/yuzhong/",
    }

    def __init__(self, cookie_dir: str | None = None, **kwargs):
        # 默认 Cookie 保存路径
        if cookie_dir is None:
            cookie_dir = str(Path(__file__).parent.parent.parent / "data" / "cookies")
        Path(cookie_dir).mkdir(parents=True, exist_ok=True)
        cookie_path = str(Path(cookie_dir) / "anjuke_cookies.json")
        kwargs.setdefault("headless", True)
        kwargs.setdefault("timeout", 30000)
        kwargs.setdefault("retry_times", 3)

        super().__init__(
            cookie_path=cookie_path,
            **kwargs,
        )

    def build_url(self, district: str, page: int) -> str:
        """构建安居客移动端 URL"""
        path = self.district_map.get(district)
        if path is None:
            raise KeyError(f"未知区县: {district}")

        if page <= 1:
            return self.absolute_url(path)
        return self.absolute_url(path.rstrip("/") + f"/p{page}/")

    def absolute_url(self, href: str) -> str:
        """将相对路径转为绝对 URL"""
        if href.startswith("http"):
            return href
        return self.base_url.rstrip("/") + "/" + href.lstrip("/")

    def parse(self, html: str, district: str, url: str) -> list[dict]:
        """
        解析安居客页面，提取房源列表

        策略：
        1. 先尝试从 __PRELOADED_STATE__ 提取 JSON 数据
        2. 回退到 HTML 卡片解析
        3. 再回退到图片 alt 文本解析
        """
        # 策略1：JSON 解析
        results = self._parse_json_state(html, district)
        if results:
            return self._dedupe(results)

        # 策略2：HTML 卡片解析
        soup = BeautifulSoup(html, "html.parser")
        results = self._parse_html_cards(soup, district, url)
        if results:
            return self._dedupe(results)

        # 策略3：图片 alt 文本解析
        results = self._parse_image_alt(soup, district, url)
        return self._dedupe(results)

    def _parse_json_state(self, html: str, district: str) -> list[dict]:
        """从 __PRELOADED_STATE__ 提取 JSON 数据"""
        try:
            # 查找 __PRELOADED_STATE__ 或类似的预加载数据
            patterns = [
                r'window\.__PRELOADED_STATE__\s*=\s*(\{.*?\});',
                r'window\.__INITIAL_STATE__\s*=\s*(\{.*?\});',
                r'"listData"\s*:\s*\{[^}]*"list"\s*:\s*\[(.*?)\]',
            ]

            for pattern in patterns:
                match = re.search(pattern, html, re.DOTALL)
                if match:
                    try:
                        data = json.loads(match.group(1))
                        # 尝试提取列表数据
                        if isinstance(data, dict):
                            list_data = (
                                data.get("ershoufangList", {})
                                .get("listData", {})
                                .get("list", [])
                            )
                            if not list_data:
                                list_data = data.get("list", [])
                            if isinstance(list_data, list):
                                return [self._parse_json_item(item, district) for item in list_data]
                        elif isinstance(data, list):
                            return [self._parse_json_item(item, district) for item in data]
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            logger.warning(f"[{self.source_key}] JSON 解析失败: {e}")
        return []

    def _parse_json_item(self, item: dict, district: str) -> dict:
        """解析单条 JSON 房源数据"""
        prop = item.get("property", {})
        comm = item.get("community", {})

        house_code = str(prop.get("houseCode") or "")
        raw_district = comm.get("areaName") or district

        total_price = prop.get("price", {}).get("totalPrice")
        if total_price is None:
            total_price = prop.get("totalPrice")

        return {
            "source": self.source_key,
            "source_listing_id": house_code,
            "title": prop.get("title", "")[:120],
            "link": f"https://m.anjuke.com/cq/sale/S{house_code}.html" if house_code else "",
            "district": raw_district,
            "community": comm.get("name"),
            "address": comm.get("address"),
            "total_price": float(total_price) if total_price else None,
            "unit_price": float(prop.get("price", {}).get("unitPrice") or 0) or None,
            "area": float(prop.get("buildArea") or 0) or None,
            "layout": prop.get("houseType"),
            "orientation": prop.get("orientation"),
            "decoration": self._decoration_from_tags(prop.get("tags", [])),
            "floor_text": prop.get("floor"),
            "tags": (prop.get("tags") or [])[:8],
            "status": "active",
            "fingerprint": self._make_fingerprint(house_code, raw_district, comm.get("name"), comm.get("address")),
        }

    def _parse_html_cards(self, soup: BeautifulSoup, district: str, url: str) -> list[dict]:
        """解析 HTML 房源卡片"""
        results = []

        # 选择器列表（尝试多个可能的选择器）
        selectors = [
            "li.item-wrap a.cell-wrap",
            "a.cell-wrap.MLIST_MAIN",
            ".property",
            ".property-content",
            "[class*=property]",
            "[class*=house-item]",
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
            # 提取标题
            title_elem = card.select_one(".content-title, .property-content-title-name, h3, [class*=title]")
            title = title_elem.get_text(" ", strip=True) if title_elem else ""

            # 提取链接
            link = self.absolute_url(card.get("href", ""))
            if not link:
                link = url

            # 提取价格
            text = card.get_text(" ", strip=True)
            total_price = self._extract_float(text, r"(\d+(?:\.\d+)?)\s*万")
            unit_price = self._extract_float(text, r"(\d+(?:\.\d+)?)\s*元/[㎡平]")

            # 提取面积和户型
            area = self._extract_float(text, r"(\d+(?:\.\d+)?)\s*㎡")
            layout = self._extract_layout(text)

            if not title or not total_price:
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
                "area": area,
                "layout": layout,
                "orientation": None,
                "decoration": None,
                "floor_text": None,
                "tags": [],
                "status": "active",
                "fingerprint": self._make_fingerprint(self._source_id_from_link(link), district, None, None),
            }
        except Exception as e:
            logger.warning(f"[{self.source_key}] 卡片解析失败: {e}")
            return None

    def _parse_image_alt(self, soup: BeautifulSoup, district: str, url: str) -> list[dict]:
        """从图片 alt 文本解析房源信息（最后兜底策略）"""
        results = []
        for img in soup.select('img[alt*="二手房图片"]'):
            alt = img.get("alt", "").replace("二手房图片", "").strip()
            total_price = self._extract_float(alt, r"(\d+(?:\.\d+)?)\s*万")
            area = self._extract_float(alt, r"(\d+(?:\.\d+)?)\s*㎡")
            layout = self._extract_layout(alt)

            if not total_price:
                continue

            title = alt
            for val in [layout, f"{area:g}㎡" if area else None, f"{total_price:g}万"]:
                if val:
                    title = title.replace(val, " ")
            title = re.sub(r"\s+", " ", title).strip()

            link_elem = img.find_parent("a")
            link = self.absolute_url(link_elem.get("href")) if link_elem and link_elem.get("href") else url

            results.append({
                "source": self.source_key,
                "source_listing_id": self._source_id_from_link(link),
                "title": title[:120] or alt[:120],
                "link": link,
                "district": district,
                "community": None,
                "address": None,
                "total_price": total_price,
                "unit_price": None,
                "area": area,
                "layout": layout,
                "orientation": None,
                "decoration": None,
                "floor_text": None,
                "tags": [],
                "status": "active",
                "fingerprint": self._make_fingerprint(self._source_id_from_link(link), district, title, None),
            })
        return results

    def _extract_float(self, text: str, pattern: str) -> float | None:
        """从文本中提取浮点数"""
        match = re.search(pattern, (text or "").replace(",", ""))
        return float(match.group(1)) if match else None

    def _extract_layout(self, text: str) -> str | None:
        """提取户型"""
        match = re.search(r"(\d+\s*室\s*\d*\s*厅?)", text or "")
        return match.group(1).replace(" ", "") if match else None

    def _source_id_from_link(self, link: str) -> str | None:
        """从链接提取房源 ID"""
        match = re.search(r"(\d{6,})", link)
        return match.group(1) if match else None

    def _decoration_from_tags(self, tags: list) -> str | None:
        """从标签判断装修情况"""
        for tag in (tags or []):
            if tag in ("精装修", "装修", "精装"):
                return "精装修"
            if tag == "毛坯":
                return "毛坯"
        return None

    def _make_fingerprint(self, source_id: str, district: str, community: str | None, address: str | None) -> str:
        """生成房源指纹（不含价格）"""
        raw = f"{source_id}|{district}|{community or ''}|{address or ''}"
        return hashlib.md5(raw.encode("utf-8")).hexdigest()

    def _dedupe(self, items: list[dict]) -> list[dict]:
        """去重"""
        seen = set()
        output = []
        for item in items:
            key = item.get("source_listing_id") or item.get("link") or f"{item.get('title')}|{item.get('area')}|{item.get('total_price')}"
            if key in seen:
                continue
            seen.add(key)
            output.append(item)
        return output

    def detect_blocked(self, page, html: str) -> str | None:
        """安居客专属反爬检测"""
        # 继承父类的通用检测
        url = page.url.lower() if hasattr(page, 'url') else ""
        text = html.lower()

        # 安居客专属标记
        anjuke_markers = [
            "cloud_an",
            "xxzlgatewayurl",
            "antibot/verifycode",
            "verifycode.58.com",
            "antivirus/antibot",
        ]
        if any(m in url or m in text for m in anjuke_markers):
            return "安居客反爬拦截（antibot/verifycode 或 cloud_an）"

        # 通用检测
        return super().detect_blocked(page, html) if hasattr(super(), 'detect_blocked') else None


def test_crawl():
    """测试安居客爬虫"""
    print("=" * 60)
    print("安居客 Playwright 爬虫测试")
    print("=" * 60)

    crawler = AnjukePlaywrightCrawler()

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
                print(f"      户型: {listing.get('layout')}")

    except Exception as e:
        print(f"测试失败: {e}")
    finally:
        crawler.close()

    print("\n" + "=" * 60)


if __name__ == "__main__":
    test_crawl()

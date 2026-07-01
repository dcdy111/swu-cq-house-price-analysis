from __future__ import annotations

import hashlib
import json
import logging
import re
import time
import warnings
from typing import Any

import requests
import urllib3
from bs4 import BeautifulSoup

from Backend.crawlers.base import BaseCrawler
from Backend.crawlers.schemas import PageCrawlResult

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
warnings.filterwarnings("ignore", message="Unverified HTTPS request")

logger = logging.getLogger(__name__)


class AnjukeMobileCrawler(BaseCrawler):
    source_key = "anjuke_mobile"
    source_name = "安居客移动端"
    enabled = True
    description = "安居客移动端重庆二手房页；页面结构存在波动，解析失败会记录日志。"
    base_url = "https://m.anjuke.com"
    # yubei / 渝北 互为别名（安居客 URL 路径为 /cq/sale/yubei/，中文名为"渝北"）
    district_map = {
        # ── 主城核心六区 ────────────────────────────────────────────────────
        "渝中": "/cq/sale/yuzhong/",
        "江北": "/cq/sale/jiangbei/",
        "沙坪坝": "/cq/sale/shapingba/",
        "九龙坡": "/cq/sale/jiulongpo/",
        "南岸": "/cq/sale/nanana/",
        "北碚": "/cq/sale/beibei/",
        "渝北": "/cq/sale/yubei/",
        "巴南": "/cq/sale/banan/",
        "大渡口": "/cq/sale/dadukou/",
        # ── 璧山区 ────────────────────────────────────────────────────────
        "璧山": "/cq/sale/bishanqu/",
        # ── 主城新区（璧山区之后）────────────────────────────────────────────
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
        # ── 区域副中心 ────────────────────────────────────────────────────
        "万州": "/cq/sale/wanzhouqu/",
        "涪陵": "/cq/sale/fulingqu/",
        "黔江": "/cq/sale/qianjiangqu/",
        "武隆": "/cq/sale/wulongxian/",
        # ── 县（自治县）───────────────────────────────────────────────────
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
        # ── URL pinyin 别名（兼容 fetch /build_url 的 district 参数）──────────
        # 用 pinyin 路径片断做 key，value 为中文名，便于"yubei" 快速查到"渝北"
        "yubei": "渝北",
        "yuzhong": "渝中",
        "jiangbei": "江北",
        "shapingba": "沙坪坝",
        "jiulongpo": "九龙坡",
        "nanan": "南岸",
        "nanana": "南岸",
        "beibei": "北碚",
        "banan": "巴南",
        "dadukou": "大渡口",
        "dianjiangxian": "垫江",
        "dainjiangxian": "垫江",
    }

    def build_url(self, district: str, page: int) -> str:
        """
        支持两种 district 参数格式：
        - 中文名：如 "渝北" → 查 district_map["渝北"] → /cq/sale/yubei/
        - pinyin 别名：如 "yubei" → 查 district_map["yubei"] → "渝北" → 再查 district_map["渝北"]
        """
        # 先直接查
        path = self.district_map.get(district)
        if path is None:
            raise KeyError(f"未知区县: {district}，不在 district_map 中")

        # pinyin 别名：value 是中文名
        if isinstance(path, str) and "/" not in path:
            district = path
            path = self.district_map.get(district)
            if path is None:
                raise KeyError(f"未知区县: {district}")

        if page <= 1:
            return self.absolute_url(path)
        return self.absolute_url(path.rstrip("/") + f"/p{page}/")

    def headers(self) -> dict:
        headers = self.default_headers()
        headers["User-Agent"] = (
            "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36"
        )
        headers["Referer"] = "https://m.anjuke.com/cq/sale/"
        return self.apply_runtime_headers(headers)

    def parse(self, html: str, district: str, url: str) -> list[dict]:
        soup = BeautifulSoup(html, "html.parser")
        results: list[dict] = []
        for card in soup.select("li.item-wrap a.cell-wrap[href], a.cell-wrap.MLIST_MAIN[href]"):
            parsed = self._parse_modern_card(card, district)
            if parsed:
                results.append(parsed)
        if results:
            return self._dedupe(results)

        candidates = (
            soup.select(".property")
            or soup.select(".property-content")
            or soup.select("[class*=property]")
            or soup.select("[class*=house-item]")
        )
        for item in candidates:
            parsed = self._parse_candidate(item, district, url)
            if parsed:
                results.append(parsed)

        if not results:
            results = self._parse_image_alt_cards(soup, district, url)
        return self._dedupe(results)

    def _parse_modern_card(self, card, district: str) -> dict | None:
        title_elem = card.select_one(".content-title")
        title = title_elem.get_text(" ", strip=True) if title_elem else ""
        link = self.absolute_url(card.get("href"))
        desc_parts = [
            part.get_text(" ", strip=True)
            for part in card.select(".desc-wrap-community .content-desc, .content-desc")
            if part.get_text(strip=True)
        ]
        text = card.get_text(" ", strip=True)
        layout = self._first_match(desc_parts, lambda x: "室" in x or "厅" in x)
        area = self._extract_float(" ".join(desc_parts), r"(\d+(?:\.\d+)?)\s*㎡")
        orientation = self._first_match(desc_parts, self._looks_like_orientation)
        card_district = self._first_match(desc_parts, lambda x: x in self.district_map) or district
        image = card.select_one('img[alt*="二手房图片"]')
        image_text = (image.get("alt") or "").replace("二手房图片", "").strip() if image else ""
        community = self._derive_title_from_alt(image_text, layout, area, self._extract_float(image_text, r"(\d+(?:\.\d+)?)\s*万")) if image_text else None
        total_elem = card.select_one(".content-price")
        unit_elem = card.select_one(".house-avg-price")
        total_price = self._extract_float(total_elem.get_text(" ", strip=True) if total_elem else text, r"(\d+(?:\.\d+)?)")
        unit_price = self._extract_float(unit_elem.get_text(" ", strip=True) if unit_elem else text, r"(\d+(?:\.\d+)?)\s*元/[㎡平]")
        tags = [x.get_text(" ", strip=True) for x in card.select(".highlight-tag, .content-tag") if x.get_text(strip=True)]

        if not title or not link or total_price is None:
            return None
        return self._build_listing(
            district=card_district,
            title=title,
            link=link,
            address=self._clean_card_address(text, card_district, community, title),
            total_price=total_price,
            unit_price=unit_price,
            area=area,
            layout=layout,
            source_listing_id=self._source_id_from_card(card, link),
            community=community,
            orientation=orientation,
            tags=tags,
            metro_distance=self._extract_metro_distance(text),
            building_type=self._extract_building_type(" ".join(desc_parts + tags)),
            has_elevator=self._extract_has_elevator(" ".join(desc_parts + tags)),
            total_floors=self._extract_total_floors(text),
        )

    def _parse_candidate(self, item, district: str, url: str) -> dict | None:
        text = item.get_text(" ", strip=True)
        title_elem = item.select_one(".property-content-title-name, h3, [class*=title]")
        title = title_elem.get_text(" ", strip=True) if title_elem else text[:80]
        link_elem = item.select_one("a[href]")
        link = self.absolute_url(link_elem.get("href")) if link_elem else url
        total_price = self._extract_float(text, r"(\d+(?:\.\d+)?)\s*万")
        unit_price = self._extract_float(text, r"(\d+(?:\.\d+)?)\s*元/[㎡平]")
        area = self._extract_float(text, r"(\d+(?:\.\d+)?)\s*㎡")
        layout = self._extract_layout(text)

        if not title or not link or total_price is None:
            return None
        return self._build_listing(
            district=district,
            title=title,
            link=link,
            address=self._clean_card_address(text, district, None, title),
            total_price=total_price,
            unit_price=unit_price,
            area=area,
            layout=layout,
            metro_distance=self._extract_metro_distance(text),
            building_type=None,
            has_elevator=self._extract_has_elevator(text),
            total_floors=self._extract_total_floors(text),
        )

    def _parse_image_alt_cards(self, soup: BeautifulSoup, district: str, url: str) -> list[dict]:
        results: list[dict] = []
        for image in soup.select('img[alt*="二手房图片"]'):
            alt = image.get("alt") or ""
            text = alt.replace("二手房图片", "").strip()
            total_price = self._extract_float(text, r"(\d+(?:\.\d+)?)\s*万")
            area = self._extract_float(text, r"(\d+(?:\.\d+)?)\s*㎡")
            layout = self._extract_layout(text)
            title = self._derive_title_from_alt(text, layout, area, total_price)

            link_elem = image.find_parent("a")
            if link_elem is None:
                link_elem = image.find_parent().find("a", href=True) if image.find_parent() else None
            link = self.absolute_url(link_elem.get("href")) if link_elem and link_elem.get("href") else url

            if not title or total_price is None:
                continue
            results.append(
                self._build_listing(
                    district=district,
                    title=title,
                    link=link,
                    address=self._clean_card_address(text, district, title, title),
                    total_price=total_price,
                    unit_price=None,
                    area=area,
                    layout=layout,
                    metro_distance=self._extract_metro_distance(text),
                    building_type=None,
                    has_elevator=self._extract_has_elevator(text),
                    total_floors=self._extract_total_floors(text),
                )
            )
        return results

    def _build_listing(
        self,
        district: str,
        title: str,
        link: str,
        address: str,
        total_price: float | None,
        unit_price: float | None,
        area: float | None,
        layout: str | None,
        source_listing_id: str | None = None,
        community: str | None = None,
        orientation: str | None = None,
        tags: list[str] | None = None,
        metro_distance: int | None = None,
        building_type: str | None = None,
        has_elevator: bool | None = None,
        total_floors: int | None = None,
    ) -> dict:
        return {
            "source": self.source_key,
            "source_listing_id": source_listing_id or self._source_id_from_link(link),
            "title": title[:120],
            "link": link,
            "district": district,
            "community": community,
            "address": address[:255],
            "total_price": total_price,
            "unit_price": unit_price,
            "area": area,
            "layout": layout,
            "orientation": orientation,
            "decoration": None,
            "floor_text": None,
            "total_floors": total_floors,
            "build_year": None,
            "metro_distance": metro_distance,
            "building_type": building_type,
            "has_elevator": has_elevator,
            "tags": (tags or [])[:8],
            "status": "active",
        }

    @staticmethod
    def _extract_layout(text: str) -> str | None:
        match = re.search(r"(\d+\s*室\s*\d*\s*厅?)", text or "")
        return match.group(1).replace(" ", "") if match else None

    @staticmethod
    def _first_match(parts: list[str], predicate) -> str | None:
        for part in parts:
            if predicate(part):
                return part
        return None

    @staticmethod
    def _looks_like_orientation(text: str) -> bool:
        return bool(re.fullmatch(r"(东|南|西|北|东西|南北|东南|东北|西南|西北)", text or ""))

    @staticmethod
    def _derive_title_from_alt(text: str, layout: str | None, area: float | None, total_price: float | None) -> str:
        title = text
        for value in [layout, f"{area:g}㎡" if area is not None else None, f"{total_price:g}万" if total_price is not None else None]:
            if value:
                title = title.replace(value, " ")
        title = re.sub(r"\s+", " ", title).strip()
        return title or text

    @staticmethod
    def _dedupe(items: list[dict]) -> list[dict]:
        seen: set[str] = set()
        output: list[dict] = []
        for item in items:
            key = item.get("source_listing_id") or item.get("link") or f"{item.get('title')}|{item.get('area')}|{item.get('total_price')}"
            if key in seen:
                continue
            seen.add(key)
            output.append(item)
        return output

    @staticmethod
    def _extract_float(text: str, pattern: str) -> float | None:
        match = re.search(pattern, (text or "").replace(",", ""))
        return float(match.group(1)) if match else None

    @staticmethod
    def _source_id_from_card(card, link: str) -> str | None:
        raw = card.get("data-lego") or ""
        if raw:
            try:
                value = json.loads(raw)
                entity_id = value.get("entity_id") if isinstance(value, dict) else None
                if entity_id:
                    return str(entity_id)
            except json.JSONDecodeError:
                pass
        return AnjukeMobileCrawler._source_id_from_link(link)

    @staticmethod
    def _source_id_from_link(link: str) -> str | None:
        match = re.search(r"(\d{6,})", link)
        return match.group(1) if match else None

    @staticmethod
    def _extract_total_floors(text: str | None) -> int | None:
        match = re.search(r"共\s*(\d+)\s*层", text or "")
        return int(match.group(1)) if match else None

    @staticmethod
    def _extract_metro_distance(text: str | None) -> int | None:
        match = re.search(r"距.{0,40}?(\d+(?:\.\d+)?)\s*(米|m|km|公里)", text or "", re.IGNORECASE)
        if not match:
            return None
        distance = float(match.group(1))
        unit = match.group(2).lower()
        return int(round(distance * 1000)) if unit in {"km", "公里"} else int(round(distance))

    @staticmethod
    def _extract_building_type(text: str | None) -> str | None:
        merged = text or ""
        for keyword in ("板楼", "塔楼", "别墅", "洋房", "平房", "板塔结合"):
            if keyword in merged:
                return keyword
        return None

    @staticmethod
    def _extract_has_elevator(text: str | None) -> bool | None:
        merged = text or ""
        if "无电梯" in merged:
            return False
        if "有电梯" in merged or "电梯房" in merged:
            return True
        return None

    @staticmethod
    def _clean_card_address(text: str | None, district: str | None, community: str | None, title: str | None) -> str:
        raw = re.sub(r"\s+", " ", str(text or "")).strip()
        markers = ("元/㎡", "元/平", "㎡", "VR看房", "经纪人力荐", "房东直卖", "满五年")
        if len(raw) > 80 or any(marker in raw for marker in markers):
            parts = [str(district or "").strip(), str(community or "").strip()]
            fallback = " ".join(part for part in parts if part)
            return fallback or "待复核"
        return raw or "待复核"

    # ─────────────────────────────────────────────────────────────────────────
    # JSON 解析入口（用于 __PRELOADED_STATE__ 注入数据）
    # ─────────────────────────────────────────────────────────────────────────

    @staticmethod
    def parse_listing_json(item: dict) -> dict | None:
        """
        解析安居客抓包 JSON 的 info dict（info.property / info.community），
        返回统一标准字段 dict，解析失败返回 None。

        适用数据结构（__PRELOADED_STATE__.ershoufangList.listData.list）：
            {
                "property": {
                    "houseCode": "...", "title": "...", "price": {...},
                    "houseType": "...", "buildArea": ..., "orientation": "...",
                    "floor": "...", "tags": [...]
                },
                "community": {
                    "name": "...", "areaName": "...", "address": "..."
                }
            }
        """
        prop = item.get("property", {})
        comm = item.get("community", {})

        house_code = str(prop.get("houseCode") or "")
        raw_district = comm.get("areaName") or ""

        if raw_district not in AnjukeMobileCrawler.district_map:
            return None

        total_price = prop.get("price", {}).get("totalPrice")
        if total_price is None:
            return None

        unit_price = prop.get("price", {}).get("unitPrice")
        area = prop.get("buildArea")
        layout = prop.get("houseType")
        orientation = prop.get("orientation")
        floor_text = prop.get("floor")
        title = prop.get("title") or ""
        community_name = comm.get("name") or ""
        address = comm.get("address") or ""
        tags: list = prop.get("tags") or []

        floor_level: str | None = None
        if floor_text:
            m = re.search(r"(低|中|高)楼层", floor_text)
            if m:
                floor_level = m.group(1) + "楼层"

        link = f"https://m.anjuke.com/cq/sale/S{house_code}.html" if house_code else ""

        return {
            "source": AnjukeMobileCrawler.source_key,
            "source_listing_id": house_code,
            "title": title[:120],
            "link": link,
            "district": raw_district,
            "community": community_name,
            "address": address[:255],
            "total_price": float(total_price),
            "unit_price": float(unit_price) if unit_price else None,
            "area": float(area) if area else None,
            "layout": layout,
            "rooms": AnjukeMobileCrawler._rooms_from_layout(layout),
            "halls": AnjukeMobileCrawler._halls_from_layout(layout),
            "orientation": orientation,
            "decoration": AnjukeMobileCrawler._decoration_from_tags(tags),
            "floor_text": floor_text,
            "floor_level": floor_level,
            "build_year": None,
            "house_age": None,
            "tags": tags[:8],
            "status": "active",
            "fingerprint": AnjukeMobileCrawler._make_fingerprint(
                house_code, raw_district, community_name, address
            ),
        }

    @staticmethod
    def _rooms_from_layout(layout: str | None) -> int | None:
        if not layout:
            return None
        m = re.search(r"(\d+)\s*室", layout)
        return int(m.group(1)) if m else None

    @staticmethod
    def _halls_from_layout(layout: str | None) -> int | None:
        if not layout:
            return None
        m = re.search(r"\d+\s*室\s*(\d+)\s*厅?", layout)
        return int(m.group(1)) if m else None

    @staticmethod
    def _decoration_from_tags(tags: list) -> str | None:
        for tag in (tags or []):
            if tag in ("精装修", "装修", "精装"):
                return "精装修"
            if tag == "毛坯":
                return "毛坯"
        return None

    @staticmethod
    def _make_fingerprint(
        source_listing_id: str,
        district: str,
        community: str,
        address: str,
    ) -> str:
        raw = f"{source_listing_id}|{district}|{community}|{address}"
        return hashlib.md5(raw.encode("utf-8")).hexdigest()

    # ─────────────────────────────────────────────────────────────────────────
    # HTML 解析入口：优先尝试从 __PRELOADED_STATE__ 提取 JSON，
    # 回退到 HTML 卡片解析
    # ─────────────────────────────────────────────────────────────────────────

    def parse_from_html(self, html: str, district: str, url: str) -> list[dict]:
        """
        优先从 HTML 中提取 __PRELOADED_STATE__ JSON，
        若成功则逐条调用 parse_listing_json；
        若提取失败则回退到 HTML 卡片解析（调用原有 parse 方法）。
        """
        preload_data = self._extract_preloaded_state(html)
        if preload_data:
            results: list[dict] = []
            for item in preload_data:
                parsed = self.parse_listing_json(item)
                if parsed:
                    results.append(parsed)
            if results:
                return self._dedupe(results)

        return self.parse(html, district, url)

    def crawl_page(self, district: str, page: int) -> PageCrawlResult:
        """
        重写父类 crawl_page：优先使用 parse_from_html（支持 __PRELOADED_STATE__ JSON 路径），
        再回退到 HTML 卡片解析。
        """
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

        for attempt in range(1, attempts + 1):
            started = time.perf_counter()
            status_code: int | None = None
            html_len: int | None = None
            final_url = url
            html_text = ""
            try:
                self.sleep()
                headers = self.headers()
                with requests.Session() as session:
                    session.trust_env = False
                    response = session.get(url, headers=headers, timeout=self.timeout, verify=False)
                    elapsed_ms = int((time.perf_counter() - started) * 1000)
                    status_code = response.status_code
                    final_url = response.url
                    html_len = len(response.content or b"")
                    if not response.encoding or response.encoding.lower() == "iso-8859-1":
                        response.encoding = response.apparent_encoding or response.encoding
                    html_text = response.text

                if status_code in {429, 500, 502, 503, 504} and attempt < attempts:
                    last_error = f"HTTP {status_code}"
                    continue
                response.raise_for_status()

                blocked_reason = self.detect_blocked(final_url, html_text)
                if blocked_reason:
                    return PageCrawlResult(
                        source=self.source_key,
                        district=district,
                        page=page,
                        url=url,
                        final_url=final_url,
                        status_code=status_code,
                        elapsed_ms=elapsed_ms,
                        html_bytes=html_len,
                        attempts=attempt,
                        ok=False,
                        message=blocked_reason,
                    )

                listings = self.parse_from_html(html_text, district, url)
                if not listings:
                    preload_found = self._extract_preloaded_state(html_text) is not None
                    return PageCrawlResult(
                        source=self.source_key,
                        district=district,
                        page=page,
                        url=url,
                        final_url=final_url,
                        status_code=status_code,
                        elapsed_ms=elapsed_ms,
                        html_bytes=html_len,
                        attempts=attempt,
                        ok=False,
                        message="页面可访问，但未解析到房源列表" +
                                ("（__PRELOADED_STATE__ 未注入，疑似被风控）" if not preload_found else ""),
                    )
                return PageCrawlResult(
                    source=self.source_key,
                    district=district,
                    page=page,
                    url=url,
                    final_url=final_url,
                    status_code=status_code,
                    elapsed_ms=elapsed_ms,
                    html_bytes=html_len,
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
                    html_bytes=html_len,
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
        """安居客专属反爬检测：补充 cloud_an / xxzlGatewayUrl 等安居客特有标记"""
        parent_reason = super().detect_blocked(final_url, html)
        if parent_reason:
            return parent_reason
        url = (final_url or "").lower()
        text = (html or "").lower()
        anjuke_markers = [
            "cloud_an",
            "xxzlgatewayurl",
            "antibot/verifycode",
            "verifycode.58.com",
            "antivirus/antibot",
        ]
        if any(m in url or m in text for m in anjuke_markers):
            return "安居客反爬拦截（antibot/verifycode 或 cloud_an）"
        return None

    @staticmethod
    def _extract_preloaded_state(html: str) -> list[dict] | None:
        """
        从 HTML 源码中提取 __PRELOADED_STATE__ JSON，
        定位路径：window.__PRELOADED_STATE__?.ershoufangList?.listData?.list
        """
        try:
            soup = BeautifulSoup(html, "html.parser")
            scripts = soup.find_all("script")
            for script in scripts:
                text = script.string or ""
                m = re.search(
                    r"window\.__PRELOADED_STATE__\s*=\s*(\{.*?\});",
                    text,
                    re.DOTALL,
                )
                if not m:
                    m = re.search(
                        r"__PRELOADED_STATE__\s*=\s*(\{.*?\})\s*;?\s*$",
                        text,
                        re.DOTALL | re.MULTILINE,
                    )
                if m:
                    raw = m.group(1)
                    try:
                        state = json.loads(raw)
                    except json.JSONDecodeError:
                        return None
                    listing_list = (
                        state.get("ershoufangList", {})
                        or state.get("listData", {})
                        or state
                    )
                    if isinstance(listing_list, dict):
                        listing_list = listing_list.get("listData", {}).get("list", [])
                    if isinstance(listing_list, list) and listing_list:
                        return listing_list
        except Exception:
            pass
        logger.warning("__PRELOADED_STATE__ 未在 HTML 中找到，parse_from_html 将回退到 HTML 卡片解析")
        return None

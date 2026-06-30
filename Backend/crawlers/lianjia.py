from __future__ import annotations

import json
import re

from bs4 import BeautifulSoup

from Backend.crawlers.base import BaseCrawler


class LianjiaCrawler(BaseCrawler):
    source_key = "lianjia"
    source_name = "链家移动端"
    enabled = False
    cookie_env_key = "LIANJIA_COOKIE"
    description = "链家移动端重庆二手房页；需配置 LIANJIA_COOKIE，适合作为高质量实验源，不默认大规模采集。"
    base_url = "https://m.lianjia.com"
    district_map = {
        "全部": "/cq/ershoufang/",
        "江北": "/cq/ershoufang/jiangbei/",
        "渝北": "/cq/ershoufang/yubei/",
        "南岸": "/cq/ershoufang/nanan/",
        "巴南": "/cq/ershoufang/banan/",
        "沙坪坝": "/cq/ershoufang/shapingba/",
        "九龙坡": "/cq/ershoufang/jiulongpo/",
        "渝中": "/cq/ershoufang/yuzhong/",
        "大渡口": "/cq/ershoufang/dadukou/",
        "北碚": "/cq/ershoufang/beibei/",
    }

    def build_url(self, district: str, page: int) -> str:
        path = self.district_map[district]
        if page <= 1:
            return self.absolute_url(path)
        return self.absolute_url(path.rstrip("/") + f"/pg{page}/")

    def headers(self) -> dict:
        headers = self.default_headers()
        headers["User-Agent"] = (
            "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36"
        )
        headers["Referer"] = "https://m.lianjia.com/cq/ershoufang/"
        return self.apply_runtime_headers(headers)

    def parse(self, html: str, district: str, url: str) -> list[dict]:
        soup = BeautifulSoup(html, "html.parser")
        if soup.title and any(word in soup.title.get_text("", strip=True).lower() for word in ["captcha", "登录"]):
            return []

        mobile_results = self._parse_mobile_state(html, district, url)
        dom_results = self._parse_mobile_dom(soup, district, url)
        if mobile_results or dom_results:
            return self._dedupe(mobile_results + dom_results)

        results: list[dict] = []
        for item in soup.select(".sellListContent li"):
            title_elem = item.select_one(".title a")
            title = title_elem.get_text(" ", strip=True) if title_elem else ""
            link = self.absolute_url(title_elem.get("href")) if title_elem else ""

            total_elem = item.select_one(".totalPrice span")
            unit_elem = item.select_one(".unitPrice")
            total_price = self._extract_float(total_elem.get_text(" ", strip=True) if total_elem else "", r"(\d+(?:\.\d+)?)")
            unit_price = None
            if unit_elem:
                unit_price = self._extract_float(unit_elem.get("data-price") or unit_elem.get_text(" ", strip=True), r"(\d+(?:\.\d+)?)")

            info_elem = item.select_one(".houseInfo")
            info_parts = [part.strip() for part in info_elem.get_text("|", strip=True).split("|") if part.strip()] if info_elem else []
            layout = info_parts[0] if len(info_parts) > 0 else None
            area = self._extract_float(info_parts[1] if len(info_parts) > 1 else "", r"(\d+(?:\.\d+)?)")
            orientation = info_parts[2] if len(info_parts) > 2 else None
            decoration = info_parts[3] if len(info_parts) > 3 else None
            floor_text = info_parts[4] if len(info_parts) > 4 else None
            build_year = self._extract_int(info_parts[5] if len(info_parts) > 5 else "")

            community_elem = item.select_one(".positionInfo a")
            community = community_elem.get_text(" ", strip=True) if community_elem else None
            address_elem = item.select_one(".positionInfo")
            address = address_elem.get_text(" ", strip=True) if address_elem else None
            tags = [x.get_text(" ", strip=True) for x in item.select(".tag span") if x.get_text(strip=True)]

            if not title or not link:
                continue
            results.append(
                {
                    "source": self.source_key,
                    "source_listing_id": self._source_id_from_link(link),
                    "title": title,
                    "link": link,
                    "district": district,
                    "community": community,
                    "address": address,
                    "total_price": total_price,
                    "unit_price": unit_price,
                    "area": area,
                    "layout": layout,
                    "orientation": orientation,
                    "decoration": decoration,
                    "floor_text": floor_text,
                    "total_floors": self._extract_total_floors(floor_text),
                    "build_year": build_year,
                    "metro_distance": self._extract_metro_distance(" ".join(info_parts + tags)),
                    "building_type": self._extract_building_type(" ".join(info_parts + tags)),
                    "has_elevator": self._extract_has_elevator(" ".join(info_parts + tags)),
                    "tags": tags[:8],
                    "status": "active",
                }
            )
        return results

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

    def _parse_mobile_dom(self, soup: BeautifulSoup, district: str, url: str) -> list[dict]:
        results: list[dict] = []
        for item in soup.select(".kem__house-tile-ershou"):
            link_elem = item.find_parent("a", href=True) or item.select_one("a[href]")
            link = self.absolute_url(link_elem.get("href")) if link_elem else url
            title_elem = item.select_one(".house-title")
            title = self._clean_text(title_elem.get_text(" ", strip=True) if title_elem else "")
            desc_elem = item.select_one(".house-desc")
            desc_text = self._clean_text(desc_elem.get_text(" ", strip=True) if desc_elem else "")
            desc_parts = self._split_desc(desc_text)
            layout = desc_parts[0] if len(desc_parts) > 0 else None
            area = self._extract_float(desc_parts[1] if len(desc_parts) > 1 else "", r"(\d+(?:\.\d+)?)")
            orientation = desc_parts[2] if len(desc_parts) > 2 else None
            community = desc_parts[3] if len(desc_parts) > 3 else None
            if community:
                community = re.sub(r"二手房$", "", community)

            total_elem = item.select_one(".price-total")
            unit_elem = item.select_one(".price-unit")
            total_price = self._extract_float(total_elem.get_text(" ", strip=True) if total_elem else "", r"(\d+(?:\.\d+)?)")
            unit_price = self._extract_float(unit_elem.get_text(" ", strip=True) if unit_elem else "", r"(\d+(?:\.\d+)?)")
            tags = [x.get_text(" ", strip=True) for x in item.select(".house-tags .tag, .tag") if x.get_text(strip=True)]
            source_listing_id = item.get("data-id") or self._source_id_from_link(link)

            if not title or not link:
                continue
            results.append(
                {
                    "source": self.source_key,
                    "source_listing_id": source_listing_id,
                    "title": title,
                    "link": link,
                    "district": district,
                    "community": community,
                    "address": desc_text,
                    "total_price": total_price,
                    "unit_price": unit_price,
                    "area": area,
                    "layout": layout,
                    "orientation": orientation,
                    "decoration": None,
                    "floor_text": None,
                    "total_floors": self._extract_total_floors(desc_text),
                    "build_year": None,
                    "metro_distance": self._extract_metro_distance(" ".join(desc_parts + tags)),
                    "building_type": self._extract_building_type(" ".join(desc_parts + tags)),
                    "has_elevator": self._extract_has_elevator(" ".join(desc_parts + tags)),
                    "tags": tags[:8],
                    "status": "active",
                }
            )
        return results

    def _parse_mobile_state(self, html: str, district: str, url: str) -> list[dict]:
        state = self._extract_preloaded_state(html)
        if not state:
            return []

        list_data = state.get("ershoufangList", {}).get("listData", {})
        raw_items = list_data.get("list") or []
        if not isinstance(raw_items, list):
            return []

        results: list[dict] = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            title = self._clean_text(item.get("title") or item.get("name"))
            desc_parts = self._split_desc(item.get("desc") or item.get("subTitle") or "")
            layout = desc_parts[0] if len(desc_parts) > 0 else None
            area = self._extract_float(desc_parts[1] if len(desc_parts) > 1 else "", r"(\d+(?:\.\d+)?)")
            orientation = desc_parts[2] if len(desc_parts) > 2 else None
            community = desc_parts[3] if len(desc_parts) > 3 else None

            link = (
                item.get("jumpUrl")
                or item.get("url")
                or item.get("detailUrl")
                or item.get("cardLink")
                or item.get("houseUrl")
            )
            source_listing_id = str(item.get("houseCode") or item.get("id") or "").strip() or self._source_id_from_link(link or "")
            if not link and source_listing_id:
                link = f"/cq/ershoufang/{source_listing_id}.html"
            link = self.absolute_url(str(link)) if link else url

            total_price = self._extract_float(str(item.get("totalPrice") or item.get("total_price") or ""), r"(\d+(?:\.\d+)?)")
            unit_price = self._extract_float(
                str(item.get("unitPrice") or item.get("unit_price") or "").replace(",", ""),
                r"(\d+(?:\.\d+)?)",
            )
            tags = item.get("tags") if isinstance(item.get("tags"), list) else []
            if tags and isinstance(tags[0], dict):
                tags = [self._clean_text(tag.get("name") or tag.get("text")) for tag in tags]

            if not title:
                continue
            results.append(
                {
                    "source": self.source_key,
                    "source_listing_id": source_listing_id,
                    "title": title,
                    "link": link,
                    "district": district,
                    "community": community,
                    "address": item.get("desc") or item.get("subTitle"),
                    "total_price": total_price,
                    "unit_price": unit_price,
                    "area": area,
                    "layout": layout,
                    "orientation": orientation,
                    "decoration": None,
                    "floor_text": None,
                    "total_floors": self._extract_total_floors(item.get("desc") or item.get("subTitle")),
                    "build_year": None,
                    "metro_distance": self._extract_metro_distance(" ".join([str(item.get("desc") or ""), *[str(tag) for tag in tags]])),
                    "building_type": self._extract_building_type(" ".join(desc_parts + [str(tag) for tag in tags])),
                    "has_elevator": self._extract_has_elevator(" ".join(desc_parts + [str(tag) for tag in tags])),
                    "tags": [tag for tag in tags[:8] if tag],
                    "status": "active",
                }
            )
        return results

    @staticmethod
    def _extract_preloaded_state(html: str) -> dict | None:
        marker = "window.__PRELOADED_STATE__"
        start = html.find(marker)
        if start < 0:
            return None
        equals = html.find("=", start)
        if equals < 0:
            return None
        object_start = html.find("{", equals)
        if object_start < 0:
            return None
        raw = LianjiaCrawler._read_balanced_json_object(html, object_start)
        if not raw:
            return None
        try:
            value = json.loads(raw)
            return value if isinstance(value, dict) else None
        except json.JSONDecodeError:
            return None

    @staticmethod
    def _read_balanced_json_object(text: str, start: int) -> str | None:
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(text)):
            char = text[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return text[start : index + 1]
        return None

    @staticmethod
    def _split_desc(text: str) -> list[str]:
        return [part.strip() for part in str(text or "").split("/") if part.strip()]

    @staticmethod
    def _clean_text(value) -> str:
        return re.sub(r"\s+", " ", str(value or "")).strip()

    @staticmethod
    def _extract_float(text: str, pattern: str) -> float | None:
        match = re.search(pattern, (text or "").replace(",", ""))
        return float(match.group(1)) if match else None

    @staticmethod
    def _extract_int(text: str) -> int | None:
        match = re.search(r"(\d{4})", text or "")
        return int(match.group(1)) if match else None

    @staticmethod
    def _source_id_from_link(link: str) -> str | None:
        match = re.search(r"(\d{6,})", link or "")
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

from __future__ import annotations

import re

from bs4 import BeautifulSoup

from Backend.crawlers.base import BaseCrawler


class FangCrawler(BaseCrawler):
    source_key = "fang"
    source_name = "房天下"
    enabled = True
    description = "重庆房天下二手房列表页，当前可直接返回普通 HTML，作为默认稳定采集源。"
    base_url = "https://cq.esf.fang.com"
    district_map = {
        # 房天下重庆首页当前已将“渝北”入口更新为“两江新区”，对应 a058。
        # 兼容保留“江北”别名，避免旧脚本或历史任务参数直接失效。
        "两江新区": "/house-a058/",
        "江北": "/house-a058/",
        "渝中": "/house-a056/",
        "南岸": "/house-a059/",
        "沙坪坝": "/house-a060/",
        "九龙坡": "/house-a061/",
        "大渡口": "/house-a062/",
        "北碚": "/house-a063/",
        "巴南": "/house-a064/",
        "涪陵": "/house-a011828/",
        "长寿": "/house-a011825/",
        "大足": "/house-a011826/",
        "垫江": "/house-a011827/",
        "南川": "/house-a011829/",
        "彭水": "/house-a011830/",
        "綦江": "/house-a011831/",
        "荣昌": "/house-a011832/",
        "江津": "/house-a011833/",
        "铜梁": "/house-a011834/",
        "潼南": "/house-a011835/",
        "万州": "/house-a011837/",
        "武隆": "/house-a011838/",
        "永川": "/house-a011839/",
        "璧山": "/house-a011840/",
        "合川": "/house-a011841/",
        "丰都": "/house-a016707/",
        "奉节": "/house-a016708/",
        "梁平": "/house-a016709/",
        "黔江": "/house-a016710/",
        "石柱": "/house-a016711/",
        "巫山": "/house-a016712/",
        "云阳": "/house-a016713/",
        "忠县": "/house-a016714/",
        "城口": "/house-a016718/",
        "巫溪": "/house-a016719/",
        "开州": "/house-a016748/",
        "秀山": "/house-a017400/",
        "酉阳": "/house-a017401/",
    }

    def build_url(self, district: str, page: int) -> str:
        path = self.district_map[district]
        if page <= 1:
            return self.absolute_url(path)
        return self.absolute_url(path.rstrip("/") + f"/i3{page}/")

    def parse(self, html: str, district: str, url: str) -> list[dict]:
        soup = BeautifulSoup(html, "html.parser")
        results: list[dict] = []
        for item in soup.select(".shop_list dl"):
            title_elem = item.select_one(".tit_shop")
            title = title_elem.get_text(" ", strip=True) if title_elem else ""
            title_link = item.select_one("h4 a[href]") or (title_elem.find_parent("a") if title_elem else None) or item.select_one("a[href]")
            link = self.absolute_url(title_link.get("href")) if title_link else ""

            price_text = item.select_one(".price_right")
            price_blob = price_text.get_text(" ", strip=True) if price_text else item.get_text(" ", strip=True)
            total_price = self._extract_float(price_blob, r"(\d+(?:\.\d+)?)\s*万")
            unit_price = self._extract_float(price_blob, r"(\d+(?:\.\d+)?)\s*元/㎡")

            info_elem = item.select_one(".tel_shop")
            info_parts = [p.strip() for p in info_elem.get_text("|", strip=True).split("|") if p.strip()] if info_elem else []
            layout = self._first_match(info_parts, lambda x: "室" in x or "独栋" in x or "别墅" in x)
            area = self._extract_float(" ".join(info_parts), r"(\d+(?:\.\d+)?)\s*㎡")
            floor_text = self._first_match(info_parts, lambda x: "层" in x)
            orientation = self._first_match(info_parts, lambda x: "向" in x)

            community_elem = item.select_one(".add_shop a")
            community = community_elem.get_text(" ", strip=True) if community_elem else None
            address_elem = item.select_one(".add_shop")
            address = address_elem.get_text(" ", strip=True) if address_elem else None
            tags = [x.get_text(" ", strip=True) for x in item.select(".label a, .label span") if x.get_text(strip=True)]
            source_listing_id = self._source_id_from_link(link)

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
                    "address": address,
                    "total_price": total_price,
                    "unit_price": unit_price,
                    "area": area,
                    "layout": layout,
                    "orientation": orientation,
                    "decoration": None,
                    "floor_text": floor_text,
                    "total_floors": self._extract_total_floors(floor_text),
                    "build_year": None,
                    "metro_distance": self._extract_metro_distance(" ".join(info_parts + tags)),
                    "building_type": self._extract_building_type(" ".join(info_parts + tags)),
                    "has_elevator": self._extract_has_elevator(" ".join(info_parts + tags)),
                    "tags": tags[:8],
                    "status": "active",
                }
            )
        if not results:
            for item in soup.select("section.houseList2.esf li.listhouse, li.listhouse"):
                link_elem = item.select_one("a.listtype[href], a[href*='/esf/cq/'][href*='.html']")
                link = self.absolute_url(link_elem.get("href")) if link_elem else ""
                title_elem = item.select_one(".txt h3, h3.line2")
                title = title_elem.get_text(" ", strip=True) if title_elem else ""
                if not title:
                    image = item.select_one("img[alt]")
                    title = image.get("alt", "").strip() if image else ""

                info_parts = [
                    part.get_text(" ", strip=True)
                    for part in item.select(".txt > p span, .txt p span")
                    if part.get_text(strip=True)
                ]
                price_elem = item.select_one(".price")
                price_blob = price_elem.get_text(" ", strip=True) if price_elem else item.get_text(" ", strip=True)
                total_price = self._extract_float(price_blob, r"(\d+(?:\.\d+)?)\s*万")
                unit_price = self._extract_float(price_blob, r"(\d+(?:\.\d+)?)\s*元/[㎡平]")
                area = self._extract_float(" ".join(info_parts), r"(\d+(?:\.\d+)?)\s*㎡")
                layout = self._first_match(info_parts, lambda x: "室" in x or "厅" in x or "别墅" in x)
                orientation = self._first_match(info_parts, self._looks_like_orientation)
                community = self._first_match(
                    info_parts,
                    lambda x: x != layout and x != orientation and self._extract_float(x, r"(\d+(?:\.\d+)?)\s*㎡") is None,
                )
                tags = [x.get_text(" ", strip=True) for x in item.select(".stag span, .label a, .label span") if x.get_text(strip=True)]

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
                        "address": item.get_text(" ", strip=True),
                        "total_price": total_price,
                        "unit_price": unit_price,
                        "area": area,
                        "layout": layout,
                        "orientation": orientation,
                        "decoration": None,
                        "floor_text": None,
                        "total_floors": None,
                        "build_year": None,
                        "metro_distance": self._extract_metro_distance(item.get_text(" ", strip=True)),
                        "building_type": self._extract_building_type(" ".join(info_parts + tags)),
                        "has_elevator": self._extract_has_elevator(item.get_text(" ", strip=True)),
                        "tags": tags[:8],
                        "status": "active",
                    }
                )
        return self._dedupe(results)

    @staticmethod
    def _extract_float(text: str, pattern: str) -> float | None:
        match = re.search(pattern, text)
        return float(match.group(1)) if match else None

    @staticmethod
    def _first_match(parts: list[str], predicate) -> str | None:
        for part in parts:
            if predicate(part):
                return part
        return None

    @staticmethod
    def _looks_like_orientation(text: str) -> bool:
        return bool(re.fullmatch(r"(东|南|西|北|东西|南北|东南|东北|西南|西北|.*向)", text or ""))

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
    def _source_id_from_link(link: str) -> str | None:
        match = re.search(r"_(\d+)\.html?", link)
        return match.group(1) if match else None

    @staticmethod
    def _extract_total_floors(text: str | None) -> int | None:
        match = re.search(r"[（(]\s*共?\s*(\d+)\s*层\s*[)）]", text or "")
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

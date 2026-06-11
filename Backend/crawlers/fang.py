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
        "两江新区": "/house-a058/",
        "渝中": "/house-a056/",
        "南岸": "/house-a059/",
        "沙坪坝": "/house-a060/",
        "九龙坡": "/house-a061/",
        "大渡口": "/house-a062/",
        "北碚": "/house-a063/",
        "巴南": "/house-a064/",
        "涪陵": "/house-a011828/",
        "江津": "/house-a011833/",
        "铜梁": "/house-a011834/",
        "永川": "/house-a011839/",
        "璧山": "/house-a011840/",
        "合川": "/house-a011841/",
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
                    "build_year": None,
                    "tags": tags[:8],
                    "status": "active",
                }
            )
        return results

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
    def _source_id_from_link(link: str) -> str | None:
        match = re.search(r"_(\d+)\.htm", link)
        return match.group(1) if match else None

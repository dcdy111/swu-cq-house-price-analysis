from __future__ import annotations

import json
import re

from bs4 import BeautifulSoup

from Backend.crawlers.base import BaseCrawler


class AnjukeMobileCrawler(BaseCrawler):
    source_key = "anjuke_mobile"
    source_name = "安居客移动端"
    enabled = True
    description = "安居客移动端重庆二手房页；页面结构存在波动，解析失败会记录日志。"
    base_url = "https://m.anjuke.com"
    district_map = {
        "渝北": "/cq/sale/yubei/",
        "南岸": "/cq/sale/nanana/",
        "沙坪坝": "/cq/sale/shapingba/",
        "九龙坡": "/cq/sale/jiulongpo/",
        "江北": "/cq/sale/jiangbei/",
        "渝中": "/cq/sale/yuzhong/",
        "巴南": "/cq/sale/banan/",
        "北碚": "/cq/sale/beibei/",
        "大渡口": "/cq/sale/dadukou/",
        "璧山": "/cq/sale/bishanqu/",
        "永川": "/cq/sale/yongchuanqu/",
        "合川": "/cq/sale/hechuanqu/",
        "万州": "/cq/sale/wanzhouqu/",
        "江津": "/cq/sale/jiangjinqu/",
        "铜梁": "/cq/sale/tongliangqu/",
        "涪陵": "/cq/sale/fulingqu/",
        "长寿": "/cq/sale/changshouqu/",
        "荣昌": "/cq/sale/rongchangqu/",
        "潼南": "/cq/sale/tongnanqu/",
        "大足": "/cq/sale/dazhuqu/",
        "开州": "/cq/sale/kaizhouqukaixian/",
        "垫江": "/cq/sale/dainjiangxian/",
        "綦江": "/cq/sale/qijiangqu/",
        "南川": "/cq/sale/nanchuanqu/",
        "梁平": "/cq/sale/liangpingxian/",
        "丰都": "/cq/sale/fengduxian/",
        "武隆": "/cq/sale/wulongxian/",
        "奉节": "/cq/sale/fengjiexian/",
        "云阳": "/cq/sale/yunyangxian/",
        "石柱": "/cq/sale/shizhutujiazuzizhixian/",
        "秀山": "/cq/sale/xiushantujiazumiaozuzizhixian/",
        "忠县": "/cq/sale/zhongxian/",
        "彭水": "/cq/sale/pengshuimiaozutujiazuzizhixian/",
        "黔江": "/cq/sale/qianjiangqu/",
        "巫山": "/cq/sale/cqwushanxian/",
        "酉阳": "/cq/sale/youyangtujiazumiaozuzizhixian/",
        "城口": "/cq/sale/chengkouxian/",
        "巫溪": "/cq/sale/wuxixian/",
    }

    def build_url(self, district: str, page: int) -> str:
        path = self.district_map[district]
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
            address=text,
            total_price=total_price,
            unit_price=unit_price,
            area=area,
            layout=layout,
            source_listing_id=self._source_id_from_card(card, link),
            community=community,
            orientation=orientation,
            tags=tags,
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
            address=text,
            total_price=total_price,
            unit_price=unit_price,
            area=area,
            layout=layout,
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
                    address=text,
                    total_price=total_price,
                    unit_price=None,
                    area=area,
                    layout=layout,
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
            "build_year": None,
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

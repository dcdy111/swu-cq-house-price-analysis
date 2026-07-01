from __future__ import annotations

from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt
from typing import Any

import requests
from flask import current_app


@dataclass(frozen=True)
class AmapPoi:
    name: str
    address: str
    location: str
    lng: float
    lat: float
    district: str | None = None
    city: str | None = None
    type_name: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "address": self.address,
            "location": self.location,
            "lng": round(self.lng, 6),
            "lat": round(self.lat, 6),
            "district": self.district,
            "city": self.city,
            "type_name": self.type_name,
        }


class AmapServiceError(RuntimeError):
    pass


class AmapService:
    @staticmethod
    def is_enabled() -> bool:
        config = current_app.config
        return bool(config.get("AMAP_ENABLE_ROUTE", True)) and bool(
            config.get("AMAP_KEY") or config.get("AMAP_WEB_KEY")
        )

    @staticmethod
    def resolve_poi(keyword: str, district: str | None = None, city: str = "重庆") -> dict[str, Any]:
        keyword = str(keyword or "").strip()
        district = str(district or "").strip() or None
        if not keyword:
            return {"matched": False, "poi": None, "note": "未提供目的地关键词，无法定位。"}
        if not AmapService.is_enabled():
            return {
                "matched": False,
                "poi": None,
                "note": "高德路线工具未启用，当前无法做真实目的地定位。",
            }

        params = {
            "key": current_app.config.get("AMAP_KEY") or current_app.config.get("AMAP_WEB_KEY"),
            "keywords": keyword,
            "city": district or city,
            "offset": 5,
            "extensions": "base",
        }
        response = requests.get(
            "https://restapi.amap.com/v3/place/text",
            params=params,
            timeout=int(current_app.config.get("AMAP_TIMEOUT", 10)),
        )
        response.raise_for_status()
        payload = response.json()
        pois = payload.get("pois") or []
        if not pois:
            return {
                "matched": False,
                "poi": None,
                "note": f"未检索到“{keyword}”的 POI。",
            }
        poi = AmapService._to_poi(pois[0])
        return {
            "matched": True,
            "poi": poi.to_dict(),
            "note": "已使用高德 POI 文本检索定位目的地。",
        }

    @staticmethod
    def estimate_commute(origin_address: str, destination_keyword: str, district: str | None = None) -> dict[str, Any]:
        destination = AmapService.resolve_poi(destination_keyword, district=district)
        if not destination.get("matched") or not destination.get("poi"):
            return {
                "matched": False,
                "origin": origin_address,
                "destination_keyword": destination_keyword,
                "destination": destination.get("poi"),
                "distance_km": None,
                "estimated_minutes": None,
                "note": destination.get("note") or "目的地定位失败，无法估算通勤。",
            }

        # 房源当前没有结构化经纬度，这里只能基于“区县 + 地址/小区文本”再次做文本定位。
        origin = AmapService.resolve_poi(origin_address, district=district)
        if not origin.get("matched") or not origin.get("poi"):
            return {
                "matched": False,
                "origin": origin_address,
                "destination_keyword": destination_keyword,
                "destination": destination.get("poi"),
                "distance_km": None,
                "estimated_minutes": None,
                "note": "当前房源地址无法稳定定位，无法估算真实路线时间。",
            }

        origin_poi = origin["poi"]
        destination_poi = destination["poi"]
        distance_km = AmapService._haversine_km(
            float(origin_poi["lng"]),
            float(origin_poi["lat"]),
            float(destination_poi["lng"]),
            float(destination_poi["lat"]),
        )
        estimated_minutes = max(5, round(distance_km / 28 * 60))
        return {
            "matched": True,
            "origin": origin_poi,
            "destination_keyword": destination_keyword,
            "destination": destination_poi,
            "distance_km": round(distance_km, 2),
            "estimated_minutes": estimated_minutes,
            "note": "当前基于高德 POI 定位与直线距离换算做通勤估算，适合候选排序，不等同于实时导航。",
        }

    @staticmethod
    def _to_poi(raw: dict[str, Any]) -> AmapPoi:
        location = str(raw.get("location") or "")
        lng_text, lat_text = (location.split(",", 1) + ["0"])[:2]
        return AmapPoi(
            name=str(raw.get("name") or "").strip() or "未命名POI",
            address=str(raw.get("address") or "").strip() or "地址待补充",
            location=location,
            lng=float(lng_text or 0),
            lat=float(lat_text or 0),
            district=str(raw.get("adname") or "").strip() or None,
            city=str(raw.get("cityname") or "").strip() or None,
            type_name=str(raw.get("type") or "").strip() or None,
        )

    @staticmethod
    def _haversine_km(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
        lng1, lat1, lng2, lat2 = map(radians, [lng1, lat1, lng2, lat2])
        d_lng = lng2 - lng1
        d_lat = lat2 - lat1
        value = sin(d_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(d_lng / 2) ** 2
        return 2 * asin(sqrt(value)) * 6371

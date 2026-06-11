from __future__ import annotations

from datetime import datetime

from Backend.extensions import db
from Backend.models.crawl import CrawlTask
from Backend.services.listing_service import ListingService


def seed_dashboard_data():
    rows = [
        {
            "source": "fang",
            "source_listing_id": "dash-001",
            "title": "渝北测试小区 3室2厅",
            "link": "https://cq.esf.fang.com/chushou/3_dash001.htm",
            "district": "渝北",
            "community": "测试小区A",
            "total_price": 120,
            "unit_price": 12000,
            "area": 100,
            "layout": "3室2厅",
            "build_year": 2018,
        },
        {
            "source": "fang",
            "source_listing_id": "dash-002",
            "title": "南岸样本小区 2室1厅",
            "link": "https://cq.esf.fang.com/chushou/3_dash002.htm",
            "district": "南岸",
            "community": "测试小区B",
            "total_price": 90,
            "unit_price": 10000,
            "area": 90,
            "layout": "2室1厅",
            "build_year": 2015,
        },
        {
            "source": "anjuke_mobile",
            "source_listing_id": "dash-003",
            "title": "渝北改善样本 4室2厅",
            "link": "https://m.anjuke.com/cq/sale/dash003/",
            "district": "渝北区",
            "community": "测试小区C",
            "total_price": 240,
            "unit_price": 16000,
            "area": 150,
            "layout": "4室2厅",
            "build_year": 2020,
        },
    ]
    for row in rows:
        ListingService.upsert_listing(row, seen_at=datetime(2026, 6, 10, 9, 0, 0))

    task = CrawlTask(
        name="Dashboard 采集任务",
        source="fang",
        mode="manual",
        max_pages=1,
        max_workers=2,
        status="success",
        total_pages=1,
        success_pages=1,
        failed_pages=0,
        total_found=3,
    )
    task.set_districts(["渝北"])
    db.session.add(task)
    db.session.commit()


def test_overview_api(client):
    seed_dashboard_data()

    response = client.get("/api/overview")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["code"] == 0
    assert payload["data"]["kpis"]["total_count"] == 3
    assert payload["data"]["kpis"]["active_count"] == 3
    assert payload["data"]["kpis"]["snapshot_count"] == 3
    assert payload["data"]["top_district"]["district"] == "渝北区"
    assert payload["data"]["crawl_status"]["summary"]["success"] == 1


def test_dashboard_chart_apis(client):
    seed_dashboard_data()

    district_payload = client.get("/api/charts/district-price?limit=5").get_json()
    assert district_payload["code"] == 0
    assert district_payload["data"]["items"][0]["district"] == "渝北区"
    assert district_payload["data"]["items"][0]["listing_count"] == 2

    district_map_payload = client.get("/api/charts/district-map").get_json()
    assert district_map_payload["code"] == 0
    assert district_map_payload["data"]["district_count"] == 2
    assert district_map_payload["data"]["total_count"] == 3
    assert district_map_payload["data"]["items"][0]["name"] == "渝北区"
    assert district_map_payload["data"]["items"][0]["count"] == 2
    assert district_map_payload["data"]["items"][0]["avgPrice"] == 14000

    trend_payload = client.get("/api/charts/price-trend?months=12").get_json()
    assert trend_payload["code"] == 0
    assert trend_payload["data"]["items"][0]["month"] == "2026-06"

    distribution_payload = client.get("/api/charts/price-distribution").get_json()
    assert distribution_payload["code"] == 0
    assert distribution_payload["data"]["total"] == 3

    scatter_payload = client.get("/api/charts/area-price-scatter?limit=20").get_json()
    assert scatter_payload["code"] == 0
    assert len(scatter_payload["data"]["items"]) == 3

    layout_payload = client.get("/api/charts/layout-distribution").get_json()
    assert layout_payload["code"] == 0
    assert layout_payload["data"]["total"] == 3

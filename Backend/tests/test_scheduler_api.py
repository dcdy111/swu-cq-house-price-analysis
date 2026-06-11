from __future__ import annotations

from Backend.extensions import db
from Backend.models.crawl import CrawlTask
from Backend.models.quality import DataQualityReport
from Backend.services.listing_service import ListingService


def test_scheduler_status_is_available_when_disabled(client):
    response = client.get("/api/scheduler/status")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["code"] == 0
    assert payload["data"]["running"] is False
    assert payload["data"]["jobs"] == []


def test_scheduler_manual_quality_report(client, app):
    with app.app_context():
        ListingService.upsert_listing(
            {
                "source": "fang",
                "source_listing_id": "scheduler-quality-1",
                "title": "调度质量报告样本",
                "link": "https://example.com/scheduler/quality/1",
                "district": "渝北",
                "total_price": 100,
                "unit_price": 10000,
                "area": 100,
                "layout": "3室2厅",
            }
        )
        db.session.commit()

    response = client.post("/api/scheduler/run-quality-report")
    payload = response.get_json()

    assert response.status_code == 201
    assert payload["code"] == 0
    assert payload["data"]["report_type"] == "manual_scheduler"
    assert payload["data"]["total_count"] == 1
    assert DataQualityReport.query.count() == 1


def test_scheduler_manual_incremental_crawl_can_create_task_without_network(client):
    response = client.post(
        "/api/scheduler/run-incremental-crawl",
        json={"source": "fang", "districts": ["两江新区"], "max_pages": 1, "run_now": False},
    )
    payload = response.get_json()

    assert response.status_code == 201
    assert payload["code"] == 0
    assert payload["data"]["mode"] == "manual_incremental"
    assert payload["data"]["status"] == "pending"
    assert payload["data"]["districts"] == ["两江新区"]
    assert CrawlTask.query.count() == 1

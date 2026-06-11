from __future__ import annotations

from Backend.extensions import db
from Backend.models.quality import DataQualityReport
from Backend.services.listing_service import ListingService


def _insert(raw: dict):
    action = ListingService.upsert_listing(raw)
    db.session.commit()
    return action


def test_quality_report_source_layering_and_policy(client, app):
    with app.app_context():
        _insert(
            {
                "source": "anjuke_legacy",
                "source_listing_id": "legacy-1",
                "title": "旧库样本",
                "link": "https://example.com/legacy/1",
                "district": "渝北",
                "total_price": 100,
                "unit_price": 10000,
                "area": 100,
                "layout": "3室2厅",
            }
        )
        _insert(
            {
                "source": "fang",
                "source_listing_id": "fang-1",
                "title": "新标准样本",
                "link": "https://example.com/fang/1",
                "district": "渝中",
                "total_price": 80,
                "unit_price": 12000,
                "area": 70,
                "layout": "2室1厅",
            }
        )
        _insert(
            {
                "source": "fang",
                "source_listing_id": "fang-extreme",
                "title": "面积异常样本",
                "link": "https://example.com/fang/extreme",
                "district": "渝中",
                "total_price": 6000,
                "unit_price": 15000,
                "area": 600,
                "layout": "8室4厅",
            }
        )

    response = client.get("/api/quality/report")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["code"] == 0
    data = payload["data"]
    assert data["overview"]["total_count"] == 3
    assert data["overview"]["legacy_count"] == 1
    assert data["overview"]["new_standard_count"] == 2
    assert data["overview"]["strict_new_standard_count"] == 1
    assert data["overview"]["recommended_mode"] == "hybrid_cold_start"
    assert any(item["source"] == "anjuke_legacy" and item["layer"] == "cold_start_baseline" for item in data["source_layers"])
    assert any(item["source"] == "fang" and item["layer"] == "new_standard_crawl" for item in data["source_layers"])
    assert data["abnormal_samples"][0]["reason"]
    assert data["analysis_policy"]["min_quality_score"] == 80
    assert len(data["cleaning_steps"]) >= 6


def test_quality_report_can_be_persisted_and_queried(client, app):
    with app.app_context():
        _insert(
            {
                "source": "fang",
                "source_listing_id": "quality-persist-1",
                "title": "质量报告持久化样本",
                "link": "https://example.com/quality/persist/1",
                "district": "渝北",
                "total_price": 120,
                "unit_price": 12000,
                "area": 100,
                "layout": "3室2厅",
            }
        )

    create_response = client.post("/api/quality/reports", json={"report_type": "manual_test"})
    create_payload = create_response.get_json()
    assert create_response.status_code == 201
    assert create_payload["code"] == 0
    assert create_payload["data"]["report_type"] == "manual_test"
    assert create_payload["data"]["total_count"] == 1
    assert create_payload["data"]["detail"]["overview"]["analysis_ready_count"] == 1

    report_id = create_payload["data"]["id"]
    list_payload = client.get("/api/quality/reports").get_json()
    assert list_payload["data"]["pagination"]["total"] == 1
    assert list_payload["data"]["items"][0]["id"] == report_id

    detail_payload = client.get(f"/api/quality/reports/{report_id}").get_json()
    assert detail_payload["data"]["id"] == report_id
    assert detail_payload["data"]["detail"]["cleaning_steps"]

    assert DataQualityReport.query.count() == 1

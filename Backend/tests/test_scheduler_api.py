from __future__ import annotations

from Backend.extensions import db
from Backend.models.crawl import CrawlTask
from Backend.models.quality import DataQualityReport
from Backend.services.listing_service import ListingService
from Backend.tasks.scheduler import run_scheduled_incremental_crawl


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
    assert payload["data"]["run_id"]
    assert payload["data"]["evidence"]["run_id"] == payload["data"]["run_id"]
    assert CrawlTask.query.count() == 1


def test_scheduled_incremental_runner_accepts_runtime_overrides(app, monkeypatch):
    captured = {}

    class FakeTask:
        id = 88

        def to_dict(self, include_logs: bool = False):
            return {"id": self.id, "status": "success", "mode": "scheduled_incremental", "districts": ["渝中"]}

    def fake_create_task(payload):
        captured["payload"] = payload
        return FakeTask()

    def fake_run_task(task_id):
        captured["task_id"] = task_id
        return {"id": task_id, "status": "success"}

    monkeypatch.setattr("Backend.tasks.scheduler.CrawlService.create_task", fake_create_task)
    monkeypatch.setattr("Backend.tasks.scheduler.CrawlService.run_task", fake_run_task)

    result = run_scheduled_incremental_crawl(
        app,
        overrides={
            "name": "验收定时任务",
            "incremental_crawl_source": "fang",
            "districts": ["渝中"],
            "incremental_crawl_max_pages": 1,
            "incremental_crawl_max_workers": 1,
        },
    )

    assert result["status"] == "success"
    assert captured["task_id"] == 88
    assert captured["payload"]["mode"] == "scheduled_incremental"
    assert captured["payload"]["districts"] == ["渝中"]


def test_canceled_task_keeps_replayable_evidence(client):
    create_response = client.post(
        "/api/crawl/tasks",
        json={"source": "fang", "districts": ["两江新区"], "max_pages": 1, "run_now": False},
    )
    task_id = create_response.get_json()["data"]["id"]
    cancel_response = client.post(f"/api/crawl/tasks/{task_id}/cancel")
    payload = cancel_response.get_json()["data"]

    assert cancel_response.status_code == 200
    assert payload["status"] == "canceled"
    assert payload["evidence"]["run_id"]
    assert payload["evidence"]["status"] == "canceled"
    assert "取消" in payload["evidence"]["log_summary"]

from __future__ import annotations


def test_sources_endpoint(client):
    response = client.get("/api/crawl/sources")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["code"] == 0
    keys = {item["key"] for item in payload["data"]["items"]}
    assert {"fang", "anjuke_mobile", "lianjia"} <= keys


def test_create_task(client):
    response = client.post(
        "/api/crawl/tasks",
        json={"source": "fang", "districts": ["渝中"], "max_pages": 1, "max_workers": 1},
    )
    payload = response.get_json()

    assert response.status_code == 201
    assert payload["code"] == 0
    assert payload["data"]["source"] == "fang"
    assert payload["data"]["districts"] == ["渝中"]
    assert payload["data"]["status"] == "pending"

    list_response = client.get("/api/crawl/tasks")
    list_payload = list_response.get_json()
    assert list_payload["data"]["pagination"]["total"] == 1


def test_cancel_pending_task(client):
    create_response = client.post(
        "/api/crawl/tasks",
        json={"source": "fang", "districts": ["渝中"], "max_pages": 1, "max_workers": 1},
    )
    task_id = create_response.get_json()["data"]["id"]

    cancel_response = client.post(f"/api/crawl/tasks/{task_id}/cancel")
    payload = cancel_response.get_json()

    assert cancel_response.status_code == 200
    assert payload["code"] == 0
    assert payload["data"]["status"] == "canceled"
    assert payload["data"]["logs"][0]["level"] == "WARN"
    assert "已取消" in payload["data"]["logs"][0]["message"]


def test_create_task_respects_backend_crawler_worker_setting(client):
    client.put("/api/settings", json={"crawler": {"max_workers": 2}})

    response = client.post(
        "/api/crawl/tasks",
        json={"source": "fang", "districts": ["渝中"], "max_pages": 1, "max_workers": 5},
    )
    payload = response.get_json()

    assert response.status_code == 201
    assert payload["data"]["max_workers"] == 2


def test_disabled_lianjia_run_fails_with_log(client):
    create_response = client.post(
        "/api/crawl/tasks",
        json={"source": "lianjia", "districts": ["渝北"], "max_pages": 1, "max_workers": 1},
    )
    task_id = create_response.get_json()["data"]["id"]

    run_response = client.post(f"/api/crawl/tasks/{task_id}/run")
    payload = run_response.get_json()

    assert run_response.status_code == 200
    assert payload["data"]["status"] == "failed"
    assert payload["data"]["logs"][0]["level"] == "ERROR"

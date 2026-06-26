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


def test_create_task_supports_all_districts_and_page_cap(client):
    client.put("/api/settings", json={"crawler": {"max_pages_per_district": 3}})

    response = client.post(
        "/api/crawl/tasks",
        json={"source": "fang", "districts": ["all"], "max_pages": 999, "max_workers": 1},
    )
    payload = response.get_json()

    assert response.status_code == 201
    assert payload["data"]["max_pages"] == 3
    assert len(payload["data"]["districts"]) > 1
    assert payload["data"]["total_pages"] == len(payload["data"]["districts"]) * 3


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


def test_runtime_headers_and_cookie_are_loaded_from_env(monkeypatch):
    from Backend.crawlers.fang import FangCrawler

    monkeypatch.setenv("FANG_HEADERS_JSON", '{"User-Agent":"UA-From-Browser","Referer":"https://cq.esf.fang.com/"}')
    monkeypatch.setenv("FANG_COOKIE", "sessionid=abc")

    headers = FangCrawler(interval=(0, 0)).headers()

    assert headers["User-Agent"] == "UA-From-Browser"
    assert headers["Referer"] == "https://cq.esf.fang.com/"
    assert headers["Cookie"] == "sessionid=abc"

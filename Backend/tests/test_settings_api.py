from __future__ import annotations

from Backend.models.setting import SystemSetting


def test_settings_can_be_saved_and_read_without_secret_echo(client):
    initial = client.get("/api/settings")
    assert initial.status_code == 200
    assert initial.get_json()["data"]["crawler"]["sources"]["fang"]["enabled"] is True

    response = client.put(
        "/api/settings",
        json={
            "crawler": {
                "max_workers": 4,
                "sources": {
                    "fang": {"enabled": False},
                    "lianjia": {"enabled": True},
                },
            },
            "scheduler": {
                "enabled": True,
                "incremental_crawl_interval_hours": 8,
            },
            "deepseek": {
                "enabled": True,
                "model": "deepseek-chat",
                "api_key": "sk-test-secret-value",
            },
        },
    )
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["code"] == 0
    data = payload["data"]
    assert data["crawler"]["max_workers"] == 4
    assert data["crawler"]["sources"]["fang"]["enabled"] is False
    assert data["crawler"]["sources"]["lianjia"]["enabled"] is True
    assert data["scheduler"]["enabled"] is True
    assert data["scheduler"]["incremental_crawl_interval_hours"] == 8
    assert data["deepseek"]["api_key_configured"] is True
    assert data["deepseek"]["api_key_masked"].startswith("sk-t")
    assert "api_key" not in data["deepseek"]
    assert SystemSetting.query.filter_by(setting_key="app_settings").count() == 1
    assert SystemSetting.query.filter_by(setting_key="deepseek_api_key").count() == 1


def test_settings_deepseek_connection_reports_disabled_state(client):
    client.put("/api/settings", json={"deepseek": {"enabled": False}})

    response = client.post("/api/settings/test-deepseek")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["data"]["ok"] is False
    assert "未启用" in payload["data"]["message"]


def test_settings_deepseek_connection_uses_real_lightweight_request(client, monkeypatch):
    client.put(
        "/api/settings",
        json={
            "deepseek": {
                "enabled": True,
                "model": "deepseek-chat",
                "api_key": "sk-test-real-request",
            }
        },
    )
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "OK"}}]}

    def fake_post(url, headers, json, timeout):
        captured.update({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return FakeResponse()

    monkeypatch.setattr("Backend.agent.deepseek_client.requests.post", fake_post)

    response = client.post("/api/settings/test-deepseek")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["data"]["ok"] is True
    assert payload["data"]["model"] == "deepseek-chat"
    assert payload["data"]["response_preview"] == "OK"
    assert captured["url"].endswith("/chat/completions")
    assert captured["json"]["max_tokens"] == 64
    assert captured["headers"]["Authorization"] == "Bearer sk-test-real-request"

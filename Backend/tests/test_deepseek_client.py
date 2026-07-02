from __future__ import annotations

import json

import Backend.agent.deepseek_client as deepseek_module
from Backend.agent.deepseek_client import DeepSeekClient
from Backend.services.settings_service import SettingsService


def test_grounding_accepts_non_transaction_phrase(app):
    evidence = {
        "market": {
            "district_items": [
                {
                    "district": "两江新区",
                    "avg_unit_price": 15453.33,
                    "listing_count": 7033,
                    "avg_total_price": 280.98,
                }
            ]
        }
    }
    answer = "根据工具数据，两江新区挂牌均价为 15,453.33 元/㎡（非成交价，仅指挂牌价/报价）。"

    with app.app_context():
        assert DeepSeekClient._is_grounded_answer(answer, evidence) is True


def test_stream_answer_retries_grounding_before_fallback(app, monkeypatch):
    evidence = {
        "market": {
            "district_items": [
                {
                    "district": "两江新区",
                    "avg_unit_price": 15453.33,
                    "listing_count": 7033,
                    "avg_total_price": 280.98,
                }
            ],
            "metric_note": "所有价格均为挂牌价/报价，不代表成交价。",
        }
    }
    streamed_answer = "根据工具数据，两江新区挂牌均价为 15,453.33 元/㎡（成交价）。"
    repaired_answer = "根据工具数据，两江新区挂牌均价为 15,453.33 元/㎡（非成交价，仅指挂牌价/报价）。"

    class FakeResponse:
        def raise_for_status(self):
            return None

        def iter_lines(self, decode_unicode: bool = True):
            payload = json.dumps(
                {"choices": [{"delta": {"content": streamed_answer}}]},
                ensure_ascii=False,
            )
            return iter([f"data: {payload}", "data: [DONE]"])

    class FakeSession:
        def post(self, *args, **kwargs):
            return FakeResponse()

    def fake_build_session():
        return FakeSession()

    def fake_request_completion(settings, model, messages):
        return repaired_answer

    monkeypatch.setattr(DeepSeekClient, "is_enabled", staticmethod(lambda: True))
    monkeypatch.setattr(
        SettingsService,
        "deepseek_settings",
        staticmethod(
            lambda: {
                "enabled": True,
                "api_key": "test-key",
                "base_url": "https://example.com",
                "model": "deepseek-test",
                "timeout": 30,
            }
        ),
    )
    monkeypatch.setattr(deepseek_module, "_build_session", fake_build_session)
    monkeypatch.setattr(DeepSeekClient, "_request_completion", staticmethod(fake_request_completion))

    with app.app_context():
        events = list(DeepSeekClient.stream_answer("两江新区挂牌均价是多少？", evidence))

    assert any(event["type"] == "replace" for event in events)
    assert events[-1]["type"] == "final"
    assert events[-1]["content"] == repaired_answer

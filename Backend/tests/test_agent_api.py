from __future__ import annotations

import pytest

from Backend.agent.deepseek_client import DeepSeekClient, DeepSeekInvocationError
from Backend.extensions import db
from Backend.models.agent import AgentSession, AgentToolCall, AgentTurn, GeneratedReport
from Backend.services.analysis_service import AnalysisService
from Backend.services.listing_service import ListingService


def build_stub_deepseek_answer(evidence: dict) -> str:
    report = evidence.get("report") or {}
    market = evidence.get("market") or {}
    buyer_options = evidence.get("buyer_options") or {}
    model = evidence.get("model") or {}

    if report.get("report"):
        item = report["report"]
        return f"**结论**\n已生成《{item['title']}》。"

    if buyer_options:
        summary = buyer_options.get("summary") or {}
        items = buyer_options.get("items") or []
        if items:
            listing = items[0].get("listing") or {}
            return "\n".join(
                [
                    "**结论**",
                    f"优先推荐 {listing.get('title')}。",
                    "",
                    "**关键证据**",
                    f"通勤代理说明：{summary.get('commute_note')}",
                ]
            )
        return f"**结论**\n通勤代理说明：{summary.get('commute_note')}"

    districts = market.get("district_items") or []
    requested_district = (market.get("query") or {}).get("requested_district")
    if requested_district and not districts:
        return f"**结论**\n未查询到 {requested_district} 的有效房源，不能用全市均价替代。"
    if districts:
        item = districts[0]
        return (
            f"**结论**\n{item.get('district')} 当前平均挂牌单价为 "
            f"{item.get('avg_unit_price', 0)} 元/平方米，样本量 {item.get('listing_count', 0)} 套。"
        )
    if model:
        return "**结论**\n已返回真实模型结果。"
    return "**结论**\n已返回真实工具结果。"


@pytest.fixture(autouse=True)
def stub_deepseek_generate_answer(monkeypatch):
    def fake_generate_answer(question: str, evidence: dict):
        answer = build_stub_deepseek_answer(evidence)
        return answer, "deepseek-test-stub"

    monkeypatch.setattr(DeepSeekClient, "generate_answer", staticmethod(fake_generate_answer))


def seed_agent_data():
    rows = [
        ("渝北", "agent-1", 120, 12000, 100, "3室2厅", 2018),
        ("渝北", "agent-2", 150, 15000, 100, "3室2厅", 2020),
        ("南岸", "agent-3", 100, 10000, 100, "2室1厅", 2016),
        ("江北", "agent-4", 180, 18000, 100, "3室2厅", 2021),
        ("沙坪坝", "agent-5", 90, 9000, 100, "2室1厅", 2014),
        ("九龙坡", "agent-6", 110, 11000, 100, "3室1厅", 2015),
    ]
    for district, source_id, total_price, unit_price, area, layout, build_year in rows:
        ListingService.upsert_listing(
            {
                "source": "fang",
                "source_listing_id": source_id,
                "title": f"{district} Agent 测试样本",
                "link": f"https://example.com/agent/{source_id}",
                "district": district,
                "community": "Agent测试小区",
                "total_price": total_price,
                "unit_price": unit_price,
                "area": area,
                "layout": layout,
                "floor_text": "中层",
                "build_year": build_year,
            }
        )
    db.session.commit()


def test_agent_chat_calls_market_stats_tool(client):
    seed_agent_data()

    response = client.post(
        "/api/agent/chat",
        json={"session_id": "test-session", "question": "渝北区均价是多少？"},
    )
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["code"] == 0
    data = payload["data"]
    assert "结论" in data["answer"]
    assert data["tool_calls"][0]["tool_name"] == "query_market_stats"
    assert data["tool_calls"][0]["tool_args"]["district"] == "渝北区"
    assert data["tool_calls"][0]["tool_result"]["district_items"][0]["district"] == "渝北区"
    assert "渝北区 当前平均挂牌单价" in data["answer"]
    assert "当前有效房源 6 套" not in data["answer"]
    assert AgentToolCall.query.filter_by(session_id="test-session", tool_name="query_market_stats").count() == 1
    assert AgentSession.query.filter_by(session_id="test-session").count() == 1
    assert AgentTurn.query.filter_by(session_id="test-session", status="success").count() == 1


def test_agent_session_groups_turns_and_tool_traces(client):
    seed_agent_data()
    for question in ["渝北区均价是多少？", "重庆整体挂牌价是多少？"]:
        response = client.post("/api/agent/chat", json={"session_id": "grouped-session", "question": question})
        assert response.status_code == 200

    payload = client.get("/api/agent/sessions/grouped-session").get_json()["data"]
    assert payload["session_id"] == "grouped-session"
    assert payload["turn_count"] == 2
    assert len(payload["turns"]) == 2
    assert all(turn["tool_calls"] for turn in payload["turns"])


def test_agent_chat_rewrites_legacy_local_session_id(client):
    seed_agent_data()

    response = client.post(
        "/api/agent/chat",
        json={"session_id": "local-default", "question": "渝北区均价是多少？"},
    )
    payload = response.get_json()["data"]

    assert response.status_code == 200
    assert payload["session_id"].startswith("agent-")
    assert payload["session_id"] != "local-default"
    assert AgentSession.query.filter_by(session_id="local-default").count() == 0


def test_agent_list_sessions_excludes_legacy_local_sessions(client):
    db.session.add_all(
        [
            AgentSession(session_id="local-legacy", title="旧本地会话"),
            AgentSession(session_id="agent-visible", title="可见会话"),
        ]
    )
    db.session.commit()

    items = client.get("/api/agent/sessions").get_json()["data"]["items"]
    ids = {item["session_id"] for item in items}

    assert "local-legacy" not in ids
    assert "agent-visible" in ids


def test_agent_business_tools_are_read_only(client):
    items = client.get("/api/agent/tools").get_json()["data"]["items"]
    names = {item["name"] for item in items}
    assert "query_market_stats" in names
    assert "get_model_result" in names
    assert "recommend_buy_options" in names
    assert "run_incremental_crawl" not in names
    assert "run_analysis_job" not in names


def test_agent_does_not_replace_missing_district_with_city_average(client):
    seed_agent_data()

    response = client.post(
        "/api/agent/chat",
        json={"session_id": "missing-district", "question": "万州区均价是多少？"},
    )
    data = response.get_json()["data"]
    market_call = data["tool_calls"][0]

    assert market_call["tool_result"]["query"] == {
        "requested_district": "万州区",
        "matched": False,
    }
    assert "未查询到 万州区 的有效房源" in data["answer"]
    assert "不能用全市均价替代" in data["answer"]


def test_agent_report_generation_is_persisted_and_readable(client):
    seed_agent_data()
    AnalysisService.create_job({"job_type": "all", "max_samples": 100})

    response = client.post(
        "/api/agent/chat",
        json={"session_id": "report-session", "question": "帮我生成重庆二手房挂牌价市场分析报告"},
    )
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["code"] == 0
    data = payload["data"]
    tool_names = [item["tool_name"] for item in data["tool_calls"]]
    assert "query_market_stats" in tool_names
    assert "get_model_result" in tool_names
    assert "generate_report" in tool_names
    assert data["report"]["id"]
    assert GeneratedReport.query.count() == 1

    report_response = client.get(f"/api/reports/{data['report']['id']}")
    report_payload = report_response.get_json()
    assert report_response.status_code == 200
    assert report_payload["data"]["title"] == "重庆二手房挂牌价市场分析报告"
    assert "market" in report_payload["data"]["evidence"]
    runtime = report_payload["data"]["evidence"]["agent_runtime"]
    assert runtime["response_model"] == data["model"]
    assert runtime["deepseek_used"] is True
    assert runtime["tool_names"] == tool_names
    assert runtime["answer_length"] == len(data["answer"])

    pdf_response = client.get(f"/api/reports/{data['report']['id']}/export.pdf")
    assert pdf_response.status_code == 200
    assert pdf_response.content_type == "application/pdf"
    assert pdf_response.data.startswith(b"%PDF")


def test_agent_tools_are_whitelisted(client):
    response = client.get("/api/agent/tools")
    payload = response.get_json()

    assert response.status_code == 200
    names = {item["name"] for item in payload["data"]["items"]}
    assert "query_market_stats" in names
    assert "recommend_buy_options" in names
    assert "generate_report" in names
    assert "execute_sql" not in names


def test_agent_can_recommend_buy_options_with_budget_and_commute_proxy(client):
    seed_agent_data()
    ListingService.upsert_listing(
        {
            "source": "fang",
            "source_listing_id": "agent-7",
            "title": "渝北 近地铁 通勤友好房源",
            "link": "https://example.com/agent/agent-7",
            "district": "渝北",
            "community": "轻轨测试小区",
            "total_price": 118,
            "unit_price": 11800,
            "area": 100,
            "layout": "3室2厅",
            "floor_text": "中层",
            "build_year": 2021,
            "tags": ["近地铁", "精装修"],
        }
    )
    db.session.commit()

    response = client.post(
        "/api/agent/chat",
        json={"session_id": "buyer-session", "question": "我刚工作，预算120万，想在重庆买通勤方便的二手房，有什么推荐？"},
    )
    payload = response.get_json()["data"]

    tool_names = [item["tool_name"] for item in payload["tool_calls"]]
    recommend_call = next(item for item in payload["tool_calls"] if item["tool_name"] == "recommend_buy_options")
    top_item = recommend_call["tool_result"]["items"][0]

    assert response.status_code == 200
    assert "recommend_buy_options" in tool_names
    assert recommend_call["tool_result"]["summary"]["matched_count"] >= 1
    assert top_item["listing"]["title"] == "渝北 近地铁 通勤友好房源"
    assert top_item["commute_proxy"]["has_metro_tag"] is True
    assert "通勤便利度优先使用地铁距离字段" in recommend_call["tool_result"]["summary"]["commute_note"]
    assert "通勤代理说明" in payload["answer"]
    assert "不代表真实通勤时间" in payload["answer"]


def test_model_tool_evidence_keeps_feature_importance(client):
    seed_agent_data()
    AnalysisService.create_job({"job_type": "all", "max_samples": 100})

    response = client.post(
        "/api/agent/chat",
        json={"session_id": "model-evidence", "question": "最新模型的特征重要性是什么？"},
    )
    data = response.get_json()["data"]

    model_call = next(item for item in data["tool_calls"] if item["tool_name"] == "get_model_result")
    regression = next(
        item for item in model_call["tool_result"]["results"] if item["result_type"] == "regression"
    )
    assert regression["feature_importance"]
    assert len(regression["feature_importance"]) <= 10


def test_deepseek_grounding_guard_accepts_tool_numbers_and_rejects_external_claims():
    evidence = {"market": {"avg_unit_price": 11491.46, "listing_count": 13782, "metric_note": "不代表成交价"}}

    assert DeepSeekClient._is_grounded_answer(
        "平均挂牌单价为 11,491.46 元/平方米，样本量 13,782 套；以上数据不代表成交价。",
        evidence,
    )
    assert not DeepSeekClient._is_grounded_answer("平均挂牌单价为 12,000 元/平方米。", evidence)
    assert not DeepSeekClient._is_grounded_answer("建议再结合近期成交价判断。", evidence)


def test_agent_chat_returns_error_when_deepseek_fails_without_local_fallback(client, monkeypatch):
    seed_agent_data()

    def raise_error(question: str, evidence: dict):
        raise DeepSeekInvocationError("DeepSeek 真实请求失败")

    monkeypatch.setattr(DeepSeekClient, "generate_answer", staticmethod(raise_error))

    response = client.post(
        "/api/agent/chat",
        json={"session_id": "deepseek-failed", "question": "渝北区均价是多少？"},
    )
    payload = response.get_json()

    assert response.status_code == 502
    assert payload["code"] == 1
    assert payload["message"] == "DeepSeek 真实请求失败"
    assert payload["data"]["tool_calls"][0]["tool_name"] == "query_market_stats"
    assert AgentTurn.query.filter_by(session_id="deepseek-failed", status="failed").count() == 1

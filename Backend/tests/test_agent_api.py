from __future__ import annotations

import pytest
from sqlalchemy.exc import IntegrityError

from Backend.agent.agent_service import AgentService
from Backend.agent.deepseek_client import DeepSeekClient, DeepSeekInvocationError
from Backend.extensions import db
from Backend.models.agent import AgentSession, AgentToolCall, AgentTurn, GeneratedReport
from Backend.services.analysis_service import AnalysisService
from Backend.services.amap_service import AmapService
from Backend.services.listing_service import ListingService


def build_stub_deepseek_answer(evidence: dict) -> str:
    report = evidence.get("report") or {}
    market = evidence.get("market") or {}
    buyer_options = evidence.get("buyer_options") or {}
    mortgage = evidence.get("mortgage") or {}
    model = evidence.get("model") or {}

    if report.get("report"):
        item = report["report"]
        return f"**结论**\n已生成《{item['title']}》。"

    if mortgage:
        loan = mortgage.get("loan") or {}
        return "\n".join(
            [
                "**结论**",
                f"按当前口径估算，月供约 {loan.get('monthly_payment')} 元。",
                "",
                "**关键证据**",
                f"贷款本金约 {loan.get('loan_amount')} 万元，首付约 {loan.get('down_payment')} 万元。",
            ]
        )

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

    destination_options = evidence.get("destination_options") or {}
    if destination_options:
        summary = destination_options.get("summary") or {}
        items = destination_options.get("items") or []
        if items:
            top = items[0]
            listing = top.get("listing") or {}
            commute = top.get("commute_estimate") or {}
            mortgage = top.get("mortgage_estimate") or {}
            return "\n".join(
                [
                    "**结论**",
                    f"优先推荐 {listing.get('title')}。",
                    "",
                    "**关键证据**",
                    f"估算通勤约 {commute.get('estimated_minutes')} 分钟，月供约 {mortgage.get('monthly_payment')} 元。",
                    f"学区说明：{summary.get('school_district_note')}",
                ]
            )
        return f"**结论**\n{summary.get('note')}"

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

    def fake_stream_answer(question: str, evidence: dict):
        answer = build_stub_deepseek_answer(evidence)
        midpoint = max(1, len(answer) // 2)
        for chunk in (answer[:midpoint], answer[midpoint:]):
            if chunk:
                yield {"type": "delta", "content": chunk, "model": "deepseek-test-stub"}
        yield {"type": "final", "content": answer, "model": "deepseek-test-stub"}

    monkeypatch.setattr(DeepSeekClient, "generate_answer", staticmethod(fake_generate_answer))
    monkeypatch.setattr(DeepSeekClient, "stream_answer", staticmethod(fake_stream_answer))


@pytest.fixture(autouse=True)
def stub_amap_service(monkeypatch):
    def fake_resolve(keyword: str, district: str | None = None, city: str = "重庆"):
        if "西南大学荣昌校区" in keyword or "荣昌校区" in keyword:
            return {
                "matched": True,
                "poi": {
                    "name": "西南大学荣昌校区",
                    "address": "重庆市荣昌区学院路160号",
                    "location": "105.594321,29.403210",
                    "lng": 105.594321,
                    "lat": 29.40321,
                    "district": "荣昌区",
                    "city": "重庆市",
                    "type_name": "高等院校",
                },
                "note": "已使用高德 POI 文本检索定位目的地。",
            }
        return {
            "matched": True,
            "poi": {
                "name": keyword,
                "address": f"{district or '重庆市'}测试地址",
                "location": "105.600000,29.410000",
                "lng": 105.6,
                "lat": 29.41,
                "district": district or "荣昌区",
                "city": "重庆市",
                "type_name": "测试POI",
            },
            "note": "已使用高德 POI 文本检索定位目的地。",
        }

    def fake_estimate(origin_address: str, destination_keyword: str, district: str | None = None):
        minutes = 14 if "学府未来城" in origin_address else 26
        km = 4.6 if minutes == 14 else 8.9
        return {
            "matched": True,
            "origin": {
                "name": origin_address,
                "address": origin_address,
                "location": "105.580000,29.400000",
                "lng": 105.58,
                "lat": 29.4,
            },
            "destination_keyword": destination_keyword,
            "destination": {
                "name": "西南大学荣昌校区",
                "address": "重庆市荣昌区学院路160号",
                "location": "105.594321,29.403210",
                "lng": 105.594321,
                "lat": 29.40321,
            },
            "distance_km": km,
            "estimated_minutes": minutes,
            "note": "当前基于高德 POI 定位与直线距离换算做通勤估算，适合候选排序，不等同于实时导航。",
        }

    monkeypatch.setattr(AmapService, "resolve_poi", staticmethod(fake_resolve))
    monkeypatch.setattr(AmapService, "estimate_commute", staticmethod(fake_estimate))


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
        json={"session_id": "test-session", "question": "两江新区挂牌均价是多少？"},
    )
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["code"] == 0
    data = payload["data"]
    assert "结论" in data["answer"]
    assert data["tool_calls"][0]["tool_name"] == "query_market_stats"
    assert data["tool_calls"][0]["tool_args"]["district"] == "两江新区"
    assert data["tool_calls"][0]["tool_result"]["district_items"][0]["district"] == "两江新区"
    assert "两江新区 当前平均挂牌单价" in data["answer"]
    assert "当前有效房源 6 套" not in data["answer"]
    assert AgentToolCall.query.filter_by(session_id="test-session", tool_name="query_market_stats").count() == 1
    assert AgentSession.query.filter_by(session_id="test-session").count() == 1
    assert AgentTurn.query.filter_by(session_id="test-session", status="success").count() == 1


def test_agent_session_groups_turns_and_tool_traces(client):
    seed_agent_data()
    for question in ["两江新区挂牌均价是多少？", "重庆整体挂牌价是多少？"]:
        response = client.post("/api/agent/chat", json={"session_id": "grouped-session", "question": question})
        assert response.status_code == 200

    payload = client.get("/api/agent/sessions/grouped-session").get_json()["data"]
    assert payload["session_id"] == "grouped-session"
    assert payload["turn_count"] == 2
    assert len(payload["turns"]) == 2
    assert all(turn["tool_calls"] for turn in payload["turns"])


def test_agent_session_creation_handles_duplicate_race(app, monkeypatch):
    with app.app_context():
        existing = AgentSession(session_id="race-session", title="已创建会话")
        state = {"get_calls": 0, "commit_calls": 0}
        original_get = db.session.get

        def fake_get(model, key):
            if model is AgentSession and key == "race-session":
                state["get_calls"] += 1
                if state["get_calls"] == 1:
                    return None
                return existing
            return original_get(model, key)

        def fake_commit():
            state["commit_calls"] += 1
            raise IntegrityError("INSERT INTO agent_sessions ...", {"session_id": "race-session"}, Exception("duplicate"))

        monkeypatch.setattr(db.session, "get", fake_get)
        monkeypatch.setattr(db.session, "commit", fake_commit)

        session = AgentService._ensure_session("race-session", "并发首问")

        assert session is existing
        assert state["commit_calls"] == 1


def test_agent_session_crud_endpoints(client):
    create_response = client.post("/api/agent/sessions", json={"title": "测试会话"})
    create_payload = create_response.get_json()["data"]

    assert create_response.status_code == 201
    assert create_payload["title"] == "测试会话"
    assert create_payload["turn_count"] == 0

    rename_response = client.patch(
        f"/api/agent/sessions/{create_payload['session_id']}",
        json={"title": "重命名后的会话"},
    )
    rename_payload = rename_response.get_json()["data"]
    assert rename_response.status_code == 200
    assert rename_payload["title"] == "重命名后的会话"

    detail_payload = client.get(f"/api/agent/sessions/{create_payload['session_id']}").get_json()["data"]
    assert detail_payload["title"] == "重命名后的会话"

    listed = client.get("/api/agent/sessions").get_json()["data"]["items"]
    assert any(item["session_id"] == create_payload["session_id"] for item in listed)

    delete_response = client.delete(f"/api/agent/sessions/{create_payload['session_id']}")
    assert delete_response.status_code == 200
    assert delete_response.get_json()["data"]["deleted"] is True
    assert client.get(f"/api/agent/sessions/{create_payload['session_id']}").status_code == 404


def test_agent_chat_rewrites_legacy_local_session_id(client):
    seed_agent_data()

    response = client.post(
        "/api/agent/chat",
        json={"session_id": "local-default", "question": "两江新区挂牌均价是多少？"},
    )
    payload = response.get_json()["data"]

    assert response.status_code == 200
    assert payload["session_id"].startswith("agent-")
    assert payload["session_id"] != "local-default"
    assert AgentSession.query.filter_by(session_id="local-default").count() == 0


def test_agent_stream_chat_returns_sse_events_and_persists_turn(client):
    seed_agent_data()

    response = client.post(
        "/api/agent/chat/stream",
        json={"session_id": "stream-session", "question": "两江新区挂牌均价是多少？"},
    )
    body = response.get_data(as_text=True)

    assert response.status_code == 200
    assert response.content_type.startswith("text/event-stream")
    assert "event: session" in body
    assert "event: tool_call" in body
    assert "event: delta" in body
    assert "event: done" in body
    assert "query_market_stats" in body
    assert AgentSession.query.filter_by(session_id="stream-session").count() == 1
    assert AgentTurn.query.filter_by(session_id="stream-session", status="success").count() == 1


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


def test_agent_session_summary_marks_answered_turns(client):
    seed_agent_data()
    client.post("/api/agent/chat", json={"session_id": "answered-session", "question": "两江新区挂牌均价是多少？"})
    pending_session = AgentSession(session_id="pending-session", title="只有提问")
    db.session.add(pending_session)
    db.session.flush()
    db.session.add(
        AgentTurn(
            turn_id="turn-pending",
            session_id="pending-session",
            question="你能做什么",
            answer=None,
            status="running",
        )
    )
    db.session.commit()

    items = client.get("/api/agent/sessions").get_json()["data"]["items"]
    by_id = {item["session_id"]: item for item in items}

    assert by_id["answered-session"]["latest_has_answer"] is True
    assert by_id["answered-session"]["latest_question"] == "两江新区挂牌均价是多少？"
    assert by_id["pending-session"]["latest_has_answer"] is False
    assert by_id["pending-session"]["latest_question"] == "你能做什么"


def test_agent_business_tools_are_read_only(client):
    items = client.get("/api/agent/tools").get_json()["data"]["items"]
    names = {item["name"] for item in items}
    assert "query_market_stats" in names
    assert "query_readonly_sql" in names
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
    assert "query_readonly_sql" in names
    assert "get_listing_detail" in names
    assert "compare_districts" in names
    assert "explain_listing_anomaly" in names
    assert "recommend_buy_options" in names
    assert "estimate_mortgage" in names
    assert "generate_report" in names
    assert "execute_sql" not in names


def test_agent_can_translate_natural_language_to_readonly_sql(client, monkeypatch):
    seed_agent_data()

    def fake_generate_sql(question: str, schema: str):
        assert "按区县统计" in question
        assert "listings(" in schema
        return (
            "SELECT district, COUNT(*) AS listing_count, "
            "ROUND(AVG(unit_price), 2) AS avg_unit_price "
            "FROM listings GROUP BY district ORDER BY listing_count DESC",
            "deepseek-sql-test-stub",
        )

    monkeypatch.setattr(DeepSeekClient, "generate_readonly_sql", staticmethod(fake_generate_sql))
    response = client.post(
        "/api/agent/chat",
        json={"session_id": "sql-session", "question": "按区县统计房源数量和平均挂牌单价，并按数量排序"},
    )
    payload = response.get_json()["data"]
    sql_call = next(item for item in payload["tool_calls"] if item["tool_name"] == "query_readonly_sql")

    assert response.status_code == 200
    assert sql_call["status"] == "success"
    assert sql_call["tool_result"]["sql"].endswith("LIMIT 100")
    assert sql_call["tool_result"]["rows"]
    assert sql_call["tool_result"]["safety"]["user_sql_executed_directly"] is False
    assert AgentToolCall.query.filter_by(session_id="sql-session", tool_name="query_readonly_sql").count() == 1


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
    assert DeepSeekClient._is_grounded_answer(
        "平均挂牌单价差值为 1,000 元/平方米，说明两区县存在明显价差。",
        evidence,
    )
    assert not DeepSeekClient._is_grounded_answer("平均挂牌单价为 12,000 元/平方米。", evidence)
    assert not DeepSeekClient._is_grounded_answer("建议再结合近期成交价判断。", evidence)


def test_agent_can_answer_listing_detail_compare_and_anomaly_questions(client):
    seed_agent_data()
    ListingService.upsert_listing(
        {
            "source": "fang",
            "source_listing_id": "agent-8",
            "title": "渝北 异常样本",
            "link": "https://example.com/agent/agent-8",
            "district": "渝北",
            "community": "异常小区",
            "total_price": 2,
            "unit_price": 500,
            "area": 800,
            "layout": "3室2厅",
            "floor_text": "低层",
            "build_year": 2024,
        }
    )
    db.session.commit()

    detail_response = client.post(
        "/api/agent/chat",
        json={"session_id": "detail-session", "question": "请查一下系统ID 1 的房源详情"},
    )
    detail_payload = detail_response.get_json()["data"]
    assert detail_response.status_code == 200
    assert any(call["tool_name"] == "get_listing_detail" for call in detail_payload["tool_calls"])
    assert "listing" in detail_payload["tool_calls"][0]["tool_result"] or "items" in detail_payload["tool_calls"][0]["tool_result"]

    compare_response = client.post(
        "/api/agent/chat",
        json={"session_id": "compare-session", "question": "对比渝北和南岸的挂牌价"},
    )
    compare_payload = compare_response.get_json()["data"]
    compare_call = next(call for call in compare_payload["tool_calls"] if call["tool_name"] == "compare_districts")
    assert compare_response.status_code == 200
    assert compare_call["tool_result"]["summary"]["matched"] is True
    assert compare_call["tool_result"]["comparison"][0]["gap"] >= 0

    anomaly_response = client.post(
        "/api/agent/chat",
        json={"session_id": "anomaly-session", "question": "为什么系统ID 7 这条房源异常？"},
    )
    anomaly_payload = anomaly_response.get_json()["data"]
    anomaly_call = next(call for call in anomaly_payload["tool_calls"] if call["tool_name"] == "explain_listing_anomaly")
    assert anomaly_response.status_code == 200
    assert anomaly_call["tool_result"]["summary"]["matched"] is True
    assert anomaly_call["tool_result"]["abnormal_reason"]


def test_agent_chat_returns_error_when_deepseek_fails_without_local_fallback(client, monkeypatch):
    seed_agent_data()

    def raise_error(question: str, evidence: dict):
        raise DeepSeekInvocationError("DeepSeek 真实请求失败")

    monkeypatch.setattr(DeepSeekClient, "generate_answer", staticmethod(raise_error))

    response = client.post(
        "/api/agent/chat",
        json={"session_id": "deepseek-failed", "question": "两江新区挂牌均价是多少？"},
    )
    payload = response.get_json()

    assert response.status_code == 502
    assert payload["code"] == 1
    assert payload["message"] == "DeepSeek 真实请求失败"
    assert payload["data"]["tool_calls"][0]["tool_name"] == "query_market_stats"
    assert AgentTurn.query.filter_by(session_id="deepseek-failed", status="failed").count() == 1


def test_agent_can_estimate_mortgage_for_budget_limited_buyer(client):
    seed_agent_data()

    response = client.post(
        "/api/agent/chat",
        json={"session_id": "mortgage-session", "question": "预算120万，首付三成，贷款30年，大概月供多少？"},
    )
    payload = response.get_json()["data"]

    mortgage_call = next(item for item in payload["tool_calls"] if item["tool_name"] == "estimate_mortgage")
    loan = mortgage_call["tool_result"]["loan"]

    assert response.status_code == 200
    assert loan["purchase_price"] == 120.0
    assert loan["loan_years"] == 30
    assert loan["loan_amount"] == 84.0
    assert loan["monthly_payment"] > 0
    assert "月供约" in payload["answer"]


def test_agent_can_recommend_near_campus_with_destination_tool(client):
    seed_agent_data()
    ListingService.upsert_listing(
        {
            "source": "fang",
            "source_listing_id": "agent-rc-1",
            "title": "荣昌 学府未来城 三房",
            "link": "https://example.com/agent/agent-rc-1",
            "district": "荣昌",
            "community": "学府未来城",
            "address": "荣昌区学府未来城",
            "total_price": 78,
            "unit_price": 8600,
            "area": 91,
            "layout": "3室2厅",
            "floor_text": "中层",
            "build_year": 2020,
            "tags": ["近学校", "配套成熟"],
        }
    )
    db.session.commit()

    response = client.post(
        "/api/agent/chat",
        json={
            "session_id": "campus-session",
            "question": "我是荣昌人，预算80万，首付三成，想在西南大学荣昌校区附近买二手房，考虑交通和贷款，有推荐吗？",
        },
    )
    payload = response.get_json()["data"]

    tool_names = [item["tool_name"] for item in payload["tool_calls"]]
    destination_call = next(item for item in payload["tool_calls"] if item["tool_name"] == "recommend_destination_options")
    top_item = destination_call["tool_result"]["items"][0]

    assert response.status_code == 200
    assert "resolve_destination_poi" in tool_names
    assert "recommend_destination_options" in tool_names
    assert "estimate_mortgage" in tool_names
    assert destination_call["tool_result"]["destination"]["name"] == "西南大学荣昌校区"
    assert top_item["listing"]["title"] == "荣昌 学府未来城 三房"
    assert top_item["commute_estimate"]["estimated_minutes"] == 14
    assert top_item["mortgage_estimate"]["monthly_payment"] > 0
    assert "学区字段" in destination_call["tool_result"]["summary"]["school_district_note"]
    assert "月供约" in payload["answer"]

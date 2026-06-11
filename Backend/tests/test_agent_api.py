from __future__ import annotations

from Backend.extensions import db
from Backend.models.agent import AgentToolCall, GeneratedReport
from Backend.services.analysis_service import AnalysisService
from Backend.services.listing_service import ListingService


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
    assert AgentToolCall.query.filter_by(session_id="test-session", tool_name="query_market_stats").count() == 1


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
    assert "generate_report" in names
    assert "execute_sql" not in names

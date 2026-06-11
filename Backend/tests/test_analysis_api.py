from __future__ import annotations

from Backend.extensions import db
from Backend.models.analysis import AnalysisJob, ModelResult
from Backend.services.analysis_service import AnalysisService
from Backend.services.listing_service import ListingService


def seed_analysis_data():
    rows = [
        ("fang", "渝北", "A", 95, 10500, 90, "2室1厅", 2016, "南北", "精装", "中层"),
        ("fang", "渝北", "B", 125, 12500, 100, "3室2厅", 2018, "南", "精装", "高层"),
        ("lianjia", "渝北", "C", 180, 15000, 120, "3室2厅", 2020, "东南", "简装", "高层"),
        ("fang", "江北", "D", 90, 10000, 90, "2室1厅", 2014, "南北", "简装", "中层"),
        ("lianjia", "江北", "E", 155, 15500, 100, "3室2厅", 2019, "南", "精装", "高层"),
        ("fang", "南岸", "F", 88, 9800, 89, "2室1厅", 2013, "北", "简装", "低层"),
        ("anjuke_mobile", "南岸", "G", 140, 14000, 100, "3室2厅", 2017, "南北", "精装", "中层"),
        ("fang", "沙坪坝", "H", 70, 8500, 82, "2室1厅", 2010, "西南", "毛坯", "低层"),
        ("lianjia", "沙坪坝", "I", 110, 11000, 100, "3室2厅", 2016, "南", "简装", "中层"),
        ("fang", "渝中", "J", 260, 26000, 100, "3室2厅", 2021, "东南", "精装", "高层"),
        ("lianjia", "渝中", "K", 330, 33000, 100, "4室2厅", 2022, "南北", "精装", "高层"),
        ("anjuke_mobile", "九龙坡", "L", 100, 10000, 100, "3室1厅", 2015, "南", "简装", "中层"),
    ]
    for index, (
        source,
        district,
        suffix,
        total_price,
        unit_price,
        area,
        layout,
        build_year,
        orientation,
        decoration,
        floor_text,
    ) in enumerate(rows, start=1):
        ListingService.upsert_listing(
            {
                "source": source,
                "source_listing_id": f"analysis-{index}",
                "title": f"{district}分析样本{suffix}",
                "link": f"https://example.com/analysis/{index}",
                "district": district,
                "community": f"样本小区{suffix}",
                "total_price": total_price,
                "unit_price": unit_price,
                "area": area,
                "layout": layout,
                "orientation": orientation,
                "decoration": decoration,
                "floor_text": floor_text,
                "build_year": build_year,
            }
        )
    db.session.commit()


def test_create_analysis_job_generates_all_result_types(client):
    seed_analysis_data()

    response = client.post("/api/analysis/jobs", json={"job_type": "all"})
    payload = response.get_json()

    assert response.status_code == 201
    assert payload["code"] == 0
    data = payload["data"]
    assert data["status"] == "success"
    assert data["sample_count"] == 12
    assert data["train_count"] > 0
    assert data["test_count"] > 0

    result_types = {item["result_type"] for item in data["results"]}
    assert {"eda", "regression", "regression_candidate", "cluster", "anomaly"} <= result_types

    regression = next(item for item in data["results"] if item["result_type"] == "regression")
    assert regression["metrics"]["target"] == "unit_price"
    assert regression["metrics"]["mae"] is not None
    assert regression["metrics"]["feature_count"] > 9
    assert "excluded_count" in regression["metrics"]
    assert regression["metrics"]["is_best"] is True
    assert regression["artifacts"]["feature_importance"]
    assert len(regression["artifacts"]["model_comparison"]) >= 3
    assert any(item["model_name"].startswith("SourceSegmented") for item in regression["artifacts"]["model_comparison"])
    assert regression["artifacts"]["model_note"].startswith("该模型用于解释")
    assert "分类特征" in "；".join(regression["evidence"]["feature_groups"])
    assert "楼盘目标编码" in "；".join(regression["evidence"]["feature_groups"])

    candidates = [item for item in data["results"] if item["result_type"] == "regression_candidate"]
    assert len(candidates) == len(regression["artifacts"]["model_comparison"])
    assert len(candidates) >= 3
    assert sum(1 for item in candidates if item["metrics"]["is_best"]) == 1

    cluster = next(item for item in data["results"] if item["result_type"] == "cluster")
    assert cluster["metrics"]["cluster_count"] >= 2
    assert cluster["artifacts"]["clusters"]

    assert AnalysisJob.query.count() == 1
    assert ModelResult.query.count() == len(data["results"])


def test_get_analysis_job_and_latest(client):
    seed_analysis_data()
    created = client.post("/api/analysis/jobs", json={"job_type": "regression"}).get_json()["data"]

    detail_response = client.get(f"/api/analysis/jobs/{created['id']}")
    detail_payload = detail_response.get_json()
    assert detail_response.status_code == 200
    assert detail_payload["data"]["id"] == created["id"]
    assert detail_payload["data"]["results"][0]["result_type"] == "regression"
    assert len([item for item in detail_payload["data"]["results"] if item["result_type"] == "regression_candidate"]) >= 3

    latest_payload = client.get("/api/analysis/jobs/latest").get_json()
    assert latest_payload["code"] == 0
    assert latest_payload["data"]["job"]["id"] == created["id"]
    assert latest_payload["data"]["results"][0]["result_type"] == "regression"


def test_invalid_analysis_job_type_returns_400(client):
    response = client.post("/api/analysis/jobs", json={"job_type": "unknown"})
    payload = response.get_json()

    assert response.status_code == 400
    assert payload["code"] == 1
    assert "job_type" in payload["message"]


def test_regression_filter_excludes_extreme_training_samples():
    records = [
        {
            "id": index,
            "title": f"样本{index}",
            "source": "fang",
            "district": "渝北",
            "community": "稳定小区",
            "unit_price": 10000 + index % 5 * 100,
            "area": 90,
        }
        for index in range(1, 59)
    ]
    records.extend(
        [
            {
                "id": 90,
                "title": "极端高价样本",
                "source": "fang",
                "district": "渝北",
                "community": "异常小区",
                "unit_price": 90000,
                "area": 90,
            },
            {
                "id": 91,
                "title": "极端面积样本",
                "source": "fang",
                "district": "渝北",
                "community": "异常小区",
                "unit_price": 10200,
                "area": 360,
            },
        ]
    )

    kept, exclusion = AnalysisService._filter_regression_records(records)

    assert exclusion["policy"]["enabled"] is True
    assert exclusion["excluded_count"] >= 2
    assert {item["id"] for item in kept}.isdisjoint({90, 91})

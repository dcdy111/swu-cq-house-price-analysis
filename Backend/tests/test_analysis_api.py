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
    assert regression["evidence"]["sampling"]["strategy"] == "district_stratified_deterministic"
    assert regression["evidence"]["sampling"]["district_count"] == 7
    assert regression["metrics"]["sampling_district_count"] == 7

    candidates = [item for item in data["results"] if item["result_type"] == "regression_candidate"]
    assert len(candidates) == len(regression["artifacts"]["model_comparison"])
    assert len(candidates) >= 3
    assert sum(1 for item in candidates if item["metrics"]["is_best"]) == 1

    cluster = next(item for item in data["results"] if item["result_type"] == "cluster")
    assert cluster["metrics"]["cluster_count"] >= 2
    assert cluster["metrics"]["algorithm"] == "sklearn.cluster.KMeans"
    assert "silhouette_score" in cluster["metrics"]
    assert cluster["artifacts"]["clusters"]

    anomaly = next(item for item in data["results"] if item["result_type"] == "anomaly")
    assert anomaly["metrics"]["algorithm"] == "sklearn.ensemble.IsolationForest"
    assert "anomaly_count" in anomaly["metrics"]
    assert anomaly["metrics"]["anomaly_rate"] <= 0.2

    assert AnalysisJob.query.count() == 1
    assert ModelResult.query.count() == len(data["results"])


def test_create_analysis_job_can_dispatch_in_background(client, monkeypatch):
    seed_analysis_data()
    captured = {}

    def fake_submit(job_key, func, *args, **kwargs):
        captured["job_key"] = job_key
        captured["args"] = args
        return True

    monkeypatch.setattr("Backend.api.analysis.TaskRunner.submit", fake_submit)

    response = client.post("/api/analysis/jobs", json={"job_type": "all", "max_samples": 500, "background": True})
    payload = response.get_json()

    assert response.status_code == 202
    assert payload["code"] == 0
    assert payload["data"]["status"] == "pending"
    assert payload["data"]["results"] == []
    assert captured["job_key"].startswith("analysis:")


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


def test_analysis_job_history_crud_and_replay(client):
    seed_analysis_data()

    created = client.post("/api/analysis/jobs", json={"job_type": "regression", "name": "首轮挂牌价回归"}).get_json()["data"]

    assert created["name"] == "首轮挂牌价回归"

    rename_response = client.patch(f"/api/analysis/jobs/{created['id']}", json={"name": "答辩展示回归"})
    rename_payload = rename_response.get_json()

    assert rename_response.status_code == 200
    assert rename_payload["code"] == 0
    assert rename_payload["data"]["name"] == "答辩展示回归"

    replay_response = client.post(
        f"/api/analysis/jobs/{created['id']}/replay",
        json={"name": "答辩展示回归-重跑", "max_samples": 500},
    )
    replay_payload = replay_response.get_json()

    assert replay_response.status_code == 201
    assert replay_payload["code"] == 0
    assert replay_payload["data"]["id"] != created["id"]
    assert replay_payload["data"]["job_type"] == "regression"
    assert replay_payload["data"]["name"] == "答辩展示回归-重跑"
    assert replay_payload["data"]["results"][0]["result_type"] == "regression"

    delete_response = client.delete(f"/api/analysis/jobs/{created['id']}")
    delete_payload = delete_response.get_json()

    assert delete_response.status_code == 200
    assert delete_payload["code"] == 0
    assert delete_payload["data"]["deleted"] is True
    assert db.session.get(AnalysisJob, created["id"]) is None


def test_analysis_simulation_returns_estimate_cluster_and_comparables(client):
    seed_analysis_data()

    response = client.post(
        "/api/analysis/simulate",
        json={
            "district": "渝北",
            "community": "样本小区A",
            "source": "fang",
            "area": 92,
            "rooms": 2,
            "halls": 1,
            "floor_level": "mid",
            "orientation": "南北",
            "decoration": "精装",
            "build_year": 2018,
        },
    )
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["code"] == 0
    data = payload["data"]
    assert data["input"]["district"] in {"渝北", "渝北区"}
    assert data["regression"]["estimated_unit_price"] > 0
    assert data["regression"]["estimated_total_price"] > 0
    assert data["regression"]["top_factors"]
    assert "挂牌价/报价辅助估计" in data["evidence"]["model_note"]
    assert data["cluster"]["label"]
    assert data["cluster"]["cluster_count"] >= 2
    assert data["district_reference"]["listing_count"] >= 1
    assert len(data["comparables"]) >= 1


def test_analysis_job_pdf_export(client):
    seed_analysis_data()
    created = client.post("/api/analysis/jobs", json={"job_type": "all"}).get_json()["data"]

    response = client.get(f"/api/analysis/jobs/{created['id']}/export.pdf")

    assert response.status_code == 200
    assert response.content_type == "application/pdf"
    assert response.data.startswith(b"%PDF")


def test_tune_job_runs_real_parameter_search(client):
    seed_analysis_data()

    response = client.post("/api/analysis/jobs", json={"job_type": "tune", "max_samples": 200})
    payload = response.get_json()

    assert response.status_code == 201
    assert payload["code"] == 0
    data = payload["data"]
    assert data["job_type"] == "tune"
    regression = next(item for item in data["results"] if item["result_type"] == "regression")
    assert regression["metrics"]["search_candidates"] >= 2
    assert regression["metrics"]["cv_folds"] >= 2
    assert regression["metrics"]["best_params"]
    assert "tuning_search" in regression["evidence"]
    assert regression["artifacts"]["tuning"]["search_algorithm"] == "sklearn.model_selection.RandomizedSearchCV"
    candidates = [item for item in data["results"] if item["result_type"] == "regression_candidate"]
    assert len(candidates) >= 2
    assert any(item["metrics"]["tuning_status"] == "searched" for item in candidates)


def test_latest_results_by_type_keeps_full_demo_chain(client):
    seed_analysis_data()
    all_job = client.post("/api/analysis/jobs", json={"job_type": "all"}).get_json()["data"]
    regression_job = client.post("/api/analysis/jobs", json={"job_type": "regression"}).get_json()["data"]

    response = client.get("/api/analysis/results/latest-by-type")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["code"] == 0
    data = payload["data"]
    assert data["job"]["id"] == regression_job["id"]

    by_type = {item["result_type"]: item for item in data["results"] if item["result_type"] != "regression_candidate"}
    assert {"eda", "regression", "cluster", "anomaly"} <= set(by_type)
    assert by_type["regression"]["job_id"] == regression_job["id"]
    assert by_type["cluster"]["job_id"] == all_job["id"]
    assert by_type["anomaly"]["job_id"] == all_job["id"]
    assert len([item for item in data["results"] if item["result_type"] == "regression_candidate"]) >= 3


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


def test_district_stratified_sampling_covers_each_available_district(app):
    seed_analysis_data()

    records = AnalysisService._load_records(max_samples=6)

    assert len(records) == 6
    assert len({item["district"] for item in records}) == 6
    assert AnalysisService._load_records(max_samples=6) == records


def test_cluster_does_not_turn_missing_house_age_into_zero():
    records = [
        {
            "id": index,
            "title": f"无楼龄样本{index}",
            "source": "fang",
            "district": "渝北" if index <= 5 else "南岸",
            "community": f"样本小区{index}",
            "total_price": 80 + index * 8,
            "unit_price": 8000 + index * 650,
            "area": 80 + index * 3,
            "layout": "3室2厅",
            "rooms": 3,
            "halls": 2,
            "orientation": "南",
            "decoration": "精装",
            "house_age": None,
            "floor_score": 1.0,
            "floor_level": "mid",
            "quality": 100,
        }
        for index in range(1, 11)
    ]

    result = AnalysisService._cluster_result(records)

    assert result["metrics"]["status"] == "ok"
    assert "房龄" not in "；".join(result["evidence"]["features"])
    assert "不把未知楼龄当作 0 年" in result["evidence"]["house_age_policy"]
    assert result["artifacts"]["clusters"]
    assert all(item["avg_house_age"] is None for item in result["artifacts"]["clusters"])
    assert all(item["house_age"] is None for item in result["artifacts"]["points"])


def test_allocate_strata_is_bounded_and_preserves_coverage():
    allocation = AnalysisService._allocate_strata(
        {"渝北": 100, "江北": 50, "南岸": 20, "渝中": 5},
        target=20,
    )

    assert sum(allocation.values()) == 20
    assert set(allocation) == {"渝北", "江北", "南岸", "渝中"}
    assert all(value >= 1 for value in allocation.values())

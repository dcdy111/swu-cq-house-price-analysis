from __future__ import annotations

import math
from collections import Counter, defaultdict
from datetime import datetime
from statistics import mean, median
from typing import Iterable

from Backend.extensions import db
from Backend.models.analysis import AnalysisJob, ModelResult
from Backend.models.listing import Listing
from Backend.services.dashboard_service import normalize_district_name


VALID_JOB_TYPES = {"all", "eda", "regression", "tune", "cluster", "anomaly"}
VALID_STATUSES = ("active", "valid")
NUMERIC_FEATURE_NAMES = [
    "建筑面积",
    "室数",
    "厅数",
    "楼层等级数值",
    "区县目标编码",
    "楼盘目标编码",
    "区县样本量",
    "楼盘样本量",
]
CATEGORICAL_FEATURE_CONFIG = [
    ("source", "来源", 8),
    ("district", "区县", 40),
    ("layout_bucket", "户型", 12),
    ("orientation_bucket", "朝向", 12),
    ("decoration_bucket", "装修", 8),
    ("floor_level", "楼层", 4),
]
CLUSTER_LABELS = ["经济型", "刚需均衡型", "改善型", "高价稀缺型"]


def _round(value, digits: int = 2):
    if value is None:
        return None
    return round(float(value), digits)


def _numeric_or_none(value) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _safe_div(numerator: float, denominator: float) -> float:
    return numerator / denominator if abs(denominator) > 1e-9 else 0.0


def _quantile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    position = (len(ordered) - 1) * q
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(ordered[lower])
    weight = position - lower
    return float(ordered[lower] * (1 - weight) + ordered[upper] * weight)


def _pearson(xs: list[float], ys: list[float]) -> float:
    if len(xs) < 2 or len(xs) != len(ys):
        return 0.0
    x_mean = mean(xs)
    y_mean = mean(ys)
    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys))
    x_den = math.sqrt(sum((x - x_mean) ** 2 for x in xs))
    y_den = math.sqrt(sum((y - y_mean) ** 2 for y in ys))
    return _safe_div(numerator, x_den * y_den)


def _floor_score(value: str | None) -> float:
    return {"low": 0.0, "mid": 1.0, "high": 2.0}.get(value or "unknown", 1.0)


def _analysis_condition():
    return db.and_(
        Listing.status.in_(VALID_STATUSES),
        Listing.data_quality_score >= 80,
        Listing.total_price.isnot(None),
        Listing.unit_price.isnot(None),
        Listing.area.isnot(None),
        Listing.total_price.between(5, 5000),
        Listing.unit_price.between(1000, 100000),
        Listing.area.between(10, 500),
    )


class AnalysisService:
    @staticmethod
    def create_job(payload: dict) -> AnalysisJob:
        job_type = str(payload.get("job_type") or "all").strip().lower()
        if job_type not in VALID_JOB_TYPES:
            raise ValueError(f"job_type 仅支持: {', '.join(sorted(VALID_JOB_TYPES))}")

        max_samples = min(20_000, max(100, int(payload.get("max_samples") or 5000)))
        now = datetime.utcnow()
        job = AnalysisJob(job_type=job_type, status="pending", created_at=now, updated_at=now)
        db.session.add(job)
        db.session.commit()

        try:
            job.status = "running"
            job.started_at = datetime.utcnow()
            job.updated_at = job.started_at
            records = AnalysisService._load_records(max_samples=max_samples)
            job.sample_count = len(records)
            sampling_evidence = AnalysisService._sampling_evidence(records, requested_max_samples=max_samples)

            result_payloads = AnalysisService._run(job_type, records)
            for payload_item in result_payloads:
                metrics = dict(payload_item.get("metrics") or {})
                metrics.setdefault("sampling_district_count", sampling_evidence["district_count"])
                metrics.setdefault("sampling_source_count", sampling_evidence["source_count"])
                evidence = dict(payload_item.get("evidence") or {})
                evidence["sampling"] = sampling_evidence
                result = ModelResult(
                    job_id=job.id,
                    result_type=payload_item["result_type"],
                    model_name=payload_item["model_name"],
                    summary=payload_item["summary"],
                )
                result.set_payloads(
                    metrics=metrics,
                    artifacts=payload_item.get("artifacts"),
                    evidence=evidence,
                )
                db.session.add(result)

            regression = next((item for item in result_payloads if item["result_type"] == "regression"), None)
            if regression:
                job.train_count = int(regression.get("metrics", {}).get("train_count") or 0)
                job.test_count = int(regression.get("metrics", {}).get("test_count") or 0)

            job.status = "success"
            job.finished_at = datetime.utcnow()
            job.updated_at = job.finished_at
            db.session.commit()
            return job
        except Exception as exc:
            db.session.rollback()
            failed_job = db.session.get(AnalysisJob, job.id)
            if failed_job is None:
                failed_job = AnalysisJob(id=job.id, job_type=job_type)
                db.session.add(failed_job)
            failed_job.status = "failed"
            failed_job.error_message = str(exc)
            failed_job.finished_at = datetime.utcnow()
            failed_job.updated_at = failed_job.finished_at
            db.session.commit()
            return failed_job

    @staticmethod
    def list_jobs(page: int = 1, page_size: int = 20) -> dict:
        page = max(1, int(page or 1))
        page_size = min(100, max(1, int(page_size or 20)))
        pagination = AnalysisJob.query.order_by(AnalysisJob.created_at.desc(), AnalysisJob.id.desc()).paginate(
            page=page, per_page=page_size, error_out=False
        )
        return {
            "items": [item.to_dict(include_results=False) for item in pagination.items],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": pagination.total,
                "pages": pagination.pages,
                "has_next": pagination.has_next,
                "has_prev": pagination.has_prev,
            },
        }

    @staticmethod
    def get_job(job_id: int) -> AnalysisJob | None:
        return db.session.get(AnalysisJob, job_id)

    @staticmethod
    def latest_success_job() -> AnalysisJob | None:
        return (
            AnalysisJob.query.filter_by(status="success")
            .order_by(AnalysisJob.finished_at.desc(), AnalysisJob.id.desc())
            .first()
        )

    @staticmethod
    def latest_results_by_type() -> dict:
        ordered_types = ["eda", "regression", "cluster", "anomaly"]
        latest_results: dict[str, ModelResult] = {}
        jobs_by_type: dict[str, dict] = {}

        for result_type in ordered_types:
            result = (
                ModelResult.query.join(AnalysisJob)
                .filter(AnalysisJob.status == "success", ModelResult.result_type == result_type)
                .order_by(AnalysisJob.finished_at.desc(), AnalysisJob.id.desc(), ModelResult.id.desc())
                .first()
            )
            if result is None:
                continue
            latest_results[result_type] = result
            jobs_by_type[result_type] = result.job.to_dict(include_results=False)

        result_items: list[ModelResult] = []
        seen_ids = set()
        for result_type in ordered_types:
            result = latest_results.get(result_type)
            if result is not None and result.id not in seen_ids:
                result_items.append(result)
                seen_ids.add(result.id)

        regression_result = latest_results.get("regression")
        primary_job = regression_result.job if regression_result is not None else AnalysisService.latest_success_job()
        if regression_result is not None:
            candidates = (
                ModelResult.query.filter_by(job_id=regression_result.job_id, result_type="regression_candidate")
                .order_by(ModelResult.id.asc())
                .all()
            )
            for candidate in candidates:
                if candidate.id not in seen_ids:
                    result_items.append(candidate)
                    seen_ids.add(candidate.id)

        return {
            "job": primary_job.to_dict(include_results=False) if primary_job else None,
            "results": [item.to_dict() for item in result_items],
            "jobs_by_type": jobs_by_type,
            "note": "按 result_type 读取最近成功结果；用于本地演示时避免最新单项任务覆盖其他分析页签。",
        }

    @staticmethod
    def _load_records(max_samples: int) -> list[dict]:
        strata = (
            db.session.query(Listing.district, db.func.count(Listing.id))
            .filter(_analysis_condition())
            .group_by(Listing.district)
            .order_by(Listing.district.asc())
            .all()
        )
        counts = {str(district or "待复核"): int(count or 0) for district, count in strata if count}
        allocations = AnalysisService._allocate_strata(counts, max_samples)
        rows = []
        for district, limit in allocations.items():
            if limit <= 0:
                continue
            rows.extend(
                Listing.query.filter(_analysis_condition(), Listing.district == district)
                .order_by(
                    db.func.crc32(db.func.concat(Listing.id, "-analysis-v1")).asc(),
                    Listing.id.asc(),
                )
                .limit(limit)
                .all()
            )
        rows.sort(key=lambda item: (normalize_district_name(item.district), item.id))
        return [
            {
                "id": item.id,
                "source": item.source or "unknown",
                "title": item.title,
                "district": normalize_district_name(item.district),
                "raw_district": item.district,
                "community": item.community,
                "total_price": float(item.total_price or 0),
                "unit_price": float(item.unit_price or 0),
                "area": float(item.area or 0),
                "layout": item.layout,
                "rooms": float(item.rooms or 0),
                "halls": float(item.halls or 0),
                "orientation": item.orientation,
                "decoration": item.decoration,
                "house_age": _numeric_or_none(item.house_age),
                "floor_score": _floor_score(item.floor_level),
                "floor_level": item.floor_level or "unknown",
                "quality": int(item.data_quality_score or 0),
                "updated_at": item.updated_at.isoformat(sep=" ") if item.updated_at else None,
            }
            for item in rows
        ]

    @staticmethod
    def _allocate_strata(counts: dict[str, int], target: int) -> dict[str, int]:
        available = {key: max(0, int(value or 0)) for key, value in counts.items() if int(value or 0) > 0}
        total = sum(available.values())
        target = min(max(0, int(target or 0)), total)
        if target <= 0 or not available:
            return {}

        ordered = sorted(available, key=lambda key: (-available[key], key))
        selected = ordered if target >= len(ordered) else ordered[:target]
        allocation = {key: 1 for key in selected}
        remaining = target - len(selected)

        while remaining > 0:
            capacity = {key: available[key] - allocation[key] for key in selected}
            total_capacity = sum(max(0, value) for value in capacity.values())
            if total_capacity <= 0:
                break

            raw = {key: remaining * max(0, capacity[key]) / total_capacity for key in selected}
            additions = {key: min(capacity[key], int(math.floor(raw[key]))) for key in selected}
            distributed = sum(additions.values())
            for key, value in additions.items():
                allocation[key] += value
            remaining -= distributed
            if remaining <= 0:
                break

            candidates = sorted(
                (key for key in selected if allocation[key] < available[key]),
                key=lambda key: (-(raw[key] - math.floor(raw[key])), -capacity[key], key),
            )
            if not candidates:
                break
            for key in candidates:
                if remaining <= 0:
                    break
                allocation[key] += 1
                remaining -= 1

        return {key: allocation[key] for key in sorted(allocation)}

    @staticmethod
    def _sampling_evidence(records: list[dict], requested_max_samples: int) -> dict:
        district_distribution = Counter(item["district"] for item in records)
        source_distribution = Counter(item["source"] for item in records)
        return {
            "strategy": "district_stratified_deterministic",
            "description": "按区县至少保留一个样本，其余名额按各区县可用样本量比例分配；区县内使用固定 CRC32 顺序抽样。",
            "requested_max_samples": int(requested_max_samples),
            "actual_sample_count": len(records),
            "district_count": len(district_distribution),
            "source_count": len(source_distribution),
            "district_distribution": dict(sorted(district_distribution.items())),
            "source_distribution": dict(sorted(source_distribution.items())),
            "deterministic_seed": "analysis-v1",
        }

    @staticmethod
    def _run(job_type: str, records: list[dict]) -> list[dict]:
        if job_type == "all":
            regression_results = AnalysisService._regression_results(records)
            return [
                AnalysisService._eda_result(records),
                *regression_results,
                AnalysisService._cluster_result(records),
                AnalysisService._anomaly_result(records),
            ]
        if job_type == "eda":
            return [AnalysisService._eda_result(records)]
        if job_type == "regression":
            return AnalysisService._regression_results(records)
        if job_type == "tune":
            return AnalysisService._tuned_regression_results(records)
        if job_type == "cluster":
            return [AnalysisService._cluster_result(records)]
        return [AnalysisService._anomaly_result(records)]

    @staticmethod
    def _eda_result(records: list[dict]) -> dict:
        unit_prices = [item["unit_price"] for item in records]
        total_prices = [item["total_price"] for item in records]
        areas = [item["area"] for item in records]
        district_groups = AnalysisService._group_by(records, "district")

        district_boxplot = []
        district_summary = []
        for district, items in district_groups.items():
            prices = [item["unit_price"] for item in items]
            district_summary.append(
                {
                    "district": district,
                    "count": len(items),
                    "avg_unit_price": _round(mean(prices), 2) if prices else 0,
                    "avg_total_price": _round(mean(item["total_price"] for item in items), 2) if items else 0,
                    "avg_area": _round(mean(item["area"] for item in items), 2) if items else 0,
                }
            )
            district_boxplot.append(
                {
                    "district": district,
                    "count": len(items),
                    "min": _round(min(prices), 2) if prices else None,
                    "q1": _round(_quantile(prices, 0.25), 2),
                    "median": _round(_quantile(prices, 0.5), 2),
                    "q3": _round(_quantile(prices, 0.75), 2),
                    "max": _round(max(prices), 2) if prices else None,
                }
            )

        district_summary.sort(key=lambda item: (item["avg_unit_price"], item["count"]), reverse=True)
        district_boxplot.sort(key=lambda item: item["median"] or 0, reverse=True)

        metrics = {
            "sample_count": len(records),
            "district_count": len(district_groups),
            "avg_unit_price": _round(mean(unit_prices), 2) if unit_prices else 0,
            "median_unit_price": _round(median(unit_prices), 2) if unit_prices else 0,
            "avg_total_price": _round(mean(total_prices), 2) if total_prices else 0,
            "avg_area": _round(mean(areas), 2) if areas else 0,
        }
        return {
            "result_type": "eda",
            "model_name": "EDA 描述性统计",
            "summary": "已完成挂牌价、面积、区县分布和箱线图统计。",
            "metrics": metrics,
            "artifacts": {
                "district_summary": district_summary[:20],
                "district_boxplot": district_boxplot[:20],
                "layout_note": "当前 EDA 基于清洗后有效样本，异常样本默认不进入统计。",
            },
            "evidence": {
                "filters": AnalysisService._default_filters(),
                "sample_count": len(records),
            },
        }

    @staticmethod
    def _regression_results(records: list[dict]) -> list[dict]:
        training_records, exclusion = AnalysisService._filter_regression_records(records)
        if len(training_records) < 5:
            return [
                {
                    "result_type": "regression",
                    "model_name": "多模型回归对比",
                    "summary": "可用样本少于 5 条，暂不输出稳定的回归评估指标。",
                    "metrics": {
                        "status": "insufficient_sample",
                        "sample_count": len(records),
                        "training_sample_count": len(training_records),
                        "excluded_count": exclusion["excluded_count"],
                        "train_count": 0,
                        "test_count": 0,
                        "mae": None,
                        "rmse": None,
                        "r2": None,
                        "mape": None,
                    },
                    "artifacts": {"feature_importance": [], "predictions": [], "model_comparison": []},
                    "evidence": {
                        "filters": AnalysisService._default_filters(),
                        "feature_groups": AnalysisService._feature_groups(),
                        "exclusion_policy": exclusion["policy"],
                    },
                }
            ]

        try:
            return AnalysisService._sklearn_regression_results(training_records, source_sample_count=len(records), exclusion=exclusion)
        except Exception as exc:
            result = AnalysisService._ridge_regression_result(training_records, source_sample_count=len(records), exclusion=exclusion)
            result["summary"] = f"{result['summary']}；sklearn 集成树训练失败，已使用 Ridge 兜底。"
            result["evidence"]["fallback_reason"] = str(exc)
            return [result]

    @staticmethod
    def _tuned_regression_results(records: list[dict]) -> list[dict]:
        training_records, exclusion = AnalysisService._filter_regression_records(records)
        if len(training_records) < 10:
            return [
                {
                    "result_type": "regression",
                    "model_name": "GradientBoostingRegressor 参数搜索",
                    "summary": "可用样本少于 10 条，暂不执行交叉验证参数搜索。已避免把普通分析误写成调参。 ",
                    "metrics": {
                        "status": "insufficient_sample",
                        "sample_count": len(records),
                        "training_sample_count": len(training_records),
                        "excluded_count": exclusion["excluded_count"],
                        "train_count": 0,
                        "test_count": 0,
                        "mae": None,
                        "rmse": None,
                        "r2": None,
                        "mape": None,
                        "search_candidates": 0,
                        "cv_folds": 0,
                    },
                    "artifacts": {
                        "feature_importance": [],
                        "predictions": [],
                        "model_comparison": [],
                        "tuning": {
                            "status": "insufficient_sample",
                            "note": "样本不足时不执行参数搜索，避免把普通重跑误判为调参。",
                        },
                    },
                    "evidence": {
                        "filters": AnalysisService._default_filters(),
                        "feature_groups": AnalysisService._feature_groups(),
                        "exclusion_policy": exclusion["policy"],
                    },
                }
            ]

        try:
            return AnalysisService._sklearn_tuned_regression_results(
                training_records,
                source_sample_count=len(records),
                exclusion=exclusion,
            )
        except Exception as exc:
            result = AnalysisService._ridge_regression_result(
                training_records,
                source_sample_count=len(records),
                exclusion=exclusion,
            )
            result["summary"] = f"{result['summary']}；参数搜索失败，已回退到 Ridge 基线。"
            result["metrics"]["tuning_status"] = "failed"
            result["evidence"]["fallback_reason"] = str(exc)
            return [result]

    @staticmethod
    def _ridge_regression_result(records: list[dict], source_sample_count: int | None = None, exclusion: dict | None = None) -> dict:
        source_sample_count = source_sample_count or len(records)
        exclusion = exclusion or AnalysisService._empty_exclusion()
        ordered = sorted(records, key=lambda item: item["id"])
        test_count = max(1, min(len(ordered) - 3, int(round(len(ordered) * 0.2))))
        train_records = ordered[:-test_count]
        test_records = ordered[-test_count:]
        model = AnalysisService._fit_ridge(train_records)
        predictions = AnalysisService._predict(model, test_records)
        actual = [item["unit_price"] for item in test_records]
        predicted = [item["predicted"] for item in predictions]

        mae = mean(abs(a - p) for a, p in zip(actual, predicted))
        rmse = math.sqrt(mean((a - p) ** 2 for a, p in zip(actual, predicted)))
        actual_mean = mean(actual)
        sse = sum((a - p) ** 2 for a, p in zip(actual, predicted))
        sst = sum((a - actual_mean) ** 2 for a in actual)
        r2 = 1 - _safe_div(sse, sst) if sst > 1e-9 else 0.0
        mape = mean(abs(_safe_div(a - p, a)) for a, p in zip(actual, predicted)) * 100

        importance = AnalysisService._feature_importance(model, train_records)
        return {
            "result_type": "regression",
            "model_name": "Ridge 线性基线",
            "summary": "以面积、户型、楼层、区县均价等特征，对挂牌单价进行辅助估计。",
            "metrics": {
                "status": "ok",
                "target": "unit_price",
                "target_label": "挂牌单价（元/平方米）",
                "sample_count": source_sample_count,
                "training_sample_count": len(records),
                "excluded_count": exclusion["excluded_count"],
                "train_count": len(train_records),
                "test_count": len(test_records),
                "feature_count": len(model["feature_names"]),
                "mae": _round(mae, 2),
                "rmse": _round(rmse, 2),
                "r2": _round(r2, 4),
                "mape": _round(mape, 2),
            },
            "artifacts": {
                "feature_importance": importance,
                "predictions": predictions[:100],
                "excluded_samples": exclusion["samples"],
                "exclusion_policy": exclusion["policy"],
                "model_note": "该模型用于解释挂牌价影响因素和辅助估价，不代表成交价预测。",
            },
            "evidence": {
                "filters": AnalysisService._default_filters(),
                "feature_groups": AnalysisService._feature_groups(),
                "features": model["feature_names"],
                "target_encoding": model["encoder"].get("target_encoding_note"),
                "house_age_policy": model["encoder"].get("house_age_policy"),
                "exclusion_policy": exclusion["policy"],
                "split_rule": "按房源 ID 排序后取后 20% 作为测试集，保证结果可复现。",
            },
        }

    @staticmethod
    def _sklearn_regression_results(
        records: list[dict],
        source_sample_count: int | None = None,
        exclusion: dict | None = None,
    ) -> list[dict]:
        from sklearn.ensemble import GradientBoostingRegressor, HistGradientBoostingRegressor, RandomForestRegressor
        from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
        from sklearn.model_selection import train_test_split

        source_sample_count = source_sample_count or len(records)
        exclusion = exclusion or AnalysisService._empty_exclusion()
        train_records, test_records = train_test_split(records, test_size=0.2, random_state=42, shuffle=True)
        encoder = AnalysisService._build_feature_encoder(train_records)
        x_train = [AnalysisService._features_for_item(item, encoder) for item in train_records]
        y_train = [item["unit_price"] for item in train_records]
        x_test = [AnalysisService._features_for_item(item, encoder) for item in test_records]
        y_test = [item["unit_price"] for item in test_records]

        model_specs = [
            (
                "RandomForestRegressor 集成树",
                "sklearn.ensemble.RandomForestRegressor",
                RandomForestRegressor(
                    n_estimators=120,
                    max_depth=16,
                    min_samples_leaf=3,
                    random_state=42,
                    n_jobs=1,
                ),
            ),
            (
                "GradientBoostingRegressor GBDT",
                "sklearn.ensemble.GradientBoostingRegressor",
                GradientBoostingRegressor(
                    n_estimators=180,
                    learning_rate=0.05,
                    max_depth=3,
                    min_samples_leaf=5,
                    random_state=42,
                ),
            ),
            (
                "HistGradientBoostingRegressor 直方图GBDT",
                "sklearn.ensemble.HistGradientBoostingRegressor",
                HistGradientBoostingRegressor(
                    max_iter=180,
                    learning_rate=0.06,
                    max_leaf_nodes=31,
                    l2_regularization=0.01,
                    random_state=42,
                ),
            ),
        ]

        candidates = []
        failed_candidates = []
        for model_name, algorithm, model in model_specs:
            try:
                model.fit(x_train, y_train)
                y_pred = model.predict(x_test)
                rmse = math.sqrt(mean_squared_error(y_test, y_pred))
                mape = mean(abs(_safe_div(actual - pred, actual)) for actual, pred in zip(y_test, y_pred)) * 100
                candidates.append(
                    {
                        "model_name": model_name,
                        "algorithm": algorithm,
                        "model": model,
                        "y_pred": y_pred,
                        "source_metrics": AnalysisService._segment_metrics(test_records, y_test, y_pred, "source"),
                        "metrics": {
                            "status": "ok",
                            "target": "unit_price",
                            "target_label": "挂牌单价（元/平方米）",
                            "sample_count": source_sample_count,
                            "training_sample_count": len(records),
                            "excluded_count": exclusion["excluded_count"],
                            "train_count": len(train_records),
                            "test_count": len(test_records),
                            "feature_count": len(encoder["feature_names"]),
                            "mae": _round(mean_absolute_error(y_test, y_pred), 2),
                            "rmse": _round(rmse, 2),
                            "r2": _round(r2_score(y_test, y_pred), 4),
                            "mape": _round(mape, 2),
                        },
                    }
                )
            except Exception as exc:
                failed_candidates.append(
                    {
                        "model_name": model_name,
                        "algorithm": algorithm,
                        "metrics": {
                            "status": "failed",
                            "sample_count": source_sample_count,
                            "training_sample_count": len(records),
                            "excluded_count": exclusion["excluded_count"],
                            "train_count": len(train_records),
                            "test_count": len(test_records),
                            "feature_count": len(encoder["feature_names"]),
                            "error": str(exc),
                        },
                    }
                )

        segmented = AnalysisService._source_segmented_regression_candidate(
            train_records=train_records,
            test_records=test_records,
            x_train=x_train,
            y_train=y_train,
            x_test=x_test,
            y_test=y_test,
            feature_count=len(encoder["feature_names"]),
            source_sample_count=source_sample_count,
            excluded_count=exclusion["excluded_count"],
        )
        if segmented:
            candidates.append(segmented)

        if not candidates:
            failed_names = ", ".join(item["model_name"] for item in failed_candidates)
            raise RuntimeError(f"全部 sklearn 候选模型训练失败: {failed_names or 'unknown'}")

        candidates.sort(
            key=lambda item: (
                float(item["metrics"].get("r2") or -9999),
                -float(item["metrics"].get("rmse") or 999999999),
                -float(item["metrics"].get("mae") or 999999999),
            ),
            reverse=True,
        )
        for index, item in enumerate(candidates, start=1):
            item["metrics"]["rank"] = index
            item["metrics"]["is_best"] = index == 1
        for item in failed_candidates:
            item["metrics"]["rank"] = None
            item["metrics"]["is_best"] = False

        best = candidates[0]
        comparison = [
            {
                "model_name": item["model_name"],
                "algorithm": item["algorithm"],
                **item["metrics"],
            }
            for item in [*candidates, *failed_candidates]
        ]

        best_result = AnalysisService._build_best_regression_result(
            best=best,
            comparison=comparison,
            encoder=encoder,
            test_records=test_records,
            y_test=y_test,
            exclusion=exclusion,
        )
        candidate_results = [
            AnalysisService._build_regression_candidate_result(item, comparison, encoder, exclusion)
            for item in [*candidates, *failed_candidates]
        ]
        return [best_result, *candidate_results]

    @staticmethod
    def _sklearn_tuned_regression_results(
        records: list[dict],
        source_sample_count: int | None = None,
        exclusion: dict | None = None,
    ) -> list[dict]:
        from sklearn.ensemble import GradientBoostingRegressor
        from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
        from sklearn.model_selection import RandomizedSearchCV, train_test_split

        source_sample_count = source_sample_count or len(records)
        exclusion = exclusion or AnalysisService._empty_exclusion()
        train_records, test_records = train_test_split(records, test_size=0.2, random_state=42, shuffle=True)
        encoder = AnalysisService._build_feature_encoder(train_records)
        x_train = [AnalysisService._features_for_item(item, encoder) for item in train_records]
        y_train = [item["unit_price"] for item in train_records]
        x_test = [AnalysisService._features_for_item(item, encoder) for item in test_records]
        y_test = [item["unit_price"] for item in test_records]

        cv_folds = 3 if len(train_records) >= 12 else 2
        search_space = {
            "n_estimators": [100, 160, 220],
            "learning_rate": [0.03, 0.05, 0.08],
            "max_depth": [2, 3, 4],
            "min_samples_leaf": [3, 5, 8],
            "subsample": [0.8, 1.0],
        }
        search = RandomizedSearchCV(
            estimator=GradientBoostingRegressor(random_state=42),
            param_distributions=search_space,
            n_iter=6,
            scoring="neg_root_mean_squared_error",
            cv=cv_folds,
            random_state=42,
            n_jobs=1,
        )
        search.fit(x_train, y_train)

        def evaluate_candidate(model_name: str, algorithm: str, model, extra_metrics: dict | None = None) -> dict:
            model.fit(x_train, y_train)
            y_pred = model.predict(x_test)
            rmse = math.sqrt(mean_squared_error(y_test, y_pred))
            mape = mean(abs(_safe_div(actual - pred, actual)) for actual, pred in zip(y_test, y_pred)) * 100
            metrics = {
                "status": "ok",
                "target": "unit_price",
                "target_label": "挂牌单价（元/平方米）",
                "sample_count": source_sample_count,
                "training_sample_count": len(records),
                "excluded_count": exclusion["excluded_count"],
                "train_count": len(train_records),
                "test_count": len(test_records),
                "feature_count": len(encoder["feature_names"]),
                "mae": _round(mean_absolute_error(y_test, y_pred), 2),
                "rmse": _round(rmse, 2),
                "r2": _round(r2_score(y_test, y_pred), 4),
                "mape": _round(mape, 2),
            }
            if extra_metrics:
                metrics.update(extra_metrics)
            return {
                "model_name": model_name,
                "algorithm": algorithm,
                "model": model,
                "y_pred": y_pred,
                "source_metrics": AnalysisService._segment_metrics(test_records, y_test, y_pred, "source"),
                "metrics": metrics,
            }

        baseline_candidate = evaluate_candidate(
            "GradientBoostingRegressor 默认参数基线",
            "sklearn.ensemble.GradientBoostingRegressor",
            GradientBoostingRegressor(
                n_estimators=180,
                learning_rate=0.05,
                max_depth=3,
                min_samples_leaf=5,
                random_state=42,
            ),
            {"tuning_status": "baseline"},
        )
        best_params = {
            key: value.item() if hasattr(value, "item") else value
            for key, value in search.best_params_.items()
        }
        tuned_candidate = evaluate_candidate(
            "GradientBoostingRegressor 参数搜索最优模型",
            "sklearn.model_selection.RandomizedSearchCV -> sklearn.ensemble.GradientBoostingRegressor",
            search.best_estimator_,
            {
                "tuning_status": "searched",
                "cv_folds": cv_folds,
                "search_candidates": len(search.cv_results_.get("params", [])),
                "cv_best_rmse": _round(-float(search.best_score_), 2),
                "best_params": best_params,
            },
        )

        candidates = [tuned_candidate, baseline_candidate]
        candidates.sort(
            key=lambda item: (
                float(item["metrics"].get("r2") or -9999),
                -float(item["metrics"].get("rmse") or 999999999),
                -float(item["metrics"].get("mae") or 999999999),
            ),
            reverse=True,
        )
        for index, item in enumerate(candidates, start=1):
            item["metrics"]["rank"] = index
            item["metrics"]["is_best"] = index == 1

        comparison = [
            {
                "model_name": item["model_name"],
                "algorithm": item["algorithm"],
                **item["metrics"],
            }
            for item in candidates
        ]
        best = candidates[0]
        best_result = AnalysisService._build_best_regression_result(
            best=best,
            comparison=comparison,
            encoder=encoder,
            test_records=test_records,
            y_test=y_test,
            exclusion=exclusion,
        )
        best_result["summary"] = (
            "已执行 GradientBoostingRegressor 受控参数搜索，并与默认参数基线在同一测试集上对比。"
            if best["metrics"].get("tuning_status") == "searched"
            else "已执行参数搜索，但默认参数基线在当前样本上更优，因此未强行替换为搜索结果。"
        )
        best_result["metrics"].update(
            {
                "search_candidates": tuned_candidate["metrics"]["search_candidates"],
                "cv_folds": tuned_candidate["metrics"]["cv_folds"],
                "cv_best_rmse": tuned_candidate["metrics"]["cv_best_rmse"],
                "best_params": best_params,
                "baseline_r2": baseline_candidate["metrics"]["r2"],
                "baseline_rmse": baseline_candidate["metrics"]["rmse"],
                "tuned_r2": tuned_candidate["metrics"]["r2"],
                "tuned_rmse": tuned_candidate["metrics"]["rmse"],
                "improved_vs_baseline": tuned_candidate["metrics"]["r2"] >= baseline_candidate["metrics"]["r2"],
            }
        )
        best_result["artifacts"].update(
            {
                "tuning": {
                    "status": "completed",
                    "search_algorithm": "sklearn.model_selection.RandomizedSearchCV",
                    "base_estimator": "sklearn.ensemble.GradientBoostingRegressor",
                    "cv_folds": cv_folds,
                    "n_iter": 6,
                    "search_space": search_space,
                    "best_params": best_params,
                    "best_cv_rmse": tuned_candidate["metrics"]["cv_best_rmse"],
                    "baseline_model": baseline_candidate["model_name"],
                    "baseline_r2": baseline_candidate["metrics"]["r2"],
                    "baseline_rmse": baseline_candidate["metrics"]["rmse"],
                    "tuned_r2": tuned_candidate["metrics"]["r2"],
                    "tuned_rmse": tuned_candidate["metrics"]["rmse"],
                }
            }
        )
        best_result["evidence"].update(
            {
                "tuning_search": {
                    "algorithm": "sklearn.model_selection.RandomizedSearchCV",
                    "base_estimator": "sklearn.ensemble.GradientBoostingRegressor",
                    "scoring": "neg_root_mean_squared_error",
                    "cv_folds": cv_folds,
                    "n_iter": 6,
                    "search_space": search_space,
                    "best_params": best_params,
                }
            }
        )
        candidate_results = [
            AnalysisService._build_regression_candidate_result(item, comparison, encoder, exclusion)
            for item in candidates
        ]
        return [best_result, *candidate_results]

    @staticmethod
    def _source_segmented_regression_candidate(
        train_records: list[dict],
        test_records: list[dict],
        x_train: list[list[float]],
        y_train: list[float],
        x_test: list[list[float]],
        y_test: list[float],
        feature_count: int,
        source_sample_count: int,
        excluded_count: int,
    ) -> dict | None:
        from sklearn.ensemble import RandomForestRegressor
        from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

        min_segment_train_count = 30 if len(train_records) >= 200 else 3
        global_model = RandomForestRegressor(
            n_estimators=100,
            max_depth=14,
            min_samples_leaf=3,
            random_state=42,
            n_jobs=1,
        )
        global_model.fit(x_train, y_train)

        indexes_by_source: dict[str, list[int]] = defaultdict(list)
        for index, item in enumerate(train_records):
            indexes_by_source[str(item.get("source") or "unknown")].append(index)

        segment_models = {}
        source_model_details = []
        for source, indexes in sorted(indexes_by_source.items()):
            detail = {"source": source, "train_count": len(indexes), "model": "global_fallback"}
            if len(indexes) >= min_segment_train_count:
                model = RandomForestRegressor(
                    n_estimators=80,
                    max_depth=12,
                    min_samples_leaf=2,
                    random_state=42,
                    n_jobs=1,
                )
                model.fit([x_train[index] for index in indexes], [y_train[index] for index in indexes])
                segment_models[source] = model
                detail["model"] = "source_random_forest"
            source_model_details.append(detail)

        if not segment_models:
            return None

        y_pred = []
        fallback_prediction_count = 0
        for item, features in zip(test_records, x_test):
            source = str(item.get("source") or "unknown")
            model = segment_models.get(source)
            if model is None:
                model = global_model
                fallback_prediction_count += 1
            y_pred.append(float(model.predict([features])[0]))

        rmse = math.sqrt(mean_squared_error(y_test, y_pred))
        mape = mean(abs(_safe_div(actual - pred, actual)) for actual, pred in zip(y_test, y_pred)) * 100
        return {
            "model_name": "SourceSegmentedRandomForest 来源分层模型",
            "algorithm": "custom.source_segmented.RandomForestRegressor",
            "model": global_model,
            "y_pred": y_pred,
            "source_metrics": AnalysisService._segment_metrics(test_records, y_test, y_pred, "source"),
            "source_model_details": source_model_details,
            "metrics": {
                "status": "ok",
                "target": "unit_price",
                "target_label": "挂牌单价（元/平方米）",
                "sample_count": source_sample_count,
                "training_sample_count": len(train_records),
                "excluded_count": excluded_count,
                "train_count": len(train_records),
                "test_count": len(test_records),
                "feature_count": feature_count,
                "source_segment_count": len(segment_models),
                "segment_min_train_count": min_segment_train_count,
                "fallback_prediction_count": fallback_prediction_count,
                "mae": _round(mean_absolute_error(y_test, y_pred), 2),
                "rmse": _round(rmse, 2),
                "r2": _round(r2_score(y_test, y_pred), 4),
                "mape": _round(mape, 2),
            },
        }

    @staticmethod
    def _build_best_regression_result(
        best: dict,
        comparison: list[dict],
        encoder: dict,
        test_records: list[dict],
        y_test: list[float],
        exclusion: dict,
    ) -> dict:
        y_pred = best["y_pred"]
        predictions = []
        for item, predicted in zip(test_records[:100], y_pred[:100]):
            actual = item["unit_price"]
            predictions.append(
                {
                    "id": item["id"],
                    "title": item["title"],
                    "district": item["district"],
                    "actual": _round(actual, 2),
                    "predicted": _round(predicted, 2),
                    "deviation_rate": _round(_safe_div(actual - predicted, actual) * 100, 2),
                }
            )

        importance_items = AnalysisService._sklearn_feature_importance(
            best["model"],
            encoder["feature_names"],
            [AnalysisService._features_for_item(item, encoder) for item in test_records],
            y_test,
        )
        return {
            "result_type": "regression",
            "model_name": best["model_name"],
            "summary": "已完成 RandomForest、GBDT、HistGBDT 多模型对比，并自动选择测试集 R² 最优模型作为当前挂牌单价辅助估计模型。",
            "metrics": best["metrics"],
            "artifacts": {
                "feature_importance": importance_items[:30],
                "predictions": predictions,
                "model_comparison": comparison,
                "source_metrics": best.get("source_metrics", []),
                "source_model_details": best.get("source_model_details", []),
                "excluded_samples": exclusion["samples"],
                "exclusion_policy": exclusion["policy"],
                "selection_rule": "按测试集 R² 降序择优；R² 相同则优先 RMSE/MAE 更低的模型。",
                "model_note": "该模型用于解释挂牌价影响因素和辅助估价，不代表成交价预测。",
            },
            "evidence": {
                "filters": AnalysisService._default_filters(),
                "feature_groups": AnalysisService._feature_groups(),
                "features": encoder["feature_names"],
                "target_encoding": encoder.get("target_encoding_note"),
                "house_age_policy": encoder.get("house_age_policy"),
                "exclusion_policy": exclusion["policy"],
                "algorithm": best["algorithm"],
                "candidate_algorithms": [item["algorithm"] for item in comparison],
                "split_rule": "train_test_split(test_size=0.2, random_state=42)，保证结果可复现。",
            },
        }

    @staticmethod
    def _build_regression_candidate_result(candidate: dict, comparison: list[dict], encoder: dict, exclusion: dict) -> dict:
        return {
            "result_type": "regression_candidate",
            "model_name": candidate["model_name"],
            "summary": "多模型回归候选结果，供模型对比和自动择优审计使用。",
            "metrics": candidate["metrics"],
            "artifacts": {
                "model_comparison": comparison,
                "source_metrics": candidate.get("source_metrics", []),
                "source_model_details": candidate.get("source_model_details", []),
                "excluded_samples": exclusion["samples"],
                "exclusion_policy": exclusion["policy"],
                "model_note": "候选模型指标已落库；最终页面和 Agent 默认读取 result_type=regression 的最佳模型。",
            },
            "evidence": {
                "filters": AnalysisService._default_filters(),
                "feature_groups": AnalysisService._feature_groups(),
                "features": encoder["feature_names"],
                "target_encoding": encoder.get("target_encoding_note"),
                "house_age_policy": encoder.get("house_age_policy"),
                "exclusion_policy": exclusion["policy"],
                "algorithm": candidate["algorithm"],
                "selection_rule": "候选模型参与同一训练/测试切分下的 R²、RMSE、MAE 对比。",
            },
        }

    @staticmethod
    def _sklearn_feature_importance(model, feature_names: list[str], x_test: list[list[float]], y_test: list[float]) -> list[dict]:
        importances = getattr(model, "feature_importances_", None)
        if importances is None:
            try:
                from sklearn.inspection import permutation_importance

                sample_size = min(300, len(x_test))
                result = permutation_importance(
                    model,
                    x_test[:sample_size],
                    y_test[:sample_size],
                    n_repeats=5,
                    random_state=42,
                    n_jobs=1,
                )
                importances = result.importances_mean
            except Exception:
                importances = []
        importance_items = [
            {"feature": feature_names[index], "importance": _round(max(0.0, float(value)), 4)}
            for index, value in enumerate(importances)
        ]
        importance_items.sort(key=lambda item: item["importance"], reverse=True)
        return importance_items

    @staticmethod
    def _segment_metrics(records: list[dict], actual: list[float], predicted, field: str) -> list[dict]:
        groups: dict[str, list[tuple[float, float]]] = defaultdict(list)
        for item, y_true, y_pred in zip(records, actual, predicted):
            groups[str(item.get(field) or "unknown")].append((float(y_true), float(y_pred)))
        rows = []
        for name, pairs in groups.items():
            if not pairs:
                continue
            segment_actual = [pair[0] for pair in pairs]
            segment_pred = [pair[1] for pair in pairs]
            mae = mean(abs(a - p) for a, p in pairs)
            rmse = math.sqrt(mean((a - p) ** 2 for a, p in pairs))
            actual_mean = mean(segment_actual)
            sse = sum((a - p) ** 2 for a, p in pairs)
            sst = sum((a - actual_mean) ** 2 for a in segment_actual)
            rows.append(
                {
                    field: name,
                    "count": len(pairs),
                    "mae": _round(mae, 2),
                    "rmse": _round(rmse, 2),
                    "r2": _round(1 - _safe_div(sse, sst), 4) if len(pairs) >= 2 and sst > 1e-9 else None,
                    "avg_actual": _round(mean(segment_actual), 2),
                    "avg_predicted": _round(mean(segment_pred), 2),
                }
            )
        rows.sort(key=lambda item: item["count"], reverse=True)
        return rows

    @staticmethod
    def _cluster_result(records: list[dict]) -> dict:
        if len(records) < 4:
            return {
                "result_type": "cluster",
                "model_name": "KMeans 价值分层",
                "summary": "可用样本少于 4 条，暂不进行聚类分层。",
                "metrics": {"status": "insufficient_sample", "sample_count": len(records), "cluster_count": 0},
                "artifacts": {"clusters": [], "points": []},
                "evidence": {
                    "features": ["挂牌单价", "面积"],
                    "house_age_policy": AnalysisService._house_age_policy(False, None),
                },
            }

        try:
            return AnalysisService._sklearn_cluster_result(records)
        except Exception as exc:
            result = AnalysisService._deterministic_cluster_result(records)
            result["summary"] = f"{result['summary']}；sklearn KMeans 失败，已使用确定性 KMeans 兜底。"
            result["evidence"]["fallback_reason"] = str(exc)
            return result

    @staticmethod
    def _sklearn_cluster_result(records: list[dict]) -> dict:
        from sklearn.cluster import KMeans
        from sklearn.metrics import silhouette_score
        from sklearn.preprocessing import StandardScaler

        house_age_fill = AnalysisService._house_age_fill(records)
        use_house_age = house_age_fill is not None
        feature_names = ["挂牌单价", "挂牌总价", "面积"]
        features = []
        for item in records:
            row = [item["unit_price"], item["total_price"], item["area"]]
            if use_house_age:
                row.append(AnalysisService._house_age_for_model(item, house_age_fill))
            features.append(row)
        if use_house_age:
            feature_names.append("房龄（缺失按样本中位数填补）")
        scaler = StandardScaler()
        scaled = scaler.fit_transform(features)
        max_k = min(4, len(records) - 1)
        min_k = 2
        candidates = []
        for k in range(min_k, max_k + 1):
            model = KMeans(n_clusters=k, n_init=10, random_state=42)
            labels = model.fit_predict(scaled)
            score = silhouette_score(scaled, labels) if len(set(labels)) > 1 else -1
            candidates.append((score, k, labels, model))
        score, k, labels, model = max(candidates, key=lambda item: item[0])

        grouped: dict[int, list[dict]] = defaultdict(list)
        for item, cluster_id in zip(records, labels):
            grouped[int(cluster_id)].append(item)

        ordered_clusters = sorted(grouped.keys(), key=lambda cid: mean(item["unit_price"] for item in grouped[cid]))
        label_map = {cluster_id: CLUSTER_LABELS[min(index, len(CLUSTER_LABELS) - 1)] for index, cluster_id in enumerate(ordered_clusters)}

        profiles = []
        for cluster_id in ordered_clusters:
            items = grouped[cluster_id]
            profiles.append(
                {
                    "cluster": cluster_id,
                    "label": label_map[cluster_id],
                    "count": len(items),
                    "avg_unit_price": _round(mean(item["unit_price"] for item in items), 2),
                    "avg_total_price": _round(mean(item["total_price"] for item in items), 2),
                    "avg_area": _round(mean(item["area"] for item in items), 2),
                    "avg_house_age": AnalysisService._optional_mean(item.get("house_age") for item in items),
                    "top_districts": Counter(item["district"] for item in items).most_common(3),
                }
            )

        points = [
            {
                "id": item["id"],
                "title": item["title"],
                "district": item["district"],
                "unit_price": _round(item["unit_price"], 2),
                "area": _round(item["area"], 2),
                "house_age": _round(_numeric_or_none(item.get("house_age")), 2),
                "cluster": int(labels[index]),
                "label": label_map[int(labels[index])],
            }
            for index, item in enumerate(records[:250])
        ]

        centers = []
        raw_centers = scaler.inverse_transform(model.cluster_centers_)
        for center in raw_centers:
            centers.append(
                {
                    "unit_price": _round(center[0], 2),
                    "total_price": _round(center[1], 2),
                    "area": _round(center[2], 2),
                    "house_age": _round(center[3], 2) if use_house_age else None,
                }
            )

        return {
            "result_type": "cluster",
            "model_name": "sklearn KMeans 价值分层",
            "summary": f"按{ '、'.join(feature_names[:3]) }等特征自动选择 {k} 个价值层级，轮廓系数为 {_round(score, 4)}。",
            "metrics": {
                "status": "ok",
                "sample_count": len(records),
                "cluster_count": k,
                "silhouette_score": _round(score, 4),
                "candidate_k": [item[1] for item in candidates],
                "algorithm": "sklearn.cluster.KMeans",
            },
            "artifacts": {"clusters": profiles, "points": points, "centers": centers},
            "evidence": {
                "features": feature_names,
                "house_age_policy": AnalysisService._house_age_policy(use_house_age, house_age_fill),
                "algorithm": "sklearn.cluster.KMeans",
                "scaler": "sklearn.preprocessing.StandardScaler",
                "selection_rule": "在 k=2..4 中按 silhouette_score 选择最优分层数。",
            },
        }

    @staticmethod
    def _deterministic_cluster_result(records: list[dict]) -> dict:
        k = 4 if len(records) >= 8 else max(2, min(3, len(records)))
        assignments, centers, feature_names, house_age_fill = AnalysisService._kmeans(records, k=k)
        grouped: dict[int, list[dict]] = defaultdict(list)
        for item, cluster_id in zip(records, assignments):
            grouped[cluster_id].append(item)

        ordered_clusters = sorted(grouped.keys(), key=lambda cid: mean(item["unit_price"] for item in grouped[cid]))
        label_map = {cluster_id: CLUSTER_LABELS[min(index, len(CLUSTER_LABELS) - 1)] for index, cluster_id in enumerate(ordered_clusters)}

        profiles = []
        for cluster_id in ordered_clusters:
            items = grouped[cluster_id]
            profiles.append(
                {
                    "cluster": cluster_id,
                    "label": label_map[cluster_id],
                    "count": len(items),
                    "avg_unit_price": _round(mean(item["unit_price"] for item in items), 2),
                    "avg_total_price": _round(mean(item["total_price"] for item in items), 2),
                    "avg_area": _round(mean(item["area"] for item in items), 2),
                    "avg_house_age": AnalysisService._optional_mean(item.get("house_age") for item in items),
                    "top_districts": Counter(item["district"] for item in items).most_common(3),
                }
            )

        points = [
            {
                "id": item["id"],
                "title": item["title"],
                "district": item["district"],
                "unit_price": _round(item["unit_price"], 2),
                "area": _round(item["area"], 2),
                "house_age": _round(_numeric_or_none(item.get("house_age")), 2),
                "cluster": assignments[index],
                "label": label_map[assignments[index]],
            }
            for index, item in enumerate(records[:250])
        ]

        return {
            "result_type": "cluster",
            "model_name": "KMeans 价值分层",
            "summary": f"按{ '、'.join(feature_names) }将有效样本划分为 {k} 类，用于识别不同价值层级。",
            "metrics": {"status": "ok", "sample_count": len(records), "cluster_count": k, "iterations": 15},
            "artifacts": {"clusters": profiles, "points": points, "centers": centers},
            "evidence": {
                "features": feature_names,
                "house_age_policy": AnalysisService._house_age_policy(house_age_fill is not None, house_age_fill),
                "algorithm": "deterministic_kmeans",
            },
        }

    @staticmethod
    def _anomaly_result(records: list[dict]) -> dict:
        if len(records) < 5:
            return {
                "result_type": "anomaly",
                "model_name": "挂牌价异常检测",
                "summary": "可用样本少于 5 条，暂不输出异常检测结论。",
                "metrics": {"status": "insufficient_sample", "sample_count": len(records), "anomaly_count": 0},
                "artifacts": {"items": []},
                "evidence": {"threshold": "区县均值偏离 30% 或全局 z-score 绝对值不低于 2.5"},
            }

        try:
            return AnalysisService._isolation_forest_anomaly_result(records)
        except Exception as exc:
            result = AnalysisService._rule_anomaly_result(records)
            result["summary"] = f"{result['summary']}；IsolationForest 失败，已使用规则阈值兜底。"
            result["evidence"]["fallback_reason"] = str(exc)
            return result

    @staticmethod
    def _isolation_forest_anomaly_result(records: list[dict]) -> dict:
        from sklearn.ensemble import IsolationForest
        from sklearn.preprocessing import StandardScaler

        house_age_fill = AnalysisService._house_age_fill(records)
        use_house_age = house_age_fill is not None
        feature_names = ["挂牌单价", "挂牌总价", "面积", "楼层等级"]
        features = []
        for item in records:
            row = [item["unit_price"], item["total_price"], item["area"], item["floor_score"]]
            if use_house_age:
                row.append(AnalysisService._house_age_for_model(item, house_age_fill))
            features.append(row)
        if use_house_age:
            feature_names.append("房龄（缺失按样本中位数填补）")
        scaled = StandardScaler().fit_transform(features)
        contamination = min(0.08, max(0.02, 10 / max(len(records), 1)))
        model = IsolationForest(n_estimators=160, contamination=contamination, random_state=42)
        labels = model.fit_predict(scaled)
        scores = model.decision_function(scaled)

        global_mean = mean(item["unit_price"] for item in records)
        global_std = math.sqrt(mean((item["unit_price"] - global_mean) ** 2 for item in records)) or 1.0
        district_groups = AnalysisService._group_by(records, "district")
        district_means = {district: mean(item["unit_price"] for item in items) for district, items in district_groups.items()}

        anomalies = []
        model_anomaly_count = 0
        rule_anomaly_count = 0
        for item, label, score in zip(records, labels, scores):
            district_mean = district_means.get(item["district"], global_mean)
            expected = 0.75 * district_mean + 0.25 * global_mean
            deviation_rate = _safe_div(item["unit_price"] - expected, expected) * 100
            z_score = _safe_div(item["unit_price"] - global_mean, global_std)
            model_flag = int(label) == -1
            rule_flag = abs(deviation_rate) >= 50 and abs(z_score) >= 2.5
            if not model_flag and not rule_flag:
                continue

            reasons = []
            if model_flag:
                model_anomaly_count += 1
                reasons.append("IsolationForest 判定为孤立样本")
            if rule_flag:
                rule_anomaly_count += 1
                direction = "高于" if deviation_rate > 0 else "低于"
                reasons.append(
                    f"挂牌单价{direction}区县基准 {abs(deviation_rate):.1f}%，且全局 z-score={z_score:.2f}"
                )
            if item["area"] <= 30 or item["area"] >= 300:
                reasons.append("面积处于极端区间")
            anomalies.append(
                {
                    "id": item["id"],
                    "title": item["title"],
                    "district": item["district"],
                    "actual_unit_price": _round(item["unit_price"], 2),
                    "expected_unit_price": _round(expected, 2),
                    "deviation_rate": _round(deviation_rate, 2),
                    "z_score": _round(z_score, 3),
                    "isolation_score": _round(float(score), 5),
                    "severity": "high" if model_flag and rule_flag else "medium",
                    "detection_flags": {"isolation_forest": model_flag, "strong_rule": rule_flag},
                    "reason": "；".join(reasons),
                }
            )

        anomalies.sort(key=lambda item: (item["severity"] == "high", -item["isolation_score"], abs(item["deviation_rate"])), reverse=True)
        return {
            "result_type": "anomaly",
            "model_name": "IsolationForest 挂牌价异常检测",
            "summary": f"使用 IsolationForest 与区县基准规则识别到 {len(anomalies)} 条需人工复核的挂牌价异常样本。",
            "metrics": {
                "status": "ok",
                "sample_count": len(records),
                "anomaly_count": len(anomalies),
                "anomaly_rate": _round(_safe_div(len(anomalies), len(records)), 4),
                "model_anomaly_count": model_anomaly_count,
                "strong_rule_count": rule_anomaly_count,
                "contamination": _round(contamination, 4),
                "threshold_deviation_rate": 50,
                "threshold_z_score": 2.5,
                "algorithm": "sklearn.ensemble.IsolationForest",
            },
            "artifacts": {"items": anomalies[:100]},
            "evidence": {
                "features": feature_names,
                "house_age_policy": AnalysisService._house_age_policy(use_house_age, house_age_fill),
                "algorithm": "sklearn.ensemble.IsolationForest",
                "scaler": "sklearn.preprocessing.StandardScaler",
                "threshold": "IsolationForest 孤立样本，或同时满足区县基准偏离 50% 与全局 z-score 绝对值不低于 2.5",
                "note": "异常保留用于人工复核，默认不物理删除。",
            },
        }

    @staticmethod
    def _rule_anomaly_result(records: list[dict]) -> dict:
        global_mean = mean(item["unit_price"] for item in records)
        global_std = math.sqrt(mean((item["unit_price"] - global_mean) ** 2 for item in records)) or 1.0
        district_groups = AnalysisService._group_by(records, "district")
        district_means = {district: mean(item["unit_price"] for item in items) for district, items in district_groups.items()}

        anomalies = []
        for item in records:
            district_mean = district_means.get(item["district"], global_mean)
            expected = 0.75 * district_mean + 0.25 * global_mean
            deviation_rate = _safe_div(item["unit_price"] - expected, expected) * 100
            z_score = _safe_div(item["unit_price"] - global_mean, global_std)
            reasons = []
            if abs(deviation_rate) >= 50 and abs(z_score) >= 2.5:
                direction = "高于" if deviation_rate > 0 else "低于"
                reasons.append(
                    f"挂牌单价{direction}区县基准 {abs(deviation_rate):.1f}%，且全局 z-score={z_score:.2f}"
                )
            if item["area"] <= 30 or item["area"] >= 300:
                if abs(z_score) >= 2.5:
                    reasons.append("面积处于极端区间且挂牌单价偏离明显")
            if not reasons:
                continue
            anomalies.append(
                {
                    "id": item["id"],
                    "title": item["title"],
                    "district": item["district"],
                    "actual_unit_price": _round(item["unit_price"], 2),
                    "expected_unit_price": _round(expected, 2),
                    "deviation_rate": _round(deviation_rate, 2),
                    "z_score": _round(z_score, 3),
                    "severity": "high" if abs(deviation_rate) >= 50 or abs(z_score) >= 3 else "medium",
                    "reason": "；".join(reasons),
                }
            )

        anomalies.sort(key=lambda item: (item["severity"] == "high", abs(item["deviation_rate"])), reverse=True)
        return {
            "result_type": "anomaly",
            "model_name": "挂牌价异常检测",
            "summary": f"检测到 {len(anomalies)} 条需人工复核的挂牌价异常样本。",
            "metrics": {
                "status": "ok",
                "sample_count": len(records),
                "anomaly_count": len(anomalies),
                "anomaly_rate": _round(_safe_div(len(anomalies), len(records)), 4),
                "threshold_deviation_rate": 50,
                "threshold_z_score": 2.5,
            },
            "artifacts": {"items": anomalies[:100]},
            "evidence": {
                "threshold": "区县基准偏离 50% 且全局 z-score 绝对值不低于 2.5；面积极端样本还需同时满足价格偏离条件",
                "note": "异常保留用于人工复核，默认不物理删除。",
            },
        }

    @staticmethod
    def _fit_ridge(records: list[dict]) -> dict:
        encoder = AnalysisService._build_feature_encoder(records)
        raw_features = [AnalysisService._features_for_item(item, encoder) for item in records]
        means = [mean(column) for column in zip(*raw_features)]
        stds = [
            math.sqrt(mean((value - means[index]) ** 2 for value in column)) or 1.0
            for index, column in enumerate(zip(*raw_features))
        ]
        x_rows = [[1.0] + [(value - means[index]) / stds[index] for index, value in enumerate(row)] for row in raw_features]
        y_values = [item["unit_price"] for item in records]
        coefficients = AnalysisService._ridge_solve(x_rows, y_values, regularization=1.0)
        return {
            "coefficients": coefficients,
            "feature_means": means,
            "feature_stds": stds,
            "encoder": encoder,
            "feature_names": encoder["feature_names"],
        }

    @staticmethod
    def _predict(model: dict, records: list[dict]) -> list[dict]:
        predictions = []
        for item in records:
            raw = AnalysisService._features_for_item(item, model["encoder"])
            features = [1.0] + [
                (value - model["feature_means"][index]) / model["feature_stds"][index]
                for index, value in enumerate(raw)
            ]
            predicted = sum(coef * value for coef, value in zip(model["coefficients"], features))
            predicted = max(1000.0, min(100000.0, predicted))
            actual = item["unit_price"]
            predictions.append(
                {
                    "id": item["id"],
                    "title": item["title"],
                    "district": item["district"],
                    "actual": _round(actual, 2),
                    "predicted": _round(predicted, 2),
                    "deviation_rate": _round(_safe_div(actual - predicted, actual) * 100, 2),
                }
            )
        return predictions

    @staticmethod
    def _feature_importance(model: dict, train_records: list[dict]) -> list[dict]:
        coef_scores = [abs(value) for value in model["coefficients"][1:]]
        y_values = [item["unit_price"] for item in train_records]
        raw_columns = list(zip(*(AnalysisService._features_for_item(item, model["encoder"]) for item in train_records)))
        corr_scores = [abs(_pearson(list(column), y_values)) for column in raw_columns]
        scores = [
            coef_scores[index] * 0.6 + corr_scores[index] * 1000 * 0.4
            for index in range(len(model["feature_names"]))
        ]
        total = sum(scores) or 1.0
        items = [
            {"feature": model["feature_names"][index], "importance": _round(scores[index] / total, 4)}
            for index in range(len(model["feature_names"]))
        ]
        return sorted(items, key=lambda item: item["importance"], reverse=True)[:30]

    @staticmethod
    def _ridge_solve(x_rows: list[list[float]], y_values: list[float], regularization: float) -> list[float]:
        size = len(x_rows[0])
        matrix = [[0.0 for _ in range(size)] for _ in range(size)]
        vector = [0.0 for _ in range(size)]
        for row, y in zip(x_rows, y_values):
            for i in range(size):
                vector[i] += row[i] * y
                for j in range(size):
                    matrix[i][j] += row[i] * row[j]
        for i in range(1, size):
            matrix[i][i] += regularization
        return AnalysisService._gaussian_elimination(matrix, vector)

    @staticmethod
    def _gaussian_elimination(matrix: list[list[float]], vector: list[float]) -> list[float]:
        size = len(vector)
        augmented = [row[:] + [vector[index]] for index, row in enumerate(matrix)]
        for col in range(size):
            pivot = max(range(col, size), key=lambda row: abs(augmented[row][col]))
            if abs(augmented[pivot][col]) < 1e-9:
                continue
            augmented[col], augmented[pivot] = augmented[pivot], augmented[col]
            divisor = augmented[col][col]
            augmented[col] = [value / divisor for value in augmented[col]]
            for row in range(size):
                if row == col:
                    continue
                factor = augmented[row][col]
                augmented[row] = [
                    value - factor * augmented[col][index]
                    for index, value in enumerate(augmented[row])
                ]
        return [augmented[index][-1] for index in range(size)]

    @staticmethod
    def _optional_mean(values: Iterable[float | int | None]) -> float | None:
        numeric_values = [
            number
            for number in (_numeric_or_none(value) for value in values)
            if number is not None
        ]
        return _round(mean(numeric_values), 2) if numeric_values else None

    @staticmethod
    def _house_age_fill(records: list[dict]) -> float | None:
        values = [
            number
            for number in (_numeric_or_none(item.get("house_age")) for item in records)
            if number is not None
        ]
        return float(median(values)) if values else None

    @staticmethod
    def _house_age_for_model(item: dict, fill_value: float | None) -> float:
        value = _numeric_or_none(item.get("house_age"))
        if value is not None:
            return value
        return float(fill_value or 0.0)

    @staticmethod
    def _house_age_policy(enabled: bool, fill_value: float | None) -> str:
        if not enabled:
            return "当前样本没有可用建成年份/房龄，分析不把未知楼龄当作 0 年。"
        return f"房龄仅作为模型内部特征使用；缺失值按样本中位数 {_round(fill_value, 2)} 年填补，不在展示层解释为真实楼龄。"

    @staticmethod
    def _kmeans(records: list[dict], k: int) -> tuple[list[int], list[dict], list[str], float | None]:
        house_age_fill = AnalysisService._house_age_fill(records)
        use_house_age = house_age_fill is not None
        feature_names = ["挂牌单价", "面积"]
        points = []
        for item in records:
            row = [item["unit_price"], item["area"]]
            if use_house_age:
                row.append(AnalysisService._house_age_for_model(item, house_age_fill))
            points.append(row)
        if use_house_age:
            feature_names.append("房龄（缺失按样本中位数填补）")
        columns = list(zip(*points))
        means = [mean(column) for column in columns]
        stds = [math.sqrt(mean((value - means[index]) ** 2 for value in column)) or 1.0 for index, column in enumerate(columns)]
        scaled = [[(value - means[index]) / stds[index] for index, value in enumerate(point)] for point in points]

        ordered_indexes = sorted(range(len(records)), key=lambda index: records[index]["unit_price"])
        centers = [scaled[ordered_indexes[min(len(ordered_indexes) - 1, round(i * (len(ordered_indexes) - 1) / max(1, k - 1)))]] for i in range(k)]
        assignments = [0 for _ in records]
        for _ in range(15):
            for index, point in enumerate(scaled):
                assignments[index] = min(range(k), key=lambda cid: AnalysisService._distance(point, centers[cid]))
            for cid in range(k):
                members = [point for index, point in enumerate(scaled) if assignments[index] == cid]
                if members:
                    centers[cid] = [mean(column) for column in zip(*members)]

        original_centers = []
        for center in centers:
            original_centers.append(
                {
                    "unit_price": _round(center[0] * stds[0] + means[0], 2),
                    "area": _round(center[1] * stds[1] + means[1], 2),
                    "house_age": _round(center[2] * stds[2] + means[2], 2) if use_house_age else None,
                }
            )
        return assignments, original_centers, feature_names, house_age_fill

    @staticmethod
    def _distance(left: Iterable[float], right: Iterable[float]) -> float:
        return math.sqrt(sum((a - b) ** 2 for a, b in zip(left, right)))

    @staticmethod
    def _build_feature_encoder(records: list[dict]) -> dict:
        global_mean = mean(item["unit_price"] for item in records)
        district_target = AnalysisService._target_encoding(records, "district", global_mean, smoothing=10)
        community_target = AnalysisService._target_encoding(records, "community", global_mean, smoothing=20)
        house_age_fill = AnalysisService._house_age_fill(records)
        categories: dict[str, list[str]] = {}
        for field, _label, limit in CATEGORICAL_FEATURE_CONFIG:
            counter = Counter(AnalysisService._category_value(item, field) for item in records)
            values = [
                value
                for value, _count in counter.most_common(limit)
                if value not in {"unknown", "待复核", "其他"}
            ]
            categories[field] = values

        feature_names = NUMERIC_FEATURE_NAMES[:]
        if house_age_fill is not None:
            feature_names.insert(3, "房龄（缺失按样本中位数填补）")
        for field, label, _limit in CATEGORICAL_FEATURE_CONFIG:
            feature_names.extend(f"{label}={value}" for value in categories[field])
        return {
            "global_mean": global_mean,
            "district_target": district_target,
            "community_target": community_target,
            "house_age_fill": house_age_fill,
            "categories": categories,
            "feature_names": feature_names,
            "target_encoding_note": "区县/楼盘目标编码仅由训练集计算，并使用全局均值平滑；未知楼盘回退到全局均值。",
            "house_age_policy": AnalysisService._house_age_policy(house_age_fill is not None, house_age_fill),
        }

    @staticmethod
    def _features_for_item(item: dict, encoder: dict) -> list[float]:
        district = str(item.get("district") or "待复核")
        community = AnalysisService._normalize_category(item.get("community"))
        district_item = encoder["district_target"].get(district, {})
        community_item = encoder["community_target"].get(community, {})
        features = [
            float(item["area"]),
            float(item["rooms"]),
            float(item["halls"]),
            float(item["floor_score"]),
            float(district_item.get("value", encoder["global_mean"])),
            float(community_item.get("value", encoder["global_mean"])),
            math.log1p(float(district_item.get("count", 0))),
            math.log1p(float(community_item.get("count", 0))),
        ]
        if encoder.get("house_age_fill") is not None:
            features.insert(3, AnalysisService._house_age_for_model(item, encoder["house_age_fill"]))
        for field, _label, _limit in CATEGORICAL_FEATURE_CONFIG:
            value = AnalysisService._category_value(item, field)
            features.extend(1.0 if value == category else 0.0 for category in encoder["categories"][field])
        return features

    @staticmethod
    def _target_encoding(records: list[dict], field: str, global_mean: float, smoothing: float) -> dict[str, dict]:
        groups: dict[str, list[float]] = defaultdict(list)
        for item in records:
            value = AnalysisService._normalize_category(item.get(field)) if field == "community" else str(item.get(field) or "待复核")
            groups[value].append(float(item["unit_price"]))
        encoded = {}
        for value, prices in groups.items():
            count = len(prices)
            encoded[value] = {
                "value": _round((sum(prices) + smoothing * global_mean) / (count + smoothing), 4),
                "count": count,
                "raw_mean": _round(mean(prices), 4),
            }
        return encoded

    @staticmethod
    def _category_value(item: dict, field: str) -> str:
        if field == "layout_bucket":
            return AnalysisService._layout_bucket(item.get("rooms"), item.get("layout"))
        if field == "orientation_bucket":
            return AnalysisService._orientation_bucket(item.get("orientation"))
        if field == "decoration_bucket":
            return AnalysisService._decoration_bucket(item.get("decoration"))
        return AnalysisService._normalize_category(item.get(field))

    @staticmethod
    def _layout_bucket(rooms: float | int | None, layout: str | None) -> str:
        if rooms:
            room_count = int(float(rooms))
            if room_count >= 4:
                return "4室及以上"
            if room_count >= 1:
                return f"{room_count}室"
        text = str(layout or "")
        if "4室" in text or "5室" in text or "6室" in text:
            return "4室及以上"
        for room_count in (1, 2, 3):
            if f"{room_count}室" in text:
                return f"{room_count}室"
        return "unknown"

    @staticmethod
    def _orientation_bucket(value: str | None) -> str:
        text = AnalysisService._normalize_category(value)
        if text == "unknown":
            return text
        for separator in (" ", "/", "、", ",", "，"):
            if separator in text:
                text = text.split(separator)[0]
                break
        for key in ("南北", "东南", "西南", "东北", "西北", "南", "北", "东", "西"):
            if key in text:
                return key
        return text[:12] if text else "unknown"

    @staticmethod
    def _decoration_bucket(value: str | None) -> str:
        text = AnalysisService._normalize_category(value)
        if text == "unknown":
            return text
        for key in ("精装", "简装", "毛坯", "其他"):
            if key in text:
                return key
        return text[:12]

    @staticmethod
    def _normalize_category(value) -> str:
        text = str(value or "").strip()
        if not text or text in {"未知", "暂无", "None", "null"}:
            return "unknown"
        return text[:32]

    @staticmethod
    def _feature_groups() -> list[str]:
        return [
            "数值特征：面积、室数、厅数、楼层等级、区县/楼盘目标编码、样本量强度；房龄仅在样本有有效建成年份时启用",
            "分类特征：来源、区县、户型、朝向、装修、楼层",
            "训练策略：回归训练前排除极端挂牌单价和面积异常样本，EDA/异常检测仍保留原始样本。",
        ]

    @staticmethod
    def _empty_exclusion() -> dict:
        return {
            "excluded_count": 0,
            "samples": [],
            "policy": {
                "enabled": False,
                "reason": "样本不足或未执行过滤",
                "min_sample_count": 50,
                "global_iqr_multiplier": 1.5,
                "district_deviation_threshold": 45,
                "area_extreme_range": [20, 300],
            },
        }

    @staticmethod
    def _filter_regression_records(records: list[dict]) -> tuple[list[dict], dict]:
        policy = {
            "enabled": len(records) >= 50,
            "reason": "样本量达到阈值时，训练前剔除极端挂牌单价、区县明显偏离和面积极端样本。",
            "min_sample_count": 50,
            "global_iqr_multiplier": 1.5,
            "district_deviation_threshold": 45,
            "district_min_count": 10,
            "area_extreme_range": [20, 300],
        }
        if len(records) < policy["min_sample_count"]:
            result = AnalysisService._empty_exclusion()
            result["policy"] = {**policy, "enabled": False, "reason": "样本量不足，未执行训练前异常过滤。"}
            return records, result

        prices = [float(item["unit_price"]) for item in records]
        q1 = _quantile(prices, 0.25) or min(prices)
        q3 = _quantile(prices, 0.75) or max(prices)
        iqr = max(q3 - q1, 1.0)
        lower = max(1000.0, q1 - policy["global_iqr_multiplier"] * iqr)
        upper = min(100000.0, q3 + policy["global_iqr_multiplier"] * iqr)
        district_groups = AnalysisService._group_by(records, "district")
        district_stats = {
            district: {"count": len(items), "mean": mean(item["unit_price"] for item in items)}
            for district, items in district_groups.items()
        }

        kept = []
        excluded = []
        for item in records:
            reasons = []
            unit_price = float(item["unit_price"])
            area = float(item["area"])
            if unit_price < lower or unit_price > upper:
                reasons.append("全局 IQR 极端挂牌单价")
            district_stat = district_stats.get(item["district"])
            if district_stat and district_stat["count"] >= policy["district_min_count"]:
                deviation = abs(_safe_div(unit_price - district_stat["mean"], district_stat["mean"]) * 100)
                if deviation >= policy["district_deviation_threshold"]:
                    reasons.append(f"偏离区县均值 {deviation:.1f}%")
            if area < policy["area_extreme_range"][0] or area > policy["area_extreme_range"][1]:
                reasons.append("面积处于训练极端区间")
            if reasons:
                excluded.append(
                    {
                        "id": item["id"],
                        "title": item["title"],
                        "district": item["district"],
                        "community": item.get("community"),
                        "unit_price": _round(unit_price, 2),
                        "area": _round(area, 2),
                        "reason": "；".join(reasons),
                    }
                )
            else:
                kept.append(item)

        if len(kept) < max(5, int(len(records) * 0.5)):
            return records, {
                "excluded_count": 0,
                "samples": [],
                "policy": {**policy, "enabled": False, "reason": "过滤后样本损失过高，已自动回退为不过滤。"},
            }
        return kept, {
            "excluded_count": len(excluded),
            "samples": excluded[:100],
            "policy": {
                **policy,
                "global_unit_price_range": [_round(lower, 2), _round(upper, 2)],
                "kept_count": len(kept),
            },
        }

    @staticmethod
    def _district_means(records: list[dict]) -> dict[str, float]:
        groups = AnalysisService._group_by(records, "district")
        return {district: mean(item["unit_price"] for item in items) for district, items in groups.items()}

    @staticmethod
    def _group_by(records: list[dict], key: str) -> dict[str, list[dict]]:
        groups: dict[str, list[dict]] = defaultdict(list)
        for item in records:
            groups[str(item.get(key) or "待复核")].append(item)
        return groups

    @staticmethod
    def _default_filters() -> list[str]:
        return [
            "status in ('active','valid')",
            "data_quality_score >= 80",
            "total_price between 5 and 5000",
            "unit_price between 1000 and 100000",
            "area between 10 and 500",
        ]

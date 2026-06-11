from __future__ import annotations

from sqlalchemy import case, distinct

from Backend.extensions import db
from Backend.models.listing import Listing
from Backend.models.quality import DataQualityReport
from Backend.models.snapshot import ListingSnapshot


MIN_ANALYSIS_QUALITY = 80
STRICT_TARGET_COUNT = 50_000


def _analysis_ready_condition():
    return db.and_(
        Listing.status.in_(["active", "valid"]),
        Listing.data_quality_score >= MIN_ANALYSIS_QUALITY,
        Listing.total_price.isnot(None),
        Listing.unit_price.isnot(None),
        Listing.area.isnot(None),
        Listing.total_price.between(5, 5000),
        Listing.unit_price.between(1000, 100000),
        Listing.area.between(10, 500),
    )


def _legacy_condition():
    return Listing.source.like("%\\_legacy", escape="\\")


def _extreme_condition():
    return db.or_(
        Listing.total_price < 5,
        Listing.total_price > 5000,
        Listing.unit_price < 1000,
        Listing.unit_price > 100000,
        Listing.area < 10,
        Listing.area > 500,
    )


def _missing_condition():
    return db.or_(
        Listing.title.is_(None),
        Listing.title == "",
        Listing.link.is_(None),
        Listing.link == "",
        Listing.district.is_(None),
        Listing.district == "",
        Listing.total_price.is_(None),
        Listing.unit_price.is_(None),
        Listing.area.is_(None),
    )


class QualityService:
    @staticmethod
    def report() -> dict:
        total_count = db.session.query(db.func.count(Listing.id)).scalar() or 0
        if total_count == 0:
            return QualityService._empty_report()

        ready_condition = _analysis_ready_condition()
        legacy_condition = _legacy_condition()
        new_standard_condition = db.not_(legacy_condition)

        overview_row = db.session.query(
            db.func.count(Listing.id).label("total_count"),
            db.func.count(distinct(Listing.fingerprint)).label("distinct_fingerprint"),
            db.func.count(distinct(Listing.link)).label("distinct_link"),
            db.func.coalesce(db.func.avg(Listing.data_quality_score), 0).label("avg_quality"),
            db.func.sum(case((legacy_condition, 1), else_=0)).label("legacy_count"),
            db.func.sum(case((new_standard_condition, 1), else_=0)).label("new_standard_count"),
            db.func.sum(case((ready_condition, 1), else_=0)).label("analysis_ready_count"),
            db.func.sum(case((db.and_(ready_condition, new_standard_condition), 1), else_=0)).label(
                "strict_new_standard_count"
            ),
            db.func.sum(case((_extreme_condition(), 1), else_=0)).label("extreme_count"),
            db.func.sum(case((_missing_condition(), 1), else_=0)).label("missing_count"),
            db.func.sum(case((Listing.data_quality_score < MIN_ANALYSIS_QUALITY, 1), else_=0)).label(
                "low_quality_count"
            ),
        ).one()

        snapshot_count = db.session.query(db.func.count(ListingSnapshot.id)).scalar() or 0
        strict_count = int(overview_row.strict_new_standard_count or 0)
        mode = "new_standard_primary" if strict_count >= STRICT_TARGET_COUNT else "hybrid_cold_start"

        return {
            "overview": {
                "total_count": int(overview_row.total_count or 0),
                "distinct_fingerprint": int(overview_row.distinct_fingerprint or 0),
                "distinct_link": int(overview_row.distinct_link or 0),
                "legacy_count": int(overview_row.legacy_count or 0),
                "new_standard_count": int(overview_row.new_standard_count or 0),
                "analysis_ready_count": int(overview_row.analysis_ready_count or 0),
                "strict_new_standard_count": strict_count,
                "snapshot_count": int(snapshot_count),
                "avg_quality": round(float(overview_row.avg_quality or 0), 2),
                "extreme_count": int(overview_row.extreme_count or 0),
                "missing_count": int(overview_row.missing_count or 0),
                "low_quality_count": int(overview_row.low_quality_count or 0),
                "recommended_mode": mode,
                "recommended_mode_label": "新标准样本优先" if mode == "new_standard_primary" else "冷启动混合基线",
            },
            "source_layers": QualityService._source_layers(),
            "quality_buckets": QualityService._quality_buckets(),
            "abnormal_samples": QualityService._abnormal_samples(),
            "cleaning_steps": QualityService._cleaning_steps(),
            "analysis_policy": QualityService._analysis_policy(mode),
        }

    @staticmethod
    def save_report(report_type: str = "manual") -> DataQualityReport:
        payload = QualityService.report()
        overview = payload["overview"]
        record = DataQualityReport(
            report_type=report_type,
            total_count=int(overview.get("total_count") or 0),
            valid_count=int(overview.get("total_count") or 0) - int(overview.get("missing_count") or 0),
            analysis_ready_count=int(overview.get("analysis_ready_count") or 0),
            avg_quality=float(overview.get("avg_quality") or 0),
            missing_count=int(overview.get("missing_count") or 0),
            extreme_count=int(overview.get("extreme_count") or 0),
            low_quality_count=int(overview.get("low_quality_count") or 0),
            snapshot_count=int(overview.get("snapshot_count") or 0),
        )
        record.set_payloads(
            summary={
                "recommended_mode": overview.get("recommended_mode"),
                "recommended_mode_label": overview.get("recommended_mode_label"),
                "source_layer_count": len(payload.get("source_layers") or []),
                "abnormal_sample_count": len(payload.get("abnormal_samples") or []),
            },
            detail=payload,
        )
        db.session.add(record)
        db.session.commit()
        return record

    @staticmethod
    def list_reports(page: int = 1, page_size: int = 20) -> dict:
        page = max(1, int(page or 1))
        page_size = min(100, max(1, int(page_size or 20)))
        pagination = DataQualityReport.query.order_by(
            DataQualityReport.created_at.desc(), DataQualityReport.id.desc()
        ).paginate(page=page, per_page=page_size, error_out=False)
        return {
            "items": [item.to_dict(include_detail=False) for item in pagination.items],
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
    def get_report(report_id: int) -> DataQualityReport | None:
        return db.session.get(DataQualityReport, report_id)

    @staticmethod
    def _source_layers() -> list[dict]:
        ready_condition = _analysis_ready_condition()
        rows = (
            db.session.query(
                Listing.source.label("source"),
                db.func.count(Listing.id).label("sample_count"),
                db.func.sum(case((ready_condition, 1), else_=0)).label("usable_count"),
                db.func.coalesce(db.func.avg(Listing.data_quality_score), 0).label("avg_quality"),
                db.func.sum(case((_missing_condition(), 1), else_=0)).label("missing_count"),
                db.func.sum(case((_extreme_condition(), 1), else_=0)).label("extreme_count"),
                db.func.count(distinct(Listing.district)).label("district_count"),
                db.func.min(Listing.unit_price).label("min_unit_price"),
                db.func.max(Listing.unit_price).label("max_unit_price"),
            )
            .group_by(Listing.source)
            .order_by(db.func.count(Listing.id).desc())
            .all()
        )

        return [
            {
                "source": row.source,
                "layer": "cold_start_baseline" if row.source.endswith("_legacy") else "new_standard_crawl",
                "layer_label": "旧库冷启动基线" if row.source.endswith("_legacy") else "新标准采集样本",
                "sample_count": int(row.sample_count or 0),
                "usable_count": int(row.usable_count or 0),
                "avg_quality": round(float(row.avg_quality or 0), 2),
                "missing_count": int(row.missing_count or 0),
                "extreme_count": int(row.extreme_count or 0),
                "district_count": int(row.district_count or 0),
                "min_unit_price": float(row.min_unit_price) if row.min_unit_price is not None else None,
                "max_unit_price": float(row.max_unit_price) if row.max_unit_price is not None else None,
                "recommended_usage": (
                    "规模基线、系统冷启动、对照分析；正式建模需按质量分和异常规则过滤"
                    if row.source.endswith("_legacy")
                    else "优先用于后续趋势分析、质量报告、建模训练和跨来源校验"
                ),
            }
            for row in rows
        ]

    @staticmethod
    def _quality_buckets() -> list[dict]:
        buckets = [
            ("90-100", Listing.data_quality_score >= 90),
            ("80-89", db.and_(Listing.data_quality_score >= 80, Listing.data_quality_score < 90)),
            ("60-79", db.and_(Listing.data_quality_score >= 60, Listing.data_quality_score < 80)),
            ("0-59", Listing.data_quality_score < 60),
        ]
        return [
            {
                "bucket": label,
                "count": int(db.session.query(db.func.count(Listing.id)).filter(condition).scalar() or 0),
            }
            for label, condition in buckets
        ]

    @staticmethod
    def _abnormal_samples(limit: int = 8) -> list[dict]:
        query = (
            Listing.query.filter(
                db.or_(
                    Listing.data_quality_score < MIN_ANALYSIS_QUALITY,
                    _extreme_condition(),
                    _missing_condition(),
                    Listing.status == "abnormal",
                )
            )
            .order_by(Listing.data_quality_score.asc(), Listing.id.desc())
            .limit(limit)
        )
        samples = []
        for item in query.all():
            payload = item.to_dict()
            payload["reason"] = QualityService._abnormal_reason(item)
            samples.append(payload)
        return samples

    @staticmethod
    def _abnormal_reason(item: Listing) -> str:
        reasons = []
        if item.data_quality_score < MIN_ANALYSIS_QUALITY:
            reasons.append(f"质量分 {item.data_quality_score} 低于 {MIN_ANALYSIS_QUALITY}")
        if item.total_price is not None and not 5 <= item.total_price <= 5000:
            reasons.append("总价超出规则区间")
        if item.unit_price is not None and not 1000 <= item.unit_price <= 100000:
            reasons.append("单价超出规则区间")
        if item.area is not None and not 10 <= item.area <= 500:
            reasons.append("面积超出规则区间")
        if not item.total_price or not item.unit_price or not item.area:
            reasons.append("关键价格/面积字段缺失")
        return "；".join(reasons) if reasons else "待复核"

    @staticmethod
    def _cleaning_steps() -> list[dict]:
        return [
            {"name": "字段标准化", "description": "统一来源、标题、链接、区县、小区、价格、面积、户型等字段。"},
            {"name": "单位转换", "description": "总价统一为万元，单价统一为元/平方米，面积统一为平方米。"},
            {"name": "结构化解析", "description": "从户型提取室/厅，从楼层文本归一 low/mid/high，从建成年份派生房龄。"},
            {"name": "去重指纹", "description": "按 source + fingerprint 去重，指纹不包含价格，避免价格变化被当成新房源。"},
            {"name": "增量快照", "description": "首次入库写快照；挂牌价或单价变化时追加 listing_snapshots。"},
            {"name": "质量评分", "description": "按关键字段缺失、价格异常、面积异常、建成年份异常扣分。"},
            {"name": "来源分层", "description": "旧库标为冷启动基线，新爬样本标为新标准采集样本，分析时分层使用。"},
            {"name": "异常保留", "description": "异常数据不物理删除，展示待复核原因，建模默认过滤。"},
        ]

    @staticmethod
    def _analysis_policy(mode: str) -> dict:
        return {
            "min_quality_score": MIN_ANALYSIS_QUALITY,
            "default_filters": [
                "status in ('active','valid')",
                "data_quality_score >= 80",
                "total_price between 5 and 5000",
                "unit_price between 1000 and 100000",
                "area between 10 and 500",
                "关键字段 title/link/district/total_price/unit_price/area 不为空",
            ],
            "source_rules": [
                "旧库 *_legacy 只作为冷启动基线和规模对照，不直接证明真实性。",
                "新采集来源 fang/anjuke_mobile/lianjia 使用当前标准字段和质量评分入库。",
                "当新标准可用样本不足 50,000 时，系统采用冷启动混合基线；达到规模后切换为新标准样本优先。",
            ],
            "current_mode": mode,
        }

    @staticmethod
    def _empty_report() -> dict:
        return {
            "overview": {
                "total_count": 0,
                "distinct_fingerprint": 0,
                "distinct_link": 0,
                "legacy_count": 0,
                "new_standard_count": 0,
                "analysis_ready_count": 0,
                "strict_new_standard_count": 0,
                "snapshot_count": 0,
                "avg_quality": 0,
                "extreme_count": 0,
                "missing_count": 0,
                "low_quality_count": 0,
                "recommended_mode": "hybrid_cold_start",
                "recommended_mode_label": "冷启动混合基线",
            },
            "source_layers": [],
            "quality_buckets": [],
            "abnormal_samples": [],
            "cleaning_steps": QualityService._cleaning_steps(),
            "analysis_policy": QualityService._analysis_policy("hybrid_cold_start"),
        }

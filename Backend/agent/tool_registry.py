from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from Backend.extensions import db
from Backend.agent.deepseek_client import DeepSeekClient
from Backend.models.agent import GeneratedReport
from Backend.models.listing import Listing
from Backend.models.snapshot import ListingSnapshot
from Backend.services.analysis_service import AnalysisService
from Backend.services.amap_service import AmapService
from Backend.services.crawl_service import CrawlService
from Backend.services.dashboard_service import DashboardService, normalize_district_name
from Backend.services.listing_service import ListingService, parse_float
from Backend.services.quality_service import QualityService
from Backend.services.read_only_sql_service import ReadOnlySqlService


LIANGJIANG_MARKET_ALIASES = {"两江新区", "渝北", "渝北区", "江北", "江北区"}


@dataclass(frozen=True)
class ToolSpec:
    name: str
    permission: str
    description: str
    handler: Callable[[dict], dict]


class ToolRegistry:
    def __init__(self, allowed_permissions: set[str] | None = None) -> None:
        self._tools: dict[str, ToolSpec] = {}
        # Agent 对业务数据默认只读；write_report 仅允许保存本轮生成物，
        # 不允许模型直接修改房源、执行 SQL 或自行启动采集/训练任务。
        self.allowed_permissions = allowed_permissions or {"read", "write_report"}
        self.register("query_market_stats", "read", "查询总体、区县和价格区间统计", self.query_market_stats)
        self.register(
            "query_readonly_sql",
            "read",
            "把自然语言转换为受限 SELECT，并查询 MySQL 业务白名单表",
            self.query_readonly_sql,
        )
        self.register("get_listing_detail", "read", "按区县、预算、来源或房源ID查详情", self.get_listing_detail)
        self.register("compare_districts", "read", "对比两个区县的挂牌价与样本特征", self.compare_districts)
        self.register("explain_listing_anomaly", "read", "解释某条房源为什么异常", self.explain_listing_anomaly)
        self.register("recommend_buy_options", "read", "按预算、面积、通勤代理和质量分推荐候选房源", self.recommend_buy_options)
        self.register("resolve_destination_poi", "read", "解析校园/医院/商圈等目的地定位", self.resolve_destination_poi)
        self.register("recommend_destination_options", "read", "按目的地、预算和通勤估算推荐房源", self.recommend_destination_options)
        self.register("estimate_mortgage", "read", "按总价、首付比例和年限估算月供", self.estimate_mortgage)
        self.register("get_chart_series", "read", "获取 ECharts 序列数据", self.get_chart_series)
        self.register("get_crawl_status", "read", "查询采集任务状态和失败页", self.get_crawl_status)
        self.register("run_incremental_crawl", "write_task", "创建增量采集任务，不直接写房源", self.run_incremental_crawl)
        self.register("run_analysis_job", "write_task", "创建分析任务并保存模型结果", self.run_analysis_job)
        self.register("get_model_result", "read", "查询最近一次模型指标和特征重要性", self.get_model_result)
        self.register("generate_report", "write_report", "基于工具结果生成报告记录", self.generate_report)

    def register(self, name: str, permission: str, description: str, handler: Callable[[dict], dict]) -> None:
        self._tools[name] = ToolSpec(name=name, permission=permission, description=description, handler=handler)

    def list_tools(self) -> list[dict]:
        return [
            {"name": spec.name, "permission": spec.permission, "description": spec.description}
            for spec in self._tools.values()
            if spec.permission in self.allowed_permissions
        ]

    def execute(self, name: str, args: dict) -> dict:
        if name not in self._tools:
            raise ValueError(f"工具不在白名单中: {name}")
        spec = self._tools[name]
        if spec.permission not in self.allowed_permissions:
            raise PermissionError(f"Agent 当前为只读模式，禁止调用工具: {name}")
        return spec.handler(args or {})

    @staticmethod
    def query_market_stats(args: dict) -> dict:
        district = args.get("district")
        overview = DashboardService.overview()
        requested_district = normalize_district_name(district) if district else None
        if requested_district in LIANGJIANG_MARKET_ALIASES:
            requested_district = "两江新区"
        requested_limit = int(args.get("limit") or 20)
        # 指定区县时必须先取完整区县集合再筛选，避免目标区县因均价排名靠后
        # 被 limit 截断后误判为“无数据”。
        district_items = DashboardService.district_price(
            limit=100 if requested_district else requested_limit
        )["items"]
        if district and district not in {"全部区县", "all"}:
            if requested_district == "两江新区":
                merged = ToolRegistry._merge_liangjiang_market_items(district_items)
                district_items = [merged] if merged else []
            else:
                district_items = [
                    item
                    for item in district_items
                    if normalize_district_name(item["district"]) == requested_district
                ]
        elif requested_limit < len(district_items):
            district_items = district_items[:requested_limit]
        price_distribution = DashboardService.price_distribution()
        return {
            "overview": overview["kpis"],
            "top_district": overview.get("top_district"),
            "district_items": district_items,
            "query": {
                "requested_district": requested_district,
                "matched": bool(district_items) if requested_district else None,
            },
            "price_distribution": price_distribution,
            "source_summary": overview.get("source_summary", []),
            "status_summary": overview.get("status_summary", []),
            "metric_note": "所有价格均为挂牌价/报价，不代表成交价。",
        }

    @staticmethod
    def query_readonly_sql(args: dict) -> dict:
        question = str(args.get("question") or "").strip()
        if not question:
            raise ValueError("自然语言查询问题不能为空")
        generated_sql, model = DeepSeekClient.generate_readonly_sql(
            question,
            ReadOnlySqlService.schema_prompt(),
        )
        result = ReadOnlySqlService.execute(generated_sql)
        return {
            "question": question,
            "sql_model": model,
            **result,
            "safety": {
                "mode": "read_only",
                "allowed_tables": sorted(ReadOnlySqlService.ALLOWED_TABLES),
                "max_rows": ReadOnlySqlService.MAX_ROWS,
                "timeout_ms": ReadOnlySqlService.MAX_EXECUTION_TIME_MS,
                "user_sql_executed_directly": False,
            },
        }

    @staticmethod
    def get_listing_detail(args: dict) -> dict:
        listing_id = args.get("listing_id")
        source_listing_id = str(args.get("source_listing_id") or "").strip()
        source = str(args.get("source") or "").strip()
        district = str(args.get("district") or "").strip()
        budget_min = args.get("budget_min")
        budget_max = args.get("budget_max")
        page_size = min(10, max(1, int(args.get("limit") or 5)))

        listing = None
        if listing_id not in (None, "", 0):
            try:
                listing = ListingService.get_listing(int(listing_id))
            except (TypeError, ValueError):
                listing = None
        elif source_listing_id:
            query = Listing.query.filter_by(source_listing_id=source_listing_id)
            if source:
                query = query.filter_by(source=source)
            listing = query.order_by(Listing.updated_at.desc(), Listing.id.desc()).first()

        if listing is not None:
            snapshots = (
                ListingSnapshot.query.filter_by(listing_id=listing.id)
                .order_by(ListingSnapshot.snapshot_at.desc(), ListingSnapshot.id.desc())
                .limit(5)
                .all()
            )
            return {
                "query": {
                    "listing_id": listing_id,
                    "source_listing_id": source_listing_id or None,
                    "source": source or None,
                    "district": district or None,
                    "budget_min": budget_min,
                    "budget_max": budget_max,
                },
                "listing": listing.to_dict(),
                "snapshots": [item.to_dict() for item in snapshots],
                "summary": {
                    "matched_count": 1,
                    "price_note": "所有价格均为挂牌价/报价，不代表成交价。",
                    "detail_note": "优先展示系统ID、来源房源ID和原始链接，系统ID仅用于内部主键展示。",
                },
            }

        params = {
            "district": district or None,
            "source": source or None,
            "price_min": budget_min,
            "price_max": budget_max,
            "page": 1,
            "page_size": page_size,
        }
        result = ListingService.query_listings({key: value for key, value in params.items() if value not in (None, "")})
        items = result.get("items") or []
        return {
            "query": {
                "listing_id": listing_id,
                "source_listing_id": source_listing_id or None,
                "source": source or None,
                "district": district or None,
                "budget_min": budget_min,
                "budget_max": budget_max,
            },
            "items": items,
            "summary": {
                "matched_count": len(items),
                "price_note": "所有价格均为挂牌价/报价，不代表成交价。",
                "detail_note": "未指定房源ID时，返回符合筛选条件的候选详情。",
            },
        }

    @staticmethod
    def compare_districts(args: dict) -> dict:
        district_a = str(args.get("district_a") or args.get("district_1") or "").strip()
        district_b = str(args.get("district_b") or args.get("district_2") or "").strip()
        limit = int(args.get("limit") or 100)
        if not district_a or not district_b:
            return {
                "query": {"district_a": district_a or None, "district_b": district_b or None},
                "comparison": [],
                "summary": {"matched": False, "note": "至少需要两个区县才能比较。"},
            }

        district_items = DashboardService.district_price(limit=max(100, limit))["items"]

        def find_item(name: str) -> dict | None:
            normalized = normalize_district_name(name)
            for item in district_items:
                if normalize_district_name(item["district"]) == normalized:
                    return item
            return None

        item_a = find_item(district_a)
        item_b = find_item(district_b)
        if item_a is None or item_b is None:
            return {
                "query": {"district_a": district_a, "district_b": district_b},
                "comparison": [],
                "summary": {
                    "matched": False,
                    "note": "至少有一个区县没有找到有效统计，不能进行对比。",
                },
            }

        gap = round(float(item_a["avg_unit_price"] or 0) - float(item_b["avg_unit_price"] or 0), 2)
        abs_gap = round(abs(gap), 2)
        higher = item_a["district"] if gap >= 0 else item_b["district"]
        lower = item_b["district"] if gap >= 0 else item_a["district"]
        return {
            "query": {"district_a": item_a["district"], "district_b": item_b["district"]},
            "district_a": item_a,
            "district_b": item_b,
            "comparison": [
                {
                    "metric": "avg_unit_price",
                    "label": "平均挂牌单价",
                    "district_a": item_a["avg_unit_price"],
                    "district_b": item_b["avg_unit_price"],
                    "gap": abs_gap,
                    "gap_direction": "district_a_higher" if gap >= 0 else "district_b_higher",
                },
                {
                    "metric": "listing_count",
                    "label": "有效样本量",
                    "district_a": item_a["listing_count"],
                    "district_b": item_b["listing_count"],
                    "gap": abs(int(item_a["listing_count"]) - int(item_b["listing_count"])),
                    "gap_direction": "district_a_higher"
                    if int(item_a["listing_count"]) >= int(item_b["listing_count"])
                    else "district_b_higher",
                },
                {
                    "metric": "avg_quality",
                    "label": "平均质量分",
                    "district_a": item_a["avg_quality"],
                    "district_b": item_b["avg_quality"],
                    "gap": round(abs(float(item_a["avg_quality"] or 0) - float(item_b["avg_quality"] or 0)), 2),
                    "gap_direction": "district_a_higher"
                    if float(item_a["avg_quality"] or 0) >= float(item_b["avg_quality"] or 0)
                    else "district_b_higher",
                },
            ],
            "summary": {
                "matched": True,
                "higher_price_district": higher,
                "lower_price_district": lower,
                "price_gap": abs_gap,
                "note": "区县对比基于 MySQL 中 3 个真实来源的有效挂牌样本，不代表成交价。",
            },
        }

    @staticmethod
    def explain_listing_anomaly(args: dict) -> dict:
        listing_id = args.get("listing_id")
        source_listing_id = str(args.get("source_listing_id") or "").strip()
        source = str(args.get("source") or "").strip()
        listing = None
        if listing_id not in (None, "", 0):
            try:
                listing = ListingService.get_listing(int(listing_id))
            except (TypeError, ValueError):
                listing = None
        elif source_listing_id:
            query = Listing.query.filter_by(source_listing_id=source_listing_id)
            if source:
                query = query.filter_by(source=source)
            listing = query.order_by(Listing.updated_at.desc(), Listing.id.desc()).first()

        if listing is None:
            return {
                "query": {
                    "listing_id": listing_id,
                    "source_listing_id": source_listing_id or None,
                    "source": source or None,
                },
                "listing": None,
                "summary": {"matched": False, "note": "未找到对应房源，无法解释异常原因。"},
            }

        district_item = next(
            (
                item
                for item in DashboardService.district_price(limit=100)["items"]
                if normalize_district_name(item["district"]) == normalize_district_name(listing.district)
            ),
            None,
        )
        abnormal_reason = QualityService._abnormal_reason(listing)
        return {
            "query": {
                "listing_id": listing.id,
                "source_listing_id": listing.source_listing_id,
                "source": listing.source,
            },
            "listing": listing.to_dict(),
            "quality_score": listing.data_quality_score,
            "abnormal_reason": abnormal_reason,
            "district_reference": district_item,
            "checks": {
                "price_range": {
                    "total_price": listing.total_price,
                    "unit_price": listing.unit_price,
                    "area": listing.area,
                },
                "identity": {
                    "source": listing.source,
                    "source_listing_id": listing.source_listing_id,
                    "system_id": listing.id,
                    "link": listing.link,
                },
            },
            "summary": {
                "matched": True,
                "note": "异常解释基于清洗规则、质量评分与区县基准，只展示可核验原因。",
            },
            "metric_note": "所有价格均为挂牌价/报价，不代表成交价。",
        }

    @staticmethod
    def _merge_liangjiang_market_items(items: list[dict]) -> dict | None:
        matched = [item for item in items if str(item.get("district") or "").strip() in LIANGJIANG_MARKET_ALIASES]
        if not matched:
            return None

        listing_count = sum(int(item.get("listing_count") or 0) for item in matched)
        if listing_count <= 0:
            listing_count = len(matched)

        def weighted_average(field: str) -> float:
            total = sum(float(item.get(field) or 0) * int(item.get("listing_count") or 0) for item in matched)
            return round(total / max(1, listing_count), 2)

        min_prices = [float(item["min_unit_price"]) for item in matched if item.get("min_unit_price") is not None]
        max_prices = [float(item["max_unit_price"]) for item in matched if item.get("max_unit_price") is not None]
        raw_districts: list[str] = []
        seen_raw: set[str] = set()
        for item in matched:
            for raw in item.get("raw_districts") or [item.get("district")]:
                text = str(raw or "").strip()
                if not text or text in seen_raw:
                    continue
                seen_raw.add(text)
                raw_districts.append(text)

        return {
            "district": "两江新区",
            "raw_districts": raw_districts,
            "listing_count": listing_count,
            "avg_unit_price": weighted_average("avg_unit_price"),
            "avg_total_price": weighted_average("avg_total_price"),
            "avg_quality": weighted_average("avg_quality"),
            "min_unit_price": min(min_prices) if min_prices else None,
            "max_unit_price": max(max_prices) if max_prices else None,
            "change": 0,
            "rank": 1,
        }

    @staticmethod
    def recommend_buy_options(args: dict) -> dict:
        return ListingService.recommend_for_buyer(args)

    @staticmethod
    def resolve_destination_poi(args: dict) -> dict:
        keyword = str(args.get("keyword") or args.get("destination_keyword") or "").strip()
        district = str(args.get("district") or "").strip() or None
        if not keyword:
            return {
                "query": {"keyword": None, "district": district},
                "poi": None,
                "summary": {"matched": False, "note": "未提供目的地关键词，无法定位。"},
            }
        try:
            result = AmapService.resolve_poi(keyword, district=district)
        except Exception as exc:
            result = {"matched": False, "poi": None, "note": f"目的地定位失败：{exc}"}
        return {
            "query": {"keyword": keyword, "district": district},
            "poi": result.get("poi"),
            "summary": {
                "matched": bool(result.get("matched")),
                "note": result.get("note") or "未返回目的地定位结果。",
            },
        }

    @staticmethod
    def recommend_destination_options(args: dict) -> dict:
        destination_keyword = str(args.get("destination_keyword") or args.get("keyword") or "").strip()
        if not destination_keyword:
            return {
                "query": {
                    "destination_keyword": None,
                    "district": args.get("district"),
                    "budget_max": args.get("budget_max"),
                },
                "destination": None,
                "items": [],
                "summary": {
                    "matched": False,
                    "note": "未提供目的地关键词，无法做附近推荐。",
                    "school_district_note": "当前库没有学区字段，不能直接判断是否为学区房。",
                },
            }

        destination = ToolRegistry.resolve_destination_poi(
            {"keyword": destination_keyword, "district": args.get("district")}
        )
        buyer_args = {**args, "limit": min(10, max(3, int(args.get("limit") or 5)))}
        buyer_options = ListingService.recommend_for_buyer(buyer_args)
        items = []
        for candidate in buyer_options.get("items") or []:
            listing = candidate.get("listing") or {}
            origin_text = ToolRegistry._listing_origin_text(listing)
            try:
                commute = AmapService.estimate_commute(
                    origin_text,
                    destination_keyword=destination_keyword,
                    district=str(listing.get("district") or args.get("district") or "").strip() or None,
                )
            except Exception as exc:
                commute = {
                    "matched": False,
                    "origin": origin_text,
                    "destination_keyword": destination_keyword,
                    "distance_km": None,
                    "estimated_minutes": None,
                    "note": f"通勤估算失败：{exc}",
                }

            destination_score = 40.0
            if commute.get("matched") and commute.get("estimated_minutes") is not None:
                destination_score = max(20.0, min(100.0, 100 - float(commute["estimated_minutes"]) * 1.35))

            combined_score = round(
                float(candidate.get("recommendation_score") or 0) * 0.68 + destination_score * 0.32,
                2,
            )
            mortgage_estimate = None
            if listing.get("total_price") not in (None, ""):
                mortgage_payload = ToolRegistry.estimate_mortgage(
                    {
                        "purchase_price": listing.get("total_price"),
                        "down_payment_ratio": args.get("down_payment_ratio"),
                        "down_payment_text": args.get("down_payment_text"),
                        "loan_years": args.get("loan_years"),
                        "annual_rate": args.get("annual_rate"),
                    }
                )
                mortgage_estimate = mortgage_payload.get("loan")

            reasons = list(candidate.get("reasons") or [])
            if commute.get("matched") and commute.get("estimated_minutes") is not None:
                reasons.insert(0, f"到{destination_keyword}估算约 {commute['estimated_minutes']} 分钟")
            elif destination.get("summary", {}).get("matched"):
                reasons.insert(0, f"已对 {destination_keyword} 做目的地匹配")

            items.append(
                {
                    **candidate,
                    "combined_score": combined_score,
                    "destination_score": round(destination_score, 2),
                    "commute_estimate": commute,
                    "mortgage_estimate": mortgage_estimate,
                    "reasons": reasons[:5],
                }
            )

        items.sort(
            key=lambda item: (
                float(item.get("combined_score") or 0),
                float(item.get("recommendation_score") or 0),
                float((item.get("listing") or {}).get("data_quality_score") or 0),
            ),
            reverse=True,
        )
        school_note = "当前库没有学区字段，不能直接判断是否为学区房；这里只能给出区位、通勤、预算和质量分建议。"
        commute_note = (
            "通勤估算使用高德白名单 POI 定位和直线距离换算，适合候选排序，不等同于实时导航。"
            if destination.get("summary", {}).get("matched")
            else "目的地未成功定位，当前无法给出真实通勤估算，只保留数据库内的预算与质量排序。"
        )
        return {
            "query": {
                "destination_keyword": destination_keyword,
                "district": buyer_options.get("query", {}).get("district"),
                "budget_min": buyer_options.get("query", {}).get("budget_min"),
                "budget_max": buyer_options.get("query", {}).get("budget_max"),
                "area_min": buyer_options.get("query", {}).get("area_min"),
                "area_max": buyer_options.get("query", {}).get("area_max"),
                "loan_years": args.get("loan_years"),
                "down_payment_ratio": args.get("down_payment_ratio"),
            },
            "destination": destination.get("poi"),
            "items": items[: min(5, max(1, int(args.get("limit") or 5)))],
            "summary": {
                "matched": bool(items),
                "matched_count": len(items),
                "note": "候选房源继续只来自 MySQL listings 的真实挂牌样本，未直接修改数据库。",
                "commute_note": commute_note,
                "school_district_note": school_note,
                "destination_note": destination.get("summary", {}).get("note"),
                "price_note": "所有价格均为挂牌价/报价，不代表成交价。",
            },
        }

    @staticmethod
    def estimate_mortgage(args: dict) -> dict:
        purchase_price = parse_float(args.get("purchase_price"))
        if purchase_price is None:
            purchase_price = parse_float(args.get("total_price"))
        if purchase_price is None:
            purchase_price = parse_float(args.get("budget_max"))
        if purchase_price is None or purchase_price <= 0:
            return {
                "query": {
                    "purchase_price": None,
                    "down_payment_ratio": None,
                    "loan_years": None,
                    "annual_rate": None,
                },
                "loan": None,
                "summary": {
                    "matched": False,
                    "note": "未提供总价或预算，无法估算月供。",
                    "price_note": "所有价格均为挂牌价/报价，不代表成交价。",
                },
            }

        down_payment_ratio = parse_float(args.get("down_payment_ratio"))
        if down_payment_ratio is None:
            ratio_text = str(args.get("down_payment_text") or args.get("pay_ratio") or "").strip()
            if "二成" in ratio_text:
                down_payment_ratio = 0.2
            elif "三成" in ratio_text:
                down_payment_ratio = 0.3
            elif "四成" in ratio_text:
                down_payment_ratio = 0.4
            else:
                down_payment_ratio = 0.3
        down_payment_ratio = min(max(float(down_payment_ratio), 0.1), 0.8)

        loan_years = int(args.get("loan_years") or 30)
        loan_years = min(max(1, loan_years), 40)

        annual_rate = parse_float(args.get("annual_rate"))
        if annual_rate is None:
            annual_rate = 3.8
            rate_note = "未提供利率，按默认年化 3.8% 演算"
        else:
            rate_note = f"按年化 {annual_rate}% 演算"

        loan_amount = max(0.0, float(purchase_price) * (1 - down_payment_ratio))
        months = max(1, loan_years * 12)
        monthly_rate = float(annual_rate) / 100 / 12
        if monthly_rate == 0:
            monthly_payment = loan_amount / months
        else:
            factor = (1 + monthly_rate) ** months
            monthly_payment = loan_amount * monthly_rate * factor / max(1e-9, factor - 1)
        total_payment = monthly_payment * months
        total_interest = max(0.0, total_payment - loan_amount)
        down_payment = float(purchase_price) - loan_amount

        return {
            "query": {
                "purchase_price": round(float(purchase_price), 2),
                "down_payment_ratio": round(down_payment_ratio, 4),
                "loan_years": loan_years,
                "annual_rate": round(float(annual_rate), 4),
            },
            "loan": {
                "purchase_price": round(float(purchase_price), 2),
                "down_payment": round(down_payment, 2),
                "loan_amount": round(loan_amount, 2),
                "loan_years": loan_years,
                "annual_rate": round(float(annual_rate), 4),
                "monthly_payment": round(monthly_payment, 2),
                "total_payment": round(total_payment, 2),
                "total_interest": round(total_interest, 2),
            },
            "summary": {
                "matched": True,
                "note": f"{rate_note}，按等额本息估算。",
                "price_note": "所有价格均为挂牌价/报价，不代表成交价。",
            },
        }

    @staticmethod
    def get_chart_series(args: dict) -> dict:
        chart_type = str(args.get("chart_type") or "price_trend")
        if chart_type == "district_price":
            return {"chart_type": chart_type, **DashboardService.district_price(limit=int(args.get("limit") or 20))}
        if chart_type == "price_distribution":
            return {"chart_type": chart_type, **DashboardService.price_distribution()}
        if chart_type == "area_price_scatter":
            return {"chart_type": chart_type, **DashboardService.area_price_scatter(limit=int(args.get("limit") or 200))}
        months = int(args.get("months") or 12)
        return {"chart_type": "price_trend", **DashboardService.price_trend(months=months)}

    @staticmethod
    def get_crawl_status(args: dict) -> dict:
        limit = int(args.get("limit") or 20)
        return {
            "summary": CrawlService.summary(),
            "tasks": CrawlService.list_tasks(page=1, page_size=min(20, max(1, limit)))["items"],
            "logs": CrawlService.recent_logs(limit=min(50, max(1, limit))),
        }

    @staticmethod
    def run_incremental_crawl(args: dict) -> dict:
        payload = {
            "source": args.get("source") or "fang",
            "districts": args.get("districts") or [],
            "max_pages": int(args.get("max_pages") or 1),
            "max_workers": int(args.get("max_workers") or 3),
            "mode": "incremental",
            "name": args.get("name") or "Agent 增量采集任务",
        }
        task = CrawlService.create_task(payload)
        return {"task": task.to_dict(include_logs=True), "note": "已创建任务，未由 Agent 直接写入房源。"}

    @staticmethod
    def run_analysis_job(args: dict) -> dict:
        job = AnalysisService.create_job(
            {
                "job_type": args.get("job_type") or "all",
                "max_samples": int(args.get("max_samples") or 3000),
            }
        )
        return {"job": job.to_dict(include_results=True)}

    @staticmethod
    def get_model_result(args: dict) -> dict:
        job_id = args.get("job_id")
        job = AnalysisService.get_job(int(job_id)) if job_id else AnalysisService.latest_success_job()
        if job is None:
            return {"job": None, "results": [], "note": "暂无成功分析任务，请先执行分析建模。"}
        data = job.to_dict(include_results=True)
        return {
            "job": {key: data[key] for key in data if key != "results"},
            "results": data["results"],
            "metric_note": "模型用于解释挂牌价影响因素和辅助估价，不代表成交价预测。",
        }

    @staticmethod
    def generate_report(args: dict) -> dict:
        title = args.get("title") or "重庆二手房挂牌价市场分析报告"
        question = args.get("question") or "生成市场分析报告"
        session_id = args.get("session_id") or "default"
        evidence = args.get("evidence") or {}
        content = args.get("content") or ToolRegistry._build_report_content(title, evidence)

        report = GeneratedReport(session_id=session_id, title=title, question=question, content=content)
        report.set_evidence(evidence)
        db.session.add(report)
        db.session.commit()
        return {"report": report.to_dict(), "status": "generated"}

    @staticmethod
    def _build_report_content(title: str, evidence: dict) -> str:
        market = evidence.get("market") or {}
        overview = market.get("overview") or {}
        top_district = market.get("top_district") or {}
        model = evidence.get("model") or {}
        return "\n".join(
            [
                f"# {title}",
                "",
                "## 一、核心结论",
                f"- 当前有效房源样本量：{overview.get('active_count', 0)} 套。",
                f"- 当前平均挂牌单价：{overview.get('avg_unit_price', 0)} 元/平方米。",
                f"- 当前平均挂牌总价：{overview.get('avg_total_price', 0)} 万元。",
                "",
                "## 二、区县对比",
                f"- 样本最高区县：{top_district.get('district', '暂无')}，平均挂牌单价 {top_district.get('avg_unit_price', 0)} 元/平方米。",
                "",
                "## 三、模型证据",
                f"- 最近模型任务：{(model.get('job') or {}).get('id', '暂无')}。",
                "- 模型结论仅用于解释挂牌价影响因素和辅助估价，不代表成交价预测。",
                "",
                "## 四、可执行建议",
                "- 答辩展示时按 Dashboard、采集日志、分析建模、Agent 工具调用证据的顺序展开。",
                "- 对样本不足或异常较多的区县，优先执行增量补采和人工复核。",
            ]
        )

    @staticmethod
    def _listing_origin_text(listing: dict) -> str:
        parts = [
            str(listing.get("district") or "").strip(),
            str(listing.get("community") or "").strip(),
            str(listing.get("address") or "").strip(),
            str(listing.get("title") or "").strip(),
        ]
        text = " ".join(part for part in parts if part)
        return text[:255] or "重庆房源"

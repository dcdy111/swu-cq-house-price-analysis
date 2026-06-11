from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from Backend.extensions import db
from Backend.models.agent import GeneratedReport
from Backend.services.analysis_service import AnalysisService
from Backend.services.crawl_service import CrawlService
from Backend.services.dashboard_service import DashboardService


@dataclass(frozen=True)
class ToolSpec:
    name: str
    permission: str
    description: str
    handler: Callable[[dict], dict]


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolSpec] = {}
        self.register("query_market_stats", "read", "查询总体、区县和价格区间统计", self.query_market_stats)
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
        ]

    def execute(self, name: str, args: dict) -> dict:
        if name not in self._tools:
            raise ValueError(f"工具不在白名单中: {name}")
        return self._tools[name].handler(args or {})

    @staticmethod
    def query_market_stats(args: dict) -> dict:
        district = args.get("district")
        overview = DashboardService.overview()
        district_items = DashboardService.district_price(limit=int(args.get("limit") or 20))["items"]
        if district and district not in {"全部区县", "all"}:
            district_items = [item for item in district_items if item["district"] == district]
        price_distribution = DashboardService.price_distribution()
        return {
            "overview": overview["kpis"],
            "top_district": overview.get("top_district"),
            "district_items": district_items,
            "price_distribution": price_distribution,
            "source_summary": overview.get("source_summary", []),
            "status_summary": overview.get("status_summary", []),
            "metric_note": "所有价格均为挂牌价/报价，不代表成交价。",
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

from __future__ import annotations

import time
from uuid import uuid4

from Backend.agent.deepseek_client import DeepSeekClient
from Backend.agent.tool_registry import ToolRegistry
from Backend.extensions import db
from Backend.models.agent import AgentToolCall, GeneratedReport


DISTRICT_KEYWORDS = [
    "渝中区",
    "江北区",
    "南岸区",
    "渝北区",
    "九龙坡区",
    "沙坪坝区",
    "大渡口区",
    "巴南区",
    "北碚区",
    "璧山区",
    "江津区",
    "永川区",
    "合川区",
    "长寿区",
    "铜梁区",
    "荣昌区",
    "大足区",
    "涪陵区",
    "綦江区",
    "南川区",
    "万州区",
    "潼南区",
    "梁平区",
    "开州区",
    "黔江区",
    "武隆区",
    "渝中",
    "江北",
    "南岸",
    "渝北",
    "九龙坡",
    "沙坪坝",
    "大渡口",
    "巴南",
    "北碚",
]


class AgentService:
    def __init__(self, registry: ToolRegistry | None = None) -> None:
        self.registry = registry or ToolRegistry()

    def chat(self, payload: dict) -> dict:
        question = str(payload.get("question") or payload.get("message") or "").strip()
        if not question:
            raise ValueError("question 不能为空")
        session_id = str(payload.get("session_id") or f"agent-{uuid4().hex[:10]}")

        plan = self._plan_tools(question, session_id)
        tool_calls = []
        evidence: dict[str, dict] = {}

        for step in plan:
            if step["tool"] == "generate_report":
                step["args"]["evidence"] = evidence
                step["args"]["content"] = self._compose_report_content(question, evidence)
            call = self._execute_and_record(session_id=session_id, question=question, tool_name=step["tool"], args=step["args"])
            tool_calls.append(call)
            if call["status"] == "success":
                evidence[self._evidence_key(step["tool"])] = call["tool_result"]

        fallback_answer = self._compose_answer(question, evidence, tool_calls)
        answer, model_name = DeepSeekClient.generate_answer(question, evidence, fallback_answer)
        self._persist_report_runtime(evidence, tool_calls, model_name, answer)
        return {
            "session_id": session_id,
            "answer": answer,
            "tool_calls": tool_calls,
            "report": evidence.get("report", {}).get("report"),
            "thinking": self._execution_summary(tool_calls),
            "model": model_name,
        }

    @staticmethod
    def _persist_report_runtime(evidence: dict, tool_calls: list[dict], model_name: str, answer: str) -> None:
        report_id = ((evidence.get("report") or {}).get("report") or {}).get("id")
        if not report_id:
            return
        report = db.session.get(GeneratedReport, int(report_id))
        if report is None:
            return
        report_evidence = dict(report.evidence or {})
        report_evidence["agent_runtime"] = {
            "response_model": model_name,
            "deepseek_used": "fallback" not in model_name,
            "grounding_guard_applied": model_name.endswith("+grounding-guard"),
            "tool_names": [item.get("tool_name") for item in tool_calls],
            "answer_length": len(answer or ""),
        }
        report.set_evidence(report_evidence)
        db.session.commit()

    def list_tools(self) -> dict:
        return {"items": self.registry.list_tools()}

    @staticmethod
    def get_report(report_id: int) -> GeneratedReport | None:
        return db.session.get(GeneratedReport, report_id)

    def _execute_and_record(self, session_id: str, question: str, tool_name: str, args: dict) -> dict:
        started = time.perf_counter()
        status = "success"
        result = {}
        error_message = None
        try:
            result = self.registry.execute(tool_name, args)
        except Exception as exc:
            status = "error"
            error_message = str(exc)
            result = {"error": error_message}
        duration_ms = int((time.perf_counter() - started) * 1000)

        record = AgentToolCall(
            session_id=session_id,
            question=question,
            tool_name=tool_name,
            status=status,
            duration_ms=duration_ms,
            error_message=error_message,
        )
        record.set_payloads(
            tool_args=self._compact_tool_args(tool_name, args),
            tool_result=self._compact_tool_result(tool_name, result),
        )
        db.session.add(record)
        db.session.commit()
        return record.to_dict()

    @staticmethod
    def _compact_tool_args(tool_name: str, args: dict) -> dict:
        if tool_name != "generate_report":
            return args
        return {
            "session_id": args.get("session_id"),
            "question": args.get("question"),
            "title": args.get("title"),
            "evidence_keys": sorted((args.get("evidence") or {}).keys()),
            "content_length": len(args.get("content") or ""),
        }

    @staticmethod
    def _compact_tool_result(tool_name: str, result: dict) -> dict:
        if tool_name == "generate_report" and result.get("report"):
            report = result["report"]
            return {
                "status": result.get("status"),
                "report": {
                    "id": report.get("id"),
                    "session_id": report.get("session_id"),
                    "title": report.get("title"),
                    "question": report.get("question"),
                    "content": report.get("content"),
                    "created_at": report.get("created_at"),
                },
            }
        if tool_name == "get_model_result" and result.get("results"):
            compact_results = []
            for item in result["results"]:
                artifacts = item.get("artifacts") or {}
                compact_results.append(
                    {
                        "id": item.get("id"),
                        "result_type": item.get("result_type"),
                        "model_name": item.get("model_name"),
                        "summary": item.get("summary"),
                        "metrics": item.get("metrics") or {},
                        "artifact_keys": sorted(artifacts.keys()),
                        "feature_importance": (artifacts.get("feature_importance") or [])[:10],
                        "cluster_profiles": (artifacts.get("clusters") or [])[:6],
                    }
                )
            return {**result, "results": compact_results}
        return result

    def _plan_tools(self, question: str, session_id: str) -> list[dict]:
        normalized = question.lower()
        district = self._extract_district(question)
        plan: list[dict] = []

        wants_report = "报告" in question or "生成" in question and "市场" in question
        wants_crawl = any(word in question for word in ["采集", "爬虫", "补采", "任务", "日志", "失败页"])
        wants_model = any(word in question for word in ["模型", "mae", "rmse", "r²", "r2", "特征", "聚类", "异常", "预测"])
        wants_trend = any(word in question for word in ["趋势", "走势", "近12月", "图表", "分布"])
        wants_crawl_create = any(word in question for word in ["创建采集", "执行补采", "增量采集", "按区补采"])

        if wants_crawl_create:
            plan.append(
                {
                    "tool": "run_incremental_crawl",
                    "args": {"source": "fang", "districts": [district] if district else [], "max_pages": 1, "max_workers": 3},
                }
            )
        elif wants_crawl:
            plan.append({"tool": "get_crawl_status", "args": {"limit": 10}})

        if wants_trend:
            plan.append({"tool": "get_chart_series", "args": {"chart_type": "price_trend", "months": 12}})

        if wants_model or wants_report:
            plan.append({"tool": "get_model_result", "args": {}})

        if wants_report or not plan or any(word in question for word in ["均价", "价格", "区县", "市场", "房价", "挂牌价"]):
            plan.insert(0, {"tool": "query_market_stats", "args": {"district": district, "limit": 20}})

        if "执行分析" in question or "重新分析" in question or "启动分析" in question:
            plan.append({"tool": "run_analysis_job", "args": {"job_type": "all", "max_samples": 3000}})

        if wants_report:
            plan.append(
                {
                    "tool": "generate_report",
                    "args": {
                        "session_id": session_id,
                        "question": question,
                        "title": "重庆二手房挂牌价市场分析报告",
                    },
                }
            )

        return self._deduplicate_plan(plan)

    @staticmethod
    def _deduplicate_plan(plan: list[dict]) -> list[dict]:
        result = []
        seen = set()
        for step in plan:
            key = step["tool"]
            if key in seen and key not in {"generate_report", "run_incremental_crawl", "run_analysis_job"}:
                continue
            seen.add(key)
            result.append(step)
        return result

    @staticmethod
    def _extract_district(question: str) -> str | None:
        for district in DISTRICT_KEYWORDS:
            if district in question:
                return district if district.endswith("区") else f"{district}区"
        return None

    @staticmethod
    def _evidence_key(tool_name: str) -> str:
        return {
            "query_market_stats": "market",
            "get_chart_series": "chart",
            "get_crawl_status": "crawl",
            "run_incremental_crawl": "crawl_task",
            "run_analysis_job": "analysis_job",
            "get_model_result": "model",
            "generate_report": "report",
        }.get(tool_name, tool_name)

    def _compose_answer(self, question: str, evidence: dict, tool_calls: list[dict]) -> str:
        market = evidence.get("market") or {}
        model = evidence.get("model") or {}
        crawl = evidence.get("crawl") or {}
        report = evidence.get("report") or {}

        if report.get("report"):
            item = report["report"]
            return "\n".join(
                [
                    "**结论**",
                    f"已生成《{item['title']}》，报告编号 #{item['id']}，内容和 evidence_json 已保存到 generated_reports。",
                    "",
                    "**关键证据**",
                    self._market_evidence_line(market),
                    self._model_evidence_line(model),
                    "",
                    "**可执行建议**",
                    f"可通过 `/api/reports/{item['id']}` 查看报告详情，并在答辩时展示本次工具调用记录。",
                ]
            )

        if crawl:
            summary = crawl.get("summary") or {}
            return "\n".join(
                [
                    "**结论**",
                    f"当前采集任务：运行中 {summary.get('running', 0)} 个，成功 {summary.get('success', 0)} 个，失败 {summary.get('failed', 0)} 个，部分失败 {summary.get('partial_failed', 0)} 个。",
                    "",
                    "**关键证据**",
                    f"- 累计解析房源数：{summary.get('total_found', 0)} 条。",
                    f"- 最近日志数：{len(crawl.get('logs') or [])} 条。",
                    "",
                    "**可执行建议**",
                    "优先查看 failed/partial_failed 任务的日志；如果只是补采，先创建小页数增量任务，确认解析正常后再扩大页数。",
                ]
            )

        if model and not market:
            return "\n".join(
                [
                    "**结论**",
                    self._model_evidence_line(model).lstrip("- "),
                    "",
                    "**关键证据**",
                    *self._model_metric_lines(model),
                    "",
                    "**可执行建议**",
                    "如果 R² 较低，优先增强区县、户型、楼层、来源等特征，再考虑随机森林、GBDT 或 XGBoost。",
                ]
            )

        return "\n".join(
            [
                "**结论**",
                self._market_conclusion(market),
                "",
                "**关键证据**",
                self._market_evidence_line(market),
                self._model_evidence_line(model) if model else "- 当前问题未触发模型工具。",
                "",
                "**可执行建议**",
                self._suggestion(question, market, tool_calls),
            ]
        )

    @staticmethod
    def _market_conclusion(market: dict) -> str:
        overview = market.get("overview") or {}
        districts = market.get("district_items") or []
        if districts:
            item = districts[0]
            return (
                f"{item.get('district')} 当前平均挂牌单价为 {item.get('avg_unit_price', 0)} 元/平方米，"
                f"样本量 {item.get('listing_count', 0)} 套。"
            )
        if overview:
            return (
                f"当前有效房源 {overview.get('active_count', 0)} 套，"
                f"平均挂牌单价 {overview.get('avg_unit_price', 0)} 元/平方米。"
            )
        return "工具未返回可用市场数据，建议先执行采集或导入数据。"

    @staticmethod
    def _market_evidence_line(market: dict) -> str:
        overview = market.get("overview") or {}
        top = market.get("top_district") or {}
        if not overview:
            return "- 市场统计工具未返回有效数据。"
        return (
            f"- 市场统计：有效样本 {overview.get('active_count', 0)} 套，"
            f"平均挂牌单价 {overview.get('avg_unit_price', 0)} 元/平方米，"
            f"区县覆盖 {overview.get('district_count', 0)} 个；"
            f"当前高位区县 {top.get('district', '暂无')}。"
        )

    @staticmethod
    def _model_evidence_line(model: dict) -> str:
        job = model.get("job") or {}
        results = model.get("results") or []
        regression = next((item for item in results if item.get("result_type") == "regression"), None)
        if not job or not regression:
            return "- 暂无成功模型结果，请先在分析建模页执行分析任务。"
        metrics = regression.get("metrics") or {}
        return (
            f"- 模型结果：任务 #{job.get('id')}，样本 {job.get('sample_count', 0)}，"
            f"MAE={metrics.get('mae')}，RMSE={metrics.get('rmse')}，R²={metrics.get('r2')}。"
        )

    @staticmethod
    def _model_metric_lines(model: dict) -> list[str]:
        results = model.get("results") or []
        regression = next((item for item in results if item.get("result_type") == "regression"), None)
        cluster = next((item for item in results if item.get("result_type") == "cluster"), None)
        anomaly = next((item for item in results if item.get("result_type") == "anomaly"), None)
        lines = []
        if regression:
            metrics = regression.get("metrics") or {}
            lines.append(f"- 回归：MAE={metrics.get('mae')}，RMSE={metrics.get('rmse')}，R²={metrics.get('r2')}。")
        if cluster:
            metrics = cluster.get("metrics") or {}
            lines.append(f"- 聚类：样本 {metrics.get('sample_count', 0)}，分层数 {metrics.get('cluster_count', 0)}。")
        if anomaly:
            metrics = anomaly.get("metrics") or {}
            lines.append(f"- 异常检测：识别 {metrics.get('anomaly_count', 0)} 条需复核样本。")
        return lines or ["- 模型工具未返回可用指标。"]

    @staticmethod
    def _suggestion(question: str, market: dict, tool_calls: list[dict]) -> str:
        failed_tools = [item for item in tool_calls if item.get("status") != "success"]
        if failed_tools:
            return "先处理失败工具调用，再重新提问；本次回答不会补写失败工具的数值。"
        if "渝北" in question or "南岸" in question:
            return "可继续查看该区县趋势图和异常样本，判断是否需要按区县补采。"
        if market.get("overview", {}).get("active_count", 0) == 0:
            return "先执行冷启动导入或增量采集，再进行 Dashboard、模型和 Agent 演示。"
        return "答辩时可把右侧工具调用 input/output 作为 Agent 未编造数值的证据。"

    @staticmethod
    def _execution_summary(tool_calls: list[dict]) -> str:
        lines = ["工具执行摘要："]
        for item in tool_calls:
            lines.append(
                f"→ {item['tool_name']}({item.get('tool_args', {})}) "
                f"=> {item['status']}，耗时 {item['duration_ms']}ms"
            )
        return "\n".join(lines)

    @staticmethod
    def _compose_report_content(question: str, evidence: dict) -> str:
        market = evidence.get("market") or {}
        model = evidence.get("model") or {}
        overview = market.get("overview") or {}
        top = market.get("top_district") or {}
        return "\n".join(
            [
                "# 重庆二手房挂牌价市场分析报告",
                "",
                "## 一、问题背景",
                question,
                "",
                "## 二、核心结论",
                f"- 当前有效房源样本量：{overview.get('active_count', 0)} 套。",
                f"- 平均挂牌单价：{overview.get('avg_unit_price', 0)} 元/平方米。",
                f"- 平均挂牌总价：{overview.get('avg_total_price', 0)} 万元。",
                "",
                "## 三、区县证据",
                f"- 当前高位区县：{top.get('district', '暂无')}。",
                f"- 高位区县平均挂牌单价：{top.get('avg_unit_price', 0)} 元/平方米。",
                "",
                "## 四、模型证据",
                AgentService._model_evidence_line(model),
                "",
                "## 五、建议",
                "- 继续按区县维护增量采集任务，保留失败日志用于答辩展示。",
                "- 对异常样本只做复核和标记，不直接物理删除。",
                "- 所有价格口径均为挂牌价/报价，不代表成交价。",
            ]
        )

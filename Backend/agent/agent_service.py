from __future__ import annotations

import re
import time
from datetime import datetime
from uuid import uuid4
from typing import Generator

from Backend.agent.deepseek_client import DeepSeekClient, DeepSeekInvocationError
from Backend.agent.tool_registry import ToolRegistry
from Backend.extensions import db
from Backend.models.agent import AgentSession, AgentToolCall, AgentTurn, GeneratedReport


DISTRICT_KEYWORDS = [
    "两江新区",
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
    "荣昌",
]
DESTINATION_KEYWORDS = [
    "西南大学荣昌校区",
    "荣昌校区",
    "西南大学",
    "校园",
    "学校",
    "校区",
    "医院",
    "商圈",
    "高铁站",
    "地铁站",
]
LEGACY_LOCAL_SESSION_PREFIX = "local-"


class AgentService:
    def __init__(self, registry: ToolRegistry | None = None) -> None:
        self.registry = registry or ToolRegistry()

    def chat(self, payload: dict) -> dict:
        question = str(payload.get("question") or payload.get("message") or "").strip()
        if not question:
            raise ValueError("question 不能为空")
        requested_session_id = str(payload.get("session_id") or "").strip()
        session_id = (
            requested_session_id
            if requested_session_id and not self._is_legacy_local_session_id(requested_session_id)
            else f"agent-{uuid4().hex[:10]}"
        )
        turn_id = f"turn-{uuid4().hex[:12]}"
        session = self._ensure_session(session_id, question)
        turn = AgentTurn(
            turn_id=turn_id,
            session_id=session_id,
            question=question,
            status="running",
            created_at=datetime.utcnow(),
        )
        db.session.add(turn)
        db.session.commit()

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

        thinking_summary = self._execution_summary(tool_calls)
        report_id = ((evidence.get("report") or {}).get("report") or {}).get("id")
        tool_call_ids = [int(item["id"]) for item in tool_calls if item.get("id")]
        try:
            answer, model_name = DeepSeekClient.generate_answer(question, evidence)
            answer = str(answer or "").strip()
            if not answer:
                raise DeepSeekInvocationError("DeepSeek 返回空回答")
            self._persist_report_runtime(evidence, tool_calls, model_name, answer)
            turn.answer = answer
            turn.thinking_summary = thinking_summary
            turn.model_name = model_name
            turn.status = "success"
            turn.report_id = int(report_id) if report_id else None
            turn.finished_at = datetime.utcnow()
            turn.set_tool_call_ids(tool_call_ids)
            session.updated_at = turn.finished_at
            db.session.commit()
        except DeepSeekInvocationError as exc:
            turn.answer = None
            turn.thinking_summary = thinking_summary
            turn.model_name = None
            turn.status = "failed"
            turn.report_id = int(report_id) if report_id else None
            turn.finished_at = datetime.utcnow()
            turn.set_tool_call_ids(tool_call_ids)
            session.updated_at = turn.finished_at
            db.session.commit()
            raise AgentChatError(
                str(exc),
                {
                    "session_id": session_id,
                    "turn_id": turn_id,
                    "tool_calls": tool_calls,
                    "report": evidence.get("report", {}).get("report"),
                    "execution": thinking_summary,
                },
            ) from exc
        return {
            "session_id": session_id,
            "turn_id": turn_id,
            "answer": answer,
            "tool_calls": tool_calls,
            "report": evidence.get("report", {}).get("report"),
            "thinking": thinking_summary,
            "model": model_name,
            "turn": turn.to_dict(include_tool_calls=True),
        }

    def stream_chat(self, payload: dict) -> Generator[dict, None, None]:
        question = str(payload.get("question") or payload.get("message") or "").strip()
        if not question:
            raise ValueError("question 不能为空")

        requested_session_id = str(payload.get("session_id") or "").strip()
        session_id = (
            requested_session_id
            if requested_session_id and not self._is_legacy_local_session_id(requested_session_id)
            else f"agent-{uuid4().hex[:10]}"
        )
        turn_id = f"turn-{uuid4().hex[:12]}"
        session = self._ensure_session(session_id, question)
        turn = AgentTurn(
            turn_id=turn_id,
            session_id=session_id,
            question=question,
            status="running",
            created_at=datetime.utcnow(),
        )
        db.session.add(turn)
        db.session.commit()

        plan = self._plan_tools(question, session_id)
        tool_calls = []
        evidence: dict[str, dict] = {}

        yield {"type": "session", "session_id": session_id, "turn_id": turn_id, "title": session.title}

        for step in plan:
            if step["tool"] == "generate_report":
                step["args"]["evidence"] = evidence
                step["args"]["content"] = self._compose_report_content(question, evidence)
            call = self._execute_and_record(session_id=session_id, question=question, tool_name=step["tool"], args=step["args"])
            tool_calls.append(call)
            if call["status"] == "success":
                evidence[self._evidence_key(step["tool"])] = call["tool_result"]
            yield {"type": "tool_call", "tool_call": call}

        thinking_summary = self._execution_summary(tool_calls)
        report_id = ((evidence.get("report") or {}).get("report") or {}).get("id")
        tool_call_ids = [int(item["id"]) for item in tool_calls if item.get("id")]

        try:
            answer = ""
            model_name = None
            for event in DeepSeekClient.stream_answer(question, evidence):
                if event["type"] == "delta":
                    answer += event["content"]
                    model_name = event.get("model")
                    yield event
                elif event["type"] == "replace":
                    answer = event["content"]
                    model_name = event.get("model")
                    yield event
                elif event["type"] == "final":
                    answer = event["content"]
                    model_name = event.get("model")

            self._persist_report_runtime(evidence, tool_calls, model_name or "", answer)
            turn.answer = answer
            turn.thinking_summary = thinking_summary
            turn.model_name = model_name
            turn.status = "success"
            turn.report_id = int(report_id) if report_id else None
            turn.finished_at = datetime.utcnow()
            turn.set_tool_call_ids(tool_call_ids)
            session.updated_at = turn.finished_at
            db.session.commit()
            yield {
                "type": "done",
                "data": {
                    "session_id": session_id,
                    "turn_id": turn_id,
                    "answer": answer,
                    "tool_calls": tool_calls,
                    "report": evidence.get("report", {}).get("report"),
                    "thinking": thinking_summary,
                    "model": model_name,
                    "turn": turn.to_dict(include_tool_calls=True),
                },
            }
        except DeepSeekInvocationError as exc:
            turn.answer = None
            turn.thinking_summary = thinking_summary
            turn.model_name = None
            turn.status = "failed"
            turn.report_id = int(report_id) if report_id else None
            turn.finished_at = datetime.utcnow()
            turn.set_tool_call_ids(tool_call_ids)
            session.updated_at = turn.finished_at
            db.session.commit()
            raise AgentChatError(
                str(exc),
                {
                    "session_id": session_id,
                    "turn_id": turn_id,
                    "tool_calls": tool_calls,
                    "report": evidence.get("report", {}).get("report"),
                    "execution": thinking_summary,
                },
            ) from exc
    @staticmethod
    def _ensure_session(session_id: str, question: str) -> AgentSession:
        session = db.session.get(AgentSession, session_id)
        if session is None:
            session = AgentSession(
                session_id=session_id,
                title=question[:32] or "新的市场问数",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            db.session.add(session)
            db.session.commit()
        return session

    @staticmethod
    def list_sessions(limit: int = 50) -> dict:
        rows = (
            AgentSession.query.filter(AgentSession.session_id.notlike(f"{LEGACY_LOCAL_SESSION_PREFIX}%"))
            .order_by(AgentSession.updated_at.desc())
            .limit(min(100, max(1, limit)))
            .all()
        )
        return {"items": [row.to_dict(include_turns=False) for row in rows]}

    @staticmethod
    def create_session(title: str | None = None) -> AgentSession:
        session = AgentSession(
            session_id=f"agent-{uuid4().hex[:10]}",
            title=(str(title or "").strip() or "新的市场问数")[:64],
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.session.add(session)
        db.session.commit()
        return session

    @staticmethod
    def rename_session(session_id: str, title: str) -> AgentSession:
        session = AgentService.get_session(session_id)
        if session is None:
            raise ValueError("会话不存在")
        session.title = (str(title or "").strip() or session.title)[:64]
        session.updated_at = datetime.utcnow()
        db.session.commit()
        return session

    @staticmethod
    def delete_session(session_id: str) -> None:
        session = AgentService.get_session(session_id)
        if session is None:
            raise ValueError("会话不存在")
        GeneratedReport.query.filter_by(session_id=session_id).delete()
        AgentToolCall.query.filter_by(session_id=session_id).delete()
        db.session.delete(session)
        db.session.commit()

    @staticmethod
    def get_session(session_id: str) -> AgentSession | None:
        if AgentService._is_legacy_local_session_id(session_id):
            return None
        return db.session.get(AgentSession, session_id)

    @staticmethod
    def _is_legacy_local_session_id(session_id: str | None) -> bool:
        return str(session_id or "").strip().lower().startswith(LEGACY_LOCAL_SESSION_PREFIX)

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
            "deepseek_used": True,
            "grounding_guard_applied": True,
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
        wants_detail = any(word in question for word in ["详情", "这套", "这条", "房源id", "系统id", "来源房源id", "原始链接"])
        wants_compare = any(word in question for word in ["对比", "比较", "区别", "差多少", "哪个区县更"])
        wants_anomaly = any(word in question for word in ["异常", "为什么异常", "为啥异常", "问题房源", "待复核"])
        wants_crawl = any(word in question for word in ["采集", "爬虫", "补采", "任务", "日志", "失败页"])
        wants_model = any(word in question for word in ["模型", "mae", "rmse", "r²", "r2", "特征", "聚类", "异常", "预测"])
        wants_trend = any(word in question for word in ["趋势", "走势", "近12月", "图表", "分布"])
        wants_mortgage = any(
            word in question
            for word in ["贷款", "月供", "首付", "按揭", "还款", "利率", "贷多少", "供多少"]
        )
        wants_destination = any(word in question for word in ["附近", "校区", "校园", "通勤", "交通", "路线", "到学校", "到西南大学"])
        wants_recommendation = any(
            word in question
            for word in ["推荐", "买房", "置业", "性价比", "通勤", "预算", "刚工作", "首套", "适合", "候选", "学区"]
        )
        wants_sql_query = bool(
            re.search(
                r"sql|mysql|自然语言查询|数据库(?:里)?查|自定义查询|复杂查询|分组(?:统计|汇总)?|聚合(?:统计|查询)?|中位数|百分位|top\s*\d+|排名前\s*\d+|按.+(?:统计|汇总)",
                normalized,
            )
        )
        if wants_sql_query:
            plan.append({"tool": "query_readonly_sql", "args": {"question": question}})
        if wants_crawl:
            plan.append({"tool": "get_crawl_status", "args": {"limit": 10}})

        if wants_trend:
            plan.append({"tool": "get_chart_series", "args": {"chart_type": "price_trend", "months": 12}})

        if wants_detail:
            plan.append({"tool": "get_listing_detail", "args": self._extract_listing_detail_args(question, district)})

        if wants_compare:
            comparison = self._extract_district_comparison_args(question, district)
            if comparison:
                plan.append({"tool": "compare_districts", "args": comparison})

        if wants_anomaly:
            anomaly_args = self._extract_anomaly_args(question)
            if anomaly_args:
                plan.append({"tool": "explain_listing_anomaly", "args": anomaly_args})

        if wants_model or wants_report:
            plan.append({"tool": "get_model_result", "args": {}})

        if wants_recommendation:
            plan.append({"tool": "recommend_buy_options", "args": self._extract_buyer_preferences(question, district)})
        destination_preferences = self._extract_destination_preferences(question, district)
        if destination_preferences and wants_destination:
            plan.append({"tool": "resolve_destination_poi", "args": destination_preferences})
        if destination_preferences and wants_recommendation:
            plan.append(
                {
                    "tool": "recommend_destination_options",
                    "args": {
                        **self._extract_buyer_preferences(question, district),
                        **destination_preferences,
                        **self._extract_mortgage_preferences(question),
                    },
                }
            )
        if wants_mortgage:
            plan.append({"tool": "estimate_mortgage", "args": self._extract_mortgage_preferences(question)})

        if wants_report or not plan or (
            not wants_sql_query
            and any(word in question for word in ["均价", "价格", "区县", "市场", "房价", "挂牌价"])
        ):
            plan.insert(0, {"tool": "query_market_stats", "args": {"district": district, "limit": 20}})

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
            "query_readonly_sql": "sql_query",
            "recommend_buy_options": "buyer_options",
            "resolve_destination_poi": "destination",
            "recommend_destination_options": "destination_options",
            "get_chart_series": "chart",
            "get_crawl_status": "crawl",
            "run_incremental_crawl": "crawl_task",
            "run_analysis_job": "analysis_job",
            "get_model_result": "model",
            "estimate_mortgage": "mortgage",
            "generate_report": "report",
        }.get(tool_name, tool_name)

    @staticmethod
    def _market_conclusion(market: dict) -> str:
        overview = market.get("overview") or {}
        districts = market.get("district_items") or []
        requested_district = (market.get("query") or {}).get("requested_district")
        if districts:
            item = districts[0]
            return (
                f"{item.get('district')} 当前平均挂牌单价为 {item.get('avg_unit_price', 0)} 元/平方米，"
                f"样本量 {item.get('listing_count', 0)} 套。"
            )
        if requested_district:
            return f"当前数据中未查询到 {requested_district} 的有效房源，不能用全市均价替代该区县挂牌价。"
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
        districts = market.get("district_items") or []
        requested_district = (market.get("query") or {}).get("requested_district")
        if requested_district and districts:
            item = districts[0]
            return (
                f"- 区县统计：{item.get('district')} 有效样本 {item.get('listing_count', 0)} 套，"
                f"平均挂牌单价 {item.get('avg_unit_price', 0)} 元/平方米，"
                f"平均挂牌总价 {item.get('avg_total_price', 0)} 万元。"
            )
        if requested_district:
            return (
                f"- 区县统计：工具返回 {requested_district} 匹配结果为 0 条；"
                f"全市有效样本 {overview.get('active_count', 0)} 套仅作数据覆盖说明，不作为该区县挂牌价。"
            )
        if not overview:
            return "- 市场统计工具未返回有效数据。"
        return (
            f"- 市场统计：有效样本 {overview.get('active_count', 0)} 套，"
            f"平均挂牌单价 {overview.get('avg_unit_price', 0)} 元/平方米，"
            f"区县覆盖 {overview.get('district_count', 0)} 个；"
            f"当前高位区县 {top.get('district', '暂无')}。"
        )

    @staticmethod
    def _buyer_conclusion(buyer_options: dict) -> str:
        items = buyer_options.get("items") or []
        summary = buyer_options.get("summary") or {}
        query = buyer_options.get("query") or {}
        if not items:
            budget_max = query.get("budget_max")
            district = query.get("district")
            if budget_max:
                return f"当前条件下没有检索到符合预算上限 {budget_max} 万元的候选房源。"
            if district:
                return f"当前条件下没有检索到 {district} 的候选房源。"
            return "当前条件下没有检索到可推荐的候选房源。"
        top_item = items[0]
        listing = top_item.get("listing") or {}
        return (
            f"按当前预算与偏好，优先推荐 {listing.get('district')}·{listing.get('community') or listing.get('title')}，"
            f"综合推荐分 {top_item.get('recommendation_score')}，在 {summary.get('matched_count', 0)} 套候选中排序靠前。"
        )

    @staticmethod
    def _destination_conclusion(destination_options: dict) -> str:
        items = destination_options.get("items") or []
        summary = destination_options.get("summary") or {}
        destination = destination_options.get("destination") or {}
        keyword = destination_options.get("query", {}).get("destination_keyword")
        if not items:
            if keyword:
                return f"当前没有检索到适合 {keyword} 周边通勤与预算条件的候选房源。"
            return "当前没有检索到可用于目的地推荐的候选房源。"
        top_item = items[0]
        listing = top_item.get("listing") or {}
        commute = top_item.get("commute_estimate") or {}
        if commute.get("matched") and commute.get("estimated_minutes") is not None:
            return (
                f"如果优先考虑 {destination.get('name') or keyword} 周边通勤，"
                f"{listing.get('district')}·{listing.get('community') or listing.get('title')} 当前更适合作为首选，"
                f"估算通勤约 {commute.get('estimated_minutes')} 分钟。"
            )
        return (
            f"当前目的地推荐先按数据库候选和质量分排序，首选是 "
            f"{listing.get('district')}·{listing.get('community') or listing.get('title')}。"
        )

    @staticmethod
    def _destination_evidence_lines(destination_options: dict) -> str:
        items = destination_options.get("items") or []
        summary = destination_options.get("summary") or {}
        destination = destination_options.get("destination") or {}
        keyword = destination_options.get("query", {}).get("destination_keyword")
        if not items:
            return "\n".join(
                [
                    f"- 目的地：{destination.get('name') or keyword or '未提供'}。",
                    f"- 推荐结果：匹配 0 套；{summary.get('destination_note') or summary.get('note')}",
                    f"- 学区说明：{summary.get('school_district_note')}",
                ]
            )
        top_item = items[0]
        listing = top_item.get("listing") or {}
        commute = top_item.get("commute_estimate") or {}
        mortgage = top_item.get("mortgage_estimate") or {}
        lines = [
            f"- 目的地：{destination.get('name') or keyword}，定位地址 {destination.get('address') or '待补充'}。",
            f"- 候选首选：{listing.get('title')}，挂牌总价 {listing.get('total_price')} 万元，挂牌单价 {listing.get('unit_price')} 元/平方米。",
            f"- 综合得分：数据库推荐分 {top_item.get('recommendation_score')}，目的地通勤分 {top_item.get('destination_score')}，合成分 {top_item.get('combined_score')}。",
        ]
        if commute.get("matched") and commute.get("estimated_minutes") is not None:
            lines.append(
                f"- 通勤估算：距离约 {commute.get('distance_km')} 公里，估算约 {commute.get('estimated_minutes')} 分钟；{summary.get('commute_note')}"
            )
        else:
            lines.append(f"- 通勤估算：{summary.get('commute_note')}")
        if mortgage:
            lines.append(
                f"- 贷款估算：首付约 {mortgage.get('down_payment')} 万元，月供约 {mortgage.get('monthly_payment')} 元。"
            )
        lines.append(f"- 学区说明：{summary.get('school_district_note')}")
        return "\n".join(lines)

    @staticmethod
    def _buyer_evidence_lines(buyer_options: dict, market: dict) -> str:
        items = buyer_options.get("items") or []
        summary = buyer_options.get("summary") or {}
        query = buyer_options.get("query") or {}
        if not items:
            return (
                f"- 候选检索结果：匹配 0 套；当前条件包括预算上限 {query.get('budget_max') or '未限定'} 万元、"
                f"面积下限 {query.get('area_min') or '未限定'} 平方米。"
            )
        top_item = items[0]
        listing = top_item.get("listing") or {}
        breakdown = top_item.get("score_breakdown") or {}
        commute_proxy = top_item.get("commute_proxy") or {}
        districts = "、".join(summary.get("district_mix") or []) or "暂无"
        market_line = AgentService._market_evidence_line(market) if market else "- 本轮未额外请求全市市场统计。"
        return "\n".join(
            [
                f"- 候选房源：{listing.get('title')}，挂牌总价 {listing.get('total_price')} 万元，挂牌单价 {listing.get('unit_price')} 元/平方米，面积 {listing.get('area')} 平方米。",
                f"- 推荐评分：预算匹配 {breakdown.get('budget_fit')}，面积匹配 {breakdown.get('area_fit')}，通勤便利代理 {breakdown.get('commute_proxy')}，质量分 {breakdown.get('quality')}。",
                f"- 通勤代理说明：{commute_proxy.get('label')}；{summary.get('commute_note')}",
                f"- 候选覆盖：共匹配 {summary.get('matched_count', 0)} 套，主要分布在 {districts}。",
                market_line,
            ]
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
        if "两江新区" in question or "渝北" in question or "南岸" in question:
            return "可继续查看该区县趋势图和异常样本，判断是否需要按区县补采。"
        if market.get("overview", {}).get("active_count", 0) == 0:
            return "先执行冷启动导入或增量采集，再进行 Dashboard、模型和 Agent 演示。"
        return "答辩时可把右侧工具调用 input/output 作为 Agent 未编造数值的证据。"

    @staticmethod
    def _buyer_suggestion(buyer_options: dict) -> str:
        items = buyer_options.get("items") or []
        query = buyer_options.get("query") or {}
        if not items:
            return "可适当放宽预算、面积或区县条件后重试，并优先补充带近地铁标签和更新更近的房源。"
        top_item = items[0]
        listing = top_item.get("listing") or {}
        reasons = "；".join(top_item.get("reasons") or [])
        district = listing.get("district")
        budget_max = query.get("budget_max")
        return (
            f"可先重点查看 {district} 的同类房源，并围绕“{reasons}”做人工复核；"
            f"如果预算上限仍是 {budget_max or '当前值'} 万元，建议再追问该区县的挂牌价分布与异常样本。"
        )

    @staticmethod
    def _destination_suggestion(destination_options: dict) -> str:
        summary = destination_options.get("summary") or {}
        items = destination_options.get("items") or []
        if not items:
            return "可放宽预算或区县条件后重试；如果重点是学区房，需要先补充独立的学校/学区数据。"
        top_item = items[0]
        listing = top_item.get("listing") or {}
        return (
            f"可继续查看 {listing.get('district')} 的相似小区，并把“真实路线时间”和“贷款月供”作为下一轮筛选条件；"
            f"{summary.get('school_district_note')}"
        )

    @staticmethod
    def _extract_buyer_preferences(question: str, district: str | None) -> dict:
        text = question or ""
        budget_matches = [float(item) for item in __import__("re").findall(r"(\d+(?:\.\d+)?)\s*万", text)]
        area_matches = [float(item) for item in __import__("re").findall(r"(\d+(?:\.\d+)?)\s*(?:平|平米|平方米)", text)]
        prefer_metro = any(word in text for word in ["通勤", "地铁", "近地铁", "方便上班"])
        commute_mode = "metro_priority" if prefer_metro else "balanced"
        if "性价比" in text or "预算有限" in text or "刚工作" in text:
            commute_mode = "value_priority" if not prefer_metro else "metro_priority"
        return {
            "district": district,
            "budget_max": max(budget_matches) if budget_matches else None,
            "area_min": min(area_matches) if area_matches else None,
            "prefer_metro": prefer_metro,
            "commute_mode": commute_mode,
            "limit": 5,
        }

    @staticmethod
    def _extract_destination_preferences(question: str, district: str | None) -> dict | None:
        text = question or ""
        destination_keyword = None
        for keyword in DESTINATION_KEYWORDS:
            if keyword in text:
                destination_keyword = keyword
                break
        if destination_keyword is None:
            matches = __import__("re").findall(r"在(.{2,20}?)(?:附近|周边|旁边|边上)", text)
            if matches:
                destination_keyword = matches[0].strip()
        if destination_keyword is None:
            return None
        return {
            "destination_keyword": destination_keyword,
            "district": district,
        }

    @staticmethod
    def _extract_mortgage_preferences(question: str) -> dict:
        text = question or ""
        money_matches = [float(item) for item in __import__("re").findall(r"(\d+(?:\.\d+)?)\s*万", text)]
        percent_matches = [float(item) for item in __import__("re").findall(r"(\d+(?:\.\d+)?)\s*%", text)]
        year_matches = [int(item) for item in __import__("re").findall(r"(\d{1,2})\s*年", text)]
        rate_matches = [float(item) for item in __import__("re").findall(r"利率(?:按|大概|约)?\s*(\d+(?:\.\d+)?)\s*%?", text)]
        down_payment_ratio = percent_matches[0] / 100 if percent_matches else None
        down_payment_text = None
        for marker in ("二成", "三成", "四成", "五成"):
            if marker in text:
                down_payment_text = marker
                break
        return {
            "purchase_price": max(money_matches) if money_matches else None,
            "budget_max": max(money_matches) if money_matches else None,
            "down_payment_ratio": down_payment_ratio,
            "down_payment_text": down_payment_text,
            "loan_years": max(year_matches) if year_matches else 30,
            "annual_rate": rate_matches[0] if rate_matches else None,
        }

    @staticmethod
    def _extract_listing_detail_args(question: str, district: str | None) -> dict:
        text = question or ""
        listing_id = None
        source_listing_id = None
        source = None
        id_matches = __import__("re").findall(r"(?:系统ID|房源ID|id|ID)\s*[:：]?\s*(\d+)", text)
        if id_matches:
            listing_id = int(id_matches[0])
        source_matches = __import__("re").findall(r"(fang|anjuke_mobile|lianjia)", text, flags=__import__("re").I)
        if source_matches:
            source = source_matches[0].lower()
        source_id_matches = __import__("re").findall(r"(?:来源房源ID|source_listing_id)\s*[:：]?\s*([A-Za-z0-9_-]+)", text)
        if source_id_matches:
            source_listing_id = source_id_matches[0]
        budget_matches = [float(item) for item in __import__("re").findall(r"(\d+(?:\.\d+)?)\s*万", text)]
        budget_max = max(budget_matches) if budget_matches else None
        budget_min = min(budget_matches) if len(budget_matches) > 1 else None
        return {
            "listing_id": listing_id,
            "source_listing_id": source_listing_id,
            "source": source,
            "district": district,
            "budget_min": budget_min,
            "budget_max": budget_max,
            "limit": 5,
        }

    @staticmethod
    def _extract_district_comparison_args(question: str, district: str | None) -> dict | None:
        text = question or ""
        candidates = []
        for item in DISTRICT_KEYWORDS:
            if item in text:
                normalized = item if item.endswith("区") or item.endswith("县") or item.endswith("新区") else f"{item}区"
                if normalized not in candidates:
                    candidates.append(normalized)
        if district and district not in candidates:
            candidates.insert(0, district)
        if len(candidates) >= 2:
            return {"district_a": candidates[0], "district_b": candidates[1], "limit": 100}
        return None

    @staticmethod
    def _extract_anomaly_args(question: str) -> dict | None:
        text = question or ""
        listing_id = None
        source_listing_id = None
        id_matches = __import__("re").findall(r"(?:系统ID|房源ID|id|ID)\s*[:：]?\s*(\d+)", text)
        if id_matches:
            listing_id = int(id_matches[0])
        source_id_matches = __import__("re").findall(r"(?:来源房源ID|source_listing_id)\s*[:：]?\s*([A-Za-z0-9_-]+)", text)
        if source_id_matches:
            source_listing_id = source_id_matches[0]
        if listing_id is None and source_listing_id is None:
            return None
        source_matches = __import__("re").findall(r"(fang|anjuke_mobile|lianjia)", text, flags=__import__("re").I)
        return {
            "listing_id": listing_id,
            "source_listing_id": source_listing_id,
            "source": source_matches[0].lower() if source_matches else None,
        }

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


class AgentChatError(RuntimeError):
    def __init__(self, message: str, data: dict | None = None) -> None:
        super().__init__(message)
        self.data = data or {}

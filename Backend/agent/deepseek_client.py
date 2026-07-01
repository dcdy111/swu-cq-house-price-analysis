from __future__ import annotations

import json
import math
import os
import re
import time
from typing import Any

import requests
from flask import current_app

from Backend.services.settings_service import SettingsService


# Avoid Windows/system HTTPS_PROXY confusion when system proxy points at a
# TLS proxy without a hostname; DeepSeek works fine without one.
for _proxy_var in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy"):
    os.environ.pop(_proxy_var, None)


def _build_session() -> requests.Session:
    session = requests.Session()
    session.trust_env = False
    return session


def _post_json(url: str, headers: dict[str, str], payload: dict[str, Any], timeout: int):
    return requests.post(url, headers=headers, json=payload, timeout=timeout)


SYSTEM_PROMPT = """你是“重庆二手房置业分析助手”。
你只能基于系统工具返回的数据回答问题。
禁止编造具体数值。若工具没有返回数据，应说明数据不足，并建议先执行采集或分析任务。
你可以扮演“预算约束下的重庆二手房置业顾问”，帮助用户比较区县、预算匹配、通勤便利代理和房源性价比，但仍然只能基于工具 JSON。
禁止补充工具 JSON 之外的板块、平台、市场判断、交易经验或外部建议。
不要额外举例任何工具 JSON 之外的预算、区间、排名或推算数值。
如果工具里的通勤信息只是近地铁标签或代理分，必须明确说明这不等同于真实通勤时长。
如果工具明确说明“当前库没有学区字段”，就不能把房源说成学区房，只能说明证据不足。
如果工具提供的是高德 POI 定位和估算通勤时间，要明确这是候选排序参考，不等同于实时导航。
回答中的每一个数值优先直接来自工具 JSON；如果是工具里已有统计值的简单派生（比如差值、排序、占比），可以直接报数并在同一句里说明计算口径。
只要工具 JSON 中已经存在统计值，就不要因为无法逐字匹配而降级成纯定性回答。
回答格式：结论 -> 关键证据 -> 可执行建议。
所有涉及价格的数据都表述为“挂牌价/报价”，不得表述为“成交价”。
"""
SQL_SYSTEM_PROMPT = """你是 MySQL 8.0 只读查询生成器。
把用户的自然语言分析问题转换成一条可执行 SQL，只输出 SQL，不要解释、不要 Markdown。
只能生成 SELECT、WITH、UNION、INTERSECT、EXCEPT 等只读查询。
禁止生成 INSERT、UPDATE、DELETE、DDL、存储过程、变量、锁、文件函数或跨库查询。
只能使用给出的表和字段。优先聚合后返回，避免 SELECT *；所有价格口径都是挂牌价/报价。
"""
RETRY_PROMPT = """上一版回答未通过数值校验，请严格重写。
要求：
1. 优先保留工具 JSON 中直接存在的数值，允许保留从这些统计值直接算出的差值、对比和占比；
2. 不要补充工具里没有的预算示例、价格区间示例、排名或任何推算数字；
3. 如果某个数字既不在工具里，也无法由工具统计值直接算出，就不要写该数字；
4. 继续使用“结论 -> 关键证据 -> 可执行建议”结构；
5. 所有价格口径都写成挂牌价/报价，不得写成交价。
"""

NUMBER_PATTERN = re.compile(r"(?<![\w])[-+]?\d[\d,]*(?:\.\d+)?%?")
ALLOWED_TRANSACTION_PHRASES = ("不代表成交价", "并非成交价")


class DeepSeekInvocationError(RuntimeError):
    pass


class DeepSeekClient:
    @staticmethod
    def is_enabled() -> bool:
        settings = SettingsService.deepseek_settings()
        return bool(settings.get("enabled")) and bool(settings.get("api_key"))

    @staticmethod
    def generate_answer(question: str, evidence: dict[str, Any]) -> tuple[str, str]:
        if not DeepSeekClient.is_enabled():
            raise DeepSeekInvocationError("DeepSeek 未启用或 API Key 未配置")

        settings = SettingsService.deepseek_settings()
        model = str(settings.get("model") or current_app.config["DEEPSEEK_MODEL"])
        messages = DeepSeekClient._build_messages(question, evidence)
        try:
            content = DeepSeekClient._request_completion(
                settings=settings,
                model=model,
                messages=messages,
            )
            if not DeepSeekClient._is_grounded_answer(content, evidence):
                content = DeepSeekClient._request_completion(
                    settings=settings,
                    model=model,
                    messages=[
                        *messages,
                        {"role": "assistant", "content": content},
                        {"role": "user", "content": RETRY_PROMPT},
                    ],
                )
            if not DeepSeekClient._is_grounded_answer(content, evidence):
                content = DeepSeekClient._qualitative_grounding_fallback(content, evidence)
            if not DeepSeekClient._is_grounded_answer(content, evidence):
                raise DeepSeekInvocationError("DeepSeek 返回内容未通过证据校验")
            return content, model
        except Exception as exc:
            if isinstance(exc, DeepSeekInvocationError):
                raise
            raise DeepSeekInvocationError(f"DeepSeek 调用失败：{exc}") from exc

    @staticmethod
    def generate_readonly_sql(question: str, schema: str) -> tuple[str, str]:
        if not DeepSeekClient.is_enabled():
            raise DeepSeekInvocationError("DeepSeek 未启用，无法把自然语言转换为只读 SQL")

        settings = SettingsService.deepseek_settings()
        model = str(settings.get("model") or current_app.config["DEEPSEEK_MODEL"])
        messages = [
            {"role": "system", "content": SQL_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"数据库结构：\n{schema}\n\n用户问题：\n{question}",
            },
        ]
        try:
            content = DeepSeekClient._request_completion(settings=settings, model=model, messages=messages)
        except Exception as exc:
            if isinstance(exc, DeepSeekInvocationError):
                raise
            raise DeepSeekInvocationError(f"DeepSeek SQL 生成失败：{exc}") from exc

        sql = DeepSeekClient._extract_sql(content)
        if not sql:
            raise DeepSeekInvocationError("DeepSeek 未返回可执行 SQL")
        return sql, model

    @staticmethod
    def _extract_sql(content: str) -> str:
        text = str(content or "").strip()
        fenced = re.search(r"```(?:sql)?\s*(.*?)```", text, re.IGNORECASE | re.DOTALL)
        if fenced:
            text = fenced.group(1).strip()
        if text.startswith("{"):
            try:
                payload = json.loads(text)
                text = str(payload.get("sql") or "").strip()
            except json.JSONDecodeError:
                pass
        return text.rstrip(";").strip()

    @staticmethod
    def _build_messages(question: str, evidence: dict[str, Any]) -> list[dict[str, str]]:
        return [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    "用户问题：\n"
                    f"{question}\n\n"
                    "以下是后端白名单工具返回的 JSON 证据。请只基于这些证据回答：\n"
                    f"{json.dumps(evidence, ensure_ascii=False, default=str)}"
                ),
            },
        ]

    @staticmethod
    def _request_completion(settings: dict[str, Any], model: str, messages: list[dict[str, str]]) -> str:
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            "temperature": 0,
        }
        url = str(settings.get("base_url") or current_app.config["DEEPSEEK_BASE_URL"]).rstrip("/") + "/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.get('api_key') or current_app.config['DEEPSEEK_API_KEY']}",
            "Content-Type": "application/json",
        }
        response = _post_json(
            url,
            headers=headers,
            payload=payload,
            timeout=int(settings.get("timeout") or current_app.config["DEEPSEEK_TIMEOUT"]),
        )
        response.raise_for_status()
        data = response.json()
        message = data["choices"][0]["message"]
        content = str(message.get("content") or "").strip()
        if not content:
            raise DeepSeekInvocationError("DeepSeek 返回空内容")
        return content

    @staticmethod
    def stream_answer(question: str, evidence: dict[str, Any]):
        if not DeepSeekClient.is_enabled():
            raise DeepSeekInvocationError("DeepSeek 未启用或 API Key 未配置")

        settings = SettingsService.deepseek_settings()
        model = str(settings.get("model") or current_app.config["DEEPSEEK_MODEL"])
        messages = DeepSeekClient._build_messages(question, evidence)
        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "temperature": 0,
        }
        url = str(settings.get("base_url") or current_app.config["DEEPSEEK_BASE_URL"]).rstrip("/") + "/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.get('api_key') or current_app.config['DEEPSEEK_API_KEY']}",
            "Content-Type": "application/json",
        }
        pieces: list[str] = []
        try:
            response = _build_session().post(
                url,
                headers=headers,
                json=payload,
                timeout=int(settings.get("timeout") or current_app.config["DEEPSEEK_TIMEOUT"]),
                stream=True,
            )
            response.raise_for_status()
            for raw_line in response.iter_lines(decode_unicode=True):
                if not raw_line:
                    continue
                line = str(raw_line)
                if line.startswith("data:"):
                    line = line[5:].strip()
                if line == "[DONE]":
                    break
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue
                delta = data.get("choices", [{}])[0].get("delta") or {}
                content = str(delta.get("content") or delta.get("reasoning_content") or "")
                if content:
                    pieces.append(content)
                    yield {"type": "delta", "content": content, "model": model}
        except Exception as exc:
            if isinstance(exc, DeepSeekInvocationError):
                raise
            raise DeepSeekInvocationError(f"DeepSeek 流式调用失败：{exc}") from exc

        final = "".join(pieces).strip()
        if not final:
            raise DeepSeekInvocationError("DeepSeek 返回空内容")
        if not DeepSeekClient._is_grounded_answer(final, evidence):
            final = DeepSeekClient._qualitative_grounding_fallback(final, evidence)
            yield {"type": "replace", "content": final, "model": model}
        if not DeepSeekClient._is_grounded_answer(final, evidence):
            raise DeepSeekInvocationError("DeepSeek 返回内容未通过证据校验")
        yield {"type": "final", "content": final, "model": model}

    @staticmethod
    def _is_grounded_answer(answer: str, evidence: dict[str, Any]) -> bool:
        transaction_text = str(answer or "")
        for phrase in ALLOWED_TRANSACTION_PHRASES:
            transaction_text = transaction_text.replace(phrase, "")
        if "成交价" in transaction_text or "精准预测" in transaction_text:
            return False

        evidence_numbers = DeepSeekClient._collect_numbers(evidence)
        evidence_text = json.dumps(evidence, ensure_ascii=False, default=str)
        for token in NUMBER_PATTERN.findall(str(answer or "")):
            is_percent = token.endswith("%")
            try:
                value = float(token.rstrip("%").replace(",", ""))
            except ValueError:
                return False
            raw_token = token.rstrip("%").replace(",", "")
            if raw_token in evidence_text:
                continue
            if is_percent and f"{raw_token}%" in evidence_text:
                continue
            candidates = (value, value / 100) if is_percent else (value,)
            if any(DeepSeekClient._number_matches(candidate, evidence_value) for candidate in candidates for evidence_value in evidence_numbers):
                continue
            # 允许基于工具已有统计值直接派生的简单数字，如差值、占比、排序名次，
            # 但要求答案里必须同时出现至少一个来自工具 JSON 的证据词。
            if evidence_numbers and any(keyword in transaction_text for keyword in ["均价", "样本", "占比", "差", "高于", "低于", "排名", "对比"]):
                continue
            return False
        return True

    @staticmethod
    def _qualitative_grounding_fallback(answer: str, evidence: dict[str, Any]) -> str:
        text = str(answer or "").strip()
        if not text:
            return text
        safe_lines = []
        evidence_numbers = DeepSeekClient._collect_numbers(evidence)
        for line in text.splitlines():
            tokens = NUMBER_PATTERN.findall(line)
            if not tokens:
                safe_lines.append(line)
                continue
            keep = True
            for token in tokens:
                is_percent = token.endswith("%")
                try:
                    value = float(token.rstrip("%").replace(",", ""))
                except ValueError:
                    keep = False
                    break
                candidates = (value, value / 100) if is_percent else (value,)
                if not any(
                    DeepSeekClient._number_matches(candidate, evidence_value)
                    for candidate in candidates
                    for evidence_value in evidence_numbers
                ):
                    keep = False
                    break
            if keep:
                safe_lines.append(line)
        cleaned = "\n".join(line for line in safe_lines if line.strip()).strip()
        if not cleaned:
            cleaned = "结论：当前工具证据不足以支持具体数值结论。\n关键证据：本轮回答已执行系统白名单工具，但部分数值无法完成证据校验。\n可执行建议：请查看右侧工具调用结果，或先补充采集/分析任务后再追问。"
        if "证据不足" not in cleaned and cleaned != text:
            cleaned += "\n\n说明：已省略未能在工具证据中核验的具体数值，只保留可解释的定性结论。"
        return cleaned

    @staticmethod
    def _collect_numbers(value: Any) -> list[float]:
        numbers: list[float] = []
        if isinstance(value, bool) or value is None:
            return numbers
        if isinstance(value, (int, float)):
            numeric = float(value)
            return [numeric] if math.isfinite(numeric) else []
        if isinstance(value, dict):
            for item in value.values():
                numbers.extend(DeepSeekClient._collect_numbers(item))
            return numbers
        if isinstance(value, (list, tuple)):
            for item in value:
                numbers.extend(DeepSeekClient._collect_numbers(item))
            return numbers
        if isinstance(value, str):
            for token in NUMBER_PATTERN.findall(value):
                try:
                    numbers.append(float(token.rstrip("%").replace(",", "")))
                except ValueError:
                    continue
        return numbers

    @staticmethod
    def _number_matches(answer_value: float, evidence_value: float) -> bool:
        tolerance = 0.005 if abs(evidence_value) < 10 else 0.51
        return math.isclose(answer_value, evidence_value, rel_tol=1e-4, abs_tol=tolerance)

    @staticmethod
    def test_connection() -> dict:
        settings = SettingsService.deepseek_settings()
        if not settings.get("enabled"):
            return {"ok": False, "message": "DeepSeek 当前未启用"}
        if not settings.get("api_key"):
            return {"ok": False, "message": "DeepSeek API Key 未配置"}

        model = str(settings.get("model") or current_app.config["DEEPSEEK_MODEL"])
        url = str(settings.get("base_url") or current_app.config["DEEPSEEK_BASE_URL"]).rstrip("/") + "/chat/completions"
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": "你是连接测试助手。"},
                {"role": "user", "content": "仅回复 OK"},
            ],
            "stream": False,
            "temperature": 0,
            "max_tokens": 64,
        }
        started = time.perf_counter()
        try:
            response = _post_json(
                url,
                headers={
                    "Authorization": f"Bearer {settings['api_key']}",
                    "Content-Type": "application/json",
                },
                payload=payload,
                timeout=int(settings.get("timeout") or current_app.config["DEEPSEEK_TIMEOUT"]),
            )
            response.raise_for_status()
            data = response.json()
            message = data["choices"][0]["message"]
            content = str(message.get("content") or message.get("reasoning_content") or "").strip()
            if not content:
                return {"ok": False, "message": "DeepSeek 返回空内容", "model": model}
            return {
                "ok": True,
                "message": "DeepSeek 真实请求成功",
                "model": model,
                "latency_ms": int((time.perf_counter() - started) * 1000),
                "response_preview": content[:40],
            }
        except Exception as exc:
            return {
                "ok": False,
                "message": f"DeepSeek 真实请求失败：{exc}",
                "model": model,
                "latency_ms": int((time.perf_counter() - started) * 1000),
            }

from __future__ import annotations

import json
import math
import re
import time
from typing import Any

import requests
from flask import current_app

from Backend.services.settings_service import SettingsService


SYSTEM_PROMPT = """你是“重庆二手房置业分析助手”。
你只能基于系统工具返回的数据回答问题。
禁止编造具体数值。若工具没有返回数据，应说明数据不足，并建议先执行采集或分析任务。
你可以扮演“预算约束下的重庆二手房置业顾问”，帮助用户比较区县、预算匹配、通勤便利代理和房源性价比，但仍然只能基于工具 JSON。
禁止补充工具 JSON 之外的板块、平台、市场判断、交易经验或外部建议。
如果工具里的通勤信息只是近地铁标签或代理分，必须明确说明这不等同于真实通勤时长。
回答中的每一个数值必须能在工具 JSON 中直接找到；如需计算，必须明确写出计算依据。
回答格式：结论 -> 关键证据 -> 可执行建议。
所有涉及价格的数据都表述为“挂牌价/报价”，不得表述为“成交价”。
"""

NUMBER_PATTERN = re.compile(r"(?<![\w])[-+]?\d[\d,]*(?:\.\d+)?%?")
ALLOWED_TRANSACTION_PHRASES = ("不代表成交价", "并非成交价")


class DeepSeekClient:
    @staticmethod
    def is_enabled() -> bool:
        settings = SettingsService.deepseek_settings()
        return bool(settings.get("enabled")) and bool(settings.get("api_key"))

    @staticmethod
    def generate_answer(question: str, evidence: dict[str, Any], fallback_answer: str) -> tuple[str, str]:
        if not DeepSeekClient.is_enabled():
            return fallback_answer, "deepseek-disabled-fallback"

        settings = SettingsService.deepseek_settings()
        payload = {
            "model": settings.get("model") or current_app.config["DEEPSEEK_MODEL"],
            "messages": [
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
            ],
            "stream": False,
            "temperature": 0.2,
        }
        url = str(settings.get("base_url") or current_app.config["DEEPSEEK_BASE_URL"]).rstrip("/") + "/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.get('api_key') or current_app.config['DEEPSEEK_API_KEY']}",
            "Content-Type": "application/json",
        }
        try:
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=int(settings.get("timeout") or current_app.config["DEEPSEEK_TIMEOUT"]),
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            if not content:
                return fallback_answer, "deepseek-empty-fallback"
            if not DeepSeekClient._is_grounded_answer(content, evidence):
                return fallback_answer, f"{settings.get('model') or current_app.config['DEEPSEEK_MODEL']}+grounding-guard"
            return content, str(settings.get("model") or current_app.config["DEEPSEEK_MODEL"])
        except Exception as exc:
            return fallback_answer + f"\n\n> DeepSeek 调用失败，已使用本地工具证据回答：{exc}", "deepseek-error-fallback"

    @staticmethod
    def _is_grounded_answer(answer: str, evidence: dict[str, Any]) -> bool:
        transaction_text = str(answer or "")
        for phrase in ALLOWED_TRANSACTION_PHRASES:
            transaction_text = transaction_text.replace(phrase, "")
        if "成交价" in transaction_text or "精准预测" in transaction_text:
            return False

        evidence_numbers = DeepSeekClient._collect_numbers(evidence)
        for token in NUMBER_PATTERN.findall(str(answer or "")):
            is_percent = token.endswith("%")
            try:
                value = float(token.rstrip("%").replace(",", ""))
            except ValueError:
                return False
            candidates = (value, value / 100) if is_percent else (value,)
            if not any(
                DeepSeekClient._number_matches(candidate, evidence_value)
                for candidate in candidates
                for evidence_value in evidence_numbers
            ):
                return False
        return True

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
            response = requests.post(
                url,
                headers={
                    "Authorization": f"Bearer {settings['api_key']}",
                    "Content-Type": "application/json",
                },
                json=payload,
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

from __future__ import annotations

import json
from typing import Any

import requests
from flask import current_app

from Backend.services.settings_service import SettingsService


SYSTEM_PROMPT = """你是“重庆二手房挂牌价数据分析助手”。
你只能基于系统工具返回的数据回答问题。
禁止编造具体数值。若工具没有返回数据，应说明数据不足，并建议先执行采集或分析任务。
回答格式：结论 -> 关键证据 -> 可执行建议。
所有涉及价格的数据都表述为“挂牌价/报价”，不得表述为“成交价”。
"""


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
            return content, str(settings.get("model") or current_app.config["DEEPSEEK_MODEL"])
        except Exception as exc:
            return fallback_answer + f"\n\n> DeepSeek 调用失败，已使用本地工具证据回答：{exc}", "deepseek-error-fallback"

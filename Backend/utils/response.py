from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from flask import jsonify


def make_trace_id() -> str:
    prefix = datetime.now().strftime("%Y%m%d")
    return f"{prefix}-{uuid4().hex[:8]}"


def api_success(data=None, message: str = "ok", status_code: int = 200):
    payload = {
        "code": 0,
        "message": message,
        "data": data if data is not None else {},
        "trace_id": make_trace_id(),
    }
    return jsonify(payload), status_code


def api_error(message: str, code: int = 1, status_code: int = 400, data=None):
    payload = {
        "code": code,
        "message": message,
        "data": data if data is not None else {},
        "trace_id": make_trace_id(),
    }
    return jsonify(payload), status_code


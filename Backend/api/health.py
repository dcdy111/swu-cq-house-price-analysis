from __future__ import annotations

from flask import Blueprint

from Backend.utils.response import api_success

bp = Blueprint("health", __name__, url_prefix="/api")


@bp.get("/health")
def health():
    return api_success({"status": "healthy"})


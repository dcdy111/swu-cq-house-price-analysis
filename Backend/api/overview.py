from __future__ import annotations

from flask import Blueprint

from Backend.services.dashboard_service import DashboardService
from Backend.utils.response import api_success


bp = Blueprint("overview", __name__, url_prefix="/api/overview")


@bp.get("")
def overview():
    return api_success(DashboardService.overview())

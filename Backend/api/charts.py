from __future__ import annotations

from flask import Blueprint, request

from Backend.services.dashboard_service import DashboardService
from Backend.utils.response import api_success


bp = Blueprint("charts", __name__, url_prefix="/api/charts")


@bp.get("/district-price")
def district_price():
    limit = int(request.args.get("limit", 20))
    return api_success(DashboardService.district_price(limit=limit))


@bp.get("/district-map")
def district_map():
    return api_success(DashboardService.district_map())


@bp.get("/district-value-profile")
def district_value_profile():
    limit = int(request.args.get("limit", 8))
    return api_success(DashboardService.district_value_profile(limit=limit))


@bp.get("/price-distribution")
def price_distribution():
    return api_success(DashboardService.price_distribution())


@bp.get("/price-trend")
def price_trend():
    months = int(request.args.get("months", 12))
    return api_success(DashboardService.price_trend(months=months))


@bp.get("/area-price-scatter")
def area_price_scatter():
    limit = int(request.args.get("limit", 500))
    return api_success(DashboardService.area_price_scatter(limit=limit))


@bp.get("/layout-distribution")
def layout_distribution():
    limit = int(request.args.get("limit", 8))
    return api_success(DashboardService.layout_distribution(limit=limit))

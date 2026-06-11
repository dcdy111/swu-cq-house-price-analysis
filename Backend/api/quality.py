from __future__ import annotations

from flask import Blueprint, request

from Backend.services.quality_service import QualityService
from Backend.utils.response import api_error, api_success


bp = Blueprint("quality", __name__, url_prefix="/api/quality")


@bp.get("/report")
def report():
    return api_success(QualityService.report())


@bp.get("/reports")
def list_reports():
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))
    return api_success(QualityService.list_reports(page=page, page_size=page_size))


@bp.post("/reports")
def create_report():
    payload = request.get_json(silent=True) or {}
    report_type = str(payload.get("report_type") or "manual")
    item = QualityService.save_report(report_type=report_type)
    return api_success(item.to_dict(include_detail=True), status_code=201)


@bp.get("/reports/<int:report_id>")
def get_report(report_id: int):
    item = QualityService.get_report(report_id)
    if item is None:
        return api_error("质量报告不存在", status_code=404)
    return api_success(item.to_dict(include_detail=True))

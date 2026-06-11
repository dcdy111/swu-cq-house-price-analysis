from __future__ import annotations

from flask import Blueprint, Response, request

from Backend.agent.agent_service import AgentService
from Backend.services.report_export_service import ReportExportService
from Backend.utils.response import api_error, api_success


bp = Blueprint("agent", __name__, url_prefix="/api")


@bp.get("/agent/tools")
def list_tools():
    return api_success(AgentService().list_tools())


@bp.post("/agent/chat")
def chat():
    payload = request.get_json(silent=True) or {}
    try:
        return api_success(AgentService().chat(payload))
    except ValueError as exc:
        return api_error(str(exc), status_code=400)


@bp.get("/reports/<int:report_id>")
def get_report(report_id: int):
    report = AgentService.get_report(report_id)
    if report is None:
        return api_error("报告不存在", status_code=404)
    return api_success(report.to_dict())


@bp.get("/reports/<int:report_id>/export.pdf")
def export_report_pdf(report_id: int):
    report = AgentService.get_report(report_id)
    if report is None:
        return api_error("报告不存在", status_code=404)
    pdf = ReportExportService.to_pdf(report)
    filename = f"report-{report.id}.pdf"
    return Response(
        pdf,
        mimetype="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

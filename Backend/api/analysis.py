from __future__ import annotations

from flask import Blueprint, Response, request

from Backend.services.analysis_service import AnalysisService
from Backend.services.report_export_service import ReportExportService
from Backend.utils.response import api_error, api_success


bp = Blueprint("analysis", __name__, url_prefix="/api/analysis")


@bp.get("/jobs")
def list_jobs():
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))
    return api_success(AnalysisService.list_jobs(page=page, page_size=page_size))


@bp.post("/jobs")
def create_job():
    payload = request.get_json(silent=True) or {}
    try:
        job = AnalysisService.create_job(payload)
    except ValueError as exc:
        return api_error(str(exc), status_code=400)
    if job.status != "success":
        return api_error(job.error_message or "分析任务执行失败", status_code=500, data=job.to_dict(include_results=True))
    return api_success(job.to_dict(include_results=True), status_code=201)


@bp.get("/jobs/latest")
def latest_job():
    job = AnalysisService.latest_success_job()
    if job is None:
        return api_success({"job": None, "results": []})
    data = job.to_dict(include_results=True)
    return api_success({"job": data, "results": data["results"]})


@bp.get("/results/latest-by-type")
def latest_results_by_type():
    return api_success(AnalysisService.latest_results_by_type())


@bp.get("/jobs/<int:job_id>")
def get_job(job_id: int):
    job = AnalysisService.get_job(job_id)
    if job is None:
        return api_error("分析任务不存在", status_code=404)
    return api_success(job.to_dict(include_results=True))


@bp.get("/jobs/<int:job_id>/export.pdf")
def export_job_pdf(job_id: int):
    job = AnalysisService.get_job(job_id)
    if job is None:
        return api_error("分析任务不存在", status_code=404)
    pdf = ReportExportService.analysis_job_to_pdf(job)
    filename = f"analysis-job-{job.id}.pdf"
    return Response(
        pdf,
        mimetype="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

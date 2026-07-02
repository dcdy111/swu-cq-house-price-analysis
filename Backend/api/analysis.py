from __future__ import annotations

from flask import Blueprint, Response, request

from Backend.services.analysis_service import AnalysisService
from Backend.services.report_export_service import ReportExportService
from Backend.services.task_runner import TaskRunner
from Backend.utils.response import api_error, api_success


bp = Blueprint("analysis", __name__, url_prefix="/api/analysis")


def _value_error_response(exc: ValueError):
    message = str(exc)
    if "不存在" in message:
        return api_error(message, status_code=404)
    if "正在运行" in message or "后台执行" in message:
        return api_error(message, status_code=409)
    return api_error(message, status_code=400)


def _dispatch_background_job(payload: dict):
    job, max_samples = AnalysisService.prepare_job(payload)
    submitted = TaskRunner.submit(f"analysis:{job.id}", AnalysisService.run_job, job.id, max_samples=max_samples)
    if not submitted:
        raise ValueError("分析任务已在后台执行，请稍后刷新状态")
    return job


@bp.get("/jobs")
def list_jobs():
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))
    return api_success(AnalysisService.list_jobs(page=page, page_size=page_size))


@bp.post("/jobs")
def create_job():
    payload = request.get_json(silent=True) or {}
    background = bool(payload.get("background"))
    try:
        if background:
            job = _dispatch_background_job(payload)
            return api_success(job.to_dict(include_results=True), status_code=202)
        job = AnalysisService.create_job(payload)
    except ValueError as exc:
        return _value_error_response(exc)
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


@bp.patch("/jobs/<int:job_id>")
def rename_job(job_id: int):
    payload = request.get_json(silent=True) or {}
    try:
        job = AnalysisService.rename_job(job_id, payload.get("name"))
    except ValueError as exc:
        return _value_error_response(exc)
    return api_success(job.to_dict(include_results=True))


@bp.delete("/jobs/<int:job_id>")
def delete_job(job_id: int):
    try:
        AnalysisService.delete_job(job_id)
    except ValueError as exc:
        return _value_error_response(exc)
    return api_success({"id": job_id, "deleted": True})


@bp.post("/jobs/<int:job_id>/replay")
def replay_job(job_id: int):
    payload = request.get_json(silent=True) or {}
    try:
        replay_payload = AnalysisService.replay_payload(job_id)
        if "name" in payload:
            replay_payload["name"] = payload.get("name")
        if "max_samples" in payload:
            replay_payload["max_samples"] = payload.get("max_samples")
        if payload.get("background"):
            job = _dispatch_background_job(replay_payload)
            return api_success(job.to_dict(include_results=True), status_code=202)
        job = AnalysisService.create_job(replay_payload)
    except ValueError as exc:
        return _value_error_response(exc)
    if job.status != "success":
        return api_error(job.error_message or "分析任务执行失败", status_code=500, data=job.to_dict(include_results=True))
    return api_success(job.to_dict(include_results=True), status_code=201)


@bp.post("/simulate")
def simulate_listing():
    payload = request.get_json(silent=True) or {}
    try:
        data = AnalysisService.simulate_listing(payload)
    except ValueError as exc:
        return _value_error_response(exc)
    return api_success(data)


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

from __future__ import annotations

from flask import Blueprint, request

from Backend.services.crawl_service import CrawlService
from Backend.services.task_runner import TaskRunner
from Backend.utils.response import api_error, api_success

bp = Blueprint("crawl", __name__, url_prefix="/api/crawl")


def _dispatch_task(task_id: int):
    task = CrawlService.get_task(task_id, include_logs=True)
    if task is None:
        raise ValueError("任务不存在")
    submitted = TaskRunner.submit(f"crawl:{task_id}", CrawlService.run_task, task_id)
    if not submitted:
        raise ValueError("任务已在后台执行，请稍后刷新状态")
    CrawlService.add_log(task_id, "INFO", "任务已提交到后台执行队列")
    return CrawlService.get_task(task_id, include_logs=True)


@bp.get("/sources")
def sources():
    return api_success({"items": CrawlService.sources()})


@bp.get("/tasks")
def list_tasks():
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("page_size", 20))
    return api_success(CrawlService.list_tasks(page=page, page_size=page_size))


@bp.post("/tasks")
def create_task():
    payload = request.get_json(silent=True) or {}
    try:
        task = CrawlService.create_task(payload)
        if payload.get("run_now"):
            if payload.get("background"):
                task = _dispatch_task(task.id)
                return api_success(task.to_dict(include_logs=True), status_code=202)
            task = CrawlService.run_task(task.id)
        return api_success(task.to_dict(include_logs=True), status_code=201)
    except ValueError as exc:
        return api_error(str(exc), status_code=400)


@bp.get("/tasks/<int:task_id>")
def get_task(task_id: int):
    task = CrawlService.get_task(task_id, include_logs=True)
    if task is None:
        return api_error("任务不存在", status_code=404)
    return api_success(task.to_dict(include_logs=True))


@bp.put("/tasks/<int:task_id>")
def update_task(task_id: int):
    payload = request.get_json(silent=True) or {}
    try:
        task = CrawlService.update_task(task_id, payload)
        if payload.get("run_now"):
            if payload.get("background"):
                task = _dispatch_task(task.id)
                return api_success(task.to_dict(include_logs=True), status_code=202)
            task = CrawlService.run_task(task.id)
        return api_success(task.to_dict(include_logs=True))
    except ValueError as exc:
        return api_error(str(exc), status_code=400)


@bp.delete("/tasks/<int:task_id>")
def delete_task(task_id: int):
    try:
        CrawlService.delete_task(task_id)
        return api_success({"id": task_id, "deleted": True})
    except ValueError as exc:
        return api_error(str(exc), status_code=400)


@bp.post("/tasks/<int:task_id>/run")
def run_task(task_id: int):
    try:
        if (request.get_json(silent=True) or {}).get("background"):
            task = _dispatch_task(task_id)
            return api_success(task.to_dict(include_logs=True), status_code=202)
        task = CrawlService.run_task(task_id)
        return api_success(task.to_dict(include_logs=True))
    except ValueError as exc:
        return api_error(str(exc), status_code=400)


@bp.post("/tasks/<int:task_id>/cancel")
def cancel_task(task_id: int):
    try:
        task = CrawlService.cancel_task(task_id)
        return api_success(task.to_dict(include_logs=True))
    except ValueError as exc:
        return api_error(str(exc), status_code=400)


@bp.get("/logs")
def logs():
    limit = int(request.args.get("limit", 100))
    return api_success({"items": CrawlService.recent_logs(limit)})

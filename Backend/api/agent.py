from __future__ import annotations

import json

from flask import Blueprint, Response, stream_with_context, request

from Backend.agent.agent_service import AgentChatError, AgentService
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
    except AgentChatError as exc:
        return api_error(str(exc), status_code=502, data=exc.data)


def _sse_message(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@bp.post("/agent/chat/stream")
def chat_stream():
    payload = request.get_json(silent=True) or {}

    def generate():
        try:
            for event in AgentService().stream_chat(payload):
                yield _sse_message(str(event.get("type") or "message"), event)
        except ValueError as exc:
            yield _sse_message("error", {"type": "error", "message": str(exc), "status": 400})
        except AgentChatError as exc:
            yield _sse_message(
                "error",
                {
                    "type": "error",
                    "message": str(exc),
                    "status": 502,
                    "data": exc.data,
                },
            )
        except Exception as exc:  # pragma: no cover - 防御式兜底，避免 SSE 无响应。
            yield _sse_message("error", {"type": "error", "message": f"流式问答失败：{exc}", "status": 500})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@bp.get("/agent/sessions")
def list_sessions():
    limit = int(request.args.get("limit", 50))
    return api_success(AgentService.list_sessions(limit=limit))


@bp.post("/agent/sessions")
def create_session():
    payload = request.get_json(silent=True) or {}
    item = AgentService.create_session(title=payload.get("title"))
    return api_success(item.to_dict(include_turns=False), status_code=201)


@bp.get("/agent/sessions/<session_id>")
def get_session(session_id: str):
    session = AgentService.get_session(session_id)
    if session is None:
        return api_error("会话不存在", status_code=404)
    return api_success(session.to_dict(include_turns=True))


@bp.patch("/agent/sessions/<session_id>")
@bp.put("/agent/sessions/<session_id>")
def rename_session(session_id: str):
    payload = request.get_json(silent=True) or {}
    title = str(payload.get("title") or "").strip()
    if not title:
        return api_error("title 不能为空", status_code=400)
    try:
        item = AgentService.rename_session(session_id, title=title)
    except ValueError as exc:
        return api_error(str(exc), status_code=404)
    return api_success(item.to_dict(include_turns=False))


@bp.delete("/agent/sessions/<session_id>")
def delete_session(session_id: str):
    try:
        AgentService.delete_session(session_id)
    except ValueError as exc:
        return api_error(str(exc), status_code=404)
    return api_success({"session_id": session_id, "deleted": True})


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

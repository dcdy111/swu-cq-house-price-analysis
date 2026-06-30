from __future__ import annotations

from flask import Blueprint, current_app, request

from Backend.services.settings_service import SettingsService
from Backend.tasks.scheduler import reconfigure_scheduler
from Backend.utils.response import api_success


bp = Blueprint("settings", __name__, url_prefix="/api/settings")


@bp.get("")
def get_settings():
    return api_success(SettingsService.public_settings())


@bp.put("")
@bp.post("")
def update_settings():
    payload = request.get_json(silent=True) or {}
    settings = SettingsService.update_settings(payload)
    reconfigure_scheduler(current_app._get_current_object())
    return api_success(settings)


@bp.post("/test-deepseek")
def test_deepseek():
    result = SettingsService.test_deepseek_connection()
    return api_success(result, message="ok" if result["ok"] else "check_failed")

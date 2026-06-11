from __future__ import annotations

from flask import Blueprint, request

from Backend.services.settings_service import SettingsService
from Backend.utils.response import api_success


bp = Blueprint("settings", __name__, url_prefix="/api/settings")


@bp.get("")
def get_settings():
    return api_success(SettingsService.public_settings())


@bp.put("")
@bp.post("")
def update_settings():
    payload = request.get_json(silent=True) or {}
    return api_success(SettingsService.update_settings(payload))


@bp.post("/test-deepseek")
def test_deepseek():
    result = SettingsService.test_deepseek_connection()
    return api_success(result, message="ok" if result["ok"] else "check_failed")

from __future__ import annotations

from flask import Blueprint, g, request

from Backend.services.auth_service import AuthService
from Backend.utils.response import api_error, api_success


bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.post("/login")
def login():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username") or "").strip()
    password = str(payload.get("password") or "")
    user = AuthService.authenticate(username, password)
    if user is None:
        return api_error("用户名或密码错误", status_code=401)
    token = AuthService.issue_token(user)
    return api_success(AuthService.token_payload(user, token))


@bp.get("/me")
def me():
    user = getattr(g, "current_user", None)
    if user is None:
        return api_error("未登录或登录已过期", status_code=401)
    return api_success({"user": user.to_dict()})


@bp.post("/logout")
def logout():
    return api_success({"status": "logged_out"})

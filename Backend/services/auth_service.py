from __future__ import annotations

from dataclasses import dataclass
from hmac import compare_digest
from typing import Any

from flask import current_app
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer


@dataclass(frozen=True)
class AuthUser:
    username: str
    role: str = "admin"

    def to_dict(self) -> dict:
        return {"username": self.username, "role": self.role}


class AuthService:
    salt = "swu-cq-house-price-auth"

    @staticmethod
    def serializer() -> URLSafeTimedSerializer:
        return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=AuthService.salt)

    @staticmethod
    def authenticate(username: str, password: str) -> AuthUser | None:
        expected_username = str(current_app.config.get("AUTH_ADMIN_USERNAME") or "admin")
        expected_password = str(current_app.config.get("AUTH_ADMIN_PASSWORD") or "swu@2026")
        if compare_digest(username or "", expected_username) and compare_digest(password or "", expected_password):
            return AuthUser(username=expected_username)
        return None

    @staticmethod
    def issue_token(user: AuthUser) -> str:
        payload: dict[str, Any] = {"username": user.username, "role": user.role}
        return AuthService.serializer().dumps(payload)

    @staticmethod
    def verify_token(token: str | None) -> AuthUser | None:
        if not token:
            return None
        max_age = int(current_app.config.get("AUTH_TOKEN_EXPIRES_SECONDS") or 28800)
        try:
            payload = AuthService.serializer().loads(token, max_age=max_age)
        except (BadSignature, SignatureExpired):
            return None
        username = str(payload.get("username") or "")
        role = str(payload.get("role") or "admin")
        if not username:
            return None
        return AuthUser(username=username, role=role)

    @staticmethod
    def token_payload(user: AuthUser, token: str) -> dict:
        return {
            "token": token,
            "token_type": "Bearer",
            "expires_in": int(current_app.config.get("AUTH_TOKEN_EXPIRES_SECONDS") or 28800),
            "user": user.to_dict(),
        }

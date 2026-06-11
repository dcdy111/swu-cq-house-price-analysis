from __future__ import annotations


def test_auth_login_and_business_api_guard(client, app):
    app.config.update(TESTING=False, AUTH_REQUIRED=True)

    unauthorized = client.get("/api/overview")
    assert unauthorized.status_code == 401
    assert unauthorized.get_json()["message"] == "未登录或登录已过期"

    bad_login = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert bad_login.status_code == 401

    login = client.post("/api/auth/login", json={"username": "admin", "password": "swu@2026"})
    payload = login.get_json()
    assert login.status_code == 200
    assert payload["code"] == 0
    token = payload["data"]["token"]
    assert payload["data"]["user"]["username"] == "admin"

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.get_json()["data"]["user"]["role"] == "admin"

    authorized = client.get("/api/overview", headers={"Authorization": f"Bearer {token}"})
    assert authorized.status_code == 200


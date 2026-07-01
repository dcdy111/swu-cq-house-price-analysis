from __future__ import annotations

import argparse
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def request_json(base_url: str, path: str, method: str = "GET", body: dict | None = None, token: str | None = None) -> dict:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = Request(base_url.rstrip("/") + path, data=data, method=method)
    req.add_header("Accept", "application/json")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urlopen(req, timeout=15) as resp:
            content_type = resp.headers.get("Content-Type", "")
            raw = resp.read().decode("utf-8", errors="replace")
            if "application/json" not in content_type:
                raise RuntimeError(f"{path} 返回非 JSON: {content_type}; {raw[:120]}")
            return json.loads(raw)
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{path} HTTP {exc.code}: {raw[:200]}") from exc
    except URLError as exc:
        raise RuntimeError(f"{path} 请求失败: {exc}") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description="本地演示接口 smoke check。默认不调用会写 tool_call 的 Agent chat。")
    parser.add_argument("--base-url", default="http://127.0.0.1:5000")
    parser.add_argument("--username", default="admin")
    parser.add_argument("--password", default="swu@2026")
    parser.add_argument("--include-agent", action="store_true", help="额外调用 /api/agent/chat，会新增 agent_tool_calls 记录。")
    args = parser.parse_args()

    print(f"[base] {args.base_url}")
    health = request_json(args.base_url, "/api/health")
    print(f"[ok] health code={health.get('code')} status={health.get('data', {}).get('status')}")

    login = request_json(
        args.base_url,
        "/api/auth/login",
        method="POST",
        body={"username": args.username, "password": args.password},
    )
    token = (login.get("data") or {}).get("token")
    if not token:
        raise RuntimeError("登录接口未返回 token")
    print("[ok] auth login returned token")

    checks = [
        "/api/overview",
        "/api/listings?page=1&page_size=3",
        "/api/quality/report",
        "/api/analysis/jobs/latest",
        "/api/analysis/results/latest-by-type",
        "/api/settings",
        "/api/agent/tools",
    ]
    for path in checks:
        payload = request_json(args.base_url, path, token=token)
        print(f"[ok] {path} code={payload.get('code')}")

    if args.include_agent:
        payload = request_json(
            args.base_url,
            "/api/agent/chat",
            method="POST",
            body={"question": "两江新区挂牌均价是多少？"},
            token=token,
        )
        data = payload.get("data") or {}
        tools = [item.get("tool_name") for item in data.get("tool_calls") or []]
        print(f"[ok] agent chat model={data.get('model')} tools={tools}")

    print("[done] 本地接口 smoke check 通过")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

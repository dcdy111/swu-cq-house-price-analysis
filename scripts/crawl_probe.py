from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _source_prefixes(source: str) -> list[str]:
    raw = source.upper()
    prefixes = [raw]
    first = raw.split("_", 1)[0]
    if first not in prefixes:
        prefixes.append(first)
    return prefixes


def _apply_runtime_env(source: str, headers_json: str | None, headers_raw: str | None, cookie: str | None) -> None:
    prefixes = _source_prefixes(source)
    if headers_json:
        os.environ[f"{prefixes[0]}_HEADERS_JSON"] = headers_json
    if headers_raw:
        os.environ[f"{prefixes[0]}_HEADERS_RAW"] = headers_raw
    if cookie:
        for prefix in prefixes:
            os.environ[f"{prefix}_COOKIE"] = cookie


def main() -> int:
    parser = argparse.ArgumentParser(description="探测指定爬虫页面：只请求和解析，不入库。")
    parser.add_argument("--source", default="fang", choices=["fang", "anjuke_mobile", "lianjia"])
    parser.add_argument("--district", default="渝中")
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--headers-json", help="浏览器请求头 JSON，例如 '{\"User-Agent\":\"...\"}'")
    parser.add_argument("--headers-raw", help="浏览器原始请求头，多行可用 ;; 分隔")
    parser.add_argument("--cookie", help="浏览器 Cookie；只放本地命令或 .env，不提交")
    parser.add_argument("--timeout", type=int, default=15)
    parser.add_argument("--retry-times", type=int, default=1)
    parser.add_argument("--show-first", type=int, default=3)
    args = parser.parse_args()

    _apply_runtime_env(args.source, args.headers_json, args.headers_raw, args.cookie)

    from Backend.app import create_app
    from Backend.crawlers.registry import get_crawler

    app = create_app({"SCHEDULER_ENABLED": False, "AUTH_REQUIRED": False})
    with app.app_context():
        crawler = get_crawler(args.source)
        if crawler is None:
            raise RuntimeError(f"未知数据源: {args.source}")
        crawler.timeout = args.timeout
        crawler.retry_times = max(0, args.retry_times)
        crawler.interval = (0.0, 0.0)
        result = crawler.crawl_page(args.district, args.page)

    print(
        json.dumps(
            {
                "source": args.source,
                "district": args.district,
                "page": args.page,
                "ok": result.ok,
                "message": result.message,
                "url": result.url,
                "final_url": result.final_url,
                "status_code": result.status_code,
                "elapsed_ms": result.elapsed_ms,
                "html_bytes": result.html_bytes,
                "attempts": result.attempts,
                "listing_count": len(result.listings),
                "samples": result.listings[: max(0, args.show_first)],
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0 if result.ok else 2


if __name__ == "__main__":
    raise SystemExit(main())

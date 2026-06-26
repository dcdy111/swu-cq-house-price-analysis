from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def build_page_ranges(start_page: int, max_page: int, batch_pages: int) -> list[tuple[int, int]]:
    start_page = max(1, int(start_page))
    max_page = max(start_page, int(max_page))
    batch_pages = max(1, int(batch_pages))
    ranges: list[tuple[int, int]] = []
    current = start_page
    while current <= max_page:
        end = min(max_page, current + batch_pages - 1)
        ranges.append((current, end))
        current = end + 1
    return ranges


def parse_csv_items(raw: str | None) -> list[str]:
    return [item.strip() for item in (raw or "").split(",") if item.strip()]


def resolve_districts(raw: str, district_map: dict[str, str]) -> list[str]:
    requested = parse_csv_items(raw)
    if not requested or any(item.lower() in {"all", "全部", "全部区县"} for item in requested):
        return list(district_map.keys())
    invalid = [item for item in requested if item not in district_map]
    if invalid:
        raise ValueError(f"未配置这些区县: {', '.join(invalid)}")
    return requested


def count_effective_listings(sources: list[str], statuses: list[str]):
    from Backend.extensions import db
    from Backend.models.listing import Listing

    query = db.session.query(db.func.count(Listing.id))
    if sources:
        query = query.filter(Listing.source.in_(sources))
    if statuses:
        query = query.filter(Listing.status.in_(statuses))
    return int(query.scalar() or 0)


def add_task_log(task_id: int, level: str, message: str, url: str | None = None, district: str | None = None, page: int | None = None) -> None:
    from Backend.extensions import db
    from Backend.models.crawl import CrawlLog

    db.session.add(CrawlLog(task_id=task_id, level=level, message=message, url=url, district=district, page=page))
    db.session.commit()


def format_page_result(result) -> str:
    parts = [result.message]
    if result.status_code is not None:
        parts.append(f"HTTP {result.status_code}")
    if result.elapsed_ms is not None:
        parts.append(f"{result.elapsed_ms}ms")
    if result.html_bytes is not None:
        parts.append(f"{result.html_bytes} bytes")
    if result.attempts:
        parts.append(f"attempts={result.attempts}")
    final_url = result.final_url or result.url
    if final_url and final_url != result.url:
        parts.append(f"final_url={final_url}")
    return "；".join(parts)


def is_empty_page_result(result) -> bool:
    return "未解析到房源列表" in (result.message or "")


def create_batch_task(source: str, source_name: str, districts: list[str], page_start: int, page_end: int, max_workers: int, target_count: int):
    from Backend.extensions import db
    from Backend.models.crawl import CrawlTask

    page_count = page_end - page_start + 1
    task = CrawlTask(
        name=f"{source_name}全量达标采集 P{page_start}-P{page_end}",
        source=source,
        mode="bulk_target",
        max_pages=page_count,
        max_workers=max_workers,
        status="pending",
        total_pages=len(districts) * page_count,
    )
    task.set_districts(districts)
    db.session.add(task)
    db.session.commit()
    add_task_log(
        task.id,
        "INFO",
        f"批次已创建：真实页码 P{page_start}-P{page_end}，区县 {len(districts)} 个，目标有效数据 {target_count} 条",
    )
    return task


def run_batch(crawler, task, page_start: int, page_end: int) -> dict:
    from Backend.extensions import db
    from Backend.services.listing_service import ListingService

    task.status = "running"
    task.started_at = datetime.utcnow()
    task.finished_at = None
    task.error_message = None
    task.success_pages = 0
    task.failed_pages = 0
    task.total_found = 0
    task.inserted_count = 0
    task.updated_count = 0
    task.unchanged_count = 0
    task.snapshot_count = 0
    db.session.commit()
    add_task_log(
        task.id,
        "INFO",
        (
            f"开始执行批次：来源={crawler.source_name}，真实页码=P{page_start}-P{page_end}，"
            f"总页数={task.total_pages}，并发={task.max_workers}，请求间隔={crawler.interval[0]}-{crawler.interval[1]}秒"
        ),
    )

    jobs = [(district, page) for district in task.districts for page in range(page_start, page_end + 1)]
    parse_errors = 0
    empty_pages = 0
    empty_by_district = {district: 0 for district in task.districts}
    page_count = page_end - page_start + 1
    try:
        with ThreadPoolExecutor(max_workers=task.max_workers) as executor:
            future_map = {executor.submit(crawler.crawl_page, district, page): (district, page) for district, page in jobs}
            for future in as_completed(future_map):
                district, page = future_map[future]
                try:
                    result = future.result()
                except Exception as exc:
                    task.failed_pages += 1
                    add_task_log(task.id, "ERROR", f"页面执行异常: {exc}", district=district, page=page)
                    db.session.commit()
                    continue

                if result.ok:
                    task.success_pages += 1
                    task.total_found += len(result.listings)
                    add_task_log(
                        task.id,
                        "INFO",
                        format_page_result(result),
                        url=result.url,
                        district=result.district,
                        page=result.page,
                    )
                    for raw in result.listings:
                        try:
                            action = ListingService.upsert_listing(raw, task_id=task.id)
                        except ValueError as exc:
                            parse_errors += 1
                            add_task_log(task.id, "WARN", f"房源入库跳过: {exc}", district=district, page=page)
                            continue
                        if action == "inserted":
                            task.inserted_count += 1
                        elif action == "snapshot":
                            task.updated_count += 1
                            task.snapshot_count += 1
                        elif action == "updated":
                            task.unchanged_count += 1
                elif is_empty_page_result(result):
                    task.success_pages += 1
                    empty_pages += 1
                    empty_by_district[district] = empty_by_district.get(district, 0) + 1
                    add_task_log(
                        task.id,
                        "INFO",
                        f"空页，视为该区县页码已耗尽；{format_page_result(result)}",
                        url=result.url,
                        district=result.district,
                        page=result.page,
                    )
                else:
                    task.failed_pages += 1
                    add_task_log(
                        task.id,
                        "WARN",
                        format_page_result(result),
                        url=result.url,
                        district=result.district,
                        page=result.page,
                    )
                db.session.commit()

        task.status = "success" if task.failed_pages == 0 else "partial_failed"
        task.finished_at = datetime.utcnow()
        db.session.commit()
        add_task_log(
            task.id,
            "INFO",
            (
                f"批次结束：新增 {task.inserted_count}，价格变化 {task.updated_count}，未变 {task.unchanged_count}，"
                f"空页 {empty_pages}，失败页 {task.failed_pages}，入库跳过 {parse_errors}，耗时 {task.duration_seconds}s，"
                f"吞吐 {task.listings_per_minute or 0} 条/分钟"
            ),
        )
    except Exception as exc:
        task.status = "failed"
        task.error_message = str(exc)
        task.finished_at = datetime.utcnow()
        db.session.commit()
        add_task_log(task.id, "ERROR", f"批次失败: {exc}")

    data = task.to_dict()
    data["empty_pages"] = empty_pages
    data["empty_districts"] = [district for district, count in empty_by_district.items() if count >= page_count]
    return data


def main() -> int:
    parser = argparse.ArgumentParser(
        description="全量达标采集脚本：按真实页码分批采集，持续入库直到达到有效数据目标或页码上限。"
    )
    parser.add_argument("--source", default="fang", choices=["fang", "anjuke_mobile", "lianjia"])
    parser.add_argument("--districts", default="all", help="逗号分隔区县，默认 all")
    parser.add_argument("--target-count", type=int, default=50000, help="目标有效房源数，默认 50000")
    parser.add_argument("--start-page", type=int, default=1)
    parser.add_argument("--max-page", type=int, default=80)
    parser.add_argument("--batch-pages", type=int, default=5)
    parser.add_argument("--max-workers", type=int, default=4)
    parser.add_argument("--max-failure-rate", type=float, default=0.2)
    parser.add_argument("--sleep-between-batches", type=float, default=5.0)
    parser.add_argument("--count-sources", default="", help="统计目标来源，默认等于 --source；可填 fang,anjuke_mobile")
    parser.add_argument("--statuses", default="active,valid", help="有效数据状态，默认 active,valid")
    parser.add_argument("--dry-run", action="store_true", help="只输出批次计划，不请求网站、不写入数据库")
    parser.add_argument("--allow-incomplete", action="store_true", help="用于小规模验证：未达到目标也返回成功退出码")
    parser.add_argument("--keep-empty-districts", action="store_true", help="默认会在下一批跳过已连续空页的区县；加此参数可保留")
    args = parser.parse_args()

    from Backend.app import create_app
    from Backend.crawlers.registry import get_crawler
    from Backend.extensions import db

    app = create_app({"SCHEDULER_ENABLED": False, "AUTH_REQUIRED": False})
    summary: dict = {
        "source": args.source,
        "target_count": args.target_count,
        "batches": [],
    }
    with app.app_context():
        crawler = get_crawler(args.source)
        if crawler is None:
            raise RuntimeError(f"未知数据源: {args.source}")
        if not crawler.is_enabled:
            raise RuntimeError(f"{crawler.source_name} 当前未启用，请先在系统设置或 .env 中启用")

        districts = resolve_districts(args.districts, crawler.district_map)
        page_ranges = build_page_ranges(args.start_page, args.max_page, args.batch_pages)
        count_sources = parse_csv_items(args.count_sources) or [args.source]
        statuses = parse_csv_items(args.statuses)
        before_count = count_effective_listings(count_sources, statuses)
        summary.update(
            {
                "source_name": crawler.source_name,
                "district_count": len(districts),
                "page_ranges": page_ranges,
                "count_sources": count_sources,
                "statuses": statuses,
                "before_count": before_count,
                "dry_run": bool(args.dry_run),
            }
        )

        if args.dry_run:
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            return 0

        current_count = before_count
        active_districts = list(districts)
        for index, (page_start, page_end) in enumerate(page_ranges, start=1):
            if current_count >= args.target_count:
                break
            if not active_districts:
                summary["stop_reason"] = "all_districts_exhausted"
                break
            task = create_batch_task(
                args.source,
                crawler.source_name,
                active_districts,
                page_start,
                page_end,
                max(1, args.max_workers),
                args.target_count,
            )
            task_result = run_batch(crawler, task, page_start, page_end)
            db.session.expire_all()
            current_count = count_effective_listings(count_sources, statuses)
            batch_summary = {
                "index": index,
                "task_id": task_result["id"],
                "page_start": page_start,
                "page_end": page_end,
                "status": task_result["status"],
                "success_pages": task_result["success_pages"],
                "failed_pages": task_result["failed_pages"],
                "empty_pages": task_result.get("empty_pages", 0),
                "empty_districts": task_result.get("empty_districts", []),
                "failure_rate": task_result["failure_rate"],
                "total_found": task_result["total_found"],
                "inserted_count": task_result["inserted_count"],
                "updated_count": task_result["updated_count"],
                "unchanged_count": task_result["unchanged_count"],
                "current_count": current_count,
                "remaining": max(0, args.target_count - current_count),
            }
            summary["batches"].append(batch_summary)
            print(json.dumps(batch_summary, ensure_ascii=False))
            if task_result["status"] == "failed":
                summary["stop_reason"] = "batch_failed"
                break
            if task_result["failure_rate"] > args.max_failure_rate:
                summary["stop_reason"] = "failure_rate_too_high"
                break
            if not args.keep_empty_districts and task_result.get("empty_districts"):
                exhausted = set(task_result["empty_districts"])
                active_districts = [district for district in active_districts if district not in exhausted]
            if current_count >= args.target_count:
                summary["stop_reason"] = "target_reached"
                break
            if args.sleep_between_batches > 0 and index < len(page_ranges):
                time.sleep(args.sleep_between_batches)

        summary["after_count"] = current_count
        summary["inserted_total"] = sum(item["inserted_count"] for item in summary["batches"])
        summary.setdefault("stop_reason", "max_page_reached")
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0 if current_count >= args.target_count or args.allow_incomplete else 2


if __name__ == "__main__":
    raise SystemExit(main())

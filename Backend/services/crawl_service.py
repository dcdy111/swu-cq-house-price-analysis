from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from uuid import uuid4

from flask import current_app

from Backend.crawlers.registry import get_crawler, list_sources
from Backend.extensions import db
from Backend.models.crawl import CrawlLog, CrawlTask
from Backend.models.listing import Listing
from Backend.models.snapshot import ListingSnapshot
from Backend.services.listing_service import ListingService
from Backend.services.settings_service import SettingsService


class CrawlService:
    @staticmethod
    def _resolve_task_payload(payload: dict) -> dict:
        source = str(payload.get("source") or "fang").strip()
        crawler = get_crawler(source)
        if crawler is None:
            raise ValueError(f"未知数据源: {source}")

        crawler_settings = SettingsService.effective_settings(include_secret=False).get("crawler", {})
        max_pages_cap = int(
            crawler_settings.get("max_pages_per_district") or current_app.config["CRAWL_MAX_PAGES_PER_DISTRICT"]
        )
        max_pages = min(max_pages_cap, max(1, int(payload.get("max_pages") or 1)))
        config_workers = int(crawler_settings.get("max_workers") or current_app.config["CRAWL_MAX_WORKERS"])
        max_workers = min(config_workers, max(1, int(payload.get("max_workers") or min(3, config_workers))))
        districts = payload.get("districts") or []
        if isinstance(districts, str):
            districts = [x.strip() for x in districts.split(",") if x.strip()]
        normalized_districts: list[str] = []
        seen: set[str] = set()
        for district in districts:
            normalized = crawler.normalize_district_name(str(district))
            if normalized and normalized not in seen:
                seen.add(normalized)
                normalized_districts.append(normalized)
        districts = normalized_districts
        if any(str(item).lower() in {"all", "全部", "全部区县"} for item in districts):
            districts = crawler.display_districts() if hasattr(crawler, "display_districts") else list(crawler.district_map.keys())
        if not districts:
            districts = crawler.display_districts()[:1] if hasattr(crawler, "display_districts") else list(crawler.district_map.keys())[:1]
        invalid = []
        resolved_districts: list[str] = []
        for district in districts:
            if district in crawler.district_map:
                resolved_districts.append(district)
                continue
            invalid.append(district)
        if invalid:
            raise ValueError(f"{crawler.source_name} 未配置这些区县: {', '.join(invalid)}")

        return {
            "source": source,
            "crawler": crawler,
            "name": str(payload.get("name") or f"{crawler.source_name}采集任务").strip() or f"{crawler.source_name}采集任务",
            "mode": str(payload.get("mode") or "manual").strip() or "manual",
            "districts": resolved_districts,
            "max_pages": max_pages,
            "max_workers": max_workers,
        }

    @staticmethod
    def sources() -> list[dict]:
        return list_sources()

    @staticmethod
    def create_task(payload: dict) -> CrawlTask:
        resolved = CrawlService._resolve_task_payload(payload)
        crawler = resolved["crawler"]
        districts = resolved["districts"]
        max_pages = resolved["max_pages"]
        max_workers = resolved["max_workers"]

        task = CrawlTask(
            name=resolved["name"],
            source=resolved["source"],
            mode=resolved["mode"],
            max_pages=max_pages,
            max_workers=max_workers,
            status="pending",
            total_pages=len(districts) * max_pages,
            run_id=str(payload.get("run_id") or uuid4()),
        )
        task.set_evidence(
            {
                "run_id": task.run_id,
                "mode": task.mode,
                "districts": districts,
                "max_pages": max_pages,
                "max_workers": max_workers,
                "status_history": [{"status": "pending", "at": datetime.utcnow().isoformat(sep=" ")}],
            }
        )
        task.set_districts(districts)
        db.session.add(task)
        db.session.commit()
        CrawlService.add_log(
            task.id,
            "INFO",
            f"任务已创建，等待执行：区县 {len(districts)} 个，每区 {max_pages} 页，并发 {max_workers}",
        )
        return task

    @staticmethod
    def update_task(task_id: int, payload: dict) -> CrawlTask:
        task = db.session.get(CrawlTask, task_id)
        if task is None:
            raise ValueError("任务不存在")
        if task.status in {"running", "cancel_requested"}:
            raise ValueError("运行中的任务不能编辑")

        resolved = CrawlService._resolve_task_payload(payload)
        task.name = resolved["name"]
        task.source = resolved["source"]
        task.mode = resolved["mode"]
        task.max_pages = resolved["max_pages"]
        task.max_workers = resolved["max_workers"]
        task.total_pages = len(resolved["districts"]) * resolved["max_pages"]
        task.set_districts(resolved["districts"])
        task.status = "pending"
        task.success_pages = 0
        task.failed_pages = 0
        task.total_found = 0
        task.inserted_count = 0
        task.updated_count = 0
        task.unchanged_count = 0
        task.snapshot_count = 0
        task.error_message = None
        task.started_at = None
        task.finished_at = None
        task.run_id = str(payload.get("run_id") or uuid4())
        task.set_evidence(
            {
                "run_id": task.run_id,
                "mode": task.mode,
                "districts": resolved["districts"],
                "max_pages": task.max_pages,
                "max_workers": task.max_workers,
                "status_history": [{"status": "pending", "at": datetime.utcnow().isoformat(sep=" ")}],
            }
        )
        CrawlLog.query.filter_by(task_id=task.id).delete()
        db.session.commit()
        CrawlService.add_log(
            task.id,
            "INFO",
            f"任务已更新，等待执行：区县 {len(resolved['districts'])} 个，每区 {task.max_pages} 页，并发 {task.max_workers}",
        )
        return task

    @staticmethod
    def delete_task(task_id: int) -> None:
        task = db.session.get(CrawlTask, task_id)
        if task is None:
            raise ValueError("任务不存在")
        if task.status in {"running", "cancel_requested"}:
            raise ValueError("运行中的任务不能删除")
        db.session.delete(task)
        db.session.commit()

    @staticmethod
    def list_tasks(page: int = 1, page_size: int = 20) -> dict:
        page = max(1, page)
        page_size = min(100, max(1, page_size))
        pagination = CrawlTask.query.order_by(CrawlTask.created_at.desc()).paginate(
            page=page, per_page=page_size, error_out=False
        )
        return {
            "items": [task.to_dict() for task in pagination.items],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": pagination.total,
                "pages": pagination.pages,
            },
            "summary": CrawlService.summary(),
        }

    @staticmethod
    def get_task(task_id: int, include_logs: bool = True) -> CrawlTask | None:
        task = db.session.get(CrawlTask, task_id)
        if task and include_logs:
            task.logs
        return task

    @staticmethod
    def summary() -> dict:
        statuses = {
            "running": 0,
            "success": 0,
            "failed": 0,
            "partial_failed": 0,
            "pending": 0,
            "canceled": 0,
            "cancel_requested": 0,
        }
        rows = db.session.query(CrawlTask.status, db.func.count(CrawlTask.id)).group_by(CrawlTask.status).all()
        for status, count in rows:
            statuses[status] = count
        today_found = db.session.query(db.func.coalesce(db.func.sum(CrawlTask.total_found), 0)).scalar() or 0
        return {
            "running": statuses.get("running", 0),
            "success": statuses.get("success", 0),
            "failed": statuses.get("failed", 0),
            "partial_failed": statuses.get("partial_failed", 0),
            "pending": statuses.get("pending", 0),
            "canceled": statuses.get("canceled", 0),
            "cancel_requested": statuses.get("cancel_requested", 0),
            "total_found": int(today_found),
        }

    @staticmethod
    def add_log(
        task_id: int,
        level: str,
        message: str,
        url: str | None = None,
        district: str | None = None,
        page: int | None = None,
    ) -> CrawlLog:
        log = CrawlLog(
            task_id=task_id,
            level=level,
            message=message,
            url=url,
            district=district,
            page=page,
        )
        db.session.add(log)
        db.session.commit()
        return log

    @staticmethod
    def recent_logs(limit: int = 100) -> list[dict]:
        limit = min(200, max(1, limit))
        logs = CrawlLog.query.order_by(CrawlLog.created_at.desc()).limit(limit).all()
        return [log.to_dict() for log in logs]

    @staticmethod
    def run_task(task_id: int) -> CrawlTask:
        task = db.session.get(CrawlTask, task_id)
        if task is None:
            raise ValueError("任务不存在")
        if task.status == "running":
            raise ValueError("任务正在运行")
        if task.status in {"canceled", "cancel_requested"}:
            raise ValueError("任务已取消，不能继续执行")

        crawler = get_crawler(task.source)
        if crawler is None:
            raise ValueError(f"未知数据源: {task.source}")
        if not crawler.is_enabled:
            task.status = "failed"
            task.error_message = crawler.description or "数据源未启用"
            task.started_at = datetime.utcnow()
            task.finished_at = datetime.utcnow()
            db.session.commit()
            CrawlService.add_log(task.id, "ERROR", task.error_message)
            return task

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
        task.total_pages = len(task.districts) * task.max_pages
        task.run_id = task.run_id or str(uuid4())
        before_listing_count = db.session.query(db.func.count(Listing.id)).scalar() or 0
        before_snapshot_count = db.session.query(db.func.count(ListingSnapshot.id)).scalar() or 0
        evidence = dict(task.evidence)
        status_history = list(evidence.get("status_history") or [])
        status_history.append({"status": "running", "at": task.started_at.isoformat(sep=" ")})
        evidence.update(
            {
                "run_id": task.run_id,
                "mode": task.mode,
                "before_listing_count": int(before_listing_count),
                "before_snapshot_count": int(before_snapshot_count),
                "districts": task.districts,
                "max_pages": task.max_pages,
                "max_workers": task.max_workers,
                "status_history": status_history,
            }
        )
        task.set_evidence(evidence)
        db.session.commit()
        CrawlService.add_log(
            task.id,
            "INFO",
            (
                f"开始执行任务，来源={crawler.source_name}，区县={','.join(task.districts)}，"
                f"总页数={task.total_pages}，并发={task.max_workers}，请求间隔={crawler.interval[0]}-{crawler.interval[1]}秒，"
                f"重试={crawler.retry_times}次"
            ),
        )

        jobs = [(district, page) for district in task.districts for page in range(1, task.max_pages + 1)]
        try:
            with ThreadPoolExecutor(max_workers=task.max_workers) as executor:
                future_map = {
                    executor.submit(crawler.crawl_page, district, page): (district, page)
                    for district, page in jobs
                }
                for future in as_completed(future_map):
                    db.session.refresh(task)
                    if task.status == "cancel_requested":
                        for pending_future in future_map:
                            pending_future.cancel()
                        task.status = "canceled"
                        task.finished_at = datetime.utcnow()
                        CrawlService._finalize_task_evidence(task.id, summary_override="任务被用户取消，已停止后续页面等待。")
                        db.session.commit()
                        CrawlService.add_log(task.id, "WARN", "任务已按用户请求取消，未完成页面已停止等待")
                        return task
                    district, page = future_map[future]
                    try:
                        result = future.result()
                    except Exception as exc:  # 防御单页异常，避免任务进程崩溃。
                        task.failed_pages += 1
                        CrawlService.add_log(task.id, "ERROR", f"页面执行异常: {exc}", district=district, page=page)
                        continue

                    if result.ok:
                        task.success_pages += 1
                        task.total_found += len(result.listings)
                        CrawlService.add_log(
                            task.id,
                            "INFO",
                            CrawlService._format_page_result(result),
                            url=result.url,
                            district=result.district,
                            page=result.page,
                        )
                        for raw in result.listings:
                            action = ListingService.upsert_listing(raw, task_id=task.id)
                            if action == "inserted":
                                task.inserted_count += 1
                            elif action == "snapshot":
                                task.updated_count += 1
                                task.snapshot_count += 1
                            elif action == "updated":
                                task.unchanged_count += 1
                    else:
                        task.failed_pages += 1
                        CrawlService.add_log(
                            task.id,
                            "WARN",
                            CrawlService._format_page_result(result),
                            url=result.url,
                            district=result.district,
                            page=result.page,
                        )
                    db.session.commit()

            task.status = "success" if task.failed_pages == 0 else "partial_failed"
            task.finished_at = datetime.utcnow()
            CrawlService._finalize_task_evidence(task.id)
            db.session.commit()
            CrawlService.add_log(
                task.id,
                "INFO",
                (
                    f"任务结束：新增 {task.inserted_count}，价格变化 {task.updated_count}，未变 {task.unchanged_count}，"
                    f"失败页 {task.failed_pages}，耗时 {task.duration_seconds}s，"
                    f"吞吐 {task.listings_per_minute or 0} 条/分钟，页面 {task.pages_per_minute or 0} 页/分钟"
                ),
            )
            return task
        except Exception as exc:
            task.status = "failed"
            task.error_message = str(exc)
            task.finished_at = datetime.utcnow()
            CrawlService._finalize_task_evidence(task.id, summary_override=f"任务失败：{exc}")
            db.session.commit()
            CrawlService.add_log(task.id, "ERROR", f"任务失败: {exc}")
            return task

    @staticmethod
    def cancel_task(task_id: int) -> CrawlTask:
        task = db.session.get(CrawlTask, task_id)
        if task is None:
            raise ValueError("任务不存在")
        if task.status == "pending":
            task.status = "canceled"
            task.finished_at = datetime.utcnow()
            CrawlService._finalize_task_evidence(task.id, summary_override="任务在执行前被取消。")
            db.session.commit()
            CrawlService.add_log(task.id, "WARN", "任务已取消，未开始执行")
            return task
        if task.status == "running":
            task.status = "cancel_requested"
            db.session.commit()
            CrawlService.add_log(task.id, "WARN", "已请求取消任务，正在等待当前页面结束")
            return task
        if task.status == "cancel_requested":
            return task
        raise ValueError(f"当前状态不能取消: {task.status}")

    @staticmethod
    def _format_page_result(result) -> str:
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

    @staticmethod
    def _finalize_task_evidence(task_id: int, summary_override: str | None = None) -> None:
        task = db.session.get(CrawlTask, task_id)
        if task is None:
            return
        after_listing_count = db.session.query(db.func.count(Listing.id)).scalar() or 0
        after_snapshot_count = db.session.query(db.func.count(ListingSnapshot.id)).scalar() or 0
        evidence = dict(task.evidence)
        before_listing_count = int(evidence.get("before_listing_count") or 0)
        before_snapshot_count = int(evidence.get("before_snapshot_count") or 0)
        status_history = list(evidence.get("status_history") or [])
        if task.finished_at:
            status_history.append({"status": task.status, "at": task.finished_at.isoformat(sep=" ")})
        recent_logs = (
            CrawlLog.query.filter_by(task_id=task.id)
            .order_by(CrawlLog.created_at.desc())
            .limit(8)
            .all()
        )
        summary = summary_override or (
            f"任务状态 {task.status}；新增 {task.inserted_count}，价格变化 {task.updated_count}，"
            f"未变 {task.unchanged_count}，新增快照 {task.snapshot_count}，失败页 {task.failed_pages}。"
        )
        evidence.update(
            {
                "run_id": task.run_id,
                "after_listing_count": int(after_listing_count),
                "after_snapshot_count": int(after_snapshot_count),
                "listing_delta": int(after_listing_count) - before_listing_count,
                "new_snapshot_count": int(after_snapshot_count) - before_snapshot_count,
                "inserted_count": int(task.inserted_count or 0),
                "updated_count": int(task.updated_count or 0),
                "unchanged_count": int(task.unchanged_count or 0),
                "failed_pages": int(task.failed_pages or 0),
                "status": task.status,
                "started_at": task.started_at.isoformat(sep=" ") if task.started_at else None,
                "finished_at": task.finished_at.isoformat(sep=" ") if task.finished_at else None,
                "log_summary": summary,
                "recent_logs": [item.to_dict() for item in reversed(recent_logs)],
                "status_history": status_history,
            }
        )
        task.set_evidence(evidence)

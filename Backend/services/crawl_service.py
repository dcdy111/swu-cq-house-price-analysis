from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

from flask import current_app

from Backend.crawlers.registry import get_crawler, list_sources
from Backend.extensions import db
from Backend.models.crawl import CrawlLog, CrawlTask
from Backend.services.listing_service import ListingService


class CrawlService:
    @staticmethod
    def sources() -> list[dict]:
        return list_sources()

    @staticmethod
    def create_task(payload: dict) -> CrawlTask:
        source = str(payload.get("source") or "fang").strip()
        crawler = get_crawler(source)
        if crawler is None:
            raise ValueError(f"未知数据源: {source}")

        max_pages = min(50, max(1, int(payload.get("max_pages") or 1)))
        config_workers = int(current_app.config["CRAWL_MAX_WORKERS"])
        max_workers = min(config_workers, max(1, int(payload.get("max_workers") or min(3, config_workers))))
        districts = payload.get("districts") or []
        if isinstance(districts, str):
            districts = [x.strip() for x in districts.split(",") if x.strip()]
        if not districts:
            districts = list(crawler.district_map.keys())[:1]
        invalid = [item for item in districts if item not in crawler.district_map]
        if invalid:
            raise ValueError(f"{crawler.source_name} 未配置这些区县: {', '.join(invalid)}")

        task = CrawlTask(
            name=payload.get("name") or f"{crawler.source_name}采集任务",
            source=source,
            mode=payload.get("mode") or "manual",
            max_pages=max_pages,
            max_workers=max_workers,
            status="pending",
            total_pages=len(districts) * max_pages,
        )
        task.set_districts(districts)
        db.session.add(task)
        db.session.commit()
        CrawlService.add_log(task.id, "INFO", "任务已创建，等待执行")
        return task

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
        statuses = {"running": 0, "success": 0, "failed": 0, "partial_failed": 0, "pending": 0}
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
        db.session.commit()
        CrawlService.add_log(task.id, "INFO", f"开始执行任务，来源={crawler.source_name}，区县={','.join(task.districts)}")

        jobs = [(district, page) for district in task.districts for page in range(1, task.max_pages + 1)]
        try:
            with ThreadPoolExecutor(max_workers=task.max_workers) as executor:
                future_map = {
                    executor.submit(crawler.crawl_page, district, page): (district, page)
                    for district, page in jobs
                }
                for future in as_completed(future_map):
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
                            result.message,
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
                            result.message,
                            url=result.url,
                            district=result.district,
                            page=result.page,
                        )
                    db.session.commit()

            task.status = "success" if task.failed_pages == 0 else "partial_failed"
            task.finished_at = datetime.utcnow()
            db.session.commit()
            CrawlService.add_log(
                task.id,
                "INFO",
                f"任务结束：新增 {task.inserted_count}，更新 {task.updated_count}，未变 {task.unchanged_count}，失败页 {task.failed_pages}",
            )
            return task
        except Exception as exc:
            task.status = "failed"
            task.error_message = str(exc)
            task.finished_at = datetime.utcnow()
            db.session.commit()
            CrawlService.add_log(task.id, "ERROR", f"任务失败: {exc}")
            return task

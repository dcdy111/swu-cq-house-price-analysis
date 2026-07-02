from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from threading import Lock
from typing import Callable

from flask import Flask, current_app

from Backend.extensions import db


class TaskRunner:
    _executor: ThreadPoolExecutor | None = None
    _futures: dict[str, Future] = {}
    _lock = Lock()

    @classmethod
    def _ensure_executor(cls, app: Flask) -> ThreadPoolExecutor:
        with cls._lock:
            if cls._executor is None:
                max_workers = max(1, int(app.config.get("TASK_RUNNER_MAX_WORKERS", 2) or 2))
                cls._executor = ThreadPoolExecutor(
                    max_workers=max_workers,
                    thread_name_prefix="swu-task",
                )
            return cls._executor

    @classmethod
    def submit(
        cls,
        job_key: str,
        func: Callable,
        *args,
        app: Flask | None = None,
        **kwargs,
    ) -> bool:
        flask_app = app or current_app._get_current_object()
        executor = cls._ensure_executor(flask_app)
        with cls._lock:
            existing = cls._futures.get(job_key)
            if existing is not None and not existing.done():
                return False
            future = executor.submit(cls._run_with_app, flask_app, func, *args, **kwargs)
            cls._futures[job_key] = future
            future.add_done_callback(lambda done: cls._cleanup(job_key, done))
            return True

    @classmethod
    def _run_with_app(cls, app: Flask, func: Callable, *args, **kwargs):
        with app.app_context():
            try:
                db.session.remove()
                return func(*args, **kwargs)
            finally:
                db.session.remove()

    @classmethod
    def _cleanup(cls, job_key: str, future: Future) -> None:
        with cls._lock:
            current = cls._futures.get(job_key)
            if current is future:
                cls._futures.pop(job_key, None)

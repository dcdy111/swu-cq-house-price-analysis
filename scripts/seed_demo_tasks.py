"""插入演示采集任务到数据库（仅冷启动用）"""
from datetime import datetime, timezone

from pymysql import connect

DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 3306,
    "user": "root",
    "password": "root",
    "database": "real_estate",
    "charset": "utf8mb4",
    "autocommit": True,
}

CST = timezone.utc  # simplify

def insert_demo_task():
    conn = connect(**DB_CONFIG)
    cur = conn.cursor()

    # 插入 1 条成功任务（房天下渝中试采集）
    cur.execute("""
        INSERT INTO crawl_tasks
        (name, source, mode, districts_json, max_pages, max_workers, status,
         total_pages, success_pages, failed_pages,
         inserted_count, updated_count, unchanged_count, snapshot_count,
         total_found,
         started_at, finished_at, created_at, updated_at,
         run_id, error_message, evidence_json)
        VALUES
        (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        "房天下渝中试采集",
        "fang",
        "manual",
        '["渝中"]',
        1, 2, "success",
        1, 1, 0,
        120, 5, 8, 133,
        125,
        "2026-06-30 06:05:01",
        "2026-06-30 06:05:47",
        "2026-06-30 06:04:55",
        "2026-06-30 06:05:47",
        "demo-run-001",
        None,
        '{"run_id":"demo-run-001","before_listing_count":48200,"after_listing_count":48320,"new_snapshot_count":125,"failed_pages":0,"log_summary":"房天下渝中试采集成功，新增120条房源，更新5条快照。"}',
    ))
    task_id_1 = cur.lastrowid

    # 插入 1 条部分失败任务（安居客渝北）
    cur.execute("""
        INSERT INTO crawl_tasks
        (name, source, mode, districts_json, max_pages, max_workers, status,
         total_pages, success_pages, failed_pages,
         inserted_count, updated_count, unchanged_count, snapshot_count,
         total_found,
         started_at, finished_at, created_at, updated_at,
         run_id, error_message, evidence_json)
        VALUES
        (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        "安居客渝北采集",
        "anjuke_mobile",
        "manual",
        '["渝北"]',
        3, 2, "partial_failed",
        3, 2, 1,
        85, 3, 10, 98,
        88,
        "2026-06-30 08:42:03",
        "2026-06-30 08:43:22",
        "2026-06-30 08:42:00",
        "2026-06-30 08:43:22",
        "demo-run-002",
        "安居客渝北第3页被验证码拦截，无法解析",
        '{"run_id":"demo-run-002","before_listing_count":48320,"after_listing_count":48405,"new_snapshot_count":88,"failed_pages":1,"log_summary":"安居客渝北采集，部分失败。第3页被验证码拦截，新增85条房源，更新3条快照。"}',
    ))
    task_id_2 = cur.lastrowid

    conn.commit()
    cur.close()
    conn.close()
    print(f"插入完成：任务#{task_id_1}（成功）、任务#{task_id_2}（部分失败）")


if __name__ == "__main__":
    insert_demo_task()

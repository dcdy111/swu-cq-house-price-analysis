from __future__ import annotations

import argparse
from typing import Iterable

from Backend.crawlers.registry import get_crawler
from Backend.services.crawl_service import CrawlService


ALL_KEYWORDS = {"all", "全部", "全部区县", "*"}


def parse_csv_items(value: str | None) -> list[str]:
    return [item.strip() for item in str(value or "").split(",") if item.strip()]


def build_page_ranges(start_page: int, max_page: int, batch_pages: int) -> list[tuple[int, int]]:
    start = max(1, int(start_page or 1))
    end = max(start, int(max_page or start))
    batch = max(1, int(batch_pages or 1))
    return [(page, min(page + batch - 1, end)) for page in range(start, end + 1, batch)]


def resolve_districts(value: str | None, district_map: dict[str, str]) -> list[str]:
    requested = parse_csv_items(value)
    if not requested or any(item.lower() in ALL_KEYWORDS for item in requested):
        return list(district_map.keys())
    unknown = [item for item in requested if item not in district_map]
    if unknown:
        raise ValueError(f"未配置这些区县: {', '.join(unknown)}")
    return requested


def dedupe_districts_by_path(
    districts: Iterable[str],
    district_map: dict[str, str],
) -> tuple[list[str], list[dict[str, str]]]:
    seen_paths: dict[str, str] = {}
    kept: list[str] = []
    skipped: list[dict[str, str]] = []
    for district in districts:
        path = district_map[district]
        if path in seen_paths:
            skipped.append({"district": district, "same_as": seen_paths[path], "path": path})
            continue
        seen_paths[path] = district
        kept.append(district)
    return kept, skipped


def create_tasks(source: str, districts: list[str], max_pages: int, max_workers: int, run_now: bool) -> None:
    batch_name = f"{source} 全量采集"
    task = CrawlService.create_task(
        {
            "name": batch_name,
            "source": source,
            "districts": districts,
            "max_pages": max_pages,
            "max_workers": max_workers,
            "mode": "manual",
            "run_now": run_now,
        }
    )
    print(f"已创建任务 #{task.id}: {task.name}，区县 {len(districts)} 个，每区 {max_pages} 页")


def main() -> None:
    parser = argparse.ArgumentParser(description="创建重庆二手房源全量采集任务")
    parser.add_argument("--source", default="fang", help="数据源，如 fang、anjuke_mobile、lianjia")
    parser.add_argument("--districts", default="全部", help="逗号分隔区县；默认全部")
    parser.add_argument("--max-pages", type=int, default=1, help="每个区县采集页数")
    parser.add_argument("--max-workers", type=int, default=3, help="并发数，建议 3-5")
    parser.add_argument("--run-now", action="store_true", help="创建后立即执行")
    args = parser.parse_args()

    crawler = get_crawler(args.source)
    districts = resolve_districts(args.districts, crawler.district_map)
    districts, skipped = dedupe_districts_by_path(districts, crawler.district_map)
    if skipped:
        print(f"已跳过 {len(skipped)} 个重复入口: {skipped}")
    create_tasks(args.source, districts, args.max_pages, args.max_workers, args.run_now)


if __name__ == "__main__":
    main()

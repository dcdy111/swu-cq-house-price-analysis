from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("run_full_crawl", ROOT / "scripts" / "run_full_crawl.py")
assert SPEC and SPEC.loader
run_full_crawl = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(run_full_crawl)

build_page_ranges = run_full_crawl.build_page_ranges
parse_csv_items = run_full_crawl.parse_csv_items
resolve_districts = run_full_crawl.resolve_districts


def test_build_page_ranges_uses_real_page_offsets():
    assert build_page_ranges(start_page=1, max_page=12, batch_pages=5) == [(1, 5), (6, 10), (11, 12)]


def test_build_page_ranges_clamps_invalid_values():
    assert build_page_ranges(start_page=0, max_page=0, batch_pages=0) == [(1, 1)]


def test_parse_csv_items_trims_empty_values():
    assert parse_csv_items(" fang, anjuke_mobile, ,lianjia ") == ["fang", "anjuke_mobile", "lianjia"]


def test_resolve_districts_supports_all_keyword():
    district_map = {"渝中": "/a/", "南岸": "/b/"}

    assert resolve_districts("all", district_map) == ["渝中", "南岸"]
    assert resolve_districts("全部区县", district_map) == ["渝中", "南岸"]


def test_resolve_districts_rejects_unknown_name():
    with pytest.raises(ValueError, match="未配置这些区县"):
        resolve_districts("渝中,不存在", {"渝中": "/a/"})

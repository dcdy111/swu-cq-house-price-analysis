from __future__ import annotations

import pytest

from Backend.extensions import db
from Backend.services.listing_service import ListingService
from Backend.services.read_only_sql_service import ReadOnlySqlError, ReadOnlySqlService


def seed_rows() -> None:
    for index, district in enumerate(("渝北", "渝北", "南岸"), start=1):
        ListingService.upsert_listing(
            {
                "source": "fang",
                "source_listing_id": f"sql-{index}",
                "title": f"{district} SQL 测试房源 {index}",
                "link": f"https://example.com/sql/{index}",
                "district": district,
                "community": "SQL测试小区",
                "total_price": 100 + index,
                "unit_price": 10000 + index * 1000,
                "area": 90,
                "layout": "3室2厅",
            }
        )
    db.session.commit()


def test_readonly_sql_executes_grouped_select(app):
    with app.app_context():
        seed_rows()
        result = ReadOnlySqlService.execute(
            "SELECT district, COUNT(*) AS listing_count, ROUND(AVG(unit_price), 2) AS avg_unit_price "
            "FROM listings GROUP BY district ORDER BY listing_count DESC"
        )

    assert result["sql"].endswith("LIMIT 100")
    assert result["columns"] == ["district", "listing_count", "avg_unit_price"]
    assert result["rows"][0]["district"] == "渝北"
    assert result["rows"][0]["listing_count"] == 2


@pytest.mark.parametrize(
    "sql",
    [
        "UPDATE listings SET district='x'",
        "DELETE FROM listings",
        "SELECT * FROM system_settings",
        "SELECT * FROM information_schema.tables",
        "SELECT SLEEP(10) FROM listings",
        "SELECT * FROM listings FOR UPDATE",
        "SELECT COUNT(*) FROM listings; SELECT COUNT(*) FROM crawl_tasks",
    ],
)
def test_readonly_sql_rejects_unsafe_statements(sql):
    with pytest.raises(ReadOnlySqlError):
        ReadOnlySqlService.validate_and_rewrite(sql)


def test_readonly_sql_allows_cte_over_whitelisted_tables():
    safe_sql = ReadOnlySqlService.validate_and_rewrite(
        "WITH district_stats AS ("
        "SELECT district, AVG(unit_price) AS avg_price FROM listings GROUP BY district"
        ") SELECT district, avg_price FROM district_stats ORDER BY avg_price DESC"
    )

    assert safe_sql.startswith("WITH district_stats AS")
    assert safe_sql.endswith("LIMIT 100")

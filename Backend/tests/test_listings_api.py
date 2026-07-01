from __future__ import annotations

from Backend.extensions import db
from Backend.models.listing import Listing
from Backend.models.snapshot import ListingSnapshot
from Backend.services.listing_service import ListingService


def seed_listing():
    action = ListingService.upsert_listing(
        {
            "source": "fang",
            "source_listing_id": "10001",
            "title": "测试小区 3室2厅",
            "link": "https://cq.esf.fang.com/chushou/3_10001.htm",
            "district": "渝北",
            "community": "测试小区",
            "address": "渝北区测试路",
            "total_price": 120,
            "unit_price": 12000,
            "area": 100,
            "layout": "3室2厅",
            "floor_text": "中层",
            "build_year": 2018,
            "tags": ["测试"],
        }
    )
    db.session.commit()
    return action


def test_listings_query_filters(client):
    assert seed_listing() == "inserted"

    response = client.get("/api/listings?district=两江新区&page=1&page_size=10&keyword=测试")
    payload = response.get_json()

    assert response.status_code == 200
    assert payload["code"] == 0
    assert payload["data"]["pagination"]["total"] == 1
    item = payload["data"]["items"][0]
    assert item["title"] == "测试小区 3室2厅"
    assert item["rooms"] == 3
    assert item["halls"] == 2
    assert item["floor_level"] == "mid"


def test_listings_options_merge_liangjiang_aliases(client):
    seed_listing()
    ListingService.upsert_listing(
        {
            "source": "anjuke_mobile",
            "source_listing_id": "options-10002",
            "title": "两江新区筛选样本",
            "link": "https://m.anjuke.com/cq/sale/options-10002/",
            "district": "江北区",
            "community": "筛选测试小区",
            "total_price": 130,
            "unit_price": 13000,
            "area": 100,
            "layout": "3室2厅",
        }
    )
    db.session.commit()

    payload = client.get("/api/listings/options").get_json()

    assert payload["code"] == 0
    assert "两江新区" in payload["data"]["districts"]
    assert "渝北" not in payload["data"]["districts"]
    assert "江北区" not in payload["data"]["districts"]


def test_upsert_price_change_creates_snapshot(app):
    with app.app_context():
        seed_listing()
        ListingService.upsert_listing(
            {
                "source": "fang",
                "source_listing_id": "10001",
                "title": "测试小区 3室2厅",
                "link": "https://cq.esf.fang.com/chushou/3_10001.htm",
                "district": "渝北",
                "total_price": 125,
                "unit_price": 12500,
                "area": 100,
                "layout": "3室2厅",
            }
        )
        db.session.commit()

        listing = Listing.query.filter_by(source="fang", source_listing_id="10001").first()
        assert listing is not None
        assert listing.total_price == 125
        assert ListingSnapshot.query.filter_by(listing_id=listing.id).count() == 2


def test_upsert_keeps_existing_structure_fields_when_new_crawl_missing(app):
    with app.app_context():
        ListingService.upsert_listing(
            {
                "source": "fang",
                "source_listing_id": "structure-10001",
                "title": "测试结构字段房源",
                "link": "https://cq.esf.fang.com/chushou/3_structure_10001.htm",
                "district": "两江新区",
                "community": "结构字段小区",
                "address": "距国博线欢乐谷约775米 板楼 有电梯",
                "total_price": 150,
                "unit_price": 15000,
                "area": 100,
                "layout": "3室2厅",
                "floor_text": "中层(共18层)",
                "metro_distance": 775,
                "building_type": "板楼",
                "has_elevator": True,
                "total_floors": 18,
            }
        )
        db.session.commit()

        ListingService.upsert_listing(
            {
                "source": "fang",
                "source_listing_id": "structure-10001",
                "title": "测试结构字段房源",
                "link": "https://cq.esf.fang.com/chushou/3_structure_10001.htm",
                "district": "两江新区",
                "community": "结构字段小区",
                "address": "结构字段小区",
                "total_price": 150,
                "unit_price": 15000,
                "area": 100,
                "layout": "3室2厅",
            }
        )
        db.session.commit()

        listing = Listing.query.filter_by(source="fang", source_listing_id="structure-10001").first()
        assert listing is not None
        assert listing.metro_distance == 775
        assert listing.building_type == "板楼"
        assert listing.has_elevator is True
        assert listing.total_floors == 18


def test_csv_export(client):
    seed_listing()
    response = client.get("/api/listings/export")
    assert response.status_code == 200
    assert "text/csv" in response.content_type
    assert "测试小区" in response.get_data(as_text=True)


def test_fang_a058_district_is_normalized_to_liangjiang_new_area(app):
    with app.app_context():
        action = ListingService.upsert_listing(
            {
                "source": "fang",
                "source_listing_id": "a058-0001",
                "title": "a058 板块测试房源",
                "link": "https://cq.esf.fang.com/chushou/3_a058_0001.htm",
                "district": "江北",
                "community": "a058测试小区",
                "total_price": 128,
                "unit_price": 12800,
                "area": 100,
                "layout": "3室2厅",
            }
        )
        db.session.commit()

        listing = Listing.query.filter_by(source="fang", source_listing_id="a058-0001").first()
        assert action == "inserted"
        assert listing is not None
        assert listing.district == "两江新区"
        assert listing.fingerprint


def test_anjuke_polluted_address_falls_back_to_district_and_community(app):
    with app.app_context():
        ListingService.upsert_listing(
            {
                "source": "anjuke_mobile",
                "source_listing_id": "anjuke-address-1",
                "title": "渝北 安居客污染地址样本",
                "link": "https://m.anjuke.com/cq/sale/anjuke-address-1/",
                "district": "渝北",
                "community": "龙湖测试花园",
                "address": "渝北 龙湖测试花园 满五年 VR看房 近地铁 12800元/㎡ 建面98㎡",
                "total_price": 126,
                "unit_price": 12800,
                "area": 98,
                "layout": "3室2厅",
            }
        )
        db.session.commit()

        listing = Listing.query.filter_by(source="anjuke_mobile", source_listing_id="anjuke-address-1").first()

        assert listing is not None
        assert listing.address == "渝北 龙湖测试花园"

from __future__ import annotations

from Backend.crawlers.anjuke_mobile import AnjukeMobileCrawler
from Backend.crawlers.lianjia import LianjiaCrawler


def test_lianjia_mobile_preloaded_state_parse():
    html = """
    <html><body><script>
    window.__PRELOADED_STATE__ = {"ershoufangList":{"listData":{"list":[
      {"houseCode":"10610001","title":"诺丁阳光精装两房","desc":"2室1厅/35.66m²/西北/诺丁阳光",
       "totalPrice":"29万","unitPrice":"8,133元/平","tags":["近地铁","满五"]}
    ]}}};
    </script></body></html>
    """
    crawler = LianjiaCrawler(interval=(0, 0))
    items = crawler.parse(html, "渝北", "https://m.lianjia.com/cq/ershoufang/yubei/")

    assert len(items) == 1
    assert items[0]["source"] == "lianjia"
    assert items[0]["source_listing_id"] == "10610001"
    assert items[0]["title"] == "诺丁阳光精装两房"
    assert items[0]["layout"] == "2室1厅"
    assert items[0]["area"] == 35.66
    assert items[0]["total_price"] == 29
    assert items[0]["unit_price"] == 8133
    assert items[0]["community"] == "诺丁阳光"


def test_anjuke_mobile_image_alt_fallback_parse():
    html = """
    <html><body>
      <a href="/prop/view/A123456"><img alt="万科森林公园林璟4室2厅132㎡139万二手房图片" /></a>
    </body></html>
    """
    crawler = AnjukeMobileCrawler(interval=(0, 0))
    items = crawler.parse(html, "渝北", "https://m.anjuke.com/cq/sale/yubei/")

    assert len(items) == 1
    assert items[0]["source"] == "anjuke_mobile"
    assert items[0]["title"] == "万科森林公园林璟"
    assert items[0]["layout"] == "4室2厅"
    assert items[0]["area"] == 132
    assert items[0]["total_price"] == 139

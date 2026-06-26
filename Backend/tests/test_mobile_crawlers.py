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


def test_lianjia_mobile_dom_card_parse():
    html = """
    <html><body>
      <div class="kem__house-tile-ershou" data-id="106119962008">
        <div class="house-text">
          <div class="house-title"><img alt="必看好房">高新区龙湖天街旁 拉特芳斯 平层</div>
          <div class="house-desc">1室1厅/28.59m²/北/龙湖拉特芳斯二街区</div>
          <div class="house-tags"><span class="tag">地铁</span><span class="tag">VR房源</span></div>
          <p class="house-price"><span class="price-total">17万</span><span class="price-unit">5,947元/平</span></p>
        </div>
      </div>
    </body></html>
    """
    crawler = LianjiaCrawler(interval=(0, 0))
    items = crawler.parse(html, "渝北", "https://m.lianjia.com/cq/ershoufang/")

    assert len(items) == 1
    assert items[0]["source_listing_id"] == "106119962008"
    assert items[0]["title"] == "高新区龙湖天街旁 拉特芳斯 平层"
    assert items[0]["layout"] == "1室1厅"
    assert items[0]["area"] == 28.59
    assert items[0]["community"] == "龙湖拉特芳斯二街区"
    assert items[0]["total_price"] == 17
    assert items[0]["unit_price"] == 5947
    assert items[0]["tags"] == ["地铁", "VR房源"]


def test_anjuke_mobile_modern_card_parse():
    html = """
    <html><body>
      <li class="item-wrap">
        <a class="cell-wrap MLIST_MAIN" data-lego='{"entity_id":"3502689280351233"}'
           href="https://m.anjuke.com/cq/sale/S3502689280351233/?from=Exp_Anjuke_Prop_List">
          <img alt="金辉云缦长滩3室2厅90.64㎡123万二手房图片" />
          <div class="content-wrap">
            <span class="content-title">24年 次新 小高 轻轨就在楼下</span>
            <div class="desc-wrap-community">
              <span class="content-desc">3室2厅</span><span class="content-desc">90.64㎡</span>
              <span class="content-desc">西</span><span class="content-desc">九龙坡</span><span class="content-desc">杨家坪</span>
            </div>
            <span class="highlight-tag">满二年</span><span class="highlight-tag">近地铁</span>
            <div class="price-wrap"><span class="content-price">123</span><span class="content-unit">万</span><span class="house-avg-price">13,571元/㎡</span></div>
          </div>
        </a>
      </li>
    </body></html>
    """
    crawler = AnjukeMobileCrawler(interval=(0, 0))
    items = crawler.parse(html, "渝北", "https://m.anjuke.com/cq/sale/")

    assert len(items) == 1
    assert items[0]["source_listing_id"] == "3502689280351233"
    assert items[0]["district"] == "九龙坡"
    assert items[0]["community"] == "金辉云缦长滩"
    assert items[0]["title"] == "24年 次新 小高 轻轨就在楼下"
    assert items[0]["layout"] == "3室2厅"
    assert items[0]["area"] == 90.64
    assert items[0]["orientation"] == "西"
    assert items[0]["total_price"] == 123
    assert items[0]["unit_price"] == 13571
    assert items[0]["tags"] == ["满二年", "近地铁"]


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

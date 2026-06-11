from __future__ import annotations

from Backend.crawlers.fang import FangCrawler


def test_fang_parse_sample_html():
    html = """
    <div class="shop_list">
      <dl>
        <dd>
          <p class="tit_shop"><a href="/chushou/3_205183030.htm">CBD核心 精装四代宅</a></p>
          <p class="tel_shop">5室3厅 | 308㎡ | 高层 （共12层） | 南北向 | 经纪人</p>
          <p class="add_shop"><a href="/house-xm1/">重庆长嘉外滩</a><span>弹子石 南滨东路6号</span></p>
          <p class="label"><a>不满二</a><span>次新房</span></p>
          <p class="price_right"><span class="red">700 万</span> 22727元/㎡</p>
        </dd>
      </dl>
    </div>
    """
    crawler = FangCrawler(interval=(0, 0))
    items = crawler.parse(html, "南岸", "https://cq.esf.fang.com/house-a059/")

    assert len(items) == 1
    item = items[0]
    assert item["source"] == "fang"
    assert item["source_listing_id"] == "205183030"
    assert item["district"] == "南岸"
    assert item["total_price"] == 700
    assert item["unit_price"] == 22727
    assert item["area"] == 308
    assert item["layout"] == "5室3厅"

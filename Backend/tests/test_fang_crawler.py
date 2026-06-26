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


def test_fang_parse_mobile_list_card():
    html = """
    <section class="houseList2 esf">
      <ul id="content">
        <li class="listhouse" data-bg='{"houseid":"204649634"}'>
          <a class="listtype" href="//m.fang.com/esf/cq/3_204649634.html">
            <div class="txt">
              <h3 class="line2">新上 汽博一线高尔夫独栋 花园900平</h3>
              <p>
                <span>455.79㎡</span><span>5室3厅</span><span>南</span><span>保利国际高尔夫花园别墅</span>
              </p>
              <div class="stag"><span>不满二</span><span>近地铁</span></div>
              <div class="price"><span><em>1200</em>万</span><span class="del-price">26328元/㎡</span></div>
            </div>
          </a>
        </li>
      </ul>
    </section>
    """
    crawler = FangCrawler(interval=(0, 0))
    items = crawler.parse(html, "两江新区", "https://m.fang.com/esf/cq/")

    assert len(items) == 1
    item = items[0]
    assert item["source_listing_id"] == "204649634"
    assert item["link"] == "https://m.fang.com/esf/cq/3_204649634.html"
    assert item["title"] == "新上 汽博一线高尔夫独栋 花园900平"
    assert item["area"] == 455.79
    assert item["layout"] == "5室3厅"
    assert item["orientation"] == "南"
    assert item["community"] == "保利国际高尔夫花园别墅"
    assert item["total_price"] == 1200
    assert item["unit_price"] == 26328
    assert item["tags"] == ["不满二", "近地铁"]


def test_fang_district_map_contains_uploaded_mobile_filters():
    crawler = FangCrawler(interval=(0, 0))

    assert len(crawler.district_map) >= 35
    assert crawler.build_url("开州", 2) == "https://cq.esf.fang.com/house-a016748/i32/"
    assert crawler.build_url("秀山", 1) == "https://cq.esf.fang.com/house-a017400/"


def test_fang_check_gateway_is_detected_as_blocked():
    crawler = FangCrawler(interval=(0, 0))
    reason = crawler.detect_blocked(
        "https://check.3g.fang.com/check.html?backurl=https%3A%2F%2Fcq.esf.fang.com%2Fhouse-a056%2F",
        "<html><body>请完成下列验证后继续<script src='checkyzm.min.js'></script></body></html>",
    )

    assert reason == "页面被登录、验证码或反爬网关拦截"

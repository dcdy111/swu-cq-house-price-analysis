import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Activity,
  BarChart3,
  Bot,
  Building2,
  Database,
  MapPin,
  Radio,
  RefreshCw,
  Search,
  TrendingUp,
} from "lucide-react";
import { Button } from "../ui/button";
import { KpiCard } from "../common/KpiCard";
import { SectionCard } from "../common/SectionCard";
import { StatusTag } from "../common/StatusTag";
import { DistrictRankBar } from "../charts/DistrictRankBar";
import { PriceTrendLine } from "../charts/PriceTrendLine";
import { AreaPriceScatter } from "../charts/AreaPriceScatter";
import { LayoutDonut } from "../charts/LayoutDonut";
import { PriceDistributionBar } from "../charts/PriceDistributionBar";
import { ChongqingHeatMap, ChongqingMapMetric, District } from "../charts/ChongqingHeatMap";
import {
  api,
  AreaPricePoint,
  DashboardOverview,
  DistrictMapItem,
  DistrictPriceItem,
  DistrictValueProfileItem,
  LayoutDistributionItem,
  PriceDistributionItem,
  PriceTrendItem,
} from "../../services/api";

type DashboardDistrict = District & { rawDistricts?: string[] };

const MAP_METRICS: { key: ChongqingMapMetric; label: string }[] = [
  { key: "avgPrice", label: "均价" },
  { key: "count", label: "样本量" },
  { key: "quality", label: "质量" },
];

const numberFormatter = new Intl.NumberFormat("zh-CN");

function fmt(value?: number | null, digits = 0) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return "-";
  return numberFormatter.format(Number(Number(value).toFixed(digits)));
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    fang: "房天下",
    anjuke_mobile: "安居客",
    lianjia: "链家",
    anjuke_legacy: "安居客旧库",
    lianjia_legacy: "链家旧库",
  };
  return labels[source] ?? source;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    running: "采集中",
    success: "完成",
    failed: "失败",
    partial_failed: "部分失败",
  pending: "待运行",
  canceled: "已取消",
  cancel_requested: "取消中",
  };
  return labels[status] ?? status;
}

function mapDistricts(items: DistrictMapItem[]): DashboardDistrict[] {
  return items.map(item => ({
    name: item.district,
    avgPrice: Math.round(item.avgPrice || item.avg_unit_price || 0),
    count: item.count,
    change: item.change || 0,
    quality: item.quality || item.avg_quality || 0,
    rawDistricts: item.raw_districts,
  }));
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [mapMetric, setMapMetric] = useState<ChongqingMapMetric>("avgPrice");
  const [selectedDistrict, setSelectedDistrict] = useState<DashboardDistrict | null>(null);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [districtPrice, setDistrictPrice] = useState<DistrictPriceItem[]>([]);
  const [mapData, setMapData] = useState<DashboardDistrict[]>([]);
  const [trendData, setTrendData] = useState<PriceTrendItem[]>([]);
  const [scatterData, setScatterData] = useState<AreaPricePoint[]>([]);
  const [layoutData, setLayoutData] = useState<LayoutDistributionItem[]>([]);
  const [priceDistribution, setPriceDistribution] = useState<PriceDistributionItem[]>([]);
  const [valueProfiles, setValueProfiles] = useState<DistrictValueProfileItem[]>([]);
  const [valueMethodology, setValueMethodology] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = () => {
    setLoading(true);
    Promise.all([
      api.getOverview(),
      api.getDistrictPriceChart(38),
      api.getDistrictMap(),
      api.getDistrictValueProfile(6),
      api.getPriceTrendChart(12),
      api.getAreaPriceScatter(500),
      api.getLayoutDistribution(8),
      api.getPriceDistributionChart(),
    ])
      .then(([overviewData, districtData, districtMap, valueProfile, trend, scatter, layout, distribution]) => {
        const districts = mapDistricts(districtMap.items);
        setOverview(overviewData);
        setDistrictPrice(districtData.items);
        setMapData(districts);
        setValueProfiles(valueProfile.items);
        setValueMethodology(valueProfile.methodology.boundary);
        setTrendData(trend.items);
        setScatterData(scatter.items);
        setLayoutData(layout.items);
        setPriceDistribution(distribution.items);
        setError(null);
        setSelectedDistrict(prev => {
          if (districts.length === 0) return null;
          return districts.find(item => item.name === prev?.name) ?? districts[0];
        });
      })
      .catch(err => {
        setOverview(null);
        setDistrictPrice([]);
        setMapData([]);
        setValueProfiles([]);
        setValueMethodology("");
        setTrendData([]);
        setScatterData([]);
        setLayoutData([]);
        setPriceDistribution([]);
        setSelectedDistrict(null);
        setError(err instanceof Error ? err.message : "Dashboard 数据加载失败");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const kpis = overview?.kpis;
  const topDistrict = overview?.top_district;
  const latestDate = kpis?.latest_updated_at?.slice(0, 10) ?? "暂无更新时间";

  const kpiData = useMemo(
    () => [
      {
        title: "房源总数",
        value: fmt(kpis?.total_count),
        unit: "套",
        icon: <Building2 size={18} style={{ color: "#4F7DBD" }} />,
        accent: true,
      },
      {
        title: "有效在售",
        value: fmt(kpis?.active_count),
        unit: "套",
        icon: <TrendingUp size={18} style={{ color: "#E67E22" }} />,
      },
      {
        title: "挂牌均价",
        value: fmt(kpis?.avg_unit_price),
        unit: "元/㎡",
        icon: <BarChart3 size={18} style={{ color: "#163A70" }} />,
      },
      {
        title: "平均总价",
        value: fmt(kpis?.avg_total_price),
        unit: "万",
        icon: <Database size={18} style={{ color: "#16A34A" }} />,
      },
      {
        title: "数据完整率",
        value: fmt(kpis?.data_complete_rate, 1),
        unit: "%",
        icon: <Activity size={18} style={{ color: "#4F7DBD" }} />,
      },
      {
        title: "区县覆盖",
        value: fmt(kpis?.district_count),
        unit: "个",
        icon: <MapPin size={18} style={{ color: "#E67E22" }} />,
      },
      {
        title: "快照记录",
        value: fmt(kpis?.snapshot_count ?? 0),
        unit: "条",
        icon: <Bot size={18} style={{ color: "#163A70" }} />,
      },
    ],
    [kpis]
  );

  const focusListingSearch = (district: DashboardDistrict) => {
    const searchTerm = district.rawDistricts?.[0] ?? district.name;
    sessionStorage.setItem("listingSearch", searchTerm);
    navigate("/listings");
  };

  const prefillCrawlDistrict = (district: DashboardDistrict) => {
    const raw = district.rawDistricts?.[0] ?? district.name;
    sessionStorage.setItem("crawlPrefillDistrict", raw.replace(/[区县]$/g, ""));
    navigate("/crawl");
  };

  const crawlItems = overview?.crawl_status.items ?? [];
  const failedTaskCount = overview
    ? overview.crawl_status.summary.failed + overview.crawl_status.summary.partial_failed
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ color: "#163A70", fontSize: 18, fontWeight: 700 }}>首页总览</h2>
          <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 2 }}>
            最新数据时间：{latestDate} · 重庆二手房挂牌价数据概览
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusTag status={loading ? "running" : error ? "failed" : "success"} label={loading ? "加载中" : error ? "接口异常" : "后端数据"} />
          <Button variant="outline" size="sm" onClick={loadDashboard} disabled={loading} style={{ fontSize: 12, height: 34 }}>
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            刷新
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: 13 }}>
          Dashboard 后端数据加载失败：{error}。请确认后端服务、鉴权 token 和数据库连接正常后重试。
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {kpiData.map(kpi => (
          <KpiCard key={kpi.title} {...kpi} />
        ))}
      </div>

      <SectionCard
        title="区域性价比指数"
        subtitle="基于挂牌价、样本量、质量分和价格稳定性的可解释区县画像"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {valueProfiles.length === 0 && (
            <div style={{ color: "#9CA3AF", fontSize: 13 }}>暂无区域画像数据，请先确认区县均价接口可用。</div>
          )}
          {valueProfiles.map(item => (
            <div key={item.district} className="rounded-xl p-4" style={{ border: "1px solid #E5EAF2", background: "#fff" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div style={{ fontSize: 12, color: "#9CA3AF" }}>TOP {item.rank}</div>
                  <div style={{ fontSize: 16, color: "#163A70", fontWeight: 800, marginTop: 2 }}>{item.district}</div>
                </div>
                <div className="rounded-full px-3 py-1" style={{ background: "#EFF6FF", color: "#163A70", fontSize: 13, fontWeight: 800 }}>
                  {fmt(item.value_index, 1)}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="rounded-lg px-2.5 py-2" style={{ background: "#F8FAFC" }}>
                  <div style={{ fontSize: 10, color: "#9CA3AF" }}>挂牌均价</div>
                  <div style={{ fontSize: 12, color: "#1F2937", fontWeight: 700 }}>{fmt(item.avg_unit_price)} 元/㎡</div>
                </div>
                <div className="rounded-lg px-2.5 py-2" style={{ background: "#F8FAFC" }}>
                  <div style={{ fontSize: 10, color: "#9CA3AF" }}>样本量</div>
                  <div style={{ fontSize: 12, color: "#1F2937", fontWeight: 700 }}>{fmt(item.listing_count)} 套</div>
                </div>
                <div className="rounded-lg px-2.5 py-2" style={{ background: "#F8FAFC" }}>
                  <div style={{ fontSize: 10, color: "#9CA3AF" }}>质量分</div>
                  <div style={{ fontSize: 12, color: "#1F2937", fontWeight: 700 }}>{fmt(item.avg_quality, 1)}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {item.reasons.map(reason => (
                  <span key={reason} className="rounded-full px-2 py-1" style={{ background: "#F7F9FC", color: "#4B5563", fontSize: 11 }}>
                    {reason}
                  </span>
                ))}
              </div>
              <div className="mt-3" style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.7 }}>
                主力户型：{item.dominant_layouts.length ? item.dominant_layouts.map(layout => `${layout.layout}(${layout.count})`).join("、") : "暂无"}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg px-3 py-2" style={{ background: "#FFF7ED", border: "1px solid #FED7AA", color: "#9A3412", fontSize: 12, lineHeight: 1.7 }}>
          {valueMethodology || "区域性价比指数只用于区域对比，不代表成交价或投资建议。"}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard
          title="重庆区县数据分布图"
          subtitle="行政区边界 · 支持均价、样本量、质量分切换"
          action={
            <div className="flex rounded-lg p-1" style={{ background: "#F7F9FC", border: "1px solid #E5EAF2" }}>
              {MAP_METRICS.map(item => (
                <button
                  key={item.key}
                  onClick={() => setMapMetric(item.key)}
                  className="px-2.5 py-1 rounded-md transition-colors"
                  style={{
                    fontSize: 12,
                    color: mapMetric === item.key ? "#fff" : "#6B7280",
                    background: mapMetric === item.key ? "#163A70" : "transparent",
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          }
        >
          <ChongqingHeatMap
            metric={mapMetric}
            data={mapData}
            selectedDistrict={selectedDistrict?.name}
            onSelectDistrict={district => setSelectedDistrict(district as DashboardDistrict | null)}
          />
          <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              ["当前区县", selectedDistrict?.name ?? "全市"],
              ["挂牌均价", selectedDistrict ? `${fmt(selectedDistrict.avgPrice)} 元/㎡` : `${fmt(kpis?.avg_unit_price)} 元/㎡`],
              ["采集样本", selectedDistrict ? `${fmt(selectedDistrict.count)} 套` : `${fmt(kpis?.total_count)} 套`],
              ["质量分", selectedDistrict ? `${fmt(selectedDistrict.quality, 1)} 分` : `${fmt(kpis?.avg_quality, 1)} 分`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg px-3 py-2" style={{ background: "#F7F9FC", border: "1px solid #E5EAF2" }}>
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{label}</div>
                <div style={{ fontSize: 13, color: "#1F2937", fontWeight: 700, marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              style={{ background: "#163A70", color: "#fff", fontSize: 12, height: 32 }}
              disabled={!selectedDistrict}
              onClick={() => selectedDistrict && focusListingSearch(selectedDistrict)}
            >
              <Search size={13} className="mr-1.5" />查看房源
            </Button>
            <Button
              size="sm"
              variant="outline"
              style={{ fontSize: 12, height: 32 }}
              disabled={!selectedDistrict}
              onClick={() => selectedDistrict && prefillCrawlDistrict(selectedDistrict)}
            >
              <Radio size={13} className="mr-1.5" />按区补采
            </Button>
            <Button size="sm" variant="ghost" style={{ fontSize: 12, height: 32 }} onClick={() => setSelectedDistrict(null)}>
              查看全市
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="区县均价排行" subtitle="Top 8 区县挂牌单价对比">
          <DistrictRankBar data={districtPrice} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <SectionCard title="挂牌价快照趋势" subtitle="按 listing_snapshots 聚合的月度挂牌均价">
            <PriceTrendLine data={trendData} />
          </SectionCard>
        </div>
        <SectionCard title="总价分布" subtitle="按挂牌总价区间统计样本量">
          <PriceDistributionBar data={priceDistribution} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <SectionCard title="面积-单价散点图" subtitle="真实房源面积与挂牌单价分布">
            <AreaPriceScatter data={scatterData} />
          </SectionCard>
        </div>
        <div className="flex flex-col gap-5">
          <SectionCard title="户型分布" subtitle="在售房源户型占比">
            <LayoutDonut data={layoutData} />
          </SectionCard>

          <SectionCard title="采集状态" subtitle="最近任务进度">
            <div className="flex flex-col gap-3">
              {crawlItems.length === 0 && (
                <div style={{ color: "#9CA3AF", fontSize: 12, lineHeight: 1.7 }}>
                  暂无后端采集任务。可进入“采集任务管理”新建小规模试采集任务。
                </div>
              )}
              {crawlItems.map(task => (
                <div key={task.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span style={{ fontSize: 13, color: "#1F2937" }}>{sourceLabel(task.source)}</span>
                    <StatusTag status={task.status} label={statusLabel(task.status)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: "#E5EAF2" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${task.progress}%`,
                          background: task.status === "running" ? "#163A70" : task.status === "success" ? "#16A34A" : "#DC2626",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 11, color: "#9CA3AF", minWidth: 30 }}>{task.progress}%</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>解析 {fmt(task.total_found)} 条 · 失败页 {task.failed_pages}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="系统洞察" subtitle="基于当前后端聚合结果">
            <div className="flex flex-col gap-3">
              <div className="p-3 rounded-lg" style={{ background: "#F7F9FC", border: "1px solid #E5EAF2" }}>
                <p style={{ fontSize: 12, color: "#1F2937", lineHeight: 1.6 }}>
                  {topDistrict ? (
                    <>
                      <strong>{topDistrict.district}</strong>挂牌均价 {fmt(topDistrict.avg_unit_price)} 元/㎡，当前样本量 {fmt(topDistrict.listing_count)} 套。
                    </>
                  ) : (
                    "暂无真实区县聚合结果，可先导入旧库或执行采集任务。"
                  )}
                </p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: failedTaskCount > 0 ? "#FFF7ED" : "#F0FDF4", border: `1px solid ${failedTaskCount > 0 ? "#FDE68A" : "#BBF7D0"}` }}>
                <p style={{ fontSize: 12, color: failedTaskCount > 0 ? "#92400E" : "#166534", lineHeight: 1.6 }}>
                  {failedTaskCount > 0
                    ? `存在 ${failedTaskCount} 个失败或部分失败采集任务，建议进入日志页查看失败 URL 与错误类型。`
                    : "当前没有失败采集任务记录，可继续按区县做增量补采。"}
                </p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                <p style={{ fontSize: 12, color: "#1F4E8C", lineHeight: 1.6 }}>
                  已可用于分析的样本 {fmt(kpis?.analysis_ready_count ?? 0)} 条。模型指标、聚类画像和异常检测结果可在“分析建模”模块查看。
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" style={{ fontSize: 12 }} onClick={() => navigate("/agent")}>生成报告</Button>
                <Button size="sm" style={{ background: "#163A70", color: "#fff", fontSize: 12 }} onClick={() => navigate("/analysis")}>查看模型</Button>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard
        title="数据来源说明"
        subtitle="可追溯性 · 真实性声明"
        noPad
      >
        <div className="p-5">
          {(() => {
            const total = overview?.source_summary.reduce((s, x) => s + x.listing_count, 0) ?? 0;
            const sourceMap: Record<string, { label: string; url: string; description: string }> = {
              fang: {
                label: "房天下",
                url: "https://cq.esf.fang.com",
                description: "重庆房天下二手房列表页，通过 requests + BeautifulSoup 直接解析 HTML，属于确定性程序采集，数据真实存储于 listings.link 字段",
              },
              fang_legacy: {
                label: "房天下（旧库）",
                url: "https://cq.esf.fang.com",
                description: "早期导入的房天下数据，按 link 域名识别来源，数据经清洗后落库",
              },
              lianjia: {
                label: "链家",
                url: "https://cq.lianjia.com",
                description: "重庆链家二手房页面，通过 requests + BeautifulSoup 解析，数据真实存储于 listings.link 字段",
              },
              lianjia_legacy: {
                label: "链家（旧库）",
                url: "https://cq.lianjia.com",
                description: "早期导入的链家数据，按 link 域名识别来源，数据经清洗后落库",
              },
              anjuke_mobile: {
                label: "安居客",
                url: "https://m.anjuke.com",
                description: "安居客移动端页面，通过 requests + BeautifulSoup 解析，数据真实存储于 listings.link 字段",
              },
              anjuke_legacy: {
                label: "安居客（旧库）",
                url: "https://m.anjuke.com",
                description: "早期导入的安居客数据，按 link 域名识别来源，数据经清洗后落库",
              },
            };

            return (
              <div className="flex flex-col gap-4">
                <div
                  className="rounded-lg p-4"
                  style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", fontSize: 13, color: "#166534", lineHeight: 1.8 }}
                >
                  <strong>真实性声明：</strong>本系统所有 {fmt(total)} 条房源数据均为真实网络采集，来源可追溯，不存在人工捏造。每条记录均有对应 <code style={{ background: "#DCFCE7", padding: "1px 4px", borderRadius: 4 }}>link</code> 字段指向原始平台 URL。
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(overview?.source_summary ?? []).map(item => {
                    const info = sourceMap[item.source];
                    const pct = total > 0 ? ((item.listing_count / total) * 100).toFixed(1) : "0.0";
                    return (
                      <div
                        key={item.source}
                        className="rounded-lg p-3"
                        style={{ background: "#F7F9FC", border: "1px solid #E5EAF2" }}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#1F2937" }}>{info?.label ?? item.source}</span>
                          <span style={{ fontSize: 11, color: "#6B7280" }}>{pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full mb-2" style={{ background: "#E5EAF2" }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: "#163A70", transition: "width 0.6s" }}
                          />
                        </div>
                        <div style={{ fontSize: 11, color: "#6B7280" }}>
                          {fmt(item.listing_count)} 套 · 均单价 {fmt(item.avg_unit_price)} 元/㎡
                        </div>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4, lineHeight: 1.5 }}>
                          {info?.description ?? "来源信息未定义"}
                        </div>
                        {info && (
                          <a
                            href={info.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 11, color: "#3B82F6", display: "inline-block", marginTop: 4 }}
                          >
                            查看原始平台 →
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-lg p-3" style={{ background: "#FFF7ED", border: "1px solid #FDE68A", fontSize: 12, color: "#92400E" }}>
                  <strong>追溯方式：</strong>在"房源管理"页面点击任意一条记录的 <code style={{ background: "#FEF3C7", padding: "1px 4px", borderRadius: 4 }}>原始链接</code> 按钮即可打开原始平台页面进行核实。每条记录的 <code style={{ background: "#FEF3C7", padding: "1px 4px", borderRadius: 4 }}>source</code>、<code style={{ background: "#FEF3C7", padding: "1px 4px", borderRadius: 4 }}>source_listing_id</code> 字段均可在数据库中查询验证。
                </div>
              </div>
            );
          })()}
        </div>
      </SectionCard>
    </div>
  );
}

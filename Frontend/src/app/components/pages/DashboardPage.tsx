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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = () => {
    setLoading(true);
    Promise.all([
      api.getOverview(),
      api.getDistrictPriceChart(38),
      api.getDistrictMap(),
      api.getPriceTrendChart(12),
      api.getAreaPriceScatter(500),
      api.getLayoutDistribution(8),
      api.getPriceDistributionChart(),
    ])
      .then(([overviewData, districtData, districtMap, trend, scatter, layout, distribution]) => {
        const districts = mapDistricts(districtMap.items);
        setOverview(overviewData);
        setDistrictPrice(districtData.items);
        setMapData(districts);
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
        icon: <Building2 size={20} style={{ color: "#4F7DBD" }} />,
        accent: false,
        delay: 0,
      },
      {
        title: "有效在售",
        value: fmt(kpis?.active_count),
        unit: "套",
        icon: <TrendingUp size={20} style={{ color: "#E67E22" }} />,
        accent: false,
        delay: 100,
      },
      {
        title: "挂牌均价",
        value: fmt(kpis?.avg_unit_price),
        unit: "元/㎡",
        icon: <BarChart3 size={20} style={{ color: "#4F7DBD" }} />,
        accent: false,
        delay: 200,
      },
      {
        title: "平均总价",
        value: fmt(kpis?.avg_total_price),
        unit: "万",
        icon: <Database size={20} style={{ color: "#16A34A" }} />,
        accent: false,
        delay: 300,
      },
      {
        title: "数据完整率",
        value: fmt(kpis?.data_complete_rate, 1),
        unit: "%",
        icon: <Activity size={20} style={{ color: "#4F7DBD" }} />,
        accent: false,
        delay: 400,
      },
      {
        title: "区县覆盖",
        value: fmt(kpis?.district_count),
        unit: "个",
        icon: <MapPin size={20} style={{ color: "#E67E22" }} />,
        accent: false,
        delay: 500,
      },
      {
        title: "快照记录",
        value: fmt(kpis?.snapshot_count ?? 0),
        unit: "条",
        icon: <Bot size={20} style={{ color: "#163A70" }} />,
        accent: true,
        delay: 600,
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="gradient-text" style={{ fontSize: 20, fontWeight: 700 }}>首页总览</h2>
          <p style={{ color: "var(--dark-text-muted)", fontSize: 13, marginTop: 4 }}>
            最新数据时间：{latestDate} · 重庆二手房挂牌价数据概览
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusTag 
            status={loading ? "running" : error ? "failed" : "success"} 
            label={loading ? "加载中" : error ? "接口异常" : "后端数据"} 
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadDashboard} 
            disabled={loading} 
            className="dark-button"
            style={{ fontSize: 12, height: 34 }}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span className="ml-1.5">刷新</span>
          </Button>
        </div>
      </div>

      {error && (
        <div 
          className="rounded-lg px-4 py-3 fade-in-up"
          style={{ 
            background: "rgba(220, 38, 38, 0.1)", 
            border: "1px solid rgba(220, 38, 38, 0.3)", 
            color: "#F87171", 
            fontSize: 13 
          }}
        >
          Dashboard 后端数据加载失败：{error}。请确认后端服务、鉴权 token 和数据库连接正常后重试。
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {kpiData.map(kpi => (
          <KpiCard key={kpi.title} {...kpi} />
        ))}
      </div>

      {/* Map & District Rank */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard
          title="重庆区县数据分布图"
          subtitle="行政区边界 · 支持均价、样本量、质量分切换"
          action={
            <div 
              className="flex rounded-lg p-1"
              style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)" }}
            >
              {MAP_METRICS.map(item => (
                <button
                  key={item.key}
                  onClick={() => setMapMetric(item.key)}
                  className="px-2.5 py-1 rounded-md transition-all duration-200"
                  style={{
                    fontSize: 12,
                    color: mapMetric === item.key ? "#fff" : "var(--dark-text-muted)",
                    background: mapMetric === item.key ? "rgba(79, 125, 189, 0.4)" : "transparent",
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
              <div 
                key={label} 
                className="rounded-lg px-3 py-2"
                style={{ 
                  background: "rgba(255, 255, 255, 0.03)", 
                  border: "1px solid rgba(255, 255, 255, 0.08)"
                }}
              >
                <div style={{ fontSize: 11, color: "var(--dark-text-muted)" }}>{label}</div>
                <div style={{ fontSize: 13, color: "var(--dark-text-primary)", fontWeight: 600, marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="dark-button"
              style={{ background: "rgba(79, 125, 189, 0.3)", border: "1px solid rgba(79, 125, 189, 0.4)", fontSize: 12, height: 32 }}
              disabled={!selectedDistrict}
              onClick={() => selectedDistrict && focusListingSearch(selectedDistrict)}
            >
              <Search size={13} className="mr-1.5" />查看房源
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="dark-button"
              style={{ fontSize: 12, height: 32, borderColor: "rgba(255, 255, 255, 0.1)" }}
              disabled={!selectedDistrict}
              onClick={() => selectedDistrict && prefillCrawlDistrict(selectedDistrict)}
            >
              <Radio size={13} className="mr-1.5" />按区补采
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              style={{ fontSize: 12, height: 32, color: "var(--dark-text-secondary)" }} 
              onClick={() => setSelectedDistrict(null)}
            >
              查看全市
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="区县均价排行" subtitle="Top 8 区县挂牌单价对比">
          <DistrictRankBar data={districtPrice} />
        </SectionCard>
      </div>

      {/* Trend & Distribution */}
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

      {/* Scatter & Sidebar */}
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
                <div style={{ color: "var(--dark-text-muted)", fontSize: 12, lineHeight: 1.7 }}>
                  暂无后端采集任务。可进入"采集任务管理"新建小规模试采集任务。
                </div>
              )}
              {crawlItems.map(task => (
                <div key={task.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span style={{ fontSize: 13, color: "var(--dark-text-primary)" }}>{sourceLabel(task.source)}</span>
                    <StatusTag status={task.status} label={statusLabel(task.status)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255, 255, 255, 0.1)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${task.progress}%`,
                          background: task.status === "running" ? "#4F7DBD" : task.status === "success" ? "#4ADE80" : "#F87171",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 11, color: "var(--dark-text-muted)", minWidth: 30 }}>{task.progress}%</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--dark-text-muted)" }}>解析 {fmt(task.total_found)} 条 · 失败页 {task.failed_pages}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="系统洞察" subtitle="基于当前后端聚合结果">
            <div className="flex flex-col gap-3">
              <div 
                className="p-3 rounded-lg"
                style={{ 
                  background: "rgba(255, 255, 255, 0.03)", 
                  border: "1px solid rgba(255, 255, 255, 0.08)"
                }}
              >
                <p style={{ fontSize: 12, color: "var(--dark-text-primary)", lineHeight: 1.6 }}>
                  {topDistrict ? (
                    <>
                      <strong>{topDistrict.district}</strong>挂牌均价 {fmt(topDistrict.avg_unit_price)} 元/㎡，当前样本量 {fmt(topDistrict.listing_count)} 套。
                    </>
                  ) : (
                    "暂无真实区县聚合结果，可先导入旧库或执行采集任务。"
                  )}
                </p>
              </div>
              <div 
                className="p-3 rounded-lg"
                style={{ 
                  background: failedTaskCount > 0 ? "rgba(245, 158, 11, 0.1)" : "rgba(22, 163, 74, 0.1)", 
                  border: `1px solid ${failedTaskCount > 0 ? "rgba(245, 158, 11, 0.3)" : "rgba(22, 163, 74, 0.3)"}`
                }}
              >
                <p style={{ fontSize: 12, color: failedTaskCount > 0 ? "#FBBF24" : "#4ADE80", lineHeight: 1.6 }}>
                  {failedTaskCount > 0
                    ? `存在 ${failedTaskCount} 个失败或部分失败采集任务，建议进入日志页查看失败 URL 与错误类型。`
                    : "当前没有失败采集任务记录，可继续按区县做增量补采。"}
                </p>
              </div>
              <div 
                className="p-3 rounded-lg"
                style={{ 
                  background: "rgba(79, 125, 189, 0.1)", 
                  border: "1px solid rgba(79, 125, 189, 0.2)" 
                }}
              >
                <p style={{ fontSize: 12, color: "#60A5FA", lineHeight: 1.6 }}>
                  已可用于分析的样本 {fmt(kpis?.analysis_ready_count ?? 0)} 条。模型指标、聚类画像和异常检测结果可在"分析建模"模块查看。
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="dark-button"
                  style={{ fontSize: 12, borderColor: "rgba(255, 255, 255, 0.1)" }} 
                  onClick={() => navigate("/agent")}
                >
                  生成报告
                </Button>
                <Button 
                  size="sm" 
                  className="dark-button"
                  style={{ background: "rgba(79, 125, 189, 0.3)", border: "1px solid rgba(79, 125, 189, 0.4)", fontSize: 12 }} 
                  onClick={() => navigate("/analysis")}
                >
                  查看模型
                </Button>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

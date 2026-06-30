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
  type SystemSettings,
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
  const [settings, setSettings] = useState<SystemSettings | null>(null);
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
      api.getSettings(),
    ])
      .then(([overviewData, districtData, districtMap, trend, scatter, layout, distribution, settingsData]) => {
        const districts = mapDistricts(districtMap.items);
        const visibleDistricts = new Set(districts.map(item => item.name));
        setOverview(overviewData);
        setDistrictPrice(districtData.items.filter(item => visibleDistricts.has(item.district)));
        setMapData(districts);
        setTrendData(trend.items);
        setScatterData(scatter.items);
        setLayoutData(layout.items);
        setPriceDistribution(distribution.items);
        setSettings(settingsData);
        setError(null);
        setSelectedDistrict(prev => {
          if (!prev) return null;
          return districts.find(item => item.name === prev.name) ?? null;
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
        setSettings(null);
        setSelectedDistrict(null);
        setError(err instanceof Error ? err.message : "Dashboard 数据加载失败");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const kpis = overview?.kpis;
  const latestDate = kpis?.latest_updated_at ?? "暂无";

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
        icon: <Bot size={20} style={{ color: "#fff" }} />,
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
  const sourceSummary = overview?.source_summary ?? [];
  const scheduler = settings?.scheduler;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#163A70" }}>
            首页总览
          </h2>
          <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 4 }}>
            更新时间：{latestDate}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusTag 
            status={loading ? "running" : error ? "danger" : "success"} 
            label={loading ? "加载中" : error ? "异常" : "已连接"} 
          />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadDashboard} 
            disabled={loading} 
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
            background: "#FEF2F2", 
            border: "1px solid #FECACA", 
            color: "#DC2626", 
            fontSize: 13 
          }}
        >
          首页数据加载失败：{error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {kpiData.map(kpi => (
          <KpiCard key={kpi.title} {...kpi} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <SectionCard
          title="重庆区县分布"
          className="lg:col-span-2"
          action={
            <div 
              className="flex rounded-lg p-1"
              style={{ background: "#F3F4F6", border: "1px solid #E5EAF2" }}
            >
              {MAP_METRICS.map(item => (
                <button
                  key={item.key}
                  onClick={() => setMapMetric(item.key)}
                  className="px-2.5 py-1 rounded-md transition-all duration-200"
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
              height={340}
              selectedDistrict={selectedDistrict?.name}
              onSelectDistrict={district => setSelectedDistrict(district as DashboardDistrict | null)}
            />
            <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
              {[
              ["选中区县", selectedDistrict?.name ?? "未选中"],
              ["挂牌均价", selectedDistrict ? `${fmt(selectedDistrict.avgPrice)} 元/㎡` : `${fmt(kpis?.avg_unit_price)} 元/㎡`],
              ["采集样本", selectedDistrict ? `${fmt(selectedDistrict.count)} 套` : `${fmt(kpis?.total_count)} 套`],
              ["质量分", selectedDistrict ? `${fmt(selectedDistrict.quality, 1)} 分` : `${fmt(kpis?.avg_quality, 1)} 分`],
            ].map(([label, value]) => (
              <div 
                key={label} 
                className="rounded-lg px-3 py-2"
                style={{ 
                  background: "#F8FAFC", 
                  border: "1px solid #E5EAF2"
                }}
              >
                <div style={{ fontSize: 11, color: "#6B7280" }}>{label}</div>
                <div style={{ fontSize: 13, color: "#1F2937", fontWeight: 600, marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              style={{ 
                background: "#163A70", 
                border: "1px solid #163A70", 
                fontSize: 12, 
                height: 32,
                color: "#fff"
              }}
              disabled={!selectedDistrict}
              onClick={() => selectedDistrict && focusListingSearch(selectedDistrict)}
            >
              <Search size={13} className="mr-1.5" />查看房源
            </Button>
            <Button
              size="sm"
              variant="outline"
              style={{ fontSize: 12, height: 32, borderColor: "#E5EAF2" }}
              disabled={!selectedDistrict}
              onClick={() => selectedDistrict && prefillCrawlDistrict(selectedDistrict)}
            >
              <Radio size={13} className="mr-1.5" />按区补采
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              style={{ fontSize: 12, height: 32, color: "#6B7280" }} 
              onClick={() => setSelectedDistrict(null)}
            >
              重置
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="区县均价">
          <DistrictRankBar data={districtPrice} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <SectionCard title="挂牌价趋势">
            <PriceTrendLine data={trendData} />
          </SectionCard>
        </div>
        <SectionCard title="总价分布">
          <PriceDistributionBar data={priceDistribution} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <SectionCard title="面积-单价">
            <AreaPriceScatter data={scatterData} />
          </SectionCard>
        </div>
        <SectionCard title="户型分布">
          <LayoutDonut data={layoutData} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <SectionCard title="采集任务">
          <div className="flex flex-col gap-2.5">
            {crawlItems.length === 0 && (
              <div style={{ color: "#9CA3AF", fontSize: 12 }}>暂无任务</div>
            )}
            {crawlItems.map(task => (
              <div
                key={task.id}
                className="rounded-lg px-3 py-2"
                style={{ background: "#F8FAFC", border: "1px solid #E5EAF2" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span style={{ fontSize: 12, color: "#1F2937", fontWeight: 600 }}>{task.name}</span>
                  <StatusTag status={task.status} label={statusLabel(task.status)} />
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
                  {sourceLabel(task.source)} · 解析 {fmt(task.total_found)} 条 · 失败页 {task.failed_pages} · {task.progress}%
                </div>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              style={{ fontSize: 12, borderColor: "#E5EAF2" }}
              onClick={() => navigate("/crawl")}
            >
              查看任务页
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="数据来源">
          <div className="flex flex-col gap-2.5">
            {sourceSummary.map(item => (
              <div
                key={item.source}
                className="rounded-lg px-3 py-2"
                style={{ background: "#F8FAFC", border: "1px solid #E5EAF2" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span style={{ fontSize: 12, color: "#1F2937", fontWeight: 600 }}>{sourceLabel(item.source)}</span>
                  <span style={{ fontSize: 12, color: "#163A70" }}>{fmt(item.listing_count)} 条</span>
                </div>
                <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6 }}>
                  均价 {fmt(item.avg_unit_price)} 元/㎡ · 质量 {fmt(item.avg_quality, 1)} 分
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="定时任务">
          <div className="flex flex-col gap-2.5">
            {[
              ["全局调度", scheduler?.enabled, scheduler?.timezone ?? "-"],
              ["定时采集", scheduler?.incremental_crawl_job_enabled, `${scheduler?.incremental_crawl_interval_hours ?? "-"} 小时`],
              ["定时质检", scheduler?.quality_report_job_enabled, `${scheduler?.quality_report_interval_hours ?? "-"} 小时`],
            ].map(([label, enabled, extra]) => (
              <div
                key={String(label)}
                className="rounded-lg px-3 py-2 flex items-center justify-between gap-3"
                style={{ background: "#F8FAFC", border: "1px solid #E5EAF2" }}
              >
                <div>
                  <div style={{ fontSize: 12, color: "#1F2937", fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>{extra}</div>
                </div>
                <StatusTag status={enabled ? "success" : "pending"} label={enabled ? "开启" : "关闭"} />
              </div>
            ))}
            <Button
              size="sm"
              style={{ background: "#163A70", border: "1px solid #163A70", fontSize: 12, color: "#fff" }}
              onClick={() => navigate("/settings")}
            >
              查看设置
            </Button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

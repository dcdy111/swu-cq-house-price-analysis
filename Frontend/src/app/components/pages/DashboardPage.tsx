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
import {
  ChongqingHeatMap,
  ChongqingMapBackend,
  ChongqingMapMetric,
  District,
} from "../charts/ChongqingHeatMap";
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

// 优先读取注入的 Vite 环境变量；不写入 .env.local 时默认关闭高德地图，回退到本地 GeoJSON。
const AMAP_KEY = (import.meta as any).env?.VITE_AMAP_WEB_KEY as string | undefined;
const MAP_BACKEND: "amap" | "geojson" = AMAP_KEY ? "amap" : "geojson";

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
  };
  return labels[source] ?? source;
}

function schedulerDistrictLabel(value?: string | null) {
  const text = String(value || "").trim();
  if (!text || text === "全部" || text.toLowerCase() === "all") return "全区县";
  return text.split(",").map(item => item.trim()).filter(Boolean).join("、");
}

function crawlDistrictName(name: string) {
  const text = String(name || "").trim();
  const aliases: Record<string, string> = {
    yubei: "渝北",
    yuzhong: "渝中",
    jiangbei: "江北",
    shapingba: "沙坪坝",
    jiulongpo: "九龙坡",
    nanan: "南岸",
    nanana: "南岸",
    banan: "巴南",
    beibei: "北碚",
    dadukou: "大渡口",
    dianjiangxian: "垫江",
    dainjiangxian: "垫江",
    wansheng: "万盛",
    万盛经开区: "万盛",
  };
  const mapped = aliases[text.toLowerCase()] ?? aliases[text] ?? text;
  if (mapped === "两江新区" || mapped === "忠县") return mapped;
  if (mapped.endsWith("自治县")) return mapped.replace(/土家族苗族自治县|苗族土家族自治县|土家族自治县/g, "");
  return mapped.replace(/区$/g, "").replace(/县$/g, "");
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

function formatTime(value?: string | null) {
  if (!value) return "暂无更新";
  const text = String(value);
  return text.length > 16 ? text.slice(0, 16) : text;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [mapMetric, setMapMetric] = useState<ChongqingMapMetric>("avgPrice");
  const [mapBackend, setMapBackend] = useState<ChongqingMapBackend>(MAP_BACKEND);
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
        // 默认不再自动选中城口；用户首次没有主动选择区县时保持“未选中”。
        setSelectedDistrict(prev => {
          if (!prev) return null;
          return districts.find(item => item.name === prev.name) ?? null;
        });
      })
      .catch(loadError => {
        setOverview(null);
        setDistrictPrice([]);
        setMapData([]);
        setTrendData([]);
        setScatterData([]);
        setLayoutData([]);
        setPriceDistribution([]);
        setSettings(null);
        setSelectedDistrict(null);
        setError(loadError instanceof Error ? loadError.message : "Dashboard 数据加载失败");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const kpis = overview?.kpis;
  const latestDate = formatTime(kpis?.latest_updated_at);

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
    sessionStorage.setItem("crawlPrefillDistrict", crawlDistrictName(raw));
    navigate("/crawl");
  };

  const crawlItems = overview?.crawl_status.items ?? [];
  const sourceSummary = overview?.source_summary ?? [];
  const scheduler = settings?.scheduler;
  const trendGranularity = trendData[0]?.granularity ?? "month";
  const schedulerSource = sourceLabel(scheduler?.incremental_crawl_source || "fang");
  const schedulerDistricts = schedulerDistrictLabel(scheduler?.incremental_crawl_districts);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#163A70" }}>首页总览</h2>
          <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 4 }}>更新时间：{latestDate}</p>
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
          className="rounded-lg px-4 py-3"
          style={{
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            color: "#DC2626",
            fontSize: 13,
          }}
        >
          首页数据加载失败：{error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
        {kpiData.map(kpi => (
          <KpiCard key={kpi.title} {...kpi} />
        ))}
      </div>

      <SectionCard
        title="重庆区县分布"
        subtitle={
          mapBackend === "amap"
            ? "底图：高德 JS API · 色彩：挂牌均价 / 样本量 / 质量"
            : "底图：本地 GeoJSON · 色彩：挂牌均价 / 样本量 / 质量"
        }
        action={
          <div className="flex w-full justify-start sm:w-auto sm:justify-end">
            <div
              className="grid w-full grid-cols-3 rounded-lg p-1 sm:w-auto sm:flex"
              style={{ background: "#F3F4F6", border: "1px solid #E5EAF2" }}
            >
              {MAP_METRICS.map(item => (
                <button
                  key={item.key}
                  onClick={() => setMapMetric(item.key)}
                  className="rounded-md px-2 py-1.5 transition-all duration-200"
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
          </div>
        }
      >
        <ChongqingHeatMap
          metric={mapMetric}
          data={mapData}
          height={460}
          selectedDistrict={selectedDistrict?.name}
          onSelectDistrict={district => setSelectedDistrict((district as DashboardDistrict) ?? null)}
          onBackendChange={setMapBackend}
        />
        {mapBackend === "geojson" && (
          <div
            className="mt-2"
            style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.6 }}
          >
            {AMAP_KEY
              ? "高德底图未成功加载，当前已自动回退到本地 GeoJSON 区县边界。"
              : "如需使用高德 JS API，在 Frontend/.env.local 配置 VITE_AMAP_WEB_KEY 后重启前端。"}
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            ["选中区县", selectedDistrict?.name ?? "未选中"],
            [
              "挂牌均价",
              selectedDistrict ? `${fmt(selectedDistrict.avgPrice)} 元/㎡` : `${fmt(kpis?.avg_unit_price)} 元/㎡`,
            ],
            [
              "采集样本",
              selectedDistrict ? `${fmt(selectedDistrict.count)} 套` : `${fmt(kpis?.total_count)} 套`,
            ],
            [
              "质量分",
              selectedDistrict
                ? `${fmt(selectedDistrict.quality, 1)} 分`
                : `${fmt(kpis?.avg_quality, 1)} 分`,
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg px-3 py-3"
              style={{ background: "#F8FAFC", border: "1px solid #E5EAF2" }}
            >
              <div style={{ fontSize: 11, color: "#6B7280" }}>{label}</div>
              <div style={{ fontSize: 14, color: "#1F2937", fontWeight: 600, marginTop: 4 }}>
                {value}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            style={{
              background: "#163A70",
              border: "1px solid #163A70",
              fontSize: 12,
              height: 32,
              color: "#fff",
            }}
            disabled={!selectedDistrict}
            onClick={() => selectedDistrict && focusListingSearch(selectedDistrict)}
          >
            <Search size={13} className="mr-1.5" />
            查看房源
          </Button>
          <Button
            size="sm"
            variant="outline"
            style={{ fontSize: 12, height: 32, borderColor: "#E5EAF2" }}
            disabled={!selectedDistrict}
            onClick={() => selectedDistrict && prefillCrawlDistrict(selectedDistrict)}
          >
            <Radio size={13} className="mr-1.5" />
            按区补采
          </Button>
          <Button
            size="sm"
            variant="ghost"
            style={{ fontSize: 12, height: 32, color: "#6B7280" }}
            onClick={() => setSelectedDistrict(null)}
          >
            清除选中
          </Button>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        <SectionCard
          title="区县均价"
          subtitle={`共 ${districtPrice.length} 个区县，按挂牌均价降序`}
          noPad
          className="xl:col-span-1"
        >
          <div className="p-2">
            <DistrictRankBar data={districtPrice} />
          </div>
        </SectionCard>

        <div className="xl:col-span-3">
          <SectionCard
            title="挂牌价趋势"
          subtitle={`粒度：${trendGranularity === "hour" ? "小时" : trendGranularity === "day" ? "日" : "月"}`}
          >
            <PriceTrendLine data={trendData} />
          </SectionCard>
        </div>
      </div>

      <SectionCard title="面积-单价散点">
        <AreaPriceScatter data={scatterData} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="总价分布" subtitle="按挂牌总价区间统计">
          <PriceDistributionBar data={priceDistribution} />
        </SectionCard>
        <SectionCard title="户型分布" subtitle="展示主要户型占比与样本量">
          <LayoutDonut data={layoutData} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch">
        <SectionCard
          title="最近任务"
          subtitle={`展示 ${crawlItems.length} 条 · 完整记录在“采集任务”页`}
          noPad
        >
          <div className="flex flex-col">
            {crawlItems.length === 0 && (
              <div
                style={{
                  color: "#9CA3AF",
                  fontSize: 12,
                  padding: 20,
                }}
              >
                暂无任务
              </div>
            )}
            {crawlItems.map(task => (
              <div
                key={task.id}
                className="flex items-center justify-between gap-2 px-4 py-3"
                style={{ borderTop: "1px solid #E5EAF2" }}
              >
                <div className="min-w-0">
                  <div
                    className="truncate"
                    style={{ fontSize: 13, color: "#1F2937", fontWeight: 600 }}
                  >
                  系统ID {task.id} · {task.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                    {sourceLabel(task.source)} · 解析 {fmt(task.total_found)} 条 · 失败页 {task.failed_pages}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusTag status={task.status} label={statusLabel(task.status)} />
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>{task.progress}%</span>
                </div>
              </div>
            ))}
            <div className="px-4 py-3" style={{ borderTop: "1px solid #E5EAF2" }}>
              <Button
                size="sm"
                variant="outline"
                style={{ fontSize: 12, borderColor: "#E5EAF2" }}
                onClick={() => navigate("/crawl")}
              >
                打开任务页
              </Button>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="数据来源" subtitle="按 MySQL listings.source 聚合，仅展示 3 个真实来源" noPad>
          <div className="flex flex-col">
            {sourceSummary.length === 0 && (
              <div style={{ color: "#9CA3AF", fontSize: 12, padding: 20 }}>暂无来源数据</div>
            )}
            {sourceSummary.map(item => (
              <div
                key={item.source}
                className="flex items-center justify-between gap-2 px-4 py-3"
                style={{ borderTop: "1px solid #E5EAF2" }}
              >
                <div>
                  <div style={{ fontSize: 13, color: "#1F2937", fontWeight: 600 }}>
                    {sourceLabel(item.source)}
                  </div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>
                    均价 {fmt(item.avg_unit_price)} 元/㎡ · 质量 {fmt(item.avg_quality, 1)} 分
                  </div>
                </div>
                <span style={{ fontSize: 13, color: "#163A70", fontWeight: 700 }}>
                  {fmt(item.listing_count)} 条
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="每日增量采集调度" subtitle="自动补采状态" noPad>
          <div className="flex flex-col">
            {[
              [
                "APScheduler 总开关",
                scheduler?.enabled,
                `控制后台定时器是否运行 · 时区 ${scheduler?.timezone ?? "-"}`,
              ],
              [
                "增量采集定时任务",
                scheduler?.incremental_crawl_job_enabled,
                `${schedulerSource} · ${schedulerDistricts} · 每 ${scheduler?.incremental_crawl_interval_hours ?? 24}h · 每区 ${scheduler?.incremental_crawl_max_pages ?? 1} 页 · 并发 ${scheduler?.incremental_crawl_max_workers ?? 3}`,
              ],
              [
                "质量报告定时任务",
                scheduler?.quality_report_job_enabled,
                `${scheduler?.quality_report_interval_hours ?? "-"}h`,
              ],
            ].map(([label, enabled, extra]) => (
              <div
                key={String(label)}
                className="flex items-center justify-between gap-3 px-4 py-3"
                style={{ borderTop: "1px solid #E5EAF2" }}
              >
                <div>
                  <div style={{ fontSize: 13, color: "#1F2937", fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>{String(extra)}</div>
                </div>
                <StatusTag
                  status={enabled ? "success" : "pending"}
                  label={enabled ? "开启" : "关闭"}
                />
              </div>
            ))}
            <div
              className="px-4 py-3"
              style={{ borderTop: "1px solid #E5EAF2", background: "#F8FAFC", fontSize: 12, color: "#6B7280", lineHeight: 1.7 }}
            >
              默认：房天下 / 全区县 / 24 小时 / 每区 1 页 / 并发 3。
            </div>
            <div className="px-4 py-3" style={{ borderTop: "1px solid #E5EAF2" }}>
              <Button
                size="sm"
                style={{
                  background: "#163A70",
                  border: "1px solid #163A70",
                  fontSize: 12,
                  color: "#fff",
                }}
                onClick={() => navigate("/settings")}
              >
                进入调度设置
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

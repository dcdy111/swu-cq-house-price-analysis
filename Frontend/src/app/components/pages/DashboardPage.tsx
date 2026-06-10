import { Building2, TrendingUp, BarChart3, Database, Bot, MapPin, Activity } from "lucide-react";
import { KpiCard } from "../common/KpiCard";
import { SectionCard } from "../common/SectionCard";
import { StatusTag } from "../common/StatusTag";
import { DistrictRankBar } from "../charts/DistrictRankBar";
import { PriceTrendLine } from "../charts/PriceTrendLine";
import { AreaPriceScatter } from "../charts/AreaPriceScatter";
import { LayoutDonut } from "../charts/LayoutDonut";
import { ChongqingHeatMap } from "../charts/ChongqingHeatMap";

const KPI_DATA = [
  { title: "房源总数", value: "128,645", unit: "套", change: 2.3, changeLabel: "较上月", icon: <Building2 size={18} style={{ color: "#4F7DBD" }} />, accent: true },
  { title: "本月新增", value: "5,234", unit: "套", change: 12.1, changeLabel: "较上月", icon: <TrendingUp size={18} style={{ color: "#E67E22" }} /> },
  { title: "全市均价", value: "14,120", unit: "元/㎡", change: 0.8, changeLabel: "较上月", icon: <BarChart3 size={18} style={{ color: "#163A70" }} /> },
  { title: "数据完整率", value: "94.6", unit: "%", change: 0.4, changeLabel: "较上月", icon: <Database size={18} style={{ color: "#16A34A" }} /> },
  { title: "最高均价(渝中)", value: "22,450", unit: "元/㎡", change: 3.2, changeLabel: "同比", icon: <MapPin size={18} style={{ color: "#E67E22" }} /> },
  { title: "模型 R² 精度", value: "0.842", unit: "", change: 1.2, changeLabel: "较上版本", icon: <Bot size={18} style={{ color: "#163A70" }} /> },
  { title: "今日采集量", value: "45,720", unit: "条", change: 5.8, changeLabel: "较昨日", icon: <Activity size={18} style={{ color: "#4F7DBD" }} /> },
];

const CRAWL_STATUS = [
  { source: "链家", status: "running" as const, progress: 67, count: "33,500" },
  { source: "贝壳", status: "success" as const, progress: 100, count: "12,000" },
  { source: "安居客", status: "failed" as const, progress: 34, count: "2,720" },
];

export function DashboardPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ color: "#163A70", fontSize: 18, fontWeight: 700 }}>首页总览</h2>
          <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 2 }}>2026-06-09 · 重庆全市二手房数据概览</p>
        </div>
        <StatusTag status="running" label="实时数据" />
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
        {KPI_DATA.map((kpi, i) => (
          <KpiCard key={i} {...kpi} />
        ))}
      </div>

      {/* Row 2: Heatmap + Rank */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="区县价格热力图" subtitle="按均价着色，悬停查看详情">
          <ChongqingHeatMap />
        </SectionCard>
        <SectionCard title="区县均价排行" subtitle="Top 8 区县单价对比">
          <DistrictRankBar />
        </SectionCard>
      </div>

      {/* Row 3: Trend + Scatter + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <SectionCard title="近12月价格走势" subtitle="全市均价趋势（元/㎡）">
            <PriceTrendLine />
          </SectionCard>
        </div>
        <SectionCard title="户型分布" subtitle="在售房源户型占比">
          <LayoutDonut />
        </SectionCard>
      </div>

      {/* Row 4: Scatter + Crawl status + Agent insight */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <SectionCard title="面积-单价散点图" subtitle="各区县价格分布">
            <AreaPriceScatter />
          </SectionCard>
        </div>
        <div className="flex flex-col gap-5">
          {/* Crawl status */}
          <SectionCard title="采集状态" subtitle="今日任务进度">
            <div className="flex flex-col gap-3">
              {CRAWL_STATUS.map(({ source, status, progress, count }) => (
                <div key={source} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 13, color: "#1F2937" }}>{source}</span>
                    <StatusTag status={status} label={status === "running" ? "采集中" : status === "success" ? "完成" : "失败"} />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: "#E5EAF2" }}>
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${progress}%`,
                        background: status === "running" ? "#163A70" : status === "success" ? "#16A34A" : "#DC2626"
                      }} />
                    </div>
                    <span style={{ fontSize: 11, color: "#9CA3AF", minWidth: 30 }}>{progress}%</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>已采集 {count} 条</span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Agent insight */}
          <SectionCard title="AI 智能洞察" subtitle="DeepSeek Agent 分析摘要">
            <div className="flex flex-col gap-3">
              <div className="p-3 rounded-lg" style={{ background: "#F7F9FC", border: "1px solid #E5EAF2" }}>
                <p style={{ fontSize: 12, color: "#1F2937", lineHeight: 1.6 }}>
                  📈 <strong>渝中区</strong>均价 22,450 元/㎡，位居全市第一，同比上涨 3.2%。
                </p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "#FFF7ED", border: "1px solid #FDE68A" }}>
                <p style={{ fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>
                  ⚠️ 安居客采集任务异常，建议检查 IP 轮换策略。
                </p>
              </div>
              <div className="p-3 rounded-lg" style={{ background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
                <p style={{ fontSize: 12, color: "#166534", lineHeight: 1.6 }}>
                  ✅ 模型 R²=0.842，本周预测误差同比下降 1.2%。
                </p>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

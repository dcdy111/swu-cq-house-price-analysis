import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileWarning,
  Filter,
  Gauge,
  Layers3,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { api, QualityReport, SourceLayer } from "../../services/api";
import { KpiCard } from "../common/KpiCard";
import { SectionCard } from "../common/SectionCard";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

const numberFormatter = new Intl.NumberFormat("zh-CN");

function fmt(value?: number | null, digits = 0) {
  if (value === undefined || value === null) return "-";
  return numberFormatter.format(Number(value.toFixed(digits)));
}

function pct(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function sourceLabel(source: string) {
  const labels: Record<string, string> = {
    fang: "房天下",
    anjuke_mobile: "安居客",
    lianjia: "链家",
  };
  return labels[source] ?? source;
}

function layerTone(layer: SourceLayer["layer"]) {
  return layer === "real_source" || layer === "new_standard_crawl"
    ? { background: "#E0F2FE", color: "#0369A1", border: "#BAE6FD" }
    : { background: "#FFF7ED", color: "#C2410C", border: "#FED7AA" };
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-80">
      <div className="flex items-center gap-2" style={{ color: "#6B7280", fontSize: 13 }}>
        <RefreshCw size={16} className="animate-spin" />
        正在加载数据质量报告...
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <SectionCard>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <AlertTriangle size={18} style={{ color: "#DC2626" }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1F2937" }}>质量报告加载失败</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{message}</div>
          </div>
        </div>
        <Button onClick={onRetry} variant="outline" size="sm">
          重试
        </Button>
      </div>
    </SectionCard>
  );
}

export function QualityPage() {
  const [report, setReport] = useState<QualityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await api.getQualityReport());
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  const overview = report?.overview;
  const maxBucket = useMemo(
    () => Math.max(1, ...(report?.quality_buckets.map(item => item.count) ?? [1])),
    [report],
  );

  if (loading) return <LoadingState />;
  if (error || !report || !overview) return <ErrorState message={error ?? "暂无数据"} onRetry={loadReport} />;

  const newStandardRatio = pct(overview.new_standard_count, overview.total_count);
  const readyRatio = pct(overview.analysis_ready_count, overview.total_count);
  const duplicateCount = overview.total_count - overview.distinct_fingerprint;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
          <div>
            <h2 style={{ color: "#163A70", fontSize: 18, fontWeight: 700 }}>数据清洗与质量报告</h2>
          </div>
        <Button variant="outline" size="sm" onClick={loadReport} style={{ fontSize: 12 }}>
          <RefreshCw size={14} />
          刷新
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          title="总样本量"
          value={fmt(overview.total_count)}
          unit="条"
          icon={<Database size={18} style={{ color: "#4F7DBD" }} />}
          accent
        />
        <KpiCard
          title="真实来源样本"
          value={fmt(overview.new_standard_count)}
          unit="条"
          icon={<ShieldCheck size={18} style={{ color: "#16A34A" }} />}
        />
        <KpiCard
          title="可用于分析"
          value={fmt(overview.analysis_ready_count)}
          unit="条"
          icon={<Filter size={18} style={{ color: "#163A70" }} />}
        />
        <KpiCard
          title="异常区间"
          value={fmt(overview.extreme_count)}
          unit="条"
          icon={<FileWarning size={18} style={{ color: "#E67E22" }} />}
        />
        <KpiCard
          title="平均质量分"
          value={fmt(overview.avg_quality, 1)}
          unit="分"
          icon={<Gauge size={18} style={{ color: "#4F7DBD" }} />}
        />
        <KpiCard
          title="快照记录"
          value={fmt(overview.snapshot_count)}
          unit="条"
          icon={<ClipboardCheck size={18} style={{ color: "#16A34A" }} />}
        />
      </div>

      <SectionCard
        title="六维数据质量评分"
      >
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {report.dimension_scores.map(item => (
            <div key={item.key} className="rounded-xl p-3" style={{ background: "#F7F9FC", border: "1px solid #E5EAF2" }}>
              <div className="flex items-center justify-between gap-2">
                <span style={{ fontSize: 12, color: "#6B7280" }}>{item.label}</span>
                <span style={{ fontSize: 10, color: "#9CA3AF" }}>权重 {Math.round(item.weight * 100)}%</span>
              </div>
              <div style={{ color: item.score >= 80 ? "#163A70" : item.score >= 60 ? "#E67E22" : "#DC2626", fontSize: 24, fontWeight: 700, marginTop: 8 }}>
                {fmt(item.score, 1)}
              </div>
              <div style={{ fontSize: 11, color: "#4B5563", marginTop: 6, lineHeight: 1.6 }}>
                {item.definition}
              </div>
              <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 4, lineHeight: 1.5 }}>
                {item.evidence}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "#E5EAF2" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, item.score))}%`, background: item.score >= 80 ? "#4F7DBD" : "#E67E22" }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg px-3 py-2" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", fontSize: 12, lineHeight: 1.7 }}>
          {report.methodology.verifiability_note}
        </div>
      </SectionCard>

      <SectionCard title="当前分析口径">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Badge style={{ background: "#EFF6FF", color: "#163A70", borderColor: "#BFDBFE" }}>
                {overview.recommended_mode_label}
              </Badge>
              <span style={{ color: "#6B7280", fontSize: 12 }}>
                真实来源 {newStandardRatio}% · 可分析 {readyRatio}% · 分析样本 {fmt(overview.analysis_ready_count)} 条
              </span>
            </div>
            <p style={{ color: "#1F2937", fontSize: 13, lineHeight: 1.8 }}>
              当前首页、质量评估和分析建模均以 MySQL 真实房源表为唯一来源；进入分析前会过滤低质量、字段缺失、价格或面积异常的样本。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div className="flex flex-col gap-2" style={{ fontSize: 12, color: "#4B5563" }}>
              {report.analysis_policy.default_filters.map(rule => (
                <div key={rule} className="flex items-start gap-2">
                  <CheckCircle2 size={13} style={{ color: "#16A34A", marginTop: 2, flexShrink: 0 }} />
                  <span>{rule}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2" style={{ fontSize: 12, color: "#4B5563" }}>
              {report.analysis_policy.source_rules.map(rule => (
                <div key={rule} className="flex items-start gap-2">
                  <Layers3 size={13} style={{ color: "#163A70", marginTop: 2, flexShrink: 0 }} />
                  <span>{rule}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <SectionCard title="真实来源分层质量" noPad>
            <div className="overflow-auto">
              <table className="w-full" style={{ fontSize: 12 }}>
                <thead style={{ background: "#F7F9FC", color: "#6B7280" }}>
                  <tr>
                    {["来源", "层级", "样本量", "可用量", "均分", "异常", "区县", "推荐用途"].map(header => (
                      <th key={header} className="text-left px-4 py-3 font-medium whitespace-nowrap">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.source_layers.map(source => {
                    const tone = layerTone(source.layer);
                    return (
                      <tr key={source.source} style={{ borderTop: "1px solid #E5EAF2" }}>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#1F2937", fontWeight: 600 }}>
                          {sourceLabel(source.source)}
                          <div style={{ color: "#9CA3AF", fontSize: 11 }}>{source.source}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className="px-2 py-1 rounded-full"
                            style={{ background: tone.background, color: tone.color, border: `1px solid ${tone.border}` }}
                          >
                            {source.layer_label}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{fmt(source.sample_count)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{fmt(source.usable_count)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{fmt(source.avg_quality, 1)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{fmt(source.extreme_count)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{fmt(source.district_count)}</td>
                        <td className="px-4 py-3" style={{ minWidth: 260, color: "#6B7280", lineHeight: 1.6 }}>
                          {source.recommended_usage}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="质量分布">
          <div className="flex flex-col gap-4">
            {report.quality_buckets.map(bucket => {
              const width = Math.max(3, Math.round((bucket.count / maxBucket) * 100));
              const high = bucket.bucket === "90-100" || bucket.bucket === "80-89";
              return (
                <div key={bucket.bucket} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span style={{ color: "#1F2937", fontSize: 13 }}>{bucket.bucket} 分</span>
                    <span style={{ color: "#6B7280", fontSize: 12 }}>{fmt(bucket.count)} 条</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: "#E5EAF2" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${width}%`, background: high ? "#16A34A" : "#E67E22" }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="pt-3" style={{ borderTop: "1px solid #E5EAF2", color: "#6B7280", fontSize: 12, lineHeight: 1.7 }}>
              指纹重复数：{fmt(duplicateCount)}；缺失样本：{fmt(overview.missing_count)}；异常区间样本：{fmt(overview.extreme_count)}。
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <SectionCard title="清洗流程">
          <div className="flex flex-col gap-3">
            {report.cleaning_steps.map((step, index) => (
              <div key={step.name} className="flex gap-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: "#EFF6FF", color: "#163A70", fontSize: 12, fontWeight: 700, flexShrink: 0 }}
                >
                  {index + 1}
                </div>
                <div>
                  <div style={{ color: "#1F2937", fontSize: 13, fontWeight: 600 }}>{step.name}</div>
                  <div style={{ color: "#6B7280", fontSize: 12, lineHeight: 1.6, marginTop: 2 }}>{step.description}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <div className="xl:col-span-2">
          <SectionCard title="异常样例">
            <div className="overflow-auto">
              <table className="w-full" style={{ fontSize: 12 }}>
                <thead style={{ background: "#F7F9FC", color: "#6B7280" }}>
                  <tr>
                    {["来源", "标题", "区县", "总价", "单价", "面积", "质量分", "原因"].map(header => (
                      <th key={header} className="text-left px-4 py-3 font-medium whitespace-nowrap">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.abnormal_samples.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center" style={{ color: "#9CA3AF" }}>
                        暂无异常样例
                      </td>
                    </tr>
                  ) : (
                    report.abnormal_samples.map(item => (
                      <tr key={item.id} style={{ borderTop: "1px solid #E5EAF2" }}>
                        <td className="px-4 py-3 whitespace-nowrap">{sourceLabel(item.source)}</td>
                        <td className="px-4 py-3" style={{ minWidth: 220, color: "#1F2937" }}>
                          {item.title}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{item.district}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{fmt(item.total_price)} 万</td>
                        <td className="px-4 py-3 whitespace-nowrap">{fmt(item.unit_price)} 元/㎡</td>
                        <td className="px-4 py-3 whitespace-nowrap">{fmt(item.area, 1)} ㎡</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span style={{ color: item.data_quality_score >= 80 ? "#16A34A" : "#DC2626", fontWeight: 600 }}>
                            {item.data_quality_score}
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ minWidth: 180, color: "#92400E" }}>
                          <FileWarning size={13} style={{ display: "inline", marginRight: 4 }} />
                          {item.reason}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="来源分层规则">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.7 }}>
          {report.analysis_policy.source_rules.map(rule => (
            <div key={rule} className="flex items-start gap-2">
              <Layers3 size={15} style={{ color: "#163A70", marginTop: 2, flexShrink: 0 }} />
              <span>{rule}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

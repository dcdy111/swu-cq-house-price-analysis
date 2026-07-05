import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { SectionCard } from "../common/SectionCard";
import { StatusTag } from "../common/StatusTag";
import { FeatureImportance } from "../charts/FeatureImportance";
import { PredVsActualScatter } from "../charts/PredVsActualScatter";
import { KMeansScatter } from "../charts/KMeansScatter";
import { SnapshotChangeTrend } from "../charts/SnapshotChangeTrend";
import { DistrictBoxPlot } from "../charts/DistrictBoxPlot";
import { toast } from "sonner";
import {
  AlertTriangle,
  Brain,
  Calculator,
  Download,
  Eye,
  PencilLine,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import {
  analysisJobPdfUrl,
  api,
  type AnalysisJob,
  type AnalysisResult,
  type AnalysisSimulationRequest,
  type AnalysisSimulationResult,
  type SnapshotInsightsResult,
} from "../../services/api";

type SimulationFormState = {
  district: string;
  community: string;
  source: string;
  area: string;
  rooms: string;
  halls: string;
  floor_level: "low" | "mid" | "high" | "unknown";
  orientation: string;
  decoration: string;
  build_year: string;
  unit_price: string;
  total_price: string;
  max_samples: string;
};

const DEFAULT_SIMULATION_FORM: SimulationFormState = {
  district: "渝北",
  community: "",
  source: "fang",
  area: "95",
  rooms: "3",
  halls: "2",
  floor_level: "mid",
  orientation: "南北",
  decoration: "精装",
  build_year: "2018",
  unit_price: "",
  total_price: "",
  max_samples: "5000",
};

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function formatMetric(value: unknown, fallback: string) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(value >= 100 ? 2 : 4);
  }
  return fallback;
}

function getResult(results: AnalysisResult[], type: string) {
  return results.find(item => item.result_type === type);
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    success: "完成",
    pending: "待运行",
    running: "运行中",
    failed: "失败",
  };
  return labels[status] ?? status;
}

function formatDate(value?: string | null) {
  if (!value) return "--";
  return value.length > 16 ? value.slice(0, 16) : value;
}

function formatNullableNumber(value: unknown, digits = 1, suffix = "") {
  if (value === null || value === undefined || value === "") return "暂无";
  const number = Number(value);
  if (!Number.isFinite(number)) return "暂无";
  return `${number.toFixed(digits)}${suffix}`;
}

function summarizeMetrics(metrics?: Record<string, any>) {
  if (!metrics) return "暂无指标";
  const parts = [
    metrics.mae !== undefined ? `MAE ${formatMetric(metrics.mae, "--")}` : null,
    metrics.rmse !== undefined ? `RMSE ${formatMetric(metrics.rmse, "--")}` : null,
    metrics.r2 !== undefined ? `R² ${formatMetric(metrics.r2, "--")}` : null,
    metrics.cluster_count !== undefined ? `价值层级 ${metrics.cluster_count} 类` : null,
    metrics.anomaly_count !== undefined ? `异常 ${metrics.anomaly_count} 条` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "暂无指标";
}

function formatCvMetric(meanValue: unknown, stdValue: unknown, digits = 2, suffix = "") {
  const meanNumber = Number(meanValue);
  const stdNumber = Number(stdValue);
  if (!Number.isFinite(meanNumber)) return "暂无";
  const stdText = Number.isFinite(stdNumber) ? ` ± ${stdNumber.toFixed(digits)}` : "";
  return `${meanNumber.toFixed(digits)}${stdText}${suffix}`;
}

function toOptionalNumber(value: string) {
  const text = value.trim();
  if (!text) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

function buildSimulationPayload(form: SimulationFormState): AnalysisSimulationRequest {
  return {
    district: form.district.trim(),
    community: form.community.trim() || undefined,
    source: form.source.trim() || undefined,
    area: Number(form.area),
    rooms: Number(form.rooms),
    halls: Number(form.halls),
    floor_level: form.floor_level,
    orientation: form.orientation.trim() || undefined,
    decoration: form.decoration.trim() || undefined,
    build_year: toOptionalNumber(form.build_year),
    unit_price: toOptionalNumber(form.unit_price),
    total_price: toOptionalNumber(form.total_price),
    max_samples: toOptionalNumber(form.max_samples),
  };
}

export function AnalysisPage() {
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [history, setHistory] = useState<AnalysisJob[]>([]);
  const [snapshotInsights, setSnapshotInsights] = useState<SnapshotInsightsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [training, setTraining] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [viewingJob, setViewingJob] = useState<AnalysisJob | null>(null);
  const [activeTab, setActiveTab] = useState("eda");
  const [renameTarget, setRenameTarget] = useState<AnalysisJob | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [busyJobId, setBusyJobId] = useState<number | null>(null);
  const [simulationForm, setSimulationForm] = useState<SimulationFormState>(DEFAULT_SIMULATION_FORM);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationResult, setSimulationResult] = useState<AnalysisSimulationResult | null>(null);

  const loadLatest = async () => {
    setLoading(true);
    try {
      const latest = await api.getLatestAnalysisResultsByType();
      setJob(latest.job);
      setResults(latest.results ?? []);
      setApiError(null);
    } catch {
      try {
        const fallback = await api.getLatestAnalysisJob();
        setJob(fallback.job);
        setResults(fallback.results ?? []);
        setApiError(null);
      } catch (fallbackError) {
        setApiError(fallbackError instanceof Error ? fallbackError.message : "分析接口暂不可用");
        setJob(null);
        setResults([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const list = await api.listAnalysisJobs(1, 12);
      const items = list.items ?? [];
      if (items.length > 0) {
        setHistory(items);
        return;
      }
      const latest = await api.getLatestAnalysisJob();
      setHistory(latest.job ? [latest.job] : []);
    } catch {
      try {
        const latest = await api.getLatestAnalysisJob();
        setHistory(latest.job ? [latest.job] : []);
      } catch {
        setHistory([]);
      }
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadSnapshotInsights = async () => {
    setSnapshotLoading(true);
    try {
      const latest = await api.getSnapshotInsights(90);
      setSnapshotInsights(latest);
    } catch {
      setSnapshotInsights(null);
    } finally {
      setSnapshotLoading(false);
    }
  };

  const refreshAnalysisState = async () => {
    await Promise.all([loadLatest(), loadHistory(), loadSnapshotInsights()]);
  };

  useEffect(() => {
    void refreshAnalysisState();
  }, []);

  const regressionResult = useMemo(() => getResult(results, "regression"), [results]);
  const edaResult = useMemo(() => getResult(results, "eda"), [results]);
  const clusterResult = useMemo(() => getResult(results, "cluster"), [results]);
  const anomalyResult = useMemo(() => getResult(results, "anomaly"), [results]);
  const snapshotSeries = useMemo(() => snapshotInsights?.series ?? [], [snapshotInsights]);
  const snapshotTopDistricts = useMemo(() => snapshotInsights?.top_districts ?? [], [snapshotInsights]);
  const snapshotSamples = useMemo(() => snapshotInsights?.samples ?? [], [snapshotInsights]);

  const metricsList = useMemo(
    () => [
      {
        label: "MAE",
        value: formatMetric(regressionResult?.metrics?.mae, "--"),
        unit: "元/㎡",
        desc: "平均绝对误差",
      },
      {
        label: "RMSE",
        value: formatMetric(regressionResult?.metrics?.rmse, "--"),
        unit: "元/㎡",
        desc: "均方根误差",
      },
      {
        label: "R²",
        value: formatMetric(regressionResult?.metrics?.r2, "--"),
        unit: "",
        desc: "决定系数",
      },
      {
        label: "MAPE",
        value:
          regressionResult?.metrics?.mape !== undefined
            ? `${formatMetric(regressionResult.metrics.mape, "--")}%`
            : "--",
        unit: "",
        desc: "平均绝对百分误差",
      },
    ],
    [regressionResult],
  );

  const cvMetricsList = useMemo(
    () => [
      {
        label: "CV MAE",
        value: formatCvMetric(regressionResult?.metrics?.cv_mae_mean, regressionResult?.metrics?.cv_mae_std, 2, " 元/㎡"),
        desc: "交叉验证平均绝对误差 ± 波动",
      },
      {
        label: "CV RMSE",
        value: formatCvMetric(regressionResult?.metrics?.cv_rmse_mean, regressionResult?.metrics?.cv_rmse_std, 2, " 元/㎡"),
        desc: "交叉验证均方根误差 ± 波动",
      },
      {
        label: "CV R²",
        value: formatCvMetric(regressionResult?.metrics?.cv_r2_mean, regressionResult?.metrics?.cv_r2_std, 4),
        desc: "交叉验证决定系数 ± 波动",
      },
    ],
    [regressionResult],
  );

  const featureImportance = useMemo(
    () => asArray<{ feature: string; importance: number }>(regressionResult?.artifacts?.feature_importance),
    [regressionResult],
  );

  const predictionPoints = useMemo(() => {
    const rows = asArray<any>(regressionResult?.artifacts?.predictions);
    return rows
      .map(item => ({ actual: Number(item.actual), predicted: Number(item.predicted) }))
      .filter(item => Number.isFinite(item.actual) && Number.isFinite(item.predicted));
  }, [regressionResult]);

  const clusterPoints = useMemo(() => {
    const rows = asArray<any>(clusterResult?.artifacts?.points);
    return rows
      .map(item => ({
        x: Number(item.unit_price),
        y: Number(item.area),
        cluster: Number(item.cluster),
        label: String(item.label ?? ""),
      }))
      .filter(item => Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.cluster));
  }, [clusterResult]);

  const clusterProfiles = useMemo(
    () => asArray<any>(clusterResult?.artifacts?.clusters),
    [clusterResult],
  );

  const districtBoxData = useMemo(
    () =>
      asArray<any>(edaResult?.artifacts?.district_boxplot).filter(
        item => item.min !== null && item.max !== null,
      ),
    [edaResult],
  );

  const anomalyRows = useMemo(() => {
    const rows = asArray<any>(anomalyResult?.artifacts?.items);
    return rows.map(item => ({
      id: item.id,
      listing: item.title,
      actualPrice: Number(item.actual_unit_price),
      predictedPrice: Number(item.expected_unit_price),
      deviation: Number(item.deviation_rate),
      reason: item.reason,
      severity: item.severity,
    }));
  }, [anomalyResult]);

  const modelComparisonRows = useMemo(() => {
    const candidates = results.filter(item => item.result_type === "regression_candidate");
    if (candidates.length > 0) {
      return candidates.map(item => ({
        model: item.model_name,
        mae: item.metrics?.mae ?? "--",
        rmse: item.metrics?.rmse ?? "--",
        r2: item.metrics?.r2 ?? "--",
        mape: item.metrics?.mape ?? "--",
        isBest: Boolean(item.metrics?.is_best),
        status: item.metrics?.status ?? "ok",
      }));
    }
    const comparison = asArray<any>(regressionResult?.artifacts?.model_comparison);
    return comparison.map(item => ({
      model: item.model_name,
      mae: item.mae ?? "--",
      rmse: item.rmse ?? "--",
      r2: item.r2 ?? "--",
      mape: item.mape ?? "--",
      isBest: Boolean(item.is_best),
      status: item.status ?? "ok",
    }));
  }, [results, regressionResult]);

  const moduleGuides = useMemo(
    () => [
      {
        key: "eda",
        title: "EDA 探索",
        text: "先看样本覆盖、区县分布和离散程度，确认首页统计与建模口径是否一致。",
      },
      {
        key: "predict",
        title: "预测分析",
        text: "只评估挂牌单价回归效果，用 MAE、RMSE、R² 和影响因素解释辅助估价，不解释成交价。",
      },
      {
        key: "cluster",
        title: "价值分层",
        text: "按挂牌价、总价、面积等特征做房源价值分层，并允许用户输入样本在线归类。",
      },
      {
        key: "snapshot",
        title: "快照分析",
        text: "基于同一房源的连续快照差分观察调价行为，只做行为统计，不包装成未来走势预测。",
      },
      {
        key: "anomaly",
        title: "异常检测",
        text: "标记需要复核的房源记录，帮助判断是源站异常、采集问题还是清洗规则问题。",
      },
    ],
    [],
  );

  const pollAnalysisJob = async (jobId: number) => {
    let latestJob = await api.getAnalysisJob(jobId);
    setJob(latestJob);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (latestJob.status === "success" || latestJob.status === "failed") {
        break;
      }
      await new Promise(resolve => window.setTimeout(resolve, 2500));
      latestJob = await api.getAnalysisJob(jobId);
      setJob(latestJob);
    }
    if (latestJob.status === "success") {
      setResults(latestJob.results ?? []);
    }
    return latestJob;
  };

  const runTraining = async (type: "train" | "tune") => {
    if (training) return;
    setTraining(true);
    try {
      const nextJob = await api.createAnalysisJob(
        type === "tune"
          ? { name: "参数搜索", job_type: "tune", max_samples: 3000, background: true }
          : { name: "全量分析", job_type: "all", background: true },
      );
      setJob(nextJob);
      setApiError(null);
      toast.success(type === "tune" ? "参数搜索任务已启动，正在后台执行" : "训练任务已启动，正在后台执行");

      const latestJob = await pollAnalysisJob(nextJob.id);
      if (latestJob.status === "success") {
        toast.success(type === "tune" ? "参数搜索任务完成，结果已更新" : "重新训练完成，结果已更新");
      } else if (latestJob.status === "failed") {
        throw new Error(latestJob.error_message || "分析任务执行失败");
      } else {
        toast.warning("分析任务仍在后台执行，可稍后在历史任务中查看结果");
      }
      await refreshAnalysisState();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "分析任务创建失败";
      setApiError(message);
      toast.error(message);
    } finally {
      setTraining(false);
    }
  };

  const openHistoryJob = async (jobId: number) => {
    try {
      const detail = await api.getAnalysisJob(jobId);
      setViewingJob(detail);
    } catch (openError) {
      const message = openError instanceof Error ? openError.message : "历史任务读取失败";
      toast.error(message);
    }
  };

  const handleReplayJob = async (item: AnalysisJob) => {
    if (busyJobId || training) return;
    setBusyJobId(item.id);
    setTraining(true);
    try {
      const nextJob = await api.replayAnalysisJob(item.id, {
        name: `${item.name} · 重跑`,
        max_samples: item.sample_count || 5000,
        background: true,
      });
      setJob(nextJob);
      toast.success(`已提交任务 #${item.id} 的重跑请求`);
      const latestJob = await pollAnalysisJob(nextJob.id);
      if (latestJob.status === "success") {
        toast.success("历史任务已重跑完成");
      } else if (latestJob.status === "failed") {
        throw new Error(latestJob.error_message || "历史任务重跑失败");
      } else {
        toast.warning("重跑任务仍在后台执行，可稍后刷新查看");
      }
      await refreshAnalysisState();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "历史任务重跑失败");
    } finally {
      setBusyJobId(null);
      setTraining(false);
    }
  };

  const handleDeleteJob = async (item: AnalysisJob) => {
    if (busyJobId || training) return;
    const confirmed = window.confirm(`确认删除任务 #${item.id}「${item.name}」吗？此操作会删除对应结果记录。`);
    if (!confirmed) return;
    setBusyJobId(item.id);
    try {
      await api.deleteAnalysisJob(item.id);
      if (viewingJob?.id === item.id) {
        setViewingJob(null);
      }
      if (job?.id === item.id) {
        setJob(null);
        setResults([]);
      }
      toast.success(`任务 #${item.id} 已删除`);
      await refreshAnalysisState();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除历史任务失败");
    } finally {
      setBusyJobId(null);
    }
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const text = renameValue.trim();
    if (!text) {
      toast.error("任务名称不能为空");
      return;
    }
    setRenameSaving(true);
    try {
      const updated = await api.renameAnalysisJob(renameTarget.id, text);
      if (job?.id === updated.id) {
        setJob(updated);
      }
      if (viewingJob?.id === updated.id) {
        setViewingJob(updated);
      }
      setHistory(previous => previous.map(item => (item.id === updated.id ? { ...item, name: updated.name } : item)));
      toast.success("历史任务名称已更新");
      setRenameTarget(null);
      setRenameValue("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重命名失败");
    } finally {
      setRenameSaving(false);
    }
  };

  const handleSimulationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSimulationLoading(true);
    try {
      const result = await api.simulateAnalysis(buildSimulationPayload(simulationForm));
      setSimulationResult(result);
      setActiveTab("predict");
      toast.success("挂牌价辅助试算已完成");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "在线试算失败");
    } finally {
      setSimulationLoading(false);
    }
  };

  const handleDownloadResults = () => {
    if (!job || results.length === 0) {
      toast.warning("暂无真实模型结果可下载");
      return;
    }
    window.open(analysisJobPdfUrl(job.id), "_blank");
  };

  const status = training || loading ? "running" : apiError ? "warn" : job?.status ?? "info";
  const statusText = training
    ? "任务运行中"
    : apiError
      ? "接口异常"
      : regressionResult?.model_name
        ? regressionResult.model_name
        : "暂无结果";
  const taskSummaryItems = [
    { label: "样本规模", value: `${job?.sample_count ?? "--"} 条`, tone: "#163A70" },
    { label: "区县覆盖", value: `${regressionResult?.metrics?.sampling_district_count ?? "--"} 个`, tone: "#163A70" },
    { label: "真实来源", value: `${regressionResult?.metrics?.sampling_source_count ?? "--"} 个`, tone: "#163A70" },
    {
      label: "异常率",
      value:
        anomalyResult?.metrics?.anomaly_rate !== undefined
          ? `${(Number(anomalyResult.metrics.anomaly_rate) * 100).toFixed(2)}%`
          : "--",
      tone: "#C2410C",
    },
  ];
  const taskDetailItems = [
    ["主模型", regressionResult?.model_name ?? "--"],
    ["任务名称", job?.name ?? "--"],
    ["任务ID", job ? `#${job.id}` : "--"],
    [
      "调参状态",
      regressionResult?.metrics?.tuning_status === "searched"
        ? "参数搜索完成"
        : regressionResult?.metrics?.tuning_status === "baseline"
          ? "默认参数"
          : "--",
    ],
    ["验证方式", regressionResult?.metrics?.cv_scheme ?? "--"],
    ["训练集", `${job?.train_count ?? "--"} 条`],
    ["测试集", `${job?.test_count ?? "--"} 条`],
    ["剔除样本", `${regressionResult?.metrics?.excluded_count ?? 0} 条`],
    ["上次训练", formatDate(job?.finished_at ?? job?.created_at)],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 style={{ color: "#163A70", fontSize: 18, fontWeight: 700 }}>分析建模</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusTag status={status} label={statusText} />
          <Button
            size="sm"
            variant="outline"
            disabled={!job || results.length === 0}
            onClick={handleDownloadResults}
            className="flex items-center gap-1.5"
            style={{ fontSize: 13, height: 36 }}
          >
            <Download size={13} />
            导出 PDF
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={training || loading}
            onClick={() => runTraining("train")}
            className="flex items-center gap-1.5"
            style={{ fontSize: 13, height: 36 }}
          >
            <RefreshCw size={13} className={training || loading ? "animate-spin" : ""} />
            {training ? "训练中..." : "重新训练"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={training || loading}
            onClick={() => runTraining("tune")}
            className="flex items-center gap-1.5"
            style={{ fontSize: 13, height: 36 }}
          >
            <Brain size={13} className={training ? "animate-spin" : ""} />
            {training ? "任务运行中" : "参数搜索"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metricsList.map(m => (
          <div
            key={m.label}
            className="flex flex-col gap-2 rounded-2xl p-4"
            style={{ background: "#fff", border: "1px solid #E5EAF2", boxShadow: "0 10px 30px rgba(22, 58, 112, 0.06)" }}
          >
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>{m.desc}</span>
              <span
                className="rounded px-2 py-0.5"
                style={{ background: "#EFF6FF", color: "#163A70", fontSize: 11, fontWeight: 700 }}
              >
                {m.label}
              </span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#163A70" }}>
              {m.value}
              <span style={{ fontSize: 13, fontWeight: 400, color: "#9CA3AF", marginLeft: 4 }}>
                {m.unit}
              </span>
            </div>
          </div>
        ))}
      </div>

      <SectionCard title="分析模块说明" subtitle="展示真实建模结果与可解释证据" className="overflow-hidden">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.35fr_.65fr]">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            {moduleGuides.map(item => (
              <div
                key={item.key}
                className="rounded-2xl p-4"
                style={{ background: "linear-gradient(180deg, #F8FAFC 0%, #FFFFFF 100%)", border: "1px solid #E5EAF2" }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: "#163A70" }}>{item.title}</div>
                <div style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.75, marginTop: 8 }}>{item.text}</div>
              </div>
            ))}
          </div>
          <div
            className="rounded-2xl p-4"
            style={{
              background: "linear-gradient(135deg, #EFF6FF 0%, #F8FBFF 55%, #FFFFFF 100%)",
              border: "1px solid #BFDBFE",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#163A70" }}>使用口径提醒</div>
            <div style={{ fontSize: 12, color: "#31507A", lineHeight: 1.85, marginTop: 8 }}>
              仅展示通过质量过滤的挂牌价数据。在线试算输出的是挂牌价/报价辅助参考，不代表成交价预测。模型用于解释影响因素、做辅助估值、房源价值分层和调价行为统计，不宣称精准预测成交价。
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[
                `结果类型 ${results.length || 0} 项`,
                `回归指标 ${regressionResult ? "已就绪" : "待生成"}`,
                `在线试算 ${simulationResult ? "已生成" : "待输入"}`,
                `快照分析 ${snapshotInsights ? "已就绪" : "待读取"}`,
              ].map(text => (
                <div
                  key={text}
                  className="rounded-full px-3 py-2"
                  style={{ background: "rgba(255,255,255,0.8)", border: "1px solid rgba(79,125,189,0.18)", fontSize: 11, color: "#4B648C" }}
                >
                  {text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="建模任务与口径" subtitle="把当前任务、训练规模和展示口径压缩到同一块信息板里">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.08fr_.92fr]">
          <div
            className="rounded-2xl p-4"
            style={{ background: "linear-gradient(135deg, #163A70 0%, #244D88 52%, #4F7DBD 100%)", color: "#fff" }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusTag status={status} label={statusText} />
              <Badge style={{ background: "rgba(255,255,255,0.16)", color: "#fff", border: "1px solid rgba(255,255,255,0.18)" }}>
                {job?.job_type ?? "analysis"}
              </Badge>
              <Badge style={{ background: "rgba(255,255,255,0.12)", color: "#D9E7FF", border: "1px solid rgba(255,255,255,0.12)" }}>
                {job ? `任务 #${job.id}` : "暂无任务"}
              </Badge>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, marginTop: 16 }}>{job?.name ?? "等待分析任务"}</div>
            <div style={{ fontSize: 12, lineHeight: 1.85, marginTop: 10, color: "rgba(233,241,255,0.92)" }}>
              当前页面优先展示可解释建模证据。所有数值都围绕挂牌价/报价展开，训练样本、测试样本、异常率和区县覆盖都在这里统一给答辩口径。
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {taskSummaryItems.map(item => (
                <div
                  key={item.label}
                  className="rounded-2xl px-3 py-3"
                  style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  <div style={{ fontSize: 11, color: "rgba(226,236,255,0.78)" }}>{item.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginTop: 6 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div
            className="rounded-2xl p-4"
            style={{ background: "#F8FAFC", border: "1px solid #E5EAF2" }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {taskDetailItems.map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-xl px-3 py-3"
                  style={{ background: "#fff", border: "1px solid #E5EAF2" }}
                >
                  <div style={{ fontSize: 11, color: "#8B9AB5" }}>{key}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#163A70", marginTop: 6, lineHeight: 1.5 }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="flex flex-col gap-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
          <TabsList className="max-w-full justify-start overflow-x-auto rounded-2xl bg-[#EEF3FB] p-1.5">
              <TabsTrigger value="eda" style={{ fontSize: 13 }}>
                EDA 探索
              </TabsTrigger>
              <TabsTrigger value="predict" style={{ fontSize: 13 }}>
                预测分析
              </TabsTrigger>
              <TabsTrigger value="cluster" style={{ fontSize: 13 }}>
                价值分层
              </TabsTrigger>
              <TabsTrigger value="snapshot" style={{ fontSize: 13 }}>
                快照分析
              </TabsTrigger>
              <TabsTrigger value="anomaly" style={{ fontSize: 13 }}>
                异常检测
              </TabsTrigger>
              <TabsTrigger value="eval" style={{ fontSize: 13 }}>
                模型对比
              </TabsTrigger>
          </TabsList>

          <TabsContent value="eda">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[.92fr_1.08fr]">
              <SectionCard
                title="EDA 探索性分析"
                subtitle={edaResult?.summary ?? "先确认样本覆盖、口径和区县离散程度"}
                className="h-full"
              >
                <div className="flex flex-col gap-3" style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.8 }}>
                  <div>1. 看本轮样本是否覆盖足够区县与数据源，避免首页统计和建模口径脱节。</div>
                  <div>2. 看不同区县挂牌单价的离散程度，识别极高价、极低价和长尾分布。</div>
                  <div>3. 看异常值是否集中在特定区县、面积段或来源，为清洗和复爬提供依据。</div>
                  <div>4. EDA 不输出预测结论，主要用于判断样本覆盖、分布特征和建模可信度。</div>
                  <div
                    className="grid grid-cols-2 gap-3 rounded-2xl p-3 sm:grid-cols-4"
                    style={{ background: "#F8FAFC", border: "1px solid #E5EAF2" }}
                  >
                    <div>
                      <div style={{ color: "#9CA3AF" }}>本轮样本量</div>
                      <div style={{ color: "#163A70", fontWeight: 700, marginTop: 4 }}>{job?.sample_count ?? "--"}</div>
                    </div>
                    <div>
                      <div style={{ color: "#9CA3AF" }}>区县覆盖</div>
                      <div style={{ color: "#163A70", fontWeight: 700, marginTop: 4 }}>
                        {regressionResult?.metrics?.sampling_district_count ?? "--"} 个
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "#9CA3AF" }}>数据来源</div>
                      <div style={{ color: "#163A70", fontWeight: 700, marginTop: 4 }}>
                        {regressionResult?.metrics?.sampling_source_count ?? "--"} 个
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "#9CA3AF" }}>剔除样本</div>
                      <div style={{ color: "#163A70", fontWeight: 700, marginTop: 4 }}>
                        {regressionResult?.metrics?.excluded_count ?? 0} 条
                      </div>
                    </div>
                  </div>
                </div>
              </SectionCard>
              <SectionCard title="区县挂牌单价箱线图" subtitle={edaResult?.summary ?? "暂无真实 EDA 结果"} className="h-full">
                <DistrictBoxPlot source={districtBoxData} />
              </SectionCard>
            </div>
          </TabsContent>

          <TabsContent value="predict">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.02fr_.98fr]">
              <div className="flex flex-col gap-4">
                <SectionCard
                  title="挂牌价辅助试算"
                  subtitle="用户输入房源条件，系统输出挂牌价估计与解释因素"
                >
                  <form onSubmit={handleSimulationSubmit} className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <Label>区县</Label>
                        <Input
                          value={simulationForm.district}
                          onChange={event => setSimulationForm(prev => ({ ...prev, district: event.target.value }))}
                          placeholder="如：渝北"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>小区名称</Label>
                        <Input
                          value={simulationForm.community}
                          onChange={event => setSimulationForm(prev => ({ ...prev, community: event.target.value }))}
                          placeholder="可选，提升解释性"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>建筑面积（㎡）</Label>
                        <Input
                          type="number"
                          value={simulationForm.area}
                          onChange={event => setSimulationForm(prev => ({ ...prev, area: event.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-2">
                          <Label>室</Label>
                          <Input
                            type="number"
                            value={simulationForm.rooms}
                            onChange={event => setSimulationForm(prev => ({ ...prev, rooms: event.target.value }))}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label>厅</Label>
                          <Input
                            type="number"
                            value={simulationForm.halls}
                            onChange={event => setSimulationForm(prev => ({ ...prev, halls: event.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>楼层等级</Label>
                        <select
                          value={simulationForm.floor_level}
                          onChange={event =>
                            setSimulationForm(prev => ({
                              ...prev,
                              floor_level: event.target.value as SimulationFormState["floor_level"],
                            }))
                          }
                          className="h-9 rounded-md border border-[#D7DFEA] px-3 text-sm outline-none focus:border-[#163A70]"
                        >
                          <option value="low">低层</option>
                          <option value="mid">中层</option>
                          <option value="high">高层</option>
                          <option value="unknown">未知</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>建成年份</Label>
                        <Input
                          type="number"
                          value={simulationForm.build_year}
                          onChange={event => setSimulationForm(prev => ({ ...prev, build_year: event.target.value }))}
                          placeholder="可选，如 2018"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>朝向</Label>
                        <Input
                          value={simulationForm.orientation}
                          onChange={event => setSimulationForm(prev => ({ ...prev, orientation: event.target.value }))}
                          placeholder="如：南北"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>装修</Label>
                        <Input
                          value={simulationForm.decoration}
                          onChange={event => setSimulationForm(prev => ({ ...prev, decoration: event.target.value }))}
                          placeholder="如：精装"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>参考挂牌单价（可选）</Label>
                        <Input
                          type="number"
                          value={simulationForm.unit_price}
                          onChange={event => setSimulationForm(prev => ({ ...prev, unit_price: event.target.value }))}
                          placeholder="已有意向报价时可填"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label>参考挂牌总价（可选）</Label>
                        <Input
                          type="number"
                          value={simulationForm.total_price}
                          onChange={event => setSimulationForm(prev => ({ ...prev, total_price: event.target.value }))}
                          placeholder="单位：万元"
                        />
                      </div>
                    </div>

                    <div
                      className="rounded-2xl px-4 py-3"
                      style={{ background: "#F8FAFC", border: "1px solid #E5EAF2", fontSize: 12, color: "#4B5563", lineHeight: 1.8 }}
                    >
                      如果没有填写参考挂牌单价，系统会先估计挂牌单价，再据此完成价值分层归类和相似样本检索。
                    </div>

                    <div className="flex justify-end">
                      <Button type="submit" disabled={simulationLoading} style={{ background: "#163A70", color: "#fff" }}>
                        <Calculator size={14} className={simulationLoading ? "animate-spin" : ""} />
                        <span className="ml-1.5">{simulationLoading ? "试算中..." : "开始辅助试算"}</span>
                      </Button>
                    </div>
                  </form>
                </SectionCard>
                <SectionCard title="影响挂牌单价的主要特征" subtitle="只解释挂牌单价影响因素，不代表成交价预测">
                  <FeatureImportance data={featureImportance} />
                </SectionCard>
                <SectionCard
                  title="交叉验证稳定性"
                  subtitle={regressionResult?.metrics?.cv_scheme ?? "当前结果暂未生成交叉验证摘要"}
                >
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {cvMetricsList.map(item => (
                      <div
                        key={item.label}
                        className="rounded-2xl p-4"
                        style={{ background: "#F8FAFC", border: "1px solid #E5EAF2" }}
                      >
                        <div style={{ fontSize: 11, color: "#9CA3AF" }}>{item.label}</div>
                        <div style={{ fontSize: 16, color: "#163A70", fontWeight: 700, marginTop: 6 }}>{item.value}</div>
                        <div style={{ fontSize: 11, color: "#6B7280", lineHeight: 1.6, marginTop: 6 }}>{item.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div
                    className="mt-3 rounded-2xl px-4 py-3"
                    style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", fontSize: 12, color: "#31507A", lineHeight: 1.8 }}
                  >
                    交叉验证用于说明模型在不同样本切分下的稳定性。页面保留 MAE / RMSE / R² 作为横截面挂牌价辅助估计指标，但不把这些结果表述为成交价精准预测。
                  </div>
                </SectionCard>
              </div>

              <div className="flex flex-col gap-4">
                <SectionCard title="试算结果" subtitle="输出挂牌单价、总价、相近样本与解释因素">
                  {!simulationResult ? (
                    <div className="flex min-h-[12rem] items-center justify-center rounded-2xl" style={{ background: "#F8FAFC", fontSize: 12, color: "#9CA3AF" }}>
                      还没有试算结果。输入房源条件后即可生成辅助估价、分层标签和解释因素。
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl p-3" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
                          <div style={{ fontSize: 11, color: "#6B7280" }}>估计挂牌单价</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: "#163A70", marginTop: 6 }}>
                            {Number(simulationResult.regression.estimated_unit_price || 0).toLocaleString()}
                          </div>
                          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>元/㎡</div>
                        </div>
                        <div className="rounded-2xl p-3" style={{ background: "#F7F9FC", border: "1px solid #E5EAF2" }}>
                          <div style={{ fontSize: 11, color: "#6B7280" }}>估计挂牌总价</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: "#163A70", marginTop: 6 }}>
                            {formatNullableNumber(simulationResult.regression.estimated_total_price, 2, " 万元")}
                          </div>
                          <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>仅供挂牌价参考</div>
                        </div>
                        <div className="rounded-2xl p-3" style={{ background: "#FFF7ED", border: "1px solid #FDBA74" }}>
                          <div style={{ fontSize: 11, color: "#9A3412" }}>所属分层</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: "#C2410C", marginTop: 6 }}>
                            {simulationResult.cluster.label}
                          </div>
                          <div style={{ fontSize: 11, color: "#9A3412", marginTop: 4 }}>
                            {simulationResult.cluster.algorithm}
                          </div>
                        </div>
                      </div>

                      <div
                        className="rounded-2xl px-4 py-3"
                        style={{ background: "#F8FAFC", border: "1px solid #E5EAF2", fontSize: 12, color: "#4B5563", lineHeight: 1.8 }}
                      >
                        {simulationResult.regression.price_note}
                        {simulationResult.regression.cluster_basis.used_observed_price
                          ? " 当前分层优先采用你输入的参考挂牌价。"
                          : " 当前分层未使用外部价格，直接采用模型估计值作为归类基准。"}
                      </div>

                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[.95fr_1.05fr]">
                        <div className="flex flex-col gap-3">
                          <div style={{ color: "#163A70", fontSize: 13, fontWeight: 700 }}>主要影响因素</div>
                          {(simulationResult.regression.top_factors || []).map(item => (
                            <div
                              key={`${item.feature}-${item.note}`}
                              className="rounded-2xl p-3"
                              style={{ background: "#F7F9FC", border: "1px solid #E5EAF2" }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#163A70" }}>{item.feature}</span>
                                <Badge variant="outline" style={{ fontSize: 10 }}>
                                  {(Number(item.importance || 0) * 100).toFixed(1)}%
                                </Badge>
                              </div>
                              <div style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.7, marginTop: 8 }}>{item.note}</div>
                            </div>
                          ))}
                          {simulationResult.regression.top_factors.length === 0 && (
                            <div style={{ fontSize: 12, color: "#9CA3AF" }}>暂无可展示的解释因素。</div>
                          )}
                        </div>

                        <div className="flex flex-col gap-4">
                          <div>
                            <div style={{ color: "#163A70", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>区县参考区间</div>
                            <div className="grid grid-cols-2 gap-3 rounded-2xl p-3" style={{ background: "#F8FAFC", border: "1px solid #E5EAF2" }}>
                              <div>
                                <div style={{ fontSize: 11, color: "#9CA3AF" }}>区县均值</div>
                                <div style={{ fontSize: 13, color: "#163A70", fontWeight: 700, marginTop: 4 }}>
                                  {formatNullableNumber(simulationResult.district_reference.avg_unit_price, 2, " 元/㎡")}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: 11, color: "#9CA3AF" }}>区县中位数</div>
                                <div style={{ fontSize: 13, color: "#163A70", fontWeight: 700, marginTop: 4 }}>
                                  {formatNullableNumber(simulationResult.district_reference.median_unit_price, 2, " 元/㎡")}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: 11, color: "#9CA3AF" }}>P25</div>
                                <div style={{ fontSize: 13, color: "#163A70", fontWeight: 700, marginTop: 4 }}>
                                  {formatNullableNumber(simulationResult.district_reference.p25_unit_price, 2, " 元/㎡")}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: 11, color: "#9CA3AF" }}>P75</div>
                                <div style={{ fontSize: 13, color: "#163A70", fontWeight: 700, marginTop: 4 }}>
                                  {formatNullableNumber(simulationResult.district_reference.p75_unit_price, 2, " 元/㎡")}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div>
                            <div style={{ color: "#163A70", fontSize: 13, fontWeight: 700, marginBottom: 10 }}>相近样本参考</div>
                            <div className="grid grid-cols-1 gap-2">
                              {simulationResult.comparables.map(sample => (
                                <div
                                  key={sample.id}
                                  className="rounded-2xl p-3"
                                  style={{ background: "#FFFFFF", border: "1px solid #E5EAF2" }}
                                >
                                  <div style={{ fontSize: 12, fontWeight: 700, color: "#1F2937" }}>{sample.title}</div>
                                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 6, lineHeight: 1.7 }}>
                                    {sample.district} · {sample.layout || "未知户型"} · {formatNullableNumber(sample.area, 1, " ㎡")} ·{" "}
                                    {Number(sample.unit_price || 0).toLocaleString()} 元/㎡
                                  </div>
                                </div>
                              ))}
                              {simulationResult.comparables.length === 0 && (
                                <div style={{ fontSize: 12, color: "#9CA3AF" }}>暂无相近样本。</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="预测值 vs 实际值" subtitle="测试样本散点，对角线越贴近说明挂牌单价回归越稳定">
                  <PredVsActualScatter data={predictionPoints} />
                </SectionCard>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="cluster">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_.95fr]">
              <SectionCard title="KMeans 价值分层" subtitle={clusterResult?.summary ?? "暂无真实价值分层结果"} className="h-full">
                <KMeansScatter data={clusterPoints} />
              </SectionCard>
              <div className="flex flex-col gap-4">
                <SectionCard title="在线分层结果" subtitle="用户试算样本会同步给出所属价值分层">
                  {!simulationResult ? (
                    <div
                      className="rounded-2xl px-4 py-5"
                      style={{ background: "#F8FAFC", border: "1px solid #E5EAF2", color: "#9CA3AF", fontSize: 13, lineHeight: 1.7 }}
                    >
                      先在“预测分析”页签输入样本并完成试算，这里就会展示该样本的价值层级归属和分层画像。
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div
                        className="rounded-2xl px-4 py-3"
                        style={{ background: "#FFF7ED", border: "1px solid #FDBA74" }}
                      >
                        <div style={{ fontSize: 11, color: "#9A3412" }}>分层标签</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "#C2410C", marginTop: 6 }}>
                          {simulationResult.cluster.label}
                        </div>
                        <div style={{ fontSize: 12, color: "#9A3412", marginTop: 8 }}>
                          {simulationResult.cluster.note || "已基于当前样本完成价值分层。"}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 rounded-2xl p-3" style={{ background: "#F8FAFC", border: "1px solid #E5EAF2" }}>
                        <div>
                          <div style={{ fontSize: 11, color: "#9CA3AF" }}>层级数</div>
                          <div style={{ fontSize: 13, color: "#163A70", fontWeight: 700, marginTop: 4 }}>
                            {simulationResult.cluster.cluster_count}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "#9CA3AF" }}>轮廓系数</div>
                          <div style={{ fontSize: 13, color: "#163A70", fontWeight: 700, marginTop: 4 }}>
                            {simulationResult.cluster.silhouette_score ?? "--"}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "#9CA3AF" }}>归类中心单价</div>
                          <div style={{ fontSize: 13, color: "#163A70", fontWeight: 700, marginTop: 4 }}>
                            {formatNullableNumber(simulationResult.cluster.assigned_center?.unit_price, 2, " 元/㎡")}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: "#9CA3AF" }}>归类中心面积</div>
                          <div style={{ fontSize: 13, color: "#163A70", fontWeight: 700, marginTop: 4 }}>
                            {formatNullableNumber(simulationResult.cluster.assigned_center?.area, 1, " ㎡")}
                          </div>
                        </div>
                      </div>
                      {simulationResult.cluster.profile && (
                        <div className="rounded-2xl p-3" style={{ background: "#FFFFFF", border: "1px solid #E5EAF2" }}>
                          <div style={{ color: "#163A70", fontSize: 13, fontWeight: 700 }}>当前分层画像</div>
                          <div style={{ color: "#4B5563", fontSize: 12, lineHeight: 1.8, marginTop: 8 }}>
                            样本量 {simulationResult.cluster.profile.count ?? "--"} 条，均价{" "}
                            {formatNullableNumber(simulationResult.cluster.profile.avg_unit_price, 2, " 元/㎡")}，均总价{" "}
                            {formatNullableNumber(simulationResult.cluster.profile.avg_total_price, 2, " 万元")}，均面积{" "}
                            {formatNullableNumber(simulationResult.cluster.profile.avg_area, 1, " ㎡")}。
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="房源分层画像" subtitle={`轮廓系数 ${clusterResult?.metrics?.silhouette_score ?? "--"}`}>
                  <div className="flex flex-col gap-3">
                    {clusterProfiles.length === 0 && (
                      <div style={{ color: "#9CA3AF", fontSize: 13 }}>暂无真实分层画像。</div>
                    )}
                    {clusterProfiles.map(profile => (
                      <div
                        key={`${profile.cluster}-${profile.label}`}
                        className="rounded-2xl p-3"
                        style={{ background: "#F7F9FC", border: "1px solid #E5EAF2" }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span style={{ color: "#163A70", fontSize: 13, fontWeight: 700 }}>{profile.label}</span>
                          <span style={{ color: "#6B7280", fontSize: 12 }}>{profile.count} 条</span>
                        </div>
                        <div style={{ color: "#4B5563", fontSize: 12, lineHeight: 1.7, marginTop: 6 }}>
                          均价 {Number(profile.avg_unit_price || 0).toLocaleString()} 元/㎡，面积{" "}
                          {Number(profile.avg_area || 0).toFixed(1)} ㎡，楼龄 {formatNullableNumber(profile.avg_house_age, 1, " 年")}
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="snapshot">
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_.95fr]">
                <SectionCard
                  title={`最近 ${snapshotInsights?.window_days ?? 90} 天调价趋势`}
                  subtitle={snapshotLoading ? "正在读取连续快照结果" : snapshotInsights?.note ?? "暂无真实快照分析结果"}
                >
                  <SnapshotChangeTrend data={snapshotSeries} />
                </SectionCard>

                <SectionCard title="快照行为摘要" subtitle="只基于同一房源的连续快照差分，不展示未来价格预测">
                  <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
                    {[
                      {
                        label: "持续跟踪房源",
                        value: Number(snapshotInsights?.kpis?.tracked_listing_count ?? 0).toLocaleString(),
                        tone: "#163A70",
                        bg: "#EFF6FF",
                        border: "#BFDBFE",
                      },
                      {
                        label: "发生调价房源",
                        value: Number(snapshotInsights?.kpis?.changed_listing_count ?? 0).toLocaleString(),
                        tone: "#0F766E",
                        bg: "#ECFEFF",
                        border: "#A5F3FC",
                      },
                      {
                        label: "上调事件",
                        value: Number(snapshotInsights?.kpis?.price_up_count ?? 0).toLocaleString(),
                        tone: "#166534",
                        bg: "#F0FDF4",
                        border: "#BBF7D0",
                      },
                      {
                        label: "下调事件",
                        value: Number(snapshotInsights?.kpis?.price_down_count ?? 0).toLocaleString(),
                        tone: "#C2410C",
                        bg: "#FFF7ED",
                        border: "#FDBA74",
                      },
                      {
                        label: "平均调价幅度",
                        value: formatNullableNumber(snapshotInsights?.kpis?.avg_change_rate, 2, "%"),
                        tone: "#7C3AED",
                        bg: "#F5F3FF",
                        border: "#DDD6FE",
                      },
                      {
                        label: "中位调价幅度",
                        value: formatNullableNumber(snapshotInsights?.kpis?.median_change_rate, 2, "%"),
                        tone: "#1D4ED8",
                        bg: "#EFF6FF",
                        border: "#BFDBFE",
                      },
                    ].map(item => (
                      <div
                        key={item.label}
                        className="rounded-2xl p-4"
                        style={{ background: item.bg, border: `1px solid ${item.border}` }}
                      >
                        <div style={{ fontSize: 11, color: "#6B7280" }}>{item.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: item.tone, marginTop: 8 }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  <div
                    className="mt-4 rounded-2xl px-4 py-3"
                    style={{ background: "#F8FAFC", border: "1px solid #E5EAF2", fontSize: 12, color: "#4B5563", lineHeight: 1.8 }}
                  >
                    <div>观察窗口：{snapshotInsights ? `${formatDate(snapshotInsights.observed_from)} 至 ${formatDate(snapshotInsights.observed_to)}` : "暂无"}</div>
                    <div className="mt-1">
                      说明：{snapshotInsights?.note ?? "当前真实多期样本有限，先展示调价行为统计，不展示未来预测结论。"}
                    </div>
                  </div>
                </SectionCard>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[.95fr_1.05fr]">
                <SectionCard title="区县调价活跃度" subtitle="按调价事件数、平均绝对调价幅度和平均调价间隔观察最活跃区县">
                  <div className="flex flex-col gap-3">
                    {snapshotTopDistricts.length === 0 && (
                      <div
                        className="rounded-2xl px-4 py-5"
                        style={{ background: "#F8FAFC", border: "1px solid #E5EAF2", color: "#9CA3AF", fontSize: 13, lineHeight: 1.7 }}
                      >
                        当前真实多期调价样本仍较少，暂未形成稳定的区县排行。
                      </div>
                    )}
                    {snapshotTopDistricts.map((item, index) => (
                      <div
                        key={`${item.district}-${index}`}
                        className="rounded-2xl p-3"
                        style={{ background: "#FFFFFF", border: "1px solid #E5EAF2" }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div style={{ color: "#163A70", fontSize: 13, fontWeight: 700 }}>{item.district || "待复核"}</div>
                          <Badge variant="outline" style={{ fontSize: 10 }}>
                            调价事件 {Number(item.event_count || 0).toLocaleString()}
                          </Badge>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2" style={{ fontSize: 12, color: "#4B5563" }}>
                          <div>涉及房源：{Number(item.changed_listing_count || 0).toLocaleString()} 套</div>
                          <div>平均绝对调价：{formatNullableNumber(item.avg_abs_change_rate, 2, "%")}</div>
                          <div>上调次数：{Number(item.price_up_count || 0).toLocaleString()}</div>
                          <div>平均调价间隔：{formatNullableNumber(item.avg_change_interval_days, 1, " 天")}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="最近真实调价样本" subtitle="展示同一房源连续快照发生变化的真实记录">
                  <div className="overflow-x-auto rounded-2xl border border-[#E5EAF2]">
                    <Table>
                      <TableHeader>
                        <TableRow style={{ background: "#F7F9FC" }}>
                          <TableHead style={{ fontSize: 12 }}>房源</TableHead>
                          <TableHead style={{ fontSize: 12 }}>区县</TableHead>
                          <TableHead style={{ fontSize: 12 }}>前值</TableHead>
                          <TableHead style={{ fontSize: 12 }}>现值</TableHead>
                          <TableHead style={{ fontSize: 12 }}>方向</TableHead>
                          <TableHead style={{ fontSize: 12 }}>变动率</TableHead>
                          <TableHead style={{ fontSize: 12 }}>间隔</TableHead>
                          <TableHead style={{ fontSize: 12 }}>时间</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {snapshotSamples.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={8} style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, padding: 24 }}>
                              暂无可展示的连续调价样本。
                            </TableCell>
                          </TableRow>
                        )}
                        {snapshotSamples.map(sample => {
                          const isUnitPrice = sample.metric === "unit_price";
                          const previousValue = isUnitPrice ? sample.previous_unit_price : sample.previous_total_price;
                          const currentValue = isUnitPrice ? sample.current_unit_price : sample.current_total_price;
                          const unitSuffix = isUnitPrice ? " 元/㎡" : " 万元";
                          const changeRate = Number(sample.change_rate ?? 0);
                          const directionTone = sample.direction === "up" ? "#166534" : sample.direction === "down" ? "#C2410C" : "#6B7280";
                          return (
                            <TableRow key={`${sample.listing_id}-${sample.snapshot_at}-${sample.metric}`} style={{ fontSize: 13 }}>
                              <TableCell style={{ fontWeight: 500, minWidth: 180 }}>
                                <div>{sample.title}</div>
                                <div style={{ color: "#9CA3AF", fontSize: 11, marginTop: 4 }}>
                                  {sample.community || "未标注小区"} · {isUnitPrice ? "挂牌单价" : "挂牌总价"}
                                </div>
                              </TableCell>
                              <TableCell>{sample.district || "待复核"}</TableCell>
                              <TableCell>{formatNullableNumber(previousValue, 2, unitSuffix)}</TableCell>
                              <TableCell>{formatNullableNumber(currentValue, 2, unitSuffix)}</TableCell>
                              <TableCell style={{ color: directionTone, fontWeight: 700 }}>
                                {sample.direction === "up" ? "上调" : sample.direction === "down" ? "下调" : "持平"}
                              </TableCell>
                              <TableCell style={{ color: directionTone, fontWeight: 700 }}>
                                {Number.isFinite(changeRate) ? `${changeRate > 0 ? "+" : ""}${changeRate.toFixed(2)}%` : "暂无"}
                              </TableCell>
                              <TableCell>{formatNullableNumber(sample.change_interval_days, 1, " 天")}</TableCell>
                              <TableCell>{formatDate(sample.snapshot_at)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </SectionCard>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="anomaly">
            <SectionCard title="挂牌价异常检测" subtitle={anomalyResult?.summary ?? "暂无真实异常检测结果"}>
              <div
                className="mb-3 flex items-center gap-2 rounded-2xl p-3"
                style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}
              >
                <AlertTriangle size={14} style={{ color: "#F59E0B" }} />
                <span style={{ fontSize: 12, color: "#92400E" }}>
                  共检测到 {Number(anomalyResult?.metrics?.anomaly_count ?? anomalyRows.length).toLocaleString()} 条需复核样本，当前展示{" "}
                  {anomalyRows.length} 条 · 算法：
                  {anomalyResult?.metrics?.algorithm ?? anomalyResult?.evidence?.algorithm ?? "规则阈值"}
                </span>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-[#E5EAF2]">
                <div className="max-h-[36rem] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow style={{ background: "#F7F9FC" }}>
                        <TableHead style={{ fontSize: 12 }}>房源</TableHead>
                        <TableHead style={{ fontSize: 12 }}>实际单价</TableHead>
                        <TableHead style={{ fontSize: 12 }}>基准单价</TableHead>
                        <TableHead style={{ fontSize: 12 }}>偏差率</TableHead>
                        <TableHead style={{ fontSize: 12 }}>原因</TableHead>
                        <TableHead style={{ fontSize: 12 }}>等级</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {anomalyRows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, padding: 24 }}>
                            暂无真实异常检测样本。
                          </TableCell>
                        </TableRow>
                      )}
                      {anomalyRows.map(a => (
                        <TableRow key={a.id} style={{ fontSize: 13 }}>
                          <TableCell style={{ fontWeight: 500 }}>{a.listing}</TableCell>
                          <TableCell>{Number(a.actualPrice || 0).toLocaleString()}</TableCell>
                          <TableCell>{Number(a.predictedPrice || 0).toLocaleString()}</TableCell>
                          <TableCell
                            style={{
                              color: a.deviation > 0 ? "#DC2626" : "#E67E22",
                              fontWeight: 600,
                            }}
                          >
                            {a.deviation > 0 ? "+" : ""}
                            {Number(a.deviation || 0).toFixed(1)}%
                          </TableCell>
                          <TableCell style={{ color: "#6B7280" }}>{a.reason}</TableCell>
                          <TableCell>
                            <StatusTag
                              status={a.severity === "high" ? "danger" : "warn"}
                              label={a.severity === "high" ? "高" : "中"}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </SectionCard>
          </TabsContent>

          <TabsContent value="eval">
            <SectionCard title="模型对比" subtitle="同一批质量过滤后的样本下，对比多个挂牌单价回归模型">
              <div className="overflow-x-auto rounded-2xl border border-[#E5EAF2]">
                <Table>
                  <TableHeader>
                    <TableRow style={{ background: "#F7F9FC" }}>
                      <TableHead style={{ fontSize: 12 }}>模型</TableHead>
                      <TableHead style={{ fontSize: 12 }}>MAE</TableHead>
                      <TableHead style={{ fontSize: 12 }}>RMSE</TableHead>
                      <TableHead style={{ fontSize: 12 }}>R²</TableHead>
                      <TableHead style={{ fontSize: 12 }}>MAPE</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modelComparisonRows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          style={{
                            textAlign: "center",
                            color: "#9CA3AF",
                            fontSize: 13,
                            padding: 24,
                          }}
                        >
                          暂无真实模型对比结果。
                        </TableCell>
                      </TableRow>
                    )}
                    {modelComparisonRows.map((m, index) => (
                      <TableRow key={`${m.model}-${index}`} style={{ background: m.isBest ? "#EFF6FF" : undefined }}>
                        <TableCell
                          style={{
                            fontWeight: m.isBest ? 700 : 400,
                            color: m.isBest ? "#163A70" : "#1F2937",
                          }}
                        >
                          {m.model}
                          {m.isBest && <Badge style={{ fontSize: 10, marginLeft: 4 }}>最佳</Badge>}
                        </TableCell>
                        <TableCell>{m.mae}</TableCell>
                        <TableCell>{m.rmse}</TableCell>
                        <TableCell
                          style={{
                            color: m.isBest ? "#16A34A" : "#1F2937",
                            fontWeight: m.isBest ? 600 : 400,
                          }}
                        >
                          {m.r2}
                        </TableCell>
                        <TableCell>{m.mape === "--" ? "--" : `${m.mape}%`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          </TabsContent>
        </Tabs>

        <SectionCard
          title="历史任务"
          subtitle="支持查看、重跑、重命名和删除，便于答辩时展示任务留痕"
          action={
            <Button variant="ghost" size="sm" onClick={() => void loadHistory()} style={{ fontSize: 12 }} disabled={historyLoading}>
              <RefreshCw size={12} className={historyLoading ? "animate-spin" : ""} />
              <span className="ml-1.5">刷新历史</span>
            </Button>
          }
        >
          {history.length === 0 ? (
            <div style={{ fontSize: 12, color: "#9CA3AF" }}>暂无历史任务，点击右上“重新训练”创建。</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {history.map(item => {
                const itemBusy = busyJobId === item.id;
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-2xl p-4"
                    style={{
                      background: job?.id === item.id ? "#EFF6FF" : "#F7F9FC",
                      border: "1px solid #E5EAF2",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div style={{ fontSize: 13, color: "#1F2937", fontWeight: 700 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>
                          #{item.id} · {item.job_type} · {formatDate(item.finished_at || item.created_at)}
                        </div>
                        <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
                          样本 {item.sample_count} 条 · 训练 {item.train_count} 条 · 测试 {item.test_count} 条
                        </div>
                      </div>
                      <StatusTag status={item.status} label={statusLabel(item.status)} />
                    </div>

                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void openHistoryJob(item.id)}
                        title="查看结果详情"
                        style={{ fontSize: 11, height: 28, padding: "0 8px" }}
                      >
                        <Eye size={12} />
                        查看
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={itemBusy || training}
                        onClick={() => void handleReplayJob(item)}
                        title="重跑历史任务"
                        style={{ fontSize: 11, height: 28, padding: "0 8px" }}
                      >
                        <RotateCcw size={12} className={itemBusy ? "animate-spin" : ""} />
                        重跑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={itemBusy || training}
                        onClick={() => {
                          setRenameTarget(item);
                          setRenameValue(item.name);
                        }}
                        title="重命名历史任务"
                        style={{ fontSize: 11, height: 28, padding: "0 8px" }}
                      >
                        <PencilLine size={12} />
                        重命名
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={itemBusy || training}
                        onClick={() => void handleDeleteJob(item)}
                        title="删除历史任务"
                        style={{ fontSize: 11, height: 28, padding: "0 8px", color: "#DC2626" }}
                      >
                        <Trash2 size={12} />
                        删除
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      <Dialog open={Boolean(viewingJob)} onOpenChange={open => !open && setViewingJob(null)}>
        <DialogContent style={{ maxWidth: 920 }}>
          <DialogHeader>
            <DialogTitle>
              {viewingJob
                ? `任务 #${viewingJob.id} · ${viewingJob.name} · ${statusLabel(viewingJob.status)}`
                : "历史任务详情"}
            </DialogTitle>
          </DialogHeader>
          {viewingJob && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  ["样本量", `${viewingJob.sample_count} 条`],
                  ["训练集", `${viewingJob.train_count} 条`],
                  ["测试集", `${viewingJob.test_count} 条`],
                  ["完成时间", viewingJob.finished_at || viewingJob.created_at || "--"],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-lg px-3 py-2"
                    style={{ background: "#F8FAFC", border: "1px solid #E5EAF2" }}
                  >
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>{label}</div>
                    <div style={{ fontSize: 13, color: "#1F2937", fontWeight: 600, marginTop: 4 }}>{value}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {(viewingJob.results || []).map(item => (
                  <div
                    key={`${item.id}-${item.result_type}`}
                    className="rounded-xl p-4"
                    style={{ background: "#FFFFFF", border: "1px solid #E5EAF2" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#163A70" }}>{item.result_type}</div>
                      <Badge variant="outline" style={{ fontSize: 10 }}>
                        {item.model_name || "内置规则"}
                      </Badge>
                    </div>
                    <div style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.7, marginTop: 8 }}>
                      {item.summary || "暂无摘要"}
                    </div>
                    <div
                      className="mt-3 rounded-lg px-3 py-2"
                      style={{ background: "#F8FAFC", border: "1px solid #E5EAF2", fontSize: 12, color: "#6B7280" }}
                    >
                      {summarizeMetrics(item.metrics)}
                    </div>
                  </div>
                ))}
                {(viewingJob.results || []).length === 0 && (
                  <div style={{ fontSize: 12, color: "#9CA3AF" }}>该任务当前没有可展示的模型结果。</div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={open => {
          if (!open && !renameSaving) {
            setRenameTarget(null);
            setRenameValue("");
          }
        }}
      >
        <DialogContent style={{ maxWidth: 480 }}>
          <DialogHeader>
            <DialogTitle>
              {renameTarget ? `重命名任务 #${renameTarget.id}` : "重命名历史任务"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>任务名称</Label>
              <Input
                value={renameValue}
                onChange={event => setRenameValue(event.target.value)}
                placeholder="如：答辩展示回归"
                maxLength={128}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (!renameSaving) {
                    setRenameTarget(null);
                    setRenameValue("");
                  }
                }}
                disabled={renameSaving}
              >
                取消
              </Button>
              <Button onClick={() => void submitRename()} disabled={renameSaving || !renameValue.trim()}>
                {renameSaving ? "保存中..." : "保存名称"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { SectionCard } from "../common/SectionCard";
import { StatusTag } from "../common/StatusTag";
import { FeatureImportance } from "../charts/FeatureImportance";
import { PredVsActualScatter } from "../charts/PredVsActualScatter";
import { KMeansScatter } from "../charts/KMeansScatter";
import { DistrictBoxPlot } from "../charts/DistrictBoxPlot";
import { toast } from "sonner";
import { RefreshCw, Brain, AlertTriangle, Download, Eye } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { analysisJobPdfUrl, api, type AnalysisJob, type AnalysisResult } from "../../services/api";

function asArray<T = any>(value: unknown): T[] | undefined {
  return Array.isArray(value) ? value as T[] : undefined;
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
    metrics.cluster_count !== undefined ? `分层 ${metrics.cluster_count} 类` : null,
    metrics.anomaly_count !== undefined ? `异常 ${metrics.anomaly_count} 条` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "暂无指标";
}

export function AnalysisPage() {
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [history, setHistory] = useState<AnalysisJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [viewingJob, setViewingJob] = useState<AnalysisJob | null>(null);

  const loadLatest = async () => {
    setLoading(true);
    try {
      const latest = await api.getLatestAnalysisResultsByType();
      setJob(latest.job);
      setResults(latest.results ?? []);
      setApiError(null);
    } catch (latestError) {
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
    }
  };

  useEffect(() => {
    void loadLatest();
    void loadHistory();
  }, []);

  const regressionResult = useMemo(() => getResult(results, "regression"), [results]);
  const edaResult = useMemo(() => getResult(results, "eda"), [results]);
  const clusterResult = useMemo(() => getResult(results, "cluster"), [results]);
  const anomalyResult = useMemo(() => getResult(results, "anomaly"), [results]);

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
    [regressionResult]
  );

  const featureImportance = useMemo(
    () => asArray<{ feature: string; importance: number }>(regressionResult?.artifacts?.feature_importance),
    [regressionResult]
  );

  const predictionPoints = useMemo(() => {
    const rows = asArray<any>(regressionResult?.artifacts?.predictions);
    return rows
      ?.map(item => ({ actual: Number(item.actual), predicted: Number(item.predicted) }))
      .filter(item => Number.isFinite(item.actual) && Number.isFinite(item.predicted));
  }, [regressionResult]);

  const clusterPoints = useMemo(() => {
    const rows = asArray<any>(clusterResult?.artifacts?.points);
    return rows
      ?.map(item => ({
        x: Number(item.unit_price),
        y: Number(item.area),
        cluster: Number(item.cluster),
        label: String(item.label ?? ""),
      }))
      .filter(item => Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.cluster));
  }, [clusterResult]);

  const clusterProfiles = useMemo(
    () => asArray<any>(clusterResult?.artifacts?.clusters) ?? [],
    [clusterResult]
  );

  const districtBoxData = useMemo(
    () =>
      asArray<any>(edaResult?.artifacts?.district_boxplot)?.filter(
        item => item.min !== null && item.max !== null
      ),
    [edaResult]
  );

  const anomalyRows = useMemo(() => {
    const rows = asArray<any>(anomalyResult?.artifacts?.items);
    if (rows) {
      return rows.map(item => ({
        id: item.id,
        listing: item.title,
        actualPrice: Number(item.actual_unit_price),
        predictedPrice: Number(item.expected_unit_price),
        deviation: Number(item.deviation_rate),
        reason: item.reason,
        severity: item.severity,
      }));
    }
    return [];
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
    if (comparison?.length) {
      return comparison.map(item => ({
        model: item.model_name,
        mae: item.mae ?? "--",
        rmse: item.rmse ?? "--",
        r2: item.r2 ?? "--",
        mape: item.mape ?? "--",
        isBest: Boolean(item.is_best),
        status: item.status ?? "ok",
      }));
    }
    return [];
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
        text: "只评估挂牌单价回归效果，用 MAE、RMSE、R² 解释模型误差，不解释成交价。",
      },
      {
        key: "cluster",
        title: "聚类分析",
        text: "按挂牌价、总价、面积等特征做房源分层，用于识别经济型、中端和改善型样本画像。",
      },
      {
        key: "anomaly",
        title: "异常检测",
        text: "标记需要复核的房源记录，帮助判断是源站异常、采集问题还是清洗规则问题。",
      },
    ],
    [],
  );

  const runTraining = async (type: "train" | "tune") => {
    if (training) return;
    setTraining(true);
    try {
      const nextJob = await api.createAnalysisJob(
        type === "tune"
          ? { job_type: "tune", max_samples: 3000 }
          : { job_type: "all" }
      );
      setJob(nextJob);
      setResults(nextJob.results ?? []);
      setApiError(null);
      toast.success(
        type === "tune"
          ? "参数搜索任务完成，结果已更新"
          : "重新训练完成，结果已更新"
      );
      await loadHistory();
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
        ? `${regressionResult.model_name}`
        : "暂无结果";
  const hasAnalysisData = results.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 style={{ color: "#163A70", fontSize: 18, fontWeight: 700 }}>分析建模</h2>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {metricsList.map(m => (
          <div
            key={m.label}
            className="rounded-xl p-4 flex flex-col gap-1"
            style={{ background: "#fff", border: "1px solid #E5EAF2" }}
          >
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>{m.desc}</span>
              <span
                className="px-2 py-0.5 rounded"
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

      <SectionCard title="分析模块说明" subtitle="展示真实建模结果与可解释证据">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {moduleGuides.map(item => (
            <div
              key={item.key}
              className="rounded-xl p-4"
              style={{ background: "#F7F9FC", border: "1px solid #E5EAF2" }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "#163A70" }}>{item.title}</div>
              <div style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.7, marginTop: 8 }}>
                {item.text}
              </div>
            </div>
          ))}
        </div>
        <div
          className="mt-4 rounded-lg px-4 py-3"
          style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1E3A8A", fontSize: 12, lineHeight: 1.8 }}
        >
          仅展示通过质量过滤的挂牌价数据。
        </div>
      </SectionCard>

      {hasAnalysisData ? (
      <>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="flex-1 min-w-0">
          <Tabs defaultValue="eda">
            <TabsList className="mb-4 max-w-full justify-start overflow-x-auto">
              <TabsTrigger value="eda" style={{ fontSize: 13 }}>
                EDA 探索
              </TabsTrigger>
              <TabsTrigger value="predict" style={{ fontSize: 13 }}>
                预测分析
              </TabsTrigger>
              <TabsTrigger value="cluster" style={{ fontSize: 13 }}>
                聚类分析
              </TabsTrigger>
              <TabsTrigger value="anomaly" style={{ fontSize: 13 }}>
                异常检测
              </TabsTrigger>
              <TabsTrigger value="eval" style={{ fontSize: 13 }}>
                模型对比
              </TabsTrigger>
            </TabsList>

            <TabsContent value="eda">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <SectionCard
                  title="EDA 探索性分析"
                  subtitle={edaResult?.summary ?? "先确认样本覆盖、口径和区县离散程度"}
                >
                  <div className="flex flex-col gap-3" style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.8 }}>
                    <div>1. 看本轮样本是否覆盖足够区县与数据源，避免首页统计和建模口径脱节。</div>
                    <div>2. 看不同区县挂牌单价的离散程度，识别极高价、极低价和长尾分布。</div>
                    <div>3. 看异常值是否集中在特定区县、面积段或来源，为清洗和复爬提供依据。</div>
                    <div>4. EDA 不输出预测结论，主要用于判断样本覆盖、分布特征和建模可信度。</div>
                    <div
                      className="grid grid-cols-2 gap-3 rounded-lg p-3"
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
                <SectionCard
                  title="区县挂牌单价箱线图"
                  subtitle={edaResult?.summary ?? "暂无真实 EDA 结果"}
                >
                  <DistrictBoxPlot source={districtBoxData} />
                </SectionCard>
              </div>
            </TabsContent>

            <TabsContent value="predict">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <SectionCard
                  title="影响挂牌单价的主要特征"
                  subtitle="只解释挂牌单价影响因素，不代表成交价预测"
                >
                  <FeatureImportance data={featureImportance} />
                </SectionCard>
                <SectionCard
                  title="预测值 vs 实际值"
                  subtitle="测试样本散点，对角线越贴近说明挂牌单价回归越稳定"
                >
                  <PredVsActualScatter data={predictionPoints} />
                </SectionCard>
              </div>
            </TabsContent>

            <TabsContent value="cluster">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                <div className="xl:col-span-2">
                  <SectionCard
                    title="KMeans 价值分层"
                    subtitle={clusterResult?.summary ?? "暂无真实聚类结果"}
                  >
                    <KMeansScatter data={clusterPoints} />
                  </SectionCard>
                </div>
                <SectionCard
                  title="聚类画像"
                  subtitle={`轮廓系数 ${clusterResult?.metrics?.silhouette_score ?? "--"}`}
                >
                  <div className="flex flex-col gap-3">
                    {clusterProfiles.length === 0 && (
                      <div style={{ color: "#9CA3AF", fontSize: 13 }}>暂无真实聚类画像。</div>
                    )}
                    {clusterProfiles.map(profile => (
                      <div
                        key={`${profile.cluster}-${profile.label}`}
                        className="rounded-lg p-3"
                        style={{ background: "#F7F9FC", border: "1px solid #E5EAF2" }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span style={{ color: "#163A70", fontSize: 13, fontWeight: 700 }}>
                            {profile.label}
                          </span>
                          <span style={{ color: "#6B7280", fontSize: 12 }}>
                            {profile.count} 条
                          </span>
                        </div>
                        <div style={{ color: "#4B5563", fontSize: 12, lineHeight: 1.7, marginTop: 6 }}>
                          均价 {Number(profile.avg_unit_price || 0).toLocaleString()} 元/㎡，
                          面积 {Number(profile.avg_area || 0).toFixed(1)} ㎡，
                          楼龄 {formatNullableNumber(profile.avg_house_age, 1, " 年")}
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            </TabsContent>

            <TabsContent value="anomaly">
              <SectionCard
                title="挂牌价异常检测"
                subtitle={anomalyResult?.summary ?? "暂无真实异常检测结果"}
              >
                <div
                  className="flex items-center gap-2 mb-3 p-3 rounded-lg"
                  style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}
                >
                  <AlertTriangle size={14} style={{ color: "#F59E0B" }} />
                  <span style={{ fontSize: 12, color: "#92400E" }}>
                    共检测到 {Number(anomalyResult?.metrics?.anomaly_count ?? anomalyRows.length).toLocaleString()} 条需复核样本，当前展示 {anomalyRows.length} 条 · 算法：
                    {anomalyResult?.metrics?.algorithm ?? anomalyResult?.evidence?.algorithm ?? "规则阈值"}
                  </span>
                </div>
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
                        <TableCell
                          colSpan={6}
                          style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, padding: 24 }}
                        >
                          暂无真实异常检测样本。
                        </TableCell>
                      </TableRow>
                    )}
                    {anomalyRows.map(a => (
                      <TableRow key={a.id} style={{ fontSize: 13 }}>
                        <TableCell style={{ fontWeight: 500 }}>{a.listing}</TableCell>
                        <TableCell>{Number(a.actualPrice || 0).toLocaleString()}</TableCell>
                        <TableCell>
                          {Number(a.predictedPrice || 0).toLocaleString()}
                        </TableCell>
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
              </SectionCard>
            </TabsContent>

            <TabsContent value="eval">
              <SectionCard
                title="模型对比"
                subtitle="同一批质量过滤后的样本下，对比多个挂牌单价回归模型"
              >
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
                    {modelComparisonRows.map((m, i) => (
                      <TableRow
                        key={`${m.model}-${i}`}
                        style={{ background: m.isBest ? "#EFF6FF" : undefined }}
                      >
                        <TableCell
                          style={{
                            fontWeight: m.isBest ? 700 : 400,
                            color: m.isBest ? "#163A70" : "#1F2937",
                          }}
                        >
                          {m.model}
                          {m.isBest && (
                            <Badge style={{ fontSize: 10, marginLeft: 4 }}>最佳</Badge>
                          )}
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
              </SectionCard>
            </TabsContent>
          </Tabs>
        </div>

        <div className="w-full flex-shrink-0 xl:w-[22rem]">
          <SectionCard title="当前任务口径">
            <div className="flex flex-col gap-3">
              {[
                ["主模型", regressionResult?.model_name ?? "--"],
                ["任务ID", job ? `#${job.id}` : "--"],
                ["建模样本", `${job?.sample_count ?? "--"} 条`],
                ["区县覆盖", `${regressionResult?.metrics?.sampling_district_count ?? "--"} 个`],
                ["真实来源", `${regressionResult?.metrics?.sampling_source_count ?? "--"} 个`],
                [
                  "调参状态",
                  regressionResult?.metrics?.tuning_status === "searched"
                    ? "参数搜索完成"
                    : regressionResult?.metrics?.tuning_status === "baseline"
                      ? "默认参数"
                      : "--",
                ],
                ["训练集", `${job?.train_count ?? "--"} 条`],
                ["测试集", `${job?.test_count ?? "--"} 条`],
                [
                  "异常率",
                  anomalyResult?.metrics?.anomaly_rate !== undefined
                    ? `${(Number(anomalyResult.metrics.anomaly_rate) * 100).toFixed(2)}%`
                    : "--",
                ],
                ["上次训练", job?.finished_at ?? "--"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex justify-between items-center gap-2 py-1"
                  style={{ borderBottom: "1px solid #E5EAF2" }}
                >
                  <span style={{ fontSize: 12, color: "#9CA3AF" }}>{k}</span>
                  <span
                    style={{ fontSize: 12, color: "#1F2937", fontWeight: 500, textAlign: "right" }}
                  >
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard
        title="历史任务"
        subtitle="按创建时间倒序，点击查看完整结果"
        action={
          <Button variant="ghost" size="sm" onClick={() => loadHistory()} style={{ fontSize: 12 }}>
            <RefreshCw size={12} />
            <span className="ml-1.5">刷新历史</span>
          </Button>
        }
      >
        {history.length === 0 ? (
          <div style={{ fontSize: 12, color: "#9CA3AF" }}>暂无历史任务，点击右上“重新训练”创建。</div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {history.map(item => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg px-3 py-2"
                style={{
                  background: job?.id === item.id ? "#EFF6FF" : "#F7F9FC",
                  border: "1px solid #E5EAF2",
                }}
              >
                <div className="min-w-0">
                  <div style={{ fontSize: 12, color: "#1F2937", fontWeight: 600 }}>
                    #{item.id} · {item.job_type}
                  </div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
                    {formatDate(item.finished_at || item.created_at)}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <StatusTag status={item.status} label={statusLabel(item.status)} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openHistoryJob(item.id)}
                    title="查看结果详情"
                    style={{ fontSize: 11, height: 28, padding: "0 8px" }}
                  >
                    <Eye size={12} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
      </>
      ) : (
        <SectionCard title="尚无分析结果" subtitle="创建一次分析任务后展示 EDA、回归、聚类和异常检测结果">
          <div className="flex flex-col items-start justify-between gap-4 py-2 sm:flex-row sm:items-center">
            <div>
              <div style={{ fontSize: 13, color: "#1F2937", fontWeight: 600 }}>
                当前没有可展示的模型结果
              </div>
              <div style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.7, marginTop: 6 }}>
                运行后将自动生成指标、图表和历史任务记录，不再预留空白图表区域。
              </div>
            </div>
            <Button
              onClick={() => runTraining("train")}
              disabled={training || loading}
              style={{ background: "#163A70", color: "#fff", flexShrink: 0 }}
            >
              <Brain size={14} className={training ? "animate-spin" : ""} />
              <span className="ml-1.5">开始分析</span>
            </Button>
          </div>
        </SectionCard>
      )}

      <Dialog open={Boolean(viewingJob)} onOpenChange={open => !open && setViewingJob(null)}>
        <DialogContent style={{ maxWidth: 920 }}>
          <DialogHeader>
            <DialogTitle>
              {viewingJob
                ? `任务 #${viewingJob.id} · ${viewingJob.job_type} · ${statusLabel(viewingJob.status)}`
                : "历史任务详情"}
            </DialogTitle>
          </DialogHeader>
          {viewingJob && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                    <div style={{ fontSize: 13, color: "#1F2937", fontWeight: 600, marginTop: 4 }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {(viewingJob.results || []).map(item => (
                  <div
                    key={`${item.id}-${item.result_type}`}
                    className="rounded-xl p-4"
                    style={{ background: "#FFFFFF", border: "1px solid #E5EAF2" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#163A70" }}>
                        {item.result_type}
                      </div>
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
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

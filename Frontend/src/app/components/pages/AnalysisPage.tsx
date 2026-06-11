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
import { RefreshCw, Brain, AlertTriangle, Download, FileText } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { api, type AnalysisJob, type AnalysisResult } from "../../services/api";

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

function downloadText(filename: string, content: string, mimeType = "application/json") {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function AnalysisPage() {
  const [job, setJob] = useState<AnalysisJob | null>(null);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const loadLatest = async () => {
    setLoading(true);
    try {
      const latest = await api.getLatestAnalysisJob();
      setJob(latest.job);
      setResults(latest.results ?? []);
      setApiError(null);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "分析接口暂不可用");
      setJob(null);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLatest();
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
        value: regressionResult?.metrics?.mape !== undefined
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
    return rows?.map(item => ({ actual: Number(item.actual), predicted: Number(item.predicted) }))
      .filter(item => Number.isFinite(item.actual) && Number.isFinite(item.predicted));
  }, [regressionResult]);

  const clusterPoints = useMemo(() => {
    const rows = asArray<any>(clusterResult?.artifacts?.points);
    return rows?.map(item => ({
      x: Number(item.unit_price),
      y: Number(item.area),
      cluster: Number(item.cluster),
      label: String(item.label ?? ""),
    })).filter(item => Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.cluster));
  }, [clusterResult]);

  const districtBoxData = useMemo(
    () => asArray<any>(edaResult?.artifacts?.district_boxplot)?.filter(item => item.min !== null && item.max !== null),
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

  const reportReference = useMemo(() => {
    const metrics = regressionResult?.metrics ?? {};
    const topFeatures = (featureImportance ?? []).slice(0, 5).map(item => `${item.feature}(${item.importance})`).join("、");
    const comparison = modelComparisonRows
      .map(item => `- ${item.model}: R²=${item.r2}, MAE=${item.mae}, RMSE=${item.rmse}${item.isBest ? "（最佳）" : ""}`)
      .join("\n");
    return [
      "### 模型分析引用",
      `- 任务编号：${job ? `#${job.id}` : "暂无真实任务"}`,
      `- 最佳模型：${regressionResult?.model_name ?? "暂无"}`,
      `- 样本量：${metrics.sample_count ?? "--"}，训练样本：${metrics.training_sample_count ?? metrics.train_count ?? "--"}，剔除样本：${metrics.excluded_count ?? 0}`,
      `- 指标：MAE=${metrics.mae ?? "--"}，RMSE=${metrics.rmse ?? "--"}，R²=${metrics.r2 ?? "--"}，MAPE=${metrics.mape ?? "--"}%`,
      `- 主要特征：${topFeatures || "暂无"}`,
      "",
      "#### 候选模型对比",
      comparison || "- 暂无候选模型结果",
      "",
      "说明：模型用于解释挂牌价影响因素和辅助估价，不代表成交价预测。",
    ].join("\n");
  }, [featureImportance, job, modelComparisonRows, regressionResult]);

  const jobLogs = useMemo(() => {
    if (!job) {
      return [
        {
          id: "empty",
          name: apiError ? "分析接口异常" : "暂无后端分析任务",
          status: apiError ? "warn" : "pending",
          time: apiError ?? "点击训练后生成真实任务",
        },
      ];
    }
    return [
      {
        id: String(job.id),
        name: `${job.job_type} 分析任务`,
        status: job.status,
        time: job.finished_at ?? job.updated_at ?? job.created_at ?? "",
      },
    ];
  }, [job, apiError]);

  const runTraining = async (type: "train" | "tune") => {
    if (training) return;
    setTraining(true);
    try {
      const nextJob = await api.createAnalysisJob({ job_type: "all" });
      setJob(nextJob);
      setResults(nextJob.results ?? []);
      setApiError(null);
      toast.success(type === "train" ? "分析任务完成，模型指标已更新" : "调参分析完成，已生成新版本指标");
    } catch (error) {
      const message = error instanceof Error ? error.message : "分析任务创建失败";
      setApiError(message);
      toast.error(message);
    } finally {
      setTraining(false);
    }
  };

  const handleDownloadResults = () => {
    if (!job || results.length === 0) {
      toast.warning("暂无真实模型结果可下载");
      return;
    }
    downloadText(
      `analysis-job-${job.id}-model-results.json`,
      JSON.stringify({ job, results }, null, 2)
    );
    toast.success("模型结果 JSON 已下载");
  };

  const handleCopyReportReference = async () => {
    try {
      await navigator.clipboard.writeText(reportReference);
      toast.success("报告引用已复制");
    } catch {
      downloadText(
        `analysis-job-${job?.id ?? "latest"}-report-reference.md`,
        reportReference,
        "text/markdown"
      );
      toast.success("剪贴板不可用，已下载 Markdown 引用");
    }
  };

  const status = training || loading ? "running" : apiError ? "warn" : job?.status ?? "info";
  const statusLabel = training ? "任务运行中" : apiError ? "接口异常" : regressionResult?.model_name ?? "暂无真实结果";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ color: "#163A70", fontSize: 18, fontWeight: 700 }}>分析建模</h2>
          <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 2 }}>EDA 探索 · 辅助估价 · KMeans 分层 · 异常检测</p>
        </div>
        <div className="flex gap-2">
          <StatusTag status={status} label={statusLabel} />
          <Button
            size="sm"
            variant="outline"
            disabled={!job || results.length === 0}
            onClick={handleDownloadResults}
            className="flex items-center gap-1.5"
            style={{ fontSize: 13, height: 36 }}
          >
            <Download size={13} />下载结果
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!regressionResult}
            onClick={handleCopyReportReference}
            className="flex items-center gap-1.5"
            style={{ fontSize: 13, height: 36 }}
          >
            <FileText size={13} />报告引用
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={training || loading}
            onClick={() => runTraining("train")}
            className="flex items-center gap-1.5"
            style={{ fontSize: 13, height: 36 }}
          >
            <RefreshCw size={13} className={training || loading ? "animate-spin" : ""} />{training ? "训练中..." : "重新训练"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {metricsList.map(m => (
          <div key={m.label} className="rounded-xl p-4 flex flex-col gap-1" style={{ background: "#fff", border: "1px solid #E5EAF2" }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>{m.desc}</span>
              <span className="px-2 py-0.5 rounded" style={{ background: "#EFF6FF", color: "#163A70", fontSize: 11, fontWeight: 700 }}>{m.label}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, color: "#163A70" }}>
              {m.value}<span style={{ fontSize: 13, fontWeight: 400, color: "#9CA3AF", marginLeft: 4 }}>{m.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-5">
        <div className="flex-1 min-w-0">
          <Tabs defaultValue="eda">
            <TabsList className="mb-4">
              <TabsTrigger value="eda" style={{ fontSize: 13 }}>EDA 探索</TabsTrigger>
              <TabsTrigger value="predict" style={{ fontSize: 13 }}>预测分析</TabsTrigger>
              <TabsTrigger value="cluster" style={{ fontSize: 13 }}>聚类分析</TabsTrigger>
              <TabsTrigger value="anomaly" style={{ fontSize: 13 }}>异常检测</TabsTrigger>
              <TabsTrigger value="eval" style={{ fontSize: 13 }}>模型对比</TabsTrigger>
            </TabsList>

            <TabsContent value="eda">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <SectionCard title="特征重要性 Top 10" subtitle={regressionResult?.summary ?? "暂无真实回归结果"}>
                  <FeatureImportance data={featureImportance} />
                </SectionCard>
                <SectionCard title="区县价格箱线图" subtitle={edaResult?.summary ?? "暂无真实 EDA 结果"}>
                  <DistrictBoxPlot source={districtBoxData} />
                </SectionCard>
              </div>
            </TabsContent>

            <TabsContent value="predict">
              <SectionCard title="预测值 vs 实际值" subtitle="测试样本散点，对角线为完美预测">
                <PredVsActualScatter data={predictionPoints} />
              </SectionCard>
            </TabsContent>

            <TabsContent value="cluster">
              <SectionCard title="KMeans 价值分层" subtitle={clusterResult?.summary ?? "暂无真实聚类结果"}>
                <KMeansScatter data={clusterPoints} />
              </SectionCard>
            </TabsContent>

            <TabsContent value="anomaly">
              <SectionCard title="挂牌价异常检测" subtitle={anomalyResult?.summary ?? "暂无真实异常检测结果"}>
                <div className="flex items-center gap-2 mb-3 p-3 rounded-lg" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                  <AlertTriangle size={14} style={{ color: "#F59E0B" }} />
                  <span style={{ fontSize: 12, color: "#92400E" }}>检测到 {anomalyRows.length} 条需复核样本</span>
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
                        <TableCell style={{ color: a.deviation > 0 ? "#DC2626" : "#E67E22", fontWeight: 600 }}>
                          {a.deviation > 0 ? "+" : ""}{Number(a.deviation || 0).toFixed(1)}%
                        </TableCell>
                        <TableCell style={{ color: "#6B7280" }}>{a.reason}</TableCell>
                        <TableCell>
                          <StatusTag status={a.severity === "high" ? "danger" : "warn"} label={a.severity === "high" ? "高" : "中"} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </SectionCard>
            </TabsContent>

            <TabsContent value="eval">
              <SectionCard title="模型对比" subtitle="同一训练/测试切分下自动选择 R² 最优模型">
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
                        <TableCell colSpan={5} style={{ textAlign: "center", color: "#9CA3AF", fontSize: 13, padding: 24 }}>
                          暂无真实模型对比结果。
                        </TableCell>
                      </TableRow>
                    )}
                    {modelComparisonRows.map((m, i) => (
                      <TableRow key={`${m.model}-${i}`} style={{ background: m.isBest ? "#EFF6FF" : undefined }}>
                        <TableCell style={{ fontWeight: m.isBest ? 700 : 400, color: m.isBest ? "#163A70" : "#1F2937" }}>
                          {m.model} {m.isBest && <Badge style={{ fontSize: 10, marginLeft: 4 }}>最佳</Badge>}
                        </TableCell>
                        <TableCell>{m.mae}</TableCell>
                        <TableCell>{m.rmse}</TableCell>
                        <TableCell style={{ color: m.isBest ? "#16A34A" : "#1F2937", fontWeight: m.isBest ? 600 : 400 }}>{m.r2}</TableCell>
                        <TableCell>{m.mape === "--" ? "--" : `${m.mape}%`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </SectionCard>
            </TabsContent>
          </Tabs>
        </div>

        <div className="w-56 flex-shrink-0 flex flex-col gap-4">
          <SectionCard title="模型信息">
            <div className="flex flex-col gap-3">
              {[
                ["算法", regressionResult?.model_name ?? "--"],
                ["任务ID", job ? `#${job.id}` : "--"],
                ["有效样本", `${job?.sample_count ?? "--"}`],
                ["训练集", `${job?.train_count ?? "--"}`],
                ["测试集", `${job?.test_count ?? "--"}`],
                ["上次训练", job?.finished_at ?? "--"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center gap-2 py-1" style={{ borderBottom: "1px solid #E5EAF2" }}>
                  <span style={{ fontSize: 12, color: "#9CA3AF" }}>{k}</span>
                  <span style={{ fontSize: 12, color: "#1F2937", fontWeight: 500, textAlign: "right" }}>{v}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <Button
            className="w-full"
            style={{ background: "#163A70", color: "#fff", fontSize: 13 }}
            disabled={training || loading}
            onClick={() => runTraining("tune")}
          >
            <Brain size={14} className="mr-1.5" />{training ? "任务运行中" : "调参优化"}
          </Button>

          <SectionCard title="训练任务">
            <div className="flex flex-col gap-2">
              {jobLogs.slice(0, 4).map(item => (
                <div key={item.id} className="rounded-lg px-3 py-2" style={{ background: "#F7F9FC", border: "1px solid #E5EAF2" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span style={{ fontSize: 12, color: "#1F2937", fontWeight: 600 }}>{item.name}</span>
                    <StatusTag status={item.status} label={item.status === "success" ? "完成" : undefined} />
                  </div>
                  <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>{item.time}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

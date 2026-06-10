import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { SectionCard } from "../common/SectionCard";
import { KpiCard } from "../common/KpiCard";
import { StatusTag } from "../common/StatusTag";
import { FeatureImportance } from "../charts/FeatureImportance";
import { PredVsActualScatter } from "../charts/PredVsActualScatter";
import { KMeansScatter } from "../charts/KMeansScatter";
import { DistrictBoxPlot } from "../charts/DistrictBoxPlot";
import { MODEL_METRICS, ANOMALIES, COMPARE_MODELS } from "../../mock/model";
import { toast } from "sonner";
import { RefreshCw, Brain, AlertTriangle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

const METRICS_LIST = [
  { label: "MAE", value: MODEL_METRICS.mae.toFixed(2), unit: "元/㎡", desc: "平均绝对误差" },
  { label: "RMSE", value: MODEL_METRICS.rmse.toFixed(2), unit: "元/㎡", desc: "均方根误差" },
  { label: "R²", value: MODEL_METRICS.r2.toFixed(4), unit: "", desc: "决定系数" },
  { label: "MAPE", value: `${MODEL_METRICS.mape}%`, unit: "", desc: "平均绝对百分误差" },
];

export function AnalysisPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ color: "#163A70", fontSize: 18, fontWeight: 700 }}>分析建模</h2>
          <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 2 }}>模型训练 · 特征分析 · 预测评估 · 异常检测</p>
        </div>
        <div className="flex gap-2">
          <StatusTag status="success" label={`${MODEL_METRICS.modelType} v${MODEL_METRICS.version}`} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => toast.info("演示模式 — 重新训练不可用")}
            className="flex items-center gap-1.5"
            style={{ fontSize: 13, height: 36 }}
          >
            <RefreshCw size={13} />重新训练
          </Button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {METRICS_LIST.map(m => (
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
        {/* Left: tabs */}
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
                <SectionCard title="特征重要性 Top 10" subtitle="XGBoost 特征权重">
                  <FeatureImportance />
                </SectionCard>
                <SectionCard title="区县价格箱线图" subtitle="各区分位数分布">
                  <DistrictBoxPlot />
                </SectionCard>
              </div>
            </TabsContent>

            <TabsContent value="predict">
              <SectionCard title="预测值 vs 实际值" subtitle="80个测试样本散点，对角线为完美预测">
                <PredVsActualScatter />
              </SectionCard>
            </TabsContent>

            <TabsContent value="cluster">
              <SectionCard title="K-Means 聚类 (k=4)" subtitle="按单价-面积聚类，识别房产价值类型">
                <KMeansScatter />
              </SectionCard>
            </TabsContent>

            <TabsContent value="anomaly">
              <SectionCard title="价格异常检测" subtitle="偏离模型预测 ±30% 以上的样本">
                <div className="flex items-center gap-2 mb-3 p-3 rounded-lg" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
                  <AlertTriangle size={14} style={{ color: "#F59E0B" }} />
                  <span style={{ fontSize: 12, color: "#92400E" }}>检测到 {ANOMALIES.length} 条异常房源，建议人工核查</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow style={{ background: "#F7F9FC" }}>
                      <TableHead style={{ fontSize: 12 }}>房源</TableHead>
                      <TableHead style={{ fontSize: 12 }}>实际单价</TableHead>
                      <TableHead style={{ fontSize: 12 }}>预测单价</TableHead>
                      <TableHead style={{ fontSize: 12 }}>偏差率</TableHead>
                      <TableHead style={{ fontSize: 12 }}>原因</TableHead>
                      <TableHead style={{ fontSize: 12 }}>等级</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ANOMALIES.map(a => (
                      <TableRow key={a.id} style={{ fontSize: 13 }}>
                        <TableCell style={{ fontWeight: 500 }}>{a.listing}</TableCell>
                        <TableCell>{a.actualPrice.toLocaleString()}</TableCell>
                        <TableCell>{a.predictedPrice.toLocaleString()}</TableCell>
                        <TableCell style={{ color: a.deviation > 0 ? "#DC2626" : "#E67E22", fontWeight: 600 }}>
                          {a.deviation > 0 ? "+" : ""}{a.deviation}%
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
              <SectionCard title="模型对比" subtitle="XGBoost / 随机森林 / 岭回归 / GBDT">
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
                    {COMPARE_MODELS.map((m, i) => (
                      <TableRow key={m.model} style={{ background: i === 0 ? "#EFF6FF" : undefined }}>
                        <TableCell style={{ fontWeight: i === 0 ? 700 : 400, color: i === 0 ? "#163A70" : "#1F2937" }}>
                          {m.model} {i === 0 && <Badge style={{ fontSize: 10, marginLeft: 4 }}>当前</Badge>}
                        </TableCell>
                        <TableCell>{m.mae}</TableCell>
                        <TableCell>{m.rmse}</TableCell>
                        <TableCell style={{ color: m.r2 > 0.83 ? "#16A34A" : "#1F2937", fontWeight: m.r2 > 0.83 ? 600 : 400 }}>{m.r2}</TableCell>
                        <TableCell>{m.mape}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </SectionCard>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right: model info */}
        <div className="w-56 flex-shrink-0 flex flex-col gap-4">
          <SectionCard title="模型信息">
            <div className="flex flex-col gap-3">
              {[
                ["算法", MODEL_METRICS.modelType],
                ["版本", MODEL_METRICS.version],
                ["训练集", `${(MODEL_METRICS.trainSize / 1000).toFixed(0)}k 条`],
                ["测试集", `${(MODEL_METRICS.testSize / 1000).toFixed(0)}k 条`],
                ["训练时长", MODEL_METRICS.trainTime],
                ["上次训练", MODEL_METRICS.lastTrained],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between items-center py-1" style={{ borderBottom: "1px solid #E5EAF2" }}>
                  <span style={{ fontSize: 12, color: "#9CA3AF" }}>{k}</span>
                  <span style={{ fontSize: 12, color: "#1F2937", fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <Button
            className="w-full"
            style={{ background: "#163A70", color: "#fff", fontSize: 13 }}
            onClick={() => toast.info("演示模式")}
          >
            <Brain size={14} className="mr-1.5" />调参优化
          </Button>
        </div>
      </div>
    </div>
  );
}

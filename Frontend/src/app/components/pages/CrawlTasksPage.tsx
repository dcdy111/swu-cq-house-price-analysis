import { useEffect, useMemo, useState } from "react";
import { Plus, Play, RotateCcw, Terminal, Activity, CheckCircle, AlertCircle, Clock, Database, RefreshCw, FileText } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Progress } from "../ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Label } from "../ui/label";
import { SectionCard } from "../common/SectionCard";
import { StatusTag } from "../common/StatusTag";
import { KpiCard } from "../common/KpiCard";
import { api, CrawlLog, CrawlSource, CrawlTask, CrawlTaskList } from "../../services/api";
import { toast } from "sonner";

const LOG_COLOR: Record<string, string> = {
  INFO: "#1F4E8C",
  WARN: "#F59E0B",
  ERROR: "#DC2626",
};

const LOG_BG: Record<string, string> = {
  INFO: "#EFF6FF",
  WARN: "#FFFBEB",
  ERROR: "#FEF2F2",
};

const TASK_STATUS_LABEL: Record<string, string> = {
  running: "运行中",
  success: "成功",
  failed: "失败",
  partial_failed: "部分失败",
  pending: "待运行",
  canceled: "已取消",
  cancel_requested: "取消中",
};

function normalizeDistrictName(name: string) {
  if (name === "两江新区") return name;
  return name
    .replace(/土家族苗族自治县|苗族土家族自治县|土家族自治县/g, "")
    .replace(/[区县]$/g, "")
    .trim();
}

export function CrawlTasksPage() {
  const [sources, setSources] = useState<CrawlSource[]>([]);
  const [taskList, setTaskList] = useState<CrawlTaskList | null>(null);
  const [logs, setLogs] = useState<CrawlLog[]>([]);
  const [logFilter, setLogFilter] = useState<string>("ALL");
  const [logTaskFilter, setLogTaskFilter] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [cancelingTaskId, setCancelingTaskId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("房天下小规模试采集");
  const [source, setSource] = useState("fang");
  const [districts, setDistricts] = useState("渝中");
  const [maxPages, setMaxPages] = useState("1");
  const [maxWorkers, setMaxWorkers] = useState("2");
  const [runNow, setRunNow] = useState(true);

  const sourceNameMap = useMemo(() => Object.fromEntries(sources.map(s => [s.key, s.name])), [sources]);
  const selectedSource = sources.find(item => item.key === source);
  const filteredLogs = logs.filter(log => (logFilter === "ALL" || log.level === logFilter) && (!logTaskFilter || log.task_id === logTaskFilter));

  const refresh = () => {
    Promise.all([api.getCrawlSources(), api.getCrawlTasks(), api.getCrawlLogs(120)])
      .then(([sourceData, taskData, logData]) => {
        setSources(sourceData.items);
        setTaskList(taskData);
        setLogs(logData.items);
        setError(null);
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : "采集任务数据加载失败";
        setSources([]);
        setTaskList(null);
        setLogs([]);
        setError(message);
        toast.error(message);
      });
  };

  useEffect(() => {
    const prefillDistrict = sessionStorage.getItem("crawlPrefillDistrict");
    if (prefillDistrict) {
      const normalized = normalizeDistrictName(prefillDistrict);
      setDistricts(normalized);
      setName(`${prefillDistrict} 小规模补采`);
      setDialogOpen(true);
      sessionStorage.removeItem("crawlPrefillDistrict");
    }
    refresh();
  }, []);

  const createTask = async () => {
    setCreating(true);
    const districtList = districts.split(",").map(item => normalizeDistrictName(item.trim())).filter(Boolean);
    try {
      await api.createCrawlTask({
        name,
        source,
        districts: districtList,
        max_pages: Number(maxPages) || 1,
        max_workers: Number(maxWorkers) || 2,
        mode: "manual",
        run_now: runNow,
      });
      toast.success(runNow ? "任务已创建并执行" : "任务已创建");
      setDialogOpen(false);
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "任务创建失败";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const runTask = async (task: CrawlTask) => {
    setRunningTaskId(task.id);
    try {
      await api.runCrawlTask(task.id);
      toast.success("任务执行完成");
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "任务执行失败";
      toast.error(message);
    } finally {
      setRunningTaskId(null);
    }
  };

  const cancelTask = async (task: CrawlTask) => {
    setCancelingTaskId(task.id);
    try {
      await api.cancelCrawlTask(task.id);
      toast.success("任务取消请求已提交");
      refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "任务取消失败";
      toast.error(message);
    } finally {
      setCancelingTaskId(null);
    }
  };

  const tasks = taskList?.items ?? [];
  const summary = taskList?.summary ?? { running: 0, success: 0, failed: 0, partial_failed: 0, pending: 0, canceled: 0, cancel_requested: 0, total_found: 0 };
  const selectedEvidenceTask = tasks.find(task => task.id === logTaskFilter) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ color: "#163A70", fontSize: 18, fontWeight: 700 }}>采集任务管理</h2>
          <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 2 }}>
            多源采集 · 任务状态 · 失败日志可追踪 · 后端任务数据
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} className="flex items-center gap-2">
            <RefreshCw size={14} />刷新
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button style={{ background: "#163A70", color: "#fff", fontSize: 13, height: 36 }}>
                <Plus size={14} className="mr-1.5" />新建任务
              </Button>
            </DialogTrigger>
            <DialogContent style={{ maxWidth: 520 }}>
              <DialogHeader>
                <DialogTitle>新建采集任务</DialogTitle>
                <DialogDescription>配置数据源、区县、页数和并发数，创建后可立即执行小规模采集任务。</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 mt-2">
                <div className="flex flex-col gap-1.5">
                  <Label style={{ fontSize: 13 }}>任务名称</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} placeholder="例: 房天下渝中试采集" style={{ fontSize: 13 }} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label style={{ fontSize: 13 }}>数据源</Label>
                    <Select value={source} onValueChange={setSource}>
                      <SelectTrigger style={{ fontSize: 13 }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {sources.map(item => (
                          <SelectItem key={item.key} value={item.key}>
                            {item.name}{item.enabled ? "" : "（实验）"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label style={{ fontSize: 13 }}>采集模式</Label>
                    <Select defaultValue="manual">
                      <SelectTrigger style={{ fontSize: 13 }}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">手动采集</SelectItem>
                        <SelectItem value="incremental">增量采集</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label style={{ fontSize: 13 }}>区县</Label>
                    <Input value={districts} onChange={e => setDistricts(e.target.value)} placeholder="渝中,南岸" style={{ fontSize: 13 }} />
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                      可用：{selectedSource?.districts.slice(0, 6).join("、") || "等待加载"}{selectedSource && selectedSource.districts.length > 6 ? "..." : ""}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label style={{ fontSize: 13 }}>每区页数</Label>
                    <Input type="number" value={maxPages} onChange={e => setMaxPages(e.target.value)} min={1} max={50} style={{ fontSize: 13 }} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label style={{ fontSize: 13 }}>并发数</Label>
                    <Input type="number" value={maxWorkers} onChange={e => setMaxWorkers(e.target.value)} min={1} max={5} style={{ fontSize: 13 }} />
                  </div>
                  <label className="flex items-center gap-2 mt-6" style={{ fontSize: 13, color: "#374151" }}>
                    <input type="checkbox" checked={runNow} onChange={e => setRunNow(e.target.checked)} />
                    创建后立即执行
                  </label>
                </div>
                <div className="rounded-lg px-3 py-2" style={{ background: "#F7F9FC", color: "#6B7280", fontSize: 12 }}>
                  {selectedSource?.description || "数据源说明加载中"}
                </div>
                <Button disabled={creating} style={{ background: "#163A70", color: "#fff", fontSize: 13 }} onClick={createTask}>
                  {creating ? "处理中..." : "创建任务"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: 13 }}>
          采集任务接口加载失败：{error}。当前页面不会生成本地演示任务，请恢复后端后刷新。
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { title: "运行中", value: String(summary.running), icon: <Activity size={16} style={{ color: "#1F4E8C" }} /> },
          { title: "已完成", value: String(summary.success), icon: <CheckCircle size={16} style={{ color: "#16A34A" }} /> },
          { title: "异常任务", value: String(summary.failed + summary.partial_failed), icon: <AlertCircle size={16} style={{ color: "#DC2626" }} /> },
          { title: "待运行", value: String(summary.pending), icon: <Clock size={16} style={{ color: "#9CA3AF" }} /> },
          { title: "累计解析", value: summary.total_found.toLocaleString(), icon: <Database size={16} style={{ color: "#E67E22" }} /> },
        ].map(({ title, value, icon }) => (
          <KpiCard key={title} title={title} value={value} icon={icon} />
        ))}
      </div>

      <SectionCard title="数据源配置" subtitle="默认优先使用可直接解析的来源">
        <div className="grid md:grid-cols-3 gap-3">
          {sources.length === 0 && (
            <div style={{ fontSize: 13, color: "#9CA3AF", padding: 24 }}>
              暂无后端数据源配置。请确认 `/api/crawl/sources` 可访问。
            </div>
          )}
          {sources.map(item => (
            <div key={item.key} className="rounded-lg p-3" style={{ border: "1px solid #E5EAF2" }}>
              <div className="flex items-center justify-between mb-2">
                <span style={{ fontSize: 14, fontWeight: 600, color: "#1F2937" }}>{item.name}</span>
                <StatusTag status={item.enabled ? "active" : "failed"} label={item.enabled ? "可用" : "实验"} />
              </div>
              <p style={{ fontSize: 12, color: "#6B7280", lineHeight: 1.6 }}>{item.description}</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>覆盖区县：{item.districts.length}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="任务列表">
        <div className="flex flex-col gap-3">
          {tasks.length === 0 && (
            <div style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: 24 }}>
              暂无采集任务，可新建一个房天下 1 页试采集任务。
            </div>
          )}
          {tasks.map(task => (
            <div key={task.id} className="p-4 rounded-xl" style={{ border: "1px solid #E5EAF2" }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#1F2937" }}>{task.name}</span>
                    <StatusTag status={task.status} label={TASK_STATUS_LABEL[task.status] || task.status} />
                    <span className="px-2 py-0.5 rounded" style={{ background: "#F7F9FC", fontSize: 11, color: "#6B7280" }}>
                      {sourceNameMap[task.source] || task.source}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 mb-2" style={{ fontSize: 12, color: "#9CA3AF" }}>
                    <span>区县: {task.districts.join("、")}</span>
                    <span>页数: {task.max_pages}</span>
                    <span>并发: {task.max_workers}</span>
                    <span>新增: {task.inserted_count}</span>
                    <span>更新: {task.updated_count}</span>
                    <span>失败页: {task.failed_pages}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={task.progress} className="flex-1 h-2" />
                    <span style={{ fontSize: 12, color: "#6B7280", minWidth: 70 }}>
                      {task.success_pages + task.failed_pages} / {task.total_pages}
                    </span>
                    <span style={{ fontSize: 12, color: task.status === "running" ? "#163A70" : "#9CA3AF", fontWeight: 600 }}>{task.progress}%</span>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {task.status !== "running" && task.status !== "cancel_requested" && (
                    <Button variant="outline" size="sm" disabled={runningTaskId === task.id} onClick={() => runTask(task)}>
                      {runningTaskId === task.id ? <RotateCcw size={12} /> : <Play size={12} />}
                    </Button>
                  )}
                  {["pending", "running", "cancel_requested"].includes(task.status) && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cancelingTaskId === task.id || task.status === "cancel_requested"}
                      onClick={() => cancelTask(task)}
                      title="取消任务"
                    >
                      {cancelingTaskId === task.id ? <RotateCcw size={12} /> : "停"}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLogTaskFilter(task.id)}
                    title="查看该任务日志"
                  >
                    <FileText size={12} />
                  </Button>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
                创建: {task.created_at}{task.started_at ? ` · 开始: ${task.started_at}` : ""}{task.finished_at ? ` · 结束: ${task.finished_at}` : ""}
              </div>
              {task.evidence && (
                <div className="mt-3 rounded-lg p-3" style={{ background: "#F8FAFC", border: "1px solid #E5EAF2" }}>
                  <div className="flex items-center justify-between gap-3">
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#163A70" }}>定时增量证据</span>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>{task.run_id || task.evidence.run_id || "未生成 run_id"}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                    {[
                      ["前房源数", task.evidence.before_listing_count],
                      ["后房源数", task.evidence.after_listing_count],
                      ["新增快照", task.evidence.new_snapshot_count],
                      ["失败页", task.evidence.failed_pages],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg px-2.5 py-2" style={{ background: "#fff" }}>
                        <div style={{ fontSize: 10, color: "#9CA3AF" }}>{label}</div>
                        <div style={{ fontSize: 12, color: "#1F2937", fontWeight: 700 }}>{value ?? "-"}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: "#4B5563", lineHeight: 1.7, marginTop: 8 }}>
                    {task.evidence.log_summary || "暂无日志摘要"}
                  </div>
                </div>
              )}
              {task.error_message && <div style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{task.error_message}</div>}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="任务证据回放"
        subtitle="每次定时/手动增量任务保存 run_id、前后数量、快照增量和最近日志摘要"
      >
        {!selectedEvidenceTask?.evidence ? (
          <div style={{ fontSize: 13, color: "#9CA3AF" }}>
            点击某个任务的日志按钮后，这里会显示该任务的证据回放卡。当前仅展示已保存 evidence 的任务。
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1F2937" }}>{selectedEvidenceTask.name}</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 2 }}>run_id: {selectedEvidenceTask.run_id || selectedEvidenceTask.evidence.run_id || "-"}</div>
              </div>
              <StatusTag status={selectedEvidenceTask.status} label={TASK_STATUS_LABEL[selectedEvidenceTask.status] || selectedEvidenceTask.status} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                ["前房源数", selectedEvidenceTask.evidence.before_listing_count],
                ["后房源数", selectedEvidenceTask.evidence.after_listing_count],
                ["前快照数", selectedEvidenceTask.evidence.before_snapshot_count],
                ["后快照数", selectedEvidenceTask.evidence.after_snapshot_count],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg p-3" style={{ border: "1px solid #E5EAF2", background: "#F8FAFC" }}>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>{label}</div>
                  <div style={{ fontSize: 15, color: "#163A70", fontWeight: 700, marginTop: 4 }}>{value ?? "-"}</div>
                </div>
              ))}
            </div>
            <div className="rounded-lg p-3" style={{ background: "#FFF7ED", border: "1px solid #FED7AA", color: "#9A3412", fontSize: 12, lineHeight: 1.7 }}>
              {selectedEvidenceTask.evidence.log_summary || "暂无日志摘要"}
            </div>
            <div className="rounded-lg overflow-hidden" style={{ background: "#0F172A", fontFamily: "monospace" }}>
              <div className="px-3 py-2" style={{ borderBottom: "1px solid #1E293B", color: "#64748B", fontSize: 12 }}>
                recent evidence logs
              </div>
              <div className="p-3 flex flex-col gap-2">
                {Array.isArray(selectedEvidenceTask.evidence.recent_logs) && selectedEvidenceTask.evidence.recent_logs.length > 0 ? selectedEvidenceTask.evidence.recent_logs.map((log: any) => (
                  <div key={`${log.id}-${log.created_at}`} style={{ fontSize: 11, color: "#CBD5E1", lineHeight: 1.7 }}>
                    <span style={{ color: "#64748B", marginRight: 8 }}>{String(log.created_at || "").slice(11, 19)}</span>
                    <span style={{ color: log.level === "ERROR" ? "#FCA5A5" : log.level === "WARN" ? "#FCD34D" : "#93C5FD", marginRight: 8 }}>
                      {log.level}
                    </span>
                    {log.message}
                  </div>
                )) : (
                  <div style={{ fontSize: 11, color: "#64748B" }}>暂无 recent_logs</div>
                )}
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="系统日志"
        subtitle="采集任务运行记录"
        action={
          <div className="flex gap-1">
            {logTaskFilter && (
              <button
                onClick={() => setLogTaskFilter(null)}
                className="px-2.5 py-1 rounded text-xs transition-colors"
                style={{ background: "#EFF6FF", color: "#163A70" }}
              >
                全部任务
              </button>
            )}
            {["ALL", "INFO", "WARN", "ERROR"].map(filter => (
              <button
                key={filter}
                onClick={() => setLogFilter(filter)}
                className="px-2.5 py-1 rounded text-xs transition-colors"
                style={{ background: logFilter === filter ? "#163A70" : "#F7F9FC", color: logFilter === filter ? "#fff" : "#6B7280" }}
              >
                {filter}
              </button>
            ))}
          </div>
        }
      >
        <div className="rounded-lg overflow-hidden" style={{ background: "#0F172A", fontFamily: "monospace" }}>
          <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: "#1E293B" }}>
            <Terminal size={13} style={{ color: "#64748B" }} />
            <span style={{ fontSize: 12, color: "#64748B" }}>crawler.log</span>
          </div>
          <div className="p-3 flex flex-col gap-1 max-h-64 overflow-auto" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
            {filteredLogs.length === 0 && <span style={{ fontSize: 11, color: "#64748B" }}>暂无日志</span>}
            {filteredLogs.map(log => (
              <div key={log.id} className="flex gap-3 items-start py-0.5">
                <span style={{ fontSize: 11, color: "#475569", flexShrink: 0 }}>{log.created_at?.slice(11, 19)}</span>
                <span className="px-1.5 py-0.5 rounded text-xs flex-shrink-0" style={{ background: `${LOG_BG[log.level]}22`, color: LOG_COLOR[log.level] }}>
                  {log.level}
                </span>
                <span style={{ fontSize: 11, color: "#94A3B8", flexShrink: 0 }}>[T{log.task_id}]</span>
                <div className="flex flex-col min-w-0">
                  <span style={{ fontSize: 11, color: "#CBD5E1" }}>{log.message}</span>
                  <span style={{ fontSize: 10, color: "#475569" }}>
                    {log.district || ""}{log.page ? ` · 第${log.page}页` : ""}{log.url ? ` · ${log.url}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

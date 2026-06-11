import { useEffect, useMemo, useRef, useState } from "react";
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
import { CRAWL_TASKS, LOG_ENTRIES } from "../../mock/crawlTasks";
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
};

const MOCK_SOURCES: CrawlSource[] = [
  {
    key: "fang",
    name: "房天下",
    enabled: true,
    description: "重庆房天下二手房列表页，当前作为默认稳定采集源。",
    districts: ["两江新区", "渝中", "南岸", "沙坪坝", "九龙坡", "大渡口", "北碚", "巴南", "涪陵", "江津", "铜梁", "永川", "璧山", "合川"],
  },
  {
    key: "anjuke_mobile",
    name: "安居客移动端",
    enabled: true,
    description: "移动端列表页，适合小批量补采，失败会进入任务日志。",
    districts: ["渝北", "南岸", "沙坪坝", "九龙坡", "江北", "渝中", "巴南", "北碚", "大渡口", "璧山", "永川", "合川"],
  },
  {
    key: "lianjia",
    name: "链家移动端",
    enabled: false,
    description: "需配置 Cookie 后启用，适合作为高质量实验源。",
    districts: ["江北", "渝北", "南岸", "巴南", "沙坪坝", "九龙坡", "渝中", "大渡口", "北碚"],
  },
];

function formatDateTime(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function normalizeDistrictName(name: string) {
  if (name === "两江新区") return name;
  return name
    .replace(/土家族苗族自治县|苗族土家族自治县|土家族自治县/g, "")
    .replace(/[区县]$/g, "")
    .trim();
}

function mockTaskToApiTask(item: typeof CRAWL_TASKS[number], index: number): CrawlTask {
  const totalPages = Math.max(1, Math.round(item.total / 30));
  const donePages = Math.round(totalPages * item.progress / 100);
  return {
    id: index + 1,
    name: item.name,
    source: item.source === "链家" ? "lianjia" : item.source === "安居客" ? "anjuke_mobile" : "fang",
    mode: item.type === "增量" ? "incremental" : "manual",
    districts: item.range === "重庆全市" ? ["全市"] : item.range.split(",").map(normalizeDistrictName),
    max_pages: Math.max(1, Math.round(totalPages / Math.max(1, item.range.split(",").length))),
    max_workers: Math.min(5, Math.max(1, item.concurrency)),
    status: item.status === "paused" ? "pending" : item.status,
    total_pages: totalPages,
    success_pages: item.status === "failed" ? Math.max(0, donePages - 3) : donePages,
    failed_pages: item.status === "failed" ? 3 : 0,
    total_found: item.crawled,
    inserted_count: Math.round(item.crawled * 0.68),
    updated_count: Math.round(item.crawled * 0.2),
    unchanged_count: Math.round(item.crawled * 0.12),
    snapshot_count: Math.round(item.crawled * 0.08),
    progress: item.progress,
    error_message: item.status === "failed" ? "部分页面请求超时，已写入失败日志" : undefined,
    started_at: item.startTime,
    finished_at: item.endTime,
    created_at: item.startTime,
    updated_at: item.endTime || item.startTime,
  };
}

function mockLogToApiLog(item: typeof LOG_ENTRIES[number]): CrawlLog {
  return {
    id: item.id,
    task_id: Number(item.taskId.replace("T", "")),
    level: item.level,
    message: item.message,
    url: item.url,
    created_at: `2026-06-09 ${item.time}`,
  };
}

function buildTaskList(items: CrawlTask[]): CrawlTaskList {
  const summary = items.reduce(
    (acc, task) => {
      acc.running += task.status === "running" ? 1 : 0;
      acc.success += task.status === "success" ? 1 : 0;
      acc.failed += task.status === "failed" ? 1 : 0;
      acc.partial_failed += task.status === "partial_failed" ? 1 : 0;
      acc.pending += task.status === "pending" ? 1 : 0;
      acc.total_found += task.total_found;
      return acc;
    },
    { running: 0, success: 0, failed: 0, partial_failed: 0, pending: 0, total_found: 0 }
  );
  return {
    items,
    pagination: { page: 1, page_size: 20, total: items.length, pages: 1 },
    summary,
  };
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
  const [usingMock, setUsingMock] = useState(false);
  const mockWarnedRef = useRef(false);
  const [localTasks, setLocalTasks] = useState<CrawlTask[]>(() => CRAWL_TASKS.map(mockTaskToApiTask));
  const [localLogs, setLocalLogs] = useState<CrawlLog[]>(() => LOG_ENTRIES.map(mockLogToApiLog));

  const [name, setName] = useState("房天下小规模试采集");
  const [source, setSource] = useState("fang");
  const [districts, setDistricts] = useState("渝中");
  const [maxPages, setMaxPages] = useState("1");
  const [maxWorkers, setMaxWorkers] = useState("2");
  const [runNow, setRunNow] = useState(true);

  const sourceNameMap = useMemo(() => Object.fromEntries(sources.map(s => [s.key, s.name])), [sources]);
  const selectedSource = sources.find(item => item.key === source);
  const filteredLogs = logs.filter(log => (logFilter === "ALL" || log.level === logFilter) && (!logTaskFilter || log.task_id === logTaskFilter));

  const applyMockData = (message?: string) => {
    setUsingMock(true);
    setSources(MOCK_SOURCES);
    setTaskList(buildTaskList(localTasks));
    setLogs(localLogs);
    if (message && !mockWarnedRef.current) {
      toast.warning(`${message}，已切换前端演示任务`);
      mockWarnedRef.current = true;
    }
  };

  const refresh = () => {
    Promise.all([api.getCrawlSources(), api.getCrawlTasks(), api.getCrawlLogs(120)])
      .then(([sourceData, taskData, logData]) => {
        setUsingMock(false);
        setSources(sourceData.items);
        setTaskList(taskData);
        setLogs(logData.items);
      })
      .catch(error => applyMockData(error.message || "采集任务数据加载失败"));
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

  useEffect(() => {
    if (usingMock) {
      setTaskList(buildTaskList(localTasks));
      setLogs(localLogs);
    }
  }, [localLogs, localTasks, usingMock]);

  const createTask = async () => {
    setCreating(true);
    const districtList = districts.split(",").map(item => normalizeDistrictName(item.trim())).filter(Boolean);
    try {
      if (usingMock) throw new Error("前端演示模式");
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
      if (!usingMock && error instanceof Error && error.message !== "前端演示模式") {
        toast.error(error.message || "任务创建失败");
        return;
      }
      const now = formatDateTime();
      const totalPages = Math.max(1, districtList.length) * (Number(maxPages) || 1);
      const found = runNow ? totalPages * 30 : 0;
      const newTask: CrawlTask = {
        id: Math.max(0, ...localTasks.map(item => item.id)) + 1,
        name: name.trim() || `${sourceNameMap[source] || source}采集任务`,
        source,
        mode: "manual",
        districts: districtList.length ? districtList : ["渝中"],
        max_pages: Number(maxPages) || 1,
        max_workers: Number(maxWorkers) || 2,
        status: runNow ? "success" : "pending",
        total_pages: totalPages,
        success_pages: runNow ? totalPages : 0,
        failed_pages: 0,
        total_found: found,
        inserted_count: Math.round(found * 0.72),
        updated_count: Math.round(found * 0.18),
        unchanged_count: Math.round(found * 0.1),
        snapshot_count: Math.round(found * 0.08),
        progress: runNow ? 100 : 0,
        started_at: runNow ? now : undefined,
        finished_at: runNow ? now : undefined,
        created_at: now,
        updated_at: now,
      };
      const nextTasks = [newTask, ...localTasks];
      const nextLogs: CrawlLog[] = [
        {
          id: Math.max(0, ...localLogs.map(item => item.id)) + 1,
          task_id: newTask.id,
          level: "INFO",
          message: runNow ? `演示任务执行完成，共解析 ${found} 条房源` : "演示任务已创建，等待执行",
          district: newTask.districts.join(","),
          created_at: now,
        },
        ...localLogs,
      ];
      setUsingMock(true);
      setSources(MOCK_SOURCES);
      setLocalTasks(nextTasks);
      setLocalLogs(nextLogs);
      setTaskList(buildTaskList(nextTasks));
      setLogs(nextLogs);
      setDialogOpen(false);
      toast.success(runNow ? "演示任务已创建并执行" : "演示任务已创建");
    } finally {
      setCreating(false);
    }
  };

  const runTask = async (task: CrawlTask) => {
    setRunningTaskId(task.id);
    try {
      if (usingMock) throw new Error("前端演示模式");
      await api.runCrawlTask(task.id);
      toast.success("任务执行完成");
      refresh();
    } catch (error) {
      if (!usingMock && error instanceof Error && error.message !== "前端演示模式") {
        toast.error(error.message || "任务执行失败");
        return;
      }
      const now = formatDateTime();
      const found = Math.max(30, task.total_pages * 30);
      const nextTasks = localTasks.map(item => item.id === task.id ? {
        ...item,
        status: "success",
        progress: 100,
        success_pages: item.total_pages,
        failed_pages: 0,
        total_found: found,
        inserted_count: Math.round(found * 0.7),
        updated_count: Math.round(found * 0.2),
        unchanged_count: Math.round(found * 0.1),
        snapshot_count: Math.round(found * 0.08),
        started_at: now,
        finished_at: now,
        updated_at: now,
        error_message: undefined,
      } : item);
      const nextLogs: CrawlLog[] = [
        {
          id: Math.max(0, ...localLogs.map(item => item.id)) + 1,
          task_id: task.id,
          level: "INFO",
          message: `演示任务重新执行完成，共解析 ${found} 条房源`,
          district: task.districts.join(","),
          created_at: now,
        },
        ...localLogs,
      ];
      setLocalTasks(nextTasks);
      setLocalLogs(nextLogs);
      toast.success("演示任务执行完成");
    } finally {
      setRunningTaskId(null);
    }
  };

  const tasks = taskList?.items ?? [];
  const summary = taskList?.summary ?? { running: 0, success: 0, failed: 0, partial_failed: 0, pending: 0, total_found: 0 };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ color: "#163A70", fontSize: 18, fontWeight: 700 }}>采集任务管理</h2>
          <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 2 }}>
            多源采集 · 任务状态 · 失败日志可追踪 · {usingMock ? "前端演示数据" : "后端任务数据"}
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
                  {task.status !== "running" && (
                    <Button variant="outline" size="sm" disabled={runningTaskId === task.id} onClick={() => runTask(task)}>
                      {runningTaskId === task.id ? <RotateCcw size={12} /> : <Play size={12} />}
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
              {task.error_message && <div style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{task.error_message}</div>}
            </div>
          ))}
        </div>
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

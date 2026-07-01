import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Play,
  RotateCcw,
  Terminal,
  Activity,
  CheckCircle,
  AlertCircle,
  Clock,
  Database,
  RefreshCw,
  FileText,
  Pencil,
  Trash2,
  Search,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Progress } from "../ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "../ui/dialog";
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
  return mapped
    .replace(/土家族苗族自治县|苗族土家族自治县|土家族自治县/g, "")
    .replace(/区$/g, "")
    .replace(/县$/g, "")
    .trim();
}

type CreatePayload = {
  name: string;
  source: string;
  districts: string;
  maxPages: string;
  maxWorkers: string;
  mode: string;
  runNow: boolean;
};

const DEFAULT_PAYLOAD: CreatePayload = {
  name: "房天下小规模试采集",
  source: "fang",
  districts: "渝中",
  maxPages: "1",
  maxWorkers: "2",
  mode: "manual",
  runNow: true,
};

function TaskFormDialog({
  open,
  onOpenChange,
  sources,
  initial,
  title,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: CrawlSource[];
  initial: CreatePayload;
  title: string;
  onSubmit: (payload: CreatePayload) => Promise<void>;
  submitting: boolean;
}) {
  const [payload, setPayload] = useState<CreatePayload>(initial);

  useEffect(() => {
    if (open) {
      setPayload(initial);
    }
  }, [open, initial]);

  const selectedSource = sources.find(item => item.key === payload.source);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 540 }}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>填写参数后保存即可创建任务。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label style={{ fontSize: 13 }}>任务名称</Label>
            <Input
              value={payload.name}
              onChange={event => setPayload(prev => ({ ...prev, name: event.target.value }))}
              placeholder="例: 房天下渝中试采集"
              style={{ fontSize: 13 }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label style={{ fontSize: 13 }}>数据源</Label>
              <Select
                value={payload.source}
                onValueChange={value => setPayload(prev => ({ ...prev, source: value }))}
              >
                <SelectTrigger style={{ fontSize: 13 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sources.map(item => (
                    <SelectItem key={item.key} value={item.key}>
                      {item.name}
                      {item.enabled ? "" : "（停用）"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label style={{ fontSize: 13 }}>采集模式</Label>
              <Select
                value={payload.mode}
                onValueChange={value => setPayload(prev => ({ ...prev, mode: value }))}
              >
                <SelectTrigger style={{ fontSize: 13 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">手动</SelectItem>
                  <SelectItem value="incremental">增量</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <Label style={{ fontSize: 13 }}>区县，逗号分隔；写“全部”则使用所有区县</Label>
              <Input
                value={payload.districts}
                onChange={event => setPayload(prev => ({ ...prev, districts: event.target.value }))}
                placeholder="渝中,南岸"
                style={{ fontSize: 13 }}
              />
              <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                支持：{selectedSource?.districts.slice(0, 6).join("、") || "等待加载"}
                {selectedSource && selectedSource.districts.length > 6 ? "..." : ""}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label style={{ fontSize: 13 }}>每区页数</Label>
              <Input
                type="number"
                value={payload.maxPages}
                onChange={event => setPayload(prev => ({ ...prev, maxPages: event.target.value }))}
                min={1}
                max={50}
                style={{ fontSize: 13 }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label style={{ fontSize: 13 }}>并发数</Label>
              <Input
                type="number"
                value={payload.maxWorkers}
                onChange={event => setPayload(prev => ({ ...prev, maxWorkers: event.target.value }))}
                min={1}
                max={5}
                style={{ fontSize: 13 }}
              />
            </div>
          </div>
          <label
            className="flex items-center gap-2"
            style={{ fontSize: 13, color: "#374151" }}
          >
            <input
              type="checkbox"
              checked={payload.runNow}
              onChange={event => setPayload(prev => ({ ...prev, runNow: event.target.checked }))}
            />
            保存后立即执行
          </label>
        </div>
        <DialogFooter className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            style={{ fontSize: 13 }}
          >
            取消
          </Button>
          <Button
            size="sm"
            disabled={submitting}
            onClick={() => onSubmit(payload)}
            style={{ background: "#163A70", color: "#fff", fontSize: 13 }}
          >
            {submitting ? "处理中..." : title.startsWith("编辑") ? "保存并执行" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function initialPayload(prefillDistrict?: string | null): CreatePayload {
  return {
    ...DEFAULT_PAYLOAD,
    districts: prefillDistrict?.trim() || DEFAULT_PAYLOAD.districts,
  };
}

export function CrawlTasksPage() {
  const [sources, setSources] = useState<CrawlSource[]>([]);
  const [taskList, setTaskList] = useState<CrawlTaskList | null>(null);
  const [logs, setLogs] = useState<CrawlLog[]>([]);
  const [logFilter, setLogFilter] = useState<string>("ALL");
  const [logTaskFilter, setLogTaskFilter] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [prefillDistrict, setPrefillDistrict] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [editingTask, setEditingTask] = useState<CrawlTask | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState<number | null>(null);
  const [cancelingTaskId, setCancelingTaskId] = useState<number | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sourceNameMap = useMemo(
    () => Object.fromEntries(sources.map(item => [item.key, item.name])),
    [sources],
  );
  const filteredLogs = logs.filter(
    item =>
      (logFilter === "ALL" || item.level === logFilter) &&
      (!logTaskFilter || item.task_id === logTaskFilter),
  );

  const refresh = () => {
    Promise.all([api.getCrawlSources(), api.getCrawlTasks(), api.getCrawlLogs(160)])
      .then(([sourceData, taskData, logData]) => {
        setSources(sourceData.items);
        setTaskList(taskData);
        setLogs(logData.items);
        setError(null);
      })
      .catch(refreshError => {
        const message = refreshError instanceof Error ? refreshError.message : "采集任务数据加载失败";
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
      setPrefillDistrict(prefillDistrict);
      setCreateOpen(true);
      sessionStorage.removeItem("crawlPrefillDistrict");
    }
    refresh();
  }, []);

  const buildRequestBody = (payload: CreatePayload) => {
    const districtList = payload.districts
      .split(/[,，]/)
      .map(item => normalizeDistrictName(item.trim()))
      .filter(Boolean);
    return {
      name: payload.name,
      source: payload.source,
      districts: districtList,
      max_pages: Number(payload.maxPages) || 1,
      max_workers: Number(payload.maxWorkers) || 2,
      mode: payload.mode,
      run_now: payload.runNow,
    };
  };

  const createTask = async (payload: CreatePayload) => {
    setCreating(true);
    try {
      await api.createCrawlTask(buildRequestBody(payload));
      toast.success(payload.runNow ? "任务已创建并执行" : "任务已创建");
      setCreateOpen(false);
      refresh();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "任务创建失败";
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const saveEdit = async (payload: CreatePayload) => {
    if (!editingTask) return;
    setSavingEdit(true);
    try {
      await api.updateCrawlTask(editingTask.id, buildRequestBody(payload));
      toast.success(payload.runNow ? "任务已更新并执行" : "任务已更新");
      setEditingTask(null);
      refresh();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "任务更新失败";
      toast.error(message);
    } finally {
      setSavingEdit(false);
    }
  };

  const runTask = async (task: CrawlTask) => {
    setRunningTaskId(task.id);
    try {
      await api.runCrawlTask(task.id);
      toast.success("任务执行完成");
      refresh();
    } catch (runError) {
      const message = runError instanceof Error ? runError.message : "任务执行失败";
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
    } catch (cancelError) {
      const message = cancelError instanceof Error ? cancelError.message : "任务取消失败";
      toast.error(message);
    } finally {
      setCancelingTaskId(null);
    }
  };

  const deleteTask = async (task: CrawlTask) => {
    const confirmed = window.confirm(`确定删除任务「${task.name}」？此操作不可撤销。`);
    if (!confirmed) return;
    setDeletingTaskId(task.id);
    try {
      await api.deleteCrawlTask(task.id);
      toast.success("任务已删除");
      refresh();
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "任务删除失败";
      toast.error(message);
    } finally {
      setDeletingTaskId(null);
    }
  };

  const startEdit = (task: CrawlTask) => {
    if (task.status === "running" || task.status === "cancel_requested") {
      toast.error("运行中的任务不能编辑");
      return;
    }
    setEditingTask(task);
  };

  const tasks = taskList?.items ?? [];
  const summary = taskList?.summary ?? {
    running: 0,
    success: 0,
    failed: 0,
    partial_failed: 0,
    pending: 0,
    canceled: 0,
    cancel_requested: 0,
    total_found: 0,
  };
  const selectedEvidenceTask = tasks.find(task => task.id === logTaskFilter) ?? null;

  const visibleTasks = useMemo(() => {
    return tasks.filter(task => {
      const matchesSearch =
        !search ||
        task.name.toLowerCase().includes(search.toLowerCase()) ||
        String(task.id).includes(search) ||
        task.source.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [tasks, search, statusFilter]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ color: "#163A70", fontSize: 18, fontWeight: 700 }}>采集任务管理</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} className="flex items-center gap-2">
            <RefreshCw size={14} />刷新
          </Button>
          <Button
            style={{ background: "#163A70", color: "#fff", fontSize: 13, height: 36 }}
            onClick={() => {
              setPrefillDistrict("");
              setCreateOpen(true);
            }}
          >
            <Plus size={14} className="mr-1.5" />新建任务
          </Button>
        </div>
      </div>

      {error && (
        <div
          className="rounded-lg px-4 py-3"
          style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: 13 }}
        >
          采集任务接口加载失败：{error}。当前页面不会生成本地演示任务，请恢复后端后刷新。
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { title: "运行中", value: String(summary.running), icon: <Activity size={16} style={{ color: "#1F4E8C" }} /> },
          { title: "已完成", value: String(summary.success), icon: <CheckCircle size={16} style={{ color: "#16A34A" }} /> },
          { title: "异常任务", value: String(summary.failed + summary.partial_failed), icon: <AlertCircle size={16} style={{ color: "#DC2626" }} /> },
          { title: "待运行", value: String(summary.pending), icon: <Clock size={16} style={{ color: "#9CA3AF" }} /> },
          { title: "解析房源数", value: summary.total_found.toLocaleString(), icon: <Database size={16} style={{ color: "#E67E22" }} /> },
        ].map(({ title, value, icon }) => (
          <KpiCard key={title} title={title} value={value} icon={icon} />
        ))}
      </div>

      <SectionCard title="任务列表">
        <div className="flex flex-wrap gap-3 items-center mb-3">
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
            <Input
              placeholder="搜索任务名 / ID / 数据源"
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="pl-9 h-9"
              style={{ fontSize: 13 }}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-9" style={{ fontSize: 13 }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="running">运行中</SelectItem>
              <SelectItem value="success">成功</SelectItem>
              <SelectItem value="partial_failed">部分失败</SelectItem>
              <SelectItem value="failed">失败</SelectItem>
              <SelectItem value="pending">待运行</SelectItem>
              <SelectItem value="canceled">已取消</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-3">
          {visibleTasks.length === 0 && (
            <div style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: 24 }}>
              暂无匹配的采集任务，点击右上角“新建任务”即可创建。
            </div>
          )}
          {visibleTasks.map(task => {
            const failedPages = task.failed_pages ?? 0;
            const isFailure = task.status === "failed" || task.status === "partial_failed" || failedPages > 0;
            const editable = task.status !== "running" && task.status !== "cancel_requested";
            return (
              <div
                key={task.id}
                className="p-4 rounded-xl"
                style={{
                  border: isFailure ? "1px solid #FCA5A5" : "1px solid #E5EAF2",
                  background: isFailure ? "#FFFBFB" : "#fff",
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#1F2937" }}>
                        系统ID {task.id} · {task.name}
                      </span>
                      <StatusTag status={task.status} label={TASK_STATUS_LABEL[task.status] || task.status} />
                      <span
                        className="px-2 py-0.5 rounded"
                        style={{ background: "#F7F9FC", fontSize: 11, color: "#6B7280" }}
                      >
                        {sourceNameMap[task.source] || task.source}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-4 mb-2" style={{ fontSize: 12, color: "#9CA3AF" }}>
                      <span>区县: {task.districts.map(normalizeDistrictName).join("、")}</span>
                      <span>每区页数: {task.max_pages}</span>
                      <span>并发数: {task.max_workers}</span>
                      <span>任务运行号: {task.run_id || "未生成"}</span>
                      <span>新增: {task.inserted_count}</span>
                      <span>更新: {task.updated_count}</span>
                      <span style={{ color: failedPages > 0 ? "#DC2626" : undefined }}>
                        失败页: {failedPages}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={task.progress} className="flex-1 h-2" />
                      <span style={{ fontSize: 12, color: "#6B7280", minWidth: 70 }}>
                        {task.success_pages + failedPages} / {task.total_pages}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: task.status === "running" ? "#163A70" : "#9CA3AF",
                          fontWeight: 600,
                        }}
                      >
                        {task.progress}%
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={runningTaskId === task.id}
                      onClick={() => runTask(task)}
                      title="立即重跑"
                    >
                      {runningTaskId === task.id ? <RotateCcw size={12} /> : <Play size={12} />}
                    </Button>
                    {editable && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(task)}
                        title="编辑任务"
                      >
                        <Pencil size={12} />
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
                      title="查看日志"
                    >
                      <FileText size={12} />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!editable || deletingTaskId === task.id}
                      onClick={() => deleteTask(task)}
                      title="删除任务"
                      style={{ color: editable ? "#DC2626" : undefined }}
                    >
                      {deletingTaskId === task.id ? <RotateCcw size={12} /> : <Trash2 size={12} />}
                    </Button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6 }}>
                  创建: {task.created_at}
                  {task.started_at ? ` · 开始: ${task.started_at}` : ""}
                  {task.finished_at ? ` · 结束: ${task.finished_at}` : ""}
                </div>
                {isFailure && (
                  <div
                    className="mt-3 rounded-lg px-3 py-2"
                    style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", fontSize: 12 }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>失败原因</div>
                    {task.error_message ? (
                      <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{task.error_message}</div>
                    ) : (
                      <div>
                        状态 {TASK_STATUS_LABEL[task.status] || task.status}，失败页 {failedPages}/{task.total_pages}。
                        详见下方任务证据回放和系统日志。
                      </div>
                    )}
                  </div>
                )}
                {task.evidence && (
                  <div
                    className="mt-3 rounded-lg p-3"
                    style={{ background: "#F8FAFC", border: "1px solid #E5EAF2" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#163A70" }}>运行证据</span>
                      <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                        任务运行号: {task.run_id || task.evidence.run_id || "未生成"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                      {[
                        ["前房源数", task.evidence.before_listing_count],
                        ["后房源数", task.evidence.after_listing_count],
                        ["新增快照", task.evidence.new_snapshot_count],
                        ["失败页", task.evidence.failed_pages],
                      ].map(([label, value]) => (
                        <div
                          key={String(label)}
                          className="rounded-lg px-2.5 py-2"
                          style={{ background: "#fff" }}
                        >
                          <div style={{ fontSize: 10, color: "#9CA3AF" }}>{label}</div>
                          <div style={{ fontSize: 12, color: "#1F2937", fontWeight: 700 }}>{value ?? "-"}</div>
                        </div>
                      ))}
                    </div>
                    <div
                      style={{ fontSize: 11, color: "#4B5563", lineHeight: 1.7, marginTop: 8 }}
                    >
                      {task.evidence.log_summary || "暂无日志摘要"}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {selectedEvidenceTask?.evidence && (
        <SectionCard title={`任务详情 #${selectedEvidenceTask.id} · ${selectedEvidenceTask.name}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              ["前房源数", selectedEvidenceTask.evidence.before_listing_count],
              ["后房源数", selectedEvidenceTask.evidence.after_listing_count],
              ["前快照数", selectedEvidenceTask.evidence.before_snapshot_count],
              ["后快照数", selectedEvidenceTask.evidence.after_snapshot_count],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-lg p-3"
                style={{ border: "1px solid #E5EAF2", background: "#F8FAFC" }}
              >
                <div style={{ fontSize: 11, color: "#9CA3AF" }}>{label}</div>
                <div style={{ fontSize: 15, color: "#163A70", fontWeight: 700, marginTop: 4 }}>
                  {value ?? "-"}
                </div>
              </div>
            ))}
          </div>
          <div
            className="rounded-lg p-3"
            style={{
              background: "#FFF7ED",
              border: "1px solid #FED7AA",
              color: "#9A3412",
              fontSize: 12,
              lineHeight: 1.7,
            }}
          >
            {selectedEvidenceTask.evidence.log_summary || "暂无日志摘要"}
          </div>
          <div
            className="mt-3 rounded-lg overflow-hidden"
            style={{ background: "#0F172A", fontFamily: "monospace" }}
          >
            <div
              className="px-3 py-2"
              style={{ borderBottom: "1px solid #1E293B", color: "#64748B", fontSize: 12 }}
            >
              recent logs（最新 8 条）
            </div>
            <div className="p-3 flex flex-col gap-2">
              {Array.isArray(selectedEvidenceTask.evidence.recent_logs) &&
              selectedEvidenceTask.evidence.recent_logs.length > 0 ? (
                selectedEvidenceTask.evidence.recent_logs.map(log => (
                  <div
                    key={`${log.id}-${log.created_at}`}
                    style={{ fontSize: 11, color: "#CBD5E1", lineHeight: 1.7 }}
                  >
                    <span style={{ color: "#64748B", marginRight: 8 }}>
                      {String(log.created_at || "").slice(11, 19)}
                    </span>
                    <span
                      style={{
                        color:
                          log.level === "ERROR"
                            ? "#FCA5A5"
                            : log.level === "WARN"
                              ? "#FCD34D"
                              : "#93C5FD",
                        marginRight: 8,
                      }}
                    >
                      {log.level}
                    </span>
                    {log.message}
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 11, color: "#64748B" }}>暂无 recent_logs</div>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard
        title="系统日志"
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
                style={{
                  background: logFilter === filter ? "#163A70" : "#F7F9FC",
                  color: logFilter === filter ? "#fff" : "#6B7280",
                }}
              >
                {filter}
              </button>
            ))}
          </div>
        }
      >
        <div
          className="rounded-lg overflow-hidden"
          style={{ background: "#0F172A", fontFamily: "monospace" }}
        >
          <div
            className="flex items-center gap-2 px-4 py-2 border-b"
            style={{ borderColor: "#1E293B" }}
          >
            <Terminal size={13} style={{ color: "#64748B" }} />
            <span style={{ fontSize: 12, color: "#64748B" }}>crawler.log</span>
          </div>
          <div
            className="p-3 flex flex-col gap-1 max-h-64 overflow-auto"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {filteredLogs.length === 0 && (
              <span style={{ fontSize: 11, color: "#64748B" }}>暂无日志</span>
            )}
            {filteredLogs.map(log => (
              <div key={log.id} className="flex gap-3 items-start py-0.5">
                <span style={{ fontSize: 11, color: "#475569", flexShrink: 0 }}>
                  {log.created_at?.slice(11, 19)}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-xs flex-shrink-0"
                  style={{
                    background: `${LOG_BG[log.level]}22`,
                    color: LOG_COLOR[log.level],
                  }}
                >
                  {log.level}
                </span>
                <span style={{ fontSize: 11, color: "#94A3B8", flexShrink: 0 }}>
                  [T{log.task_id}]
                </span>
                <div className="flex flex-col min-w-0">
                  <span style={{ fontSize: 11, color: "#CBD5E1" }}>{log.message}</span>
                  <span style={{ fontSize: 10, color: "#475569" }}>
                    {log.district || ""}
                    {log.page ? ` · 第${log.page}页` : ""}
                    {log.url ? ` · ${log.url}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <TaskFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        sources={sources}
        initial={initialPayload(prefillDistrict)}
        title="新建采集任务"
        onSubmit={createTask}
        submitting={creating}
      />
      <TaskFormDialog
        open={!!editingTask}
        onOpenChange={open => !open && setEditingTask(null)}
        sources={sources}
        initial={{
          name: editingTask?.name ?? "",
          source: editingTask?.source ?? "fang",
          districts: editingTask?.districts.map(normalizeDistrictName).join("、") ?? "",
          maxPages: String(editingTask?.max_pages ?? 1),
          maxWorkers: String(editingTask?.max_workers ?? 2),
          mode: editingTask?.mode ?? "manual",
          runNow: false,
        }}
        title={`编辑任务 #${editingTask?.id ?? ""}`}
        onSubmit={saveEdit}
        submitting={savingEdit}
      />
    </div>
  );
}

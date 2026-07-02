import { useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { SectionCard } from "../common/SectionCard";
import { StatusTag } from "../common/StatusTag";
import { toast } from "sonner";
import { Eye, EyeOff, RefreshCw, Save, Server, Database, Cpu, Globe } from "lucide-react";
import { api, type CrawlTask, type DashboardOverview, type SchedulerStatusData, type SystemSettings } from "../../services/api";

const SOURCE_LABELS: Record<string, string> = {
  fang: "房天下",
  anjuke_mobile: "安居客移动端",
  lianjia: "链家",
};

const SCHEDULER_SOURCE_OPTIONS = ["fang", "anjuke_mobile", "lianjia"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label style={{ fontSize: 13 }}>{label}</Label>
      {children}
    </div>
  );
}

function toNumber(value: string, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function maskStatus(settings: SystemSettings | null) {
  if (!settings?.deepseek.api_key_configured) return "未配置";
  return settings.deepseek.api_key_masked || "已配置";
}

function formatDateTime(value?: string | null) {
  if (!value) return "--";
  return value.length > 19 ? value.slice(0, 19) : value;
}

export function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatusData | null>(null);
  const [runtimeOverview, setRuntimeOverview] = useState<DashboardOverview | null>(null);
  const [runtimeTasks, setRuntimeTasks] = useState<CrawlTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadSettings = () => {
    setLoading(true);
    Promise.all([
      api.getSettings(),
      api.getSchedulerStatus().catch(() => null),
      api.getOverview().catch(() => null),
      api.getCrawlTasks(1, 100).catch(() => null),
    ])
      .then(([data, scheduler, overview, crawlTasks]) => {
        setSettings(data);
        setSchedulerStatus(scheduler);
        setRuntimeOverview(overview);
        setRuntimeTasks(crawlTasks?.items ?? []);
        setApiKey("");
        setError(null);
      })
      .catch(err => {
        const message = err instanceof Error ? err.message : "设置加载失败";
        setSettings(null);
        setError(message);
        toast.error(message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const updateCrawler = (patch: Partial<SystemSettings["crawler"]>) => {
    setSettings(prev => prev ? { ...prev, crawler: { ...prev.crawler, ...patch } } : prev);
  };

  const updateSource = (key: string, enabled: boolean) => {
    setSettings(prev => prev ? {
      ...prev,
      crawler: {
        ...prev.crawler,
        sources: {
          ...prev.crawler.sources,
          [key]: { ...(prev.crawler.sources[key] || {}), enabled },
        },
      },
    } : prev);
  };

  const updateScheduler = (patch: Partial<SystemSettings["scheduler"]>) => {
    setSettings(prev => prev ? { ...prev, scheduler: { ...prev.scheduler, ...patch } } : prev);
  };

  const updateDeepSeek = (patch: Partial<SystemSettings["deepseek"]>) => {
    setSettings(prev => prev ? { ...prev, deepseek: { ...prev.deepseek, ...patch } } : prev);
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const payload: Partial<SystemSettings> = {
        crawler: settings.crawler,
        scheduler: settings.scheduler,
        deepseek: {
          enabled: settings.deepseek.enabled,
          base_url: settings.deepseek.base_url,
          model: settings.deepseek.model,
          timeout: settings.deepseek.timeout,
          ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
        },
      };
      const next = await api.updateSettings(payload);
      setSettings(next);
      setApiKey("");
      setError(null);
      toast.success("设置已保存");
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const clearApiKey = async () => {
    setSaving(true);
    try {
      const next = await api.updateSettings({ deepseek: { clear_api_key: true } });
      setSettings(next);
      setApiKey("");
      toast.success("API Key 已清除");
    } catch (err) {
      const message = err instanceof Error ? err.message : "清除失败";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const testDeepSeek = async () => {
    setTesting(true);
    try {
      if (apiKey.trim()) {
        const next = await api.updateSettings({ deepseek: { ...settings?.deepseek, api_key: apiKey.trim() } });
        setSettings(next);
        setApiKey("");
      }
      const result = await api.testDeepSeek();
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "连接测试失败";
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const sourceEntries = Object.entries(settings?.crawler.sources ?? {});
  const schedulerJobs = schedulerStatus?.jobs ?? [];
  const incrementalJob = schedulerJobs.find(item => item.id === "incremental_crawl") ?? null;
  const qualityJob = schedulerJobs.find(item => item.id === "quality_report_snapshot") ?? null;
  const recentAutoTasks = useMemo(
    () => runtimeTasks.filter(item => item.mode === "scheduled_incremental" || item.mode === "manual_incremental").slice(0, 5),
    [runtimeTasks],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ color: "#163A70", fontSize: 18, fontWeight: 700 }}>系统设置</h2>
        </div>
        <div className="flex gap-2">
          <StatusTag status={loading ? "running" : error ? "failed" : "success"} label={loading ? "加载中" : error ? "接口异常" : "后端设置"} />
          <Button variant="outline" size="sm" onClick={loadSettings} disabled={loading} className="flex items-center gap-1.5">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />刷新
          </Button>
          <Button size="sm" onClick={saveSettings} disabled={!settings || saving} className="flex items-center gap-1.5" style={{ background: "#163A70", color: "#fff" }}>
            <Save size={13} />{saving ? "保存中..." : "保存设置"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3" style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: 13 }}>
          设置加载失败：{error}
        </div>
      )}

      <Tabs defaultValue="sources">
        <TabsList>
          {["sources", "crawl", "schedule", "api", "runtime"].map((t, i) => (
            <TabsTrigger key={t} value={t} style={{ fontSize: 13 }}>
              {["数据源", "采集策略", "调度设置", "Agent 配置", "运行信息"][i]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="sources">
          <div className="mt-4">
            <SectionCard title="数据源开关">
              <div className="flex flex-col gap-4">
                {sourceEntries.length === 0 && (
                  <div style={{ fontSize: 13, color: "#9CA3AF", padding: 20 }}>
                    暂无数据源配置。
                  </div>
                )}
                {sourceEntries.map(([key, cfg]) => (
                  <div key={key} className="p-4 rounded-xl" style={{ border: "1px solid #E5EAF2" }}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Switch checked={Boolean(cfg.enabled)} onCheckedChange={checked => updateSource(key, checked)} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#1F2937" }}>{SOURCE_LABELS[key] ?? key}</div>
                          <div style={{ fontSize: 12, color: "#9CA3AF" }}>source key: {key}</div>
                        </div>
                      </div>
                      <StatusTag status={cfg.enabled ? "success" : "default"} label={cfg.enabled ? "启用" : "禁用"} />
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="crawl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
            <SectionCard title="采集参数">
              <div className="flex flex-col gap-4">
                <Field label="默认并发数">
                  <Input type="number" value={settings?.crawler.max_workers ?? ""} min={1} max={10}
                    onChange={e => updateCrawler({ max_workers: toNumber(e.target.value, 3) })} style={{ fontSize: 13 }} />
                </Field>
                <Field label="每区最大页数">
                  <Input type="number" value={settings?.crawler.max_pages_per_district ?? ""} min={1} max={500}
                    onChange={e => updateCrawler({ max_pages_per_district: toNumber(e.target.value, 200) })} style={{ fontSize: 13 }} />
                </Field>
                <Field label="请求超时 (秒)">
                  <Input type="number" value={settings?.crawler.request_timeout ?? ""}
                    onChange={e => updateCrawler({ request_timeout: toNumber(e.target.value, 15) })} style={{ fontSize: 13 }} />
                </Field>
                <Field label="失败重试次数">
                  <Input type="number" value={settings?.crawler.retry_times ?? ""} min={0} max={5}
                    onChange={e => updateCrawler({ retry_times: toNumber(e.target.value, 2) })} style={{ fontSize: 13 }} />
                </Field>
                <Field label="最小请求间隔 (秒)">
                  <Input type="number" value={settings?.crawler.interval_min ?? ""} step="0.1"
                    onChange={e => updateCrawler({ interval_min: toNumber(e.target.value, 1) })} style={{ fontSize: 13 }} />
                </Field>
                <Field label="最大请求间隔 (秒)">
                  <Input type="number" value={settings?.crawler.interval_max ?? ""} step="0.1"
                    onChange={e => updateCrawler({ interval_max: toNumber(e.target.value, 3) })} style={{ fontSize: 13 }} />
                </Field>
              </div>
            </SectionCard>

            <SectionCard title="存储">
              <div className="flex flex-col gap-3" style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.8 }}>
                <p>运行期数据写入 MySQL。</p>
                <p>去重、快照和质量评分由后端处理。</p>
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="schedule">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
            <SectionCard title="调度总开关">
              <div className="flex flex-col gap-4">
                <div className="rounded-xl px-4 py-3" style={{ background: "#F8FAFC", border: "1px solid #E5EAF2", fontSize: 12, color: "#6B7280", lineHeight: 1.7 }}>
                  只控制自动任务开关，不改历史数据。
                </div>
                <label className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #E5EAF2" }}>
                  <span style={{ fontSize: 13, color: "#1F2937" }}>启用 APScheduler</span>
                  <Switch checked={Boolean(settings?.scheduler.enabled)} onCheckedChange={checked => updateScheduler({ enabled: checked })} />
                </label>
                <Field label="时区">
                  <Input value={settings?.scheduler.timezone ?? ""} onChange={e => updateScheduler({ timezone: e.target.value })} style={{ fontSize: 13 }} />
                </Field>
                <label className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #E5EAF2" }}>
                  <span style={{ fontSize: 13, color: "#1F2937" }}>质量报告定时任务</span>
                  <Switch checked={Boolean(settings?.scheduler.quality_report_job_enabled)} onCheckedChange={checked => updateScheduler({ quality_report_job_enabled: checked })} />
                </label>
                <Field label="质量报告间隔 (小时)">
                  <Input type="number" value={settings?.scheduler.quality_report_interval_hours ?? ""}
                    onChange={e => updateScheduler({ quality_report_interval_hours: toNumber(e.target.value, 6) })} style={{ fontSize: 13 }} />
                </Field>
              </div>
            </SectionCard>

            <SectionCard title="增量采集定时任务">
              <div className="flex flex-col gap-4">
                <div className="rounded-xl px-4 py-3" style={{ background: "#F8FAFC", border: "1px solid #E5EAF2", fontSize: 12, color: "#6B7280", lineHeight: 1.7 }}>
                  默认：房天下 / 全区县 / 24 小时 / 每区 1 页 / 并发 3。
                </div>
                <label className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #E5EAF2" }}>
                  <span style={{ fontSize: 13, color: "#1F2937" }}>启用增量采集任务</span>
                  <Switch checked={Boolean(settings?.scheduler.incremental_crawl_job_enabled)} onCheckedChange={checked => updateScheduler({ incremental_crawl_job_enabled: checked })} />
                </label>
                <Field label="采集间隔 (小时)">
                  <Input type="number" value={settings?.scheduler.incremental_crawl_interval_hours ?? ""}
                    onChange={e => updateScheduler({ incremental_crawl_interval_hours: toNumber(e.target.value, 24) })} style={{ fontSize: 13 }} />
                </Field>
                <Field label="数据源">
                  <Select
                    value={settings?.scheduler.incremental_crawl_source ?? "fang"}
                    onValueChange={value => updateScheduler({ incremental_crawl_source: value })}
                  >
                    <SelectTrigger style={{ fontSize: 13 }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHEDULER_SOURCE_OPTIONS.map(source => (
                        <SelectItem key={source} value={source}>
                          {SOURCE_LABELS[source] ?? source}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="区县，英文逗号分隔">
                  <Input value={settings?.scheduler.incremental_crawl_districts ?? "全部"}
                    onChange={e => updateScheduler({ incremental_crawl_districts: e.target.value })} style={{ fontSize: 13 }} />
                  <span style={{ fontSize: 11, color: "#9CA3AF" }}>留空或“全部”表示全区县。</span>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="每区页数">
                    <Input type="number" value={settings?.scheduler.incremental_crawl_max_pages ?? ""}
                      onChange={e => updateScheduler({ incremental_crawl_max_pages: toNumber(e.target.value, 1) })} style={{ fontSize: 13 }} />
                  </Field>
                  <Field label="并发数">
                    <Input type="number" value={settings?.scheduler.incremental_crawl_max_workers ?? ""}
                      onChange={e => updateScheduler({ incremental_crawl_max_workers: toNumber(e.target.value, 3) })} style={{ fontSize: 13 }} />
                  </Field>
                </div>
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="api">
          <div className="flex flex-col gap-5 mt-4">
            <SectionCard title="DeepSeek Agent 配置">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <label className="flex items-center justify-between py-2 lg:col-span-2" style={{ borderBottom: "1px solid #E5EAF2" }}>
                  <span style={{ fontSize: 13, color: "#1F2937" }}>启用 DeepSeek</span>
                  <Switch checked={Boolean(settings?.deepseek.enabled)} onCheckedChange={checked => updateDeepSeek({ enabled: checked })} />
                </label>
                <Field label="Base URL">
                  <Input value={settings?.deepseek.base_url ?? ""} onChange={e => updateDeepSeek({ base_url: e.target.value })} style={{ fontSize: 13, fontFamily: "monospace" }} />
                </Field>
                <Field label="模型">
                  <Input value={settings?.deepseek.model ?? ""} onChange={e => updateDeepSeek({ model: e.target.value })} style={{ fontSize: 13 }} />
                </Field>
                <Field label="超时 (秒)">
                  <Input type="number" value={settings?.deepseek.timeout ?? ""} onChange={e => updateDeepSeek({ timeout: toNumber(e.target.value, 20) })} style={{ fontSize: 13 }} />
                </Field>
                <Field label={`API Key 状态：${maskStatus(settings)}`}>
                  <div className="relative">
                    <Input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      placeholder="留空则不修改"
                      className="pr-9 font-mono"
                      style={{ fontSize: 12 }}
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowKey(v => !v)}>
                      {showKey ? <EyeOff size={13} style={{ color: "#9CA3AF" }} /> : <Eye size={13} style={{ color: "#9CA3AF" }} />}
                    </button>
                  </div>
                </Field>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" onClick={testDeepSeek} disabled={!settings || testing} style={{ background: "#163A70", color: "#fff", fontSize: 12 }}>
                  {testing ? "测试中..." : "测试连接"}
                </Button>
                <Button size="sm" variant="outline" onClick={clearApiKey} disabled={!settings || saving || !settings.deepseek.api_key_configured} style={{ fontSize: 12 }}>
                  清除密钥
                </Button>
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="runtime">
          <div className="mt-4">
            <SectionCard title="运行信息">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    icon: <Server size={20} style={{ color: "#163A70" }} />,
                    title: "后端服务",
                    items: [
                      "Flask + Gunicorn",
                      schedulerStatus?.running ? "APScheduler 运行中" : "APScheduler 未运行",
                      schedulerStatus?.lock_owner_pid ? `调度锁 PID ${schedulerStatus.lock_owner_pid}` : "无调度锁信息",
                    ],
                  },
                  {
                    icon: <Database size={20} style={{ color: "#163A70" }} />,
                    title: "MySQL 实时数据",
                    items: [
                      `当前房源 ${runtimeOverview?.kpis?.total_count?.toLocaleString?.() ?? "--"} 条`,
                      `分析就绪 ${runtimeOverview?.kpis?.analysis_ready_count?.toLocaleString?.() ?? "--"} 条`,
                      `最近更新 ${formatDateTime(runtimeOverview?.kpis?.latest_updated_at)}`,
                    ],
                  },
                  {
                    icon: <Cpu size={20} style={{ color: "#163A70" }} />,
                    title: "定时调度",
                    items: [
                      `增量采集 ${incrementalJob ? "已注册" : "未注册"}`,
                      `下次采集 ${formatDateTime(incrementalJob?.next_run_time)}`,
                      `下次质检 ${formatDateTime(qualityJob?.next_run_time)}`,
                    ],
                  },
                  {
                    icon: <Globe size={20} style={{ color: "#163A70" }} />,
                    title: "任务执行",
                    items: [
                      `历史任务 ${runtimeTasks.length || 0} 条`,
                      `最近自动任务 ${recentAutoTasks.length || 0} 条`,
                      settings?.scheduler.incremental_crawl_job_enabled ? "自动增量已启用" : "自动增量未启用",
                    ],
                  },
                ].map(({ icon, title, items }) => (
                  <div key={title} className="p-4 rounded-xl flex flex-col gap-3" style={{ background: "#F7F9FC", border: "1px solid #E5EAF2" }}>
                    <div className="flex items-center gap-2">
                      {icon}
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>{title}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {items.map(item => (
                        <span key={item} style={{ fontSize: 12, color: "#6B7280" }}>{item}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div
                className="mt-4 rounded-lg px-4 py-3"
                style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#1E3A8A", fontSize: 12, lineHeight: 1.8 }}
              >
                {schedulerStatus?.note || "当前页面展示的是服务器实时运行信息，可作为答辩时的调度与更新证据。"}
              </div>
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl p-4" style={{ background: "#fff", border: "1px solid #E5EAF2" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#163A70" }}>调度任务</div>
                  <div className="mt-3 flex flex-col gap-3">
                    {[incrementalJob, qualityJob].filter(Boolean).map(job => (
                      <div key={job?.id} className="rounded-lg px-3 py-2.5" style={{ background: "#F8FAFC" }}>
                        <div style={{ fontSize: 12, color: "#1F2937", fontWeight: 600 }}>{job?.name}</div>
                        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>
                          {job?.id} · 下次运行 {formatDateTime(job?.next_run_time)}
                        </div>
                      </div>
                    ))}
                    {schedulerJobs.length === 0 && (
                      <div style={{ fontSize: 12, color: "#9CA3AF" }}>当前 worker 未持有调度器实例，但系统已通过调度锁机制保证只有一个 worker 真正执行定时任务。</div>
                    )}
                  </div>
                </div>
                <div className="rounded-xl p-4" style={{ background: "#fff", border: "1px solid #E5EAF2" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#163A70" }}>最近自动/增量任务</div>
                  <div className="mt-3 flex flex-col gap-3">
                    {recentAutoTasks.map(task => (
                      <div key={task.id} className="rounded-lg px-3 py-2.5" style={{ background: "#F8FAFC" }}>
                        <div className="flex items-center justify-between gap-3">
                          <div style={{ fontSize: 12, color: "#1F2937", fontWeight: 600 }}>
                            #{task.id} · {task.name}
                          </div>
                          <StatusTag status={task.status} label={task.status} />
                        </div>
                        <div style={{ fontSize: 11, color: "#6B7280", marginTop: 4 }}>
                          {task.mode} · 新增 {task.inserted_count} · 价格变化 {task.updated_count} · 结束 {formatDateTime(task.finished_at)}
                        </div>
                      </div>
                    ))}
                    {recentAutoTasks.length === 0 && (
                      <div style={{ fontSize: 12, color: "#9CA3AF" }}>当前还没有近期自动增量任务记录。</div>
                    )}
                  </div>
                </div>
              </div>
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

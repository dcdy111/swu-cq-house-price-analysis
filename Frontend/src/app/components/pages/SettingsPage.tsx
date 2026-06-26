import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { SectionCard } from "../common/SectionCard";
import { StatusTag } from "../common/StatusTag";
import { toast } from "sonner";
import { Eye, EyeOff, RefreshCw, Save, Server, Database, Cpu, Globe } from "lucide-react";
import { api, type SystemSettings } from "../../services/api";

const SOURCE_LABELS: Record<string, string> = {
  fang: "房天下",
  anjuke_mobile: "安居客移动端",
  lianjia: "链家",
};

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

export function SettingsPage() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadSettings = () => {
    setLoading(true);
    api.getSettings()
      .then(data => {
        setSettings(data);
        setApiKey("");
        setError(null);
      })
      .catch(err => {
        const message = err instanceof Error ? err.message : "系统设置加载失败";
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
      toast.success("系统设置已保存到后端");
    } catch (err) {
      const message = err instanceof Error ? err.message : "系统设置保存失败";
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
      toast.success("DeepSeek API Key 已从后端清除");
    } catch (err) {
      const message = err instanceof Error ? err.message : "API Key 清除失败";
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
      const message = err instanceof Error ? err.message : "DeepSeek 连接测试失败";
      toast.error(message);
    } finally {
      setTesting(false);
    }
  };

  const sourceEntries = Object.entries(settings?.crawler.sources ?? {});

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 style={{ color: "#163A70", fontSize: 18, fontWeight: 700 }}>系统设置</h2>
          <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 2 }}>读取和保存后端 system_settings，不再使用前端静态状态</p>
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
          设置接口加载失败：{error}。当前页不会显示静态演示配置。
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
            <SectionCard title="数据源开关" subtitle="保存后将影响 CrawlerRegistry 的可用数据源判断">
              <div className="flex flex-col gap-4">
                {sourceEntries.length === 0 && (
                  <div style={{ fontSize: 13, color: "#9CA3AF", padding: 20 }}>
                    暂无后端数据源配置。
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

            <SectionCard title="存储说明">
              <div className="flex flex-col gap-3" style={{ fontSize: 13, color: "#4B5563", lineHeight: 1.8 }}>
                <p>运行期数据库统一使用后端配置的 MySQL，前端不保存数据库连接信息。</p>
                <p>去重、快照和质量评分逻辑由后端 service 层执行；本页只保存采集参数和数据源开关。</p>
                <p>保存设置后，新创建的采集任务会读取最新配置。</p>
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="schedule">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
            <SectionCard title="调度总开关">
              <div className="flex flex-col gap-4">
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
                <label className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #E5EAF2" }}>
                  <span style={{ fontSize: 13, color: "#1F2937" }}>启用增量采集任务</span>
                  <Switch checked={Boolean(settings?.scheduler.incremental_crawl_job_enabled)} onCheckedChange={checked => updateScheduler({ incremental_crawl_job_enabled: checked })} />
                </label>
                <Field label="采集间隔 (小时)">
                  <Input type="number" value={settings?.scheduler.incremental_crawl_interval_hours ?? ""}
                    onChange={e => updateScheduler({ incremental_crawl_interval_hours: toNumber(e.target.value, 12) })} style={{ fontSize: 13 }} />
                </Field>
                <Field label="数据源">
                  <Input value={settings?.scheduler.incremental_crawl_source ?? ""}
                    onChange={e => updateScheduler({ incremental_crawl_source: e.target.value })} style={{ fontSize: 13 }} />
                </Field>
                <Field label="区县，英文逗号分隔">
                  <Input value={settings?.scheduler.incremental_crawl_districts ?? ""}
                    onChange={e => updateScheduler({ incremental_crawl_districts: e.target.value })} style={{ fontSize: 13 }} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="每区页数">
                    <Input type="number" value={settings?.scheduler.incremental_crawl_max_pages ?? ""}
                      onChange={e => updateScheduler({ incremental_crawl_max_pages: toNumber(e.target.value, 1) })} style={{ fontSize: 13 }} />
                  </Field>
                  <Field label="并发数">
                    <Input type="number" value={settings?.scheduler.incremental_crawl_max_workers ?? ""}
                      onChange={e => updateScheduler({ incremental_crawl_max_workers: toNumber(e.target.value, 2) })} style={{ fontSize: 13 }} />
                  </Field>
                </div>
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="api">
          <div className="flex flex-col gap-5 mt-4">
            <SectionCard title="DeepSeek Agent 配置" subtitle="API Key 保存到后端，前端只显示 masked 状态">
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
                      placeholder="留空则不覆盖后端 API Key"
                      className="pr-9 font-mono"
                      style={{ fontSize: 12 }}
                    />
                    <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowKey(v => !v)}>
                      {showKey ? <EyeOff size={13} style={{ color: "#9CA3AF" }} /> : <Eye size={13} style={{ color: "#9CA3AF" }} />}
                    </button>
                  </div>
                </Field>
              </div>
              <div className="flex gap-2 mt-4">
                <Button size="sm" onClick={testDeepSeek} disabled={!settings || testing} style={{ background: "#163A70", color: "#fff", fontSize: 12 }}>
                  {testing ? "测试中..." : "测试真实连接"}
                </Button>
                <Button size="sm" variant="outline" onClick={clearApiKey} disabled={!settings || saving || !settings.deepseek.api_key_configured} style={{ fontSize: 12 }}>
                  清除后端 API Key
                </Button>
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="runtime">
          <div className="mt-4">
            <SectionCard title="运行信息" subtitle="本轮暂不部署，以下仅为当前项目运行依赖说明">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { icon: <Server size={20} style={{ color: "#163A70" }} />, title: "后端", items: ["Flask API", "本地鉴权", "system_settings"] },
                  { icon: <Database size={20} style={{ color: "#163A70" }} />, title: "数据库", items: ["MySQL 8.x", "真实房源表", "快照与日志表"] },
                  { icon: <Cpu size={20} style={{ color: "#163A70" }} />, title: "任务", items: ["多线程采集", "取消任务", "APScheduler"] },
                  { icon: <Globe size={20} style={{ color: "#163A70" }} />, title: "前端", items: ["Vite", "真实 API 数据", "无 mock 兜底"] },
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
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

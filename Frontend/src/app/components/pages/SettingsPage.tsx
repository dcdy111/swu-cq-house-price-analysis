import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { SectionCard } from "../common/SectionCard";
import { StatusTag } from "../common/StatusTag";
import { toast } from "sonner";
import { Eye, EyeOff, CheckCircle, Server, Database, Cpu, Globe, ChevronDown, ChevronUp, Zap } from "lucide-react";

const SOURCES = [
  { name: "链家", url: "https://cq.lianjia.com", enabled: true, status: "success" as const, count: "33,500" },
  { name: "贝壳找房", url: "https://cq.ke.com", enabled: true, status: "success" as const, count: "12,000" },
  { name: "安居客", url: "https://cq.anjuke.com", enabled: true, status: "failed" as const, count: "2,720" },
  { name: "自定义数据源", url: "http://custom-api.internal", enabled: false, status: "default" as const, count: "—" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label style={{ fontSize: 13 }}>{label}</Label>
      {children}
    </div>
  );
}

const MODEL_PROVIDERS = [
  {
    id: "deepseek",
    name: "DeepSeek",
    badge: "默认",
    tagline: "深度求索 · 国产领先大模型",
    color: "#163A70",
    models: ["deepseek-v3", "deepseek-r1", "deepseek-chat"],
    defaultModel: "deepseek-v3",
    endpoint: "https://api.deepseek.com/v1",
    keyPlaceholder: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    defaultKey: "sk-deepseek-xxxxxxxxxxxxxxxxxxxx",
    enabled: true,
  },
  {
    id: "qwen",
    name: "通义千问",
    badge: "阿里云",
    tagline: "阿里云 · 通义千问系列",
    color: "#7C3AED",
    models: ["qwen-max", "qwen-plus", "qwen-turbo", "qwen-long"],
    defaultModel: "qwen-max",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    keyPlaceholder: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    defaultKey: "",
    enabled: false,
  },
  {
    id: "ernie",
    name: "文心一言",
    badge: "百度",
    tagline: "百度智能云 · 文心大模型",
    color: "#0284C7",
    models: ["ERNIE-4.0-8K", "ERNIE-3.5-8K", "ERNIE-Speed-8K"],
    defaultModel: "ERNIE-4.0-8K",
    endpoint: "https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat",
    keyPlaceholder: "API Key（同时需要 Secret Key）",
    defaultKey: "",
    enabled: false,
  },
  {
    id: "glm",
    name: "智谱 AI",
    badge: "GLM",
    tagline: "智谱 · ChatGLM 系列",
    color: "#059669",
    models: ["glm-4", "glm-4-flash", "glm-3-turbo"],
    defaultModel: "glm-4",
    endpoint: "https://open.bigmodel.cn/api/paas/v4",
    keyPlaceholder: "xxxxxxxx.xxxxxxxxxxxx",
    defaultKey: "",
    enabled: false,
  },
  {
    id: "moonshot",
    name: "月之暗面",
    badge: "Kimi",
    tagline: "Moonshot AI · Kimi 长文本模型",
    color: "#DB2777",
    models: ["moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k"],
    defaultModel: "moonshot-v1-32k",
    endpoint: "https://api.moonshot.cn/v1",
    keyPlaceholder: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    defaultKey: "",
    enabled: false,
  },
  {
    id: "minimax",
    name: "MiniMax",
    badge: "海螺",
    tagline: "MiniMax · ABAB 多模态大模型",
    color: "#EA580C",
    models: ["abab6.5-chat", "abab5.5-chat"],
    defaultModel: "abab6.5-chat",
    endpoint: "https://api.minimax.chat/v1",
    keyPlaceholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    defaultKey: "",
    enabled: false,
  },
  {
    id: "spark",
    name: "讯飞星火",
    badge: "科大讯飞",
    tagline: "科大讯飞 · 星火认知大模型",
    color: "#0369A1",
    models: ["spark-max", "spark-pro", "spark-lite"],
    defaultModel: "spark-max",
    endpoint: "https://spark-api-open.xf-yun.com/v1",
    keyPlaceholder: "API Key",
    defaultKey: "",
    enabled: false,
  },
  {
    id: "baichuan",
    name: "百川",
    badge: "Baichuan",
    tagline: "百川智能 · 百川大模型",
    color: "#B45309",
    models: ["Baichuan4", "Baichuan3-Turbo", "Baichuan2-Turbo"],
    defaultModel: "Baichuan4",
    endpoint: "https://api.baichuan-ai.com/v1",
    keyPlaceholder: "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    defaultKey: "",
    enabled: false,
  },
];

function ApiProviderCard({ provider, isActive, onSetActive }: {
  provider: typeof MODEL_PROVIDERS[0];
  isActive: boolean;
  onSetActive: () => void;
}) {
  const [enabled, setEnabled] = useState(provider.enabled);
  const [expanded, setExpanded] = useState(provider.enabled);
  const [showKey, setShowKey] = useState(false);
  const [apiKey, setApiKey] = useState(provider.defaultKey);
  const [endpoint, setEndpoint] = useState(provider.endpoint);
  const [selectedModel, setSelectedModel] = useState(provider.defaultModel);

  return (
    <div className="rounded-xl overflow-hidden transition-all"
      style={{ border: `1.5px solid ${isActive ? provider.color : "#E5EAF2"}`, background: "#fff" }}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Color dot + name */}
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${provider.color}18` }}>
          <div className="w-3 h-3 rounded-full" style={{ background: provider.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>{provider.name}</span>
            <span className="px-1.5 py-0.5 rounded" style={{ fontSize: 10, background: `${provider.color}18`, color: provider.color, fontWeight: 600 }}>{provider.badge}</span>
            {isActive && (
              <span className="px-1.5 py-0.5 rounded flex items-center gap-1" style={{ fontSize: 10, background: "#DCFCE7", color: "#16A34A", fontWeight: 600 }}>
                <Zap size={9} />当前使用
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 1 }}>{provider.tagline}</div>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={enabled} onCheckedChange={v => { setEnabled(v); if (!v && isActive) toast.info("已关闭，请切换到其他模型"); }} />
          {enabled && (
            <button
              className="px-2.5 py-1 rounded-lg transition-colors"
              style={{ fontSize: 11, background: isActive ? provider.color : "#F7F9FC", color: isActive ? "#fff" : "#6B7280", border: `1px solid ${isActive ? provider.color : "#E5EAF2"}` }}
              onClick={onSetActive}>
              {isActive ? "使用中" : "设为当前"}
            </button>
          )}
          <button onClick={() => setExpanded(v => !v)} style={{ color: "#9CA3AF" }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded config */}
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-3" style={{ borderTop: "1px solid #E5EAF2" }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <Field label="API Key">
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={provider.keyPlaceholder}
                  className="pr-9 font-mono"
                  style={{ fontSize: 12 }}
                />
                <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowKey(v => !v)}>
                  {showKey ? <EyeOff size={13} style={{ color: "#9CA3AF" }} /> : <Eye size={13} style={{ color: "#9CA3AF" }} />}
                </button>
              </div>
            </Field>
            <Field label="接入端点 (Endpoint)">
              <Input value={endpoint} onChange={e => setEndpoint(e.target.value)} style={{ fontSize: 12, fontFamily: "monospace" }} />
            </Field>
            <Field label="模型版本">
              <select
                value={selectedModel}
                onChange={e => setSelectedModel(e.target.value)}
                className="w-full rounded-md px-3 h-9 outline-none"
                style={{ fontSize: 12, border: "1px solid #E5EAF2", background: "#fff", color: "#1F2937" }}>
                {provider.models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Temperature">
              <Input type="number" defaultValue="0.7" step="0.1" min="0" max="2" style={{ fontSize: 12 }} />
            </Field>
          </div>
          <div className="flex gap-2 mt-1">
            <Button size="sm" style={{ background: provider.color, color: "#fff", fontSize: 12, height: 30 }}
              onClick={() => toast.success(`${provider.name} 连接测试成功（演示模式）`)}>
              测试连接
            </Button>
            <Button size="sm" variant="outline" style={{ fontSize: 12, height: 30 }}
              onClick={() => toast.success(`${provider.name} 配置已保存（演示模式）`)}>
              保存
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsPage() {
  const [showKey, setShowKey] = useState(false);
  const [activeProvider, setActiveProvider] = useState("deepseek");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 style={{ color: "#163A70", fontSize: 18, fontWeight: 700 }}>系统设置</h2>
        <p style={{ color: "#9CA3AF", fontSize: 13, marginTop: 2 }}>配置系统基础参数、数据源、采集策略及 API 密钥</p>
      </div>

      <Tabs defaultValue="basic">
        <TabsList>
          {["basic", "sources", "crawl", "schedule", "api", "deploy"].map((t, i) => (
            <TabsTrigger key={t} value={t} style={{ fontSize: 13 }}>
              {["基础设置", "数据源", "采集策略", "调度设置", "API 密钥", "部署信息"][i]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="basic">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
            <SectionCard title="基础信息">
              <div className="flex flex-col gap-4">
                <Field label="系统名称">
                  <Input defaultValue="重庆二手房价格数据分析与智能可视化系统" style={{ fontSize: 13 }} />
                </Field>
                <Field label="系统版本">
                  <Input defaultValue="v2.3.1" style={{ fontSize: 13 }} readOnly />
                </Field>
                <Field label="管理员邮箱">
                  <Input defaultValue="admin@swu.edu.cn" style={{ fontSize: 13 }} />
                </Field>
                <Field label="数据刷新间隔 (分钟)">
                  <Input type="number" defaultValue="30" style={{ fontSize: 13 }} />
                </Field>
                <Button style={{ background: "#163A70", color: "#fff", fontSize: 13, width: "fit-content" }}
                  onClick={() => toast.success("设置已保存（演示模式）")}>
                  保存设置
                </Button>
              </div>
            </SectionCard>

            <SectionCard title="界面设置">
              <div className="flex flex-col gap-4">
                {[
                  { label: "显示数据更新时间", defaultChecked: true },
                  { label: "启用深色模式", defaultChecked: false },
                  { label: "侧栏默认展开", defaultChecked: true },
                  { label: "图表动画效果", defaultChecked: true },
                  { label: "消息通知提醒", defaultChecked: true },
                ].map(({ label, defaultChecked }) => (
                  <div key={label} className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid #E5EAF2" }}>
                    <span style={{ fontSize: 13, color: "#1F2937" }}>{label}</span>
                    <Switch defaultChecked={defaultChecked} />
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="sources">
          <div className="mt-4">
            <SectionCard title="数据源配置" subtitle="管理房产数据采集来源">
              <div className="flex flex-col gap-4">
                {SOURCES.map(src => (
                  <div key={src.name} className="p-4 rounded-xl" style={{ border: "1px solid #E5EAF2" }}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Switch defaultChecked={src.enabled} />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#1F2937" }}>{src.name}</div>
                          <div style={{ fontSize: 12, color: "#9CA3AF" }}>{src.url}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span style={{ fontSize: 12, color: "#6B7280" }}>已采集: {src.count}</span>
                        <StatusTag status={src.status} label={src.status === "success" ? "连接正常" : src.status === "failed" ? "连接失败" : "未启用"} />
                        <Button size="sm" variant="outline" style={{ fontSize: 12 }}
                          onClick={() => toast.info(`测试连接 ${src.name}... （演示模式）`)}>
                          测试连接
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                <Button variant="outline" style={{ fontSize: 13, width: "fit-content" }}
                  onClick={() => toast.info("演示模式")}>
                  + 添加自定义数据源
                </Button>
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="crawl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-4">
            <SectionCard title="采集参数">
              <div className="flex flex-col gap-4">
                <Field label="默认并发数">
                  <Input type="number" defaultValue="5" style={{ fontSize: 13 }} />
                </Field>
                <Field label="请求超时 (秒)">
                  <Input type="number" defaultValue="30" style={{ fontSize: 13 }} />
                </Field>
                <Field label="重试次数">
                  <Input type="number" defaultValue="3" style={{ fontSize: 13 }} />
                </Field>
                <Field label="请求间隔 (毫秒)">
                  <Input type="number" defaultValue="500" style={{ fontSize: 13 }} />
                </Field>
                <Field label="User-Agent 轮换">
                  <Switch defaultChecked={true} />
                </Field>
                <Field label="IP 代理池">
                  <Input defaultValue="proxy.internal:3128" style={{ fontSize: 13, fontFamily: "monospace" }} />
                </Field>
                <Button style={{ background: "#163A70", color: "#fff", fontSize: 13, width: "fit-content" }}
                  onClick={() => toast.success("保存成功（演示模式）")}>保存</Button>
              </div>
            </SectionCard>

            <SectionCard title="存储配置">
              <div className="flex flex-col gap-4">
                <Field label="MySQL 主机">
                  <Input defaultValue="localhost" style={{ fontSize: 13 }} />
                </Field>
                <Field label="端口">
                  <Input defaultValue="3306" style={{ fontSize: 13 }} />
                </Field>
                <Field label="数据库名">
                  <Input defaultValue="chongqing_housing" style={{ fontSize: 13 }} />
                </Field>
                <Field label="去重策略">
                  <Input defaultValue="URL + 价格 + 面积 hash" style={{ fontSize: 13 }} />
                </Field>
                <Field label="数据保留天数">
                  <Input type="number" defaultValue="365" style={{ fontSize: 13 }} />
                </Field>
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="schedule">
          <div className="mt-4">
            <SectionCard title="调度计划" subtitle="配置自动采集 Cron 表达式">
              <div className="flex flex-col gap-4">
                {[
                  { name: "全量采集 (每日)", cron: "0 2 * * *", enabled: true },
                  { name: "增量更新 (每6小时)", cron: "0 */6 * * *", enabled: true },
                  { name: "模型重训练 (每周)", cron: "0 4 * * 1", enabled: true },
                  { name: "数据清洗 (每天凌晨)", cron: "0 3 * * *", enabled: false },
                ].map(({ name, cron, enabled }) => (
                  <div key={name} className="flex items-center gap-4 p-4 rounded-xl" style={{ border: "1px solid #E5EAF2" }}>
                    <Switch defaultChecked={enabled} />
                    <div className="flex-1">
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#1F2937" }}>{name}</div>
                    </div>
                    <code style={{ fontSize: 12, color: "#163A70", background: "#EFF6FF", padding: "2px 8px", borderRadius: 4 }}>{cron}</code>
                    <Button size="sm" variant="outline" style={{ fontSize: 12 }}
                      onClick={() => toast.info("演示模式")}>编辑</Button>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="api">
          <div className="flex flex-col gap-5 mt-4">
            {/* Active model banner */}
            <div className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ background: "linear-gradient(135deg, #163A70 0%, #1F4E8C 100%)", border: "1px solid #1F4E8C" }}>
              <div className="flex items-center gap-3">
                <Zap size={16} style={{ color: "#F59E0B" }} />
                <span style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>当前 Agent 使用模型</span>
                <span className="px-2.5 py-0.5 rounded-full" style={{ fontSize: 12, background: "rgba(255,255,255,0.15)", color: "#fff" }}>
                  {MODEL_PROVIDERS.find(p => p.id === activeProvider)?.name} · {MODEL_PROVIDERS.find(p => p.id === activeProvider)?.defaultModel}
                </span>
              </div>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>仅已启用的模型可设为当前</span>
            </div>

            {/* Provider cards */}
            <div className="flex flex-col gap-3">
              {MODEL_PROVIDERS.map(provider => (
                <ApiProviderCard
                  key={provider.id}
                  provider={provider}
                  isActive={activeProvider === provider.id}
                  onSetActive={() => { setActiveProvider(provider.id); toast.success(`已切换至 ${provider.name}`); }}
                />
              ))}
            </div>

            {/* Flask API settings below */}
            <SectionCard title="Flask API 设置" subtitle="后端服务接口参数">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="API 前缀">
                  <Input defaultValue="/api/v1" style={{ fontSize: 13 }} />
                </Field>
                <Field label="跨域白名单">
                  <Input defaultValue="http://localhost:5173" style={{ fontSize: 13 }} />
                </Field>
                <Field label="JWT 密钥">
                  <Input type="password" defaultValue="swu-housing-secret-2026" style={{ fontSize: 13 }} />
                </Field>
                <Field label="Token 有效期 (小时)">
                  <Input type="number" defaultValue="24" style={{ fontSize: 13 }} />
                </Field>
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="deploy">
          <div className="mt-4">
            <SectionCard title="部署信息" subtitle="当前运行环境与服务状态">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { icon: <Server size={20} style={{ color: "#163A70" }} />, title: "Web 服务", items: ["Flask 2.3.2", "Gunicorn 21.2.0", "Nginx 1.24"] },
                  { icon: <Database size={20} style={{ color: "#163A70" }} />, title: "数据库", items: ["MySQL 8.0.35", "Redis 7.2", "存储: 24.8 GB"] },
                  { icon: <Cpu size={20} style={{ color: "#163A70" }} />, title: "服务器", items: ["Ubuntu 22.04 LTS", "16核 64GB RAM", "CPU: 23%  MEM: 41%"] },
                  { icon: <Globe size={20} style={{ color: "#163A70" }} />, title: "前端", items: ["React 18.3", "Vite 5.4", "Tailwind CSS v4"] },
                ].map(({ icon, title, items }) => (
                  <div key={title} className="p-4 rounded-xl flex flex-col gap-3" style={{ background: "#F7F9FC", border: "1px solid #E5EAF2" }}>
                    <div className="flex items-center gap-2">
                      {icon}
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>{title}</span>
                      <CheckCircle size={14} style={{ color: "#16A34A", marginLeft: "auto" }} />
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

import { useState, useEffect, useRef } from "react";
import { Send, ChevronRight, Download, FileText, Sparkles, MessageSquare, X, Activity, ChevronDown, Clock, Pin, Pencil, Archive, Trash2, MoreHorizontal, Check } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { SESSIONS, MESSAGES, TOOL_TRACES, Message, ToolTrace } from "../../mock/chat";
import { DISTRICTS } from "../../mock/districts";
import { TREND_DATA } from "../../mock/trend";
import { toast } from "sonner";
import { api, type AgentToolCall, type GeneratedReport } from "../../services/api";

const SUGGESTIONS = [
  "近12月重庆房价走势如何？",
  "渝北区性价比最高的户型是？",
  "帮我生成市场分析报告",
  "哪个区县均价涨幅最大？",
];

// Mock thinking chain shown before assistant reply
const THINKING_CHAIN = `分析用户问题：比较渝北区与南岸区的二手房价格走势...

→ 调用工具：query_market_stats({ districts: ["渝北区", "南岸区"], metrics: ["avgPrice", "listing_count"] })

→ 获取到 12 个月挂牌价数据点，渝北区均价呈微下行趋势，南岸区受弹子石 CBD 开发驱动上涨...

→ 调用工具：get_model_result({ model: "xgboost_v2.3.1" })

→ 整合数据，准备生成对比分析回复。`;

function useTimer(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  return elapsed;
}

function formatTime(s: number) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function toToolTrace(call: AgentToolCall): ToolTrace {
  return {
    id: String(call.id),
    tool: call.tool_name,
    input: call.tool_args,
    output: call.tool_result,
    duration: call.duration_ms,
    status: call.status,
  };
}

function reportToHtml(report?: GeneratedReport | null) {
  if (!report) return buildReportHtml();
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${report.title}</title></head>
<body style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.8;color:#1F2937;">
${report.content
  .split("\n")
  .map(line => {
    if (line.startsWith("# ")) return `<h1>${line.slice(2)}</h1>`;
    if (line.startsWith("## ")) return `<h2>${line.slice(3)}</h2>`;
    if (line.startsWith("- ")) return `<p>• ${line.slice(2)}</p>`;
    return line.trim() ? `<p>${line}</p>` : "";
  })
  .join("\n")}
</body></html>`;
}

function ThinkingBubble({ elapsed }: { elapsed: number }) {
  const [dotsIdx, setDotsIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setDotsIdx(i => (i + 1) % 4), 400);
    return () => clearInterval(t);
  }, []);
  const dots = "...".slice(0, dotsIdx + 1).padEnd(3, " ");

  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#163A70" }}>
        <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>AI</span>
      </div>
      <div className="flex flex-col gap-2">
        {/* Thinking badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full self-start" style={{ background: "#F7F9FC", border: "1px solid #E5EAF2" }}>
          <div className="flex gap-1">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full" style={{
                background: "#163A70",
                opacity: dotsIdx === i ? 1 : 0.25,
                transition: "opacity 0.3s",
              }} />
            ))}
          </div>
          <span style={{ fontSize: 12, color: "#6B7280" }}>思考中</span>
          <span style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "monospace" }}>{formatTime(elapsed)}</span>
        </div>
      </div>
    </div>
  );
}

function ThinkingChainBlock({ chain, thinkTime }: { chain: string; thinkTime: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 mb-2 group">
        <Clock size={12} style={{ color: "#9CA3AF" }} />
        <span style={{ fontSize: 12, color: "#9CA3AF" }}>已思考 {thinkTime}</span>
        <ChevronDown size={12} style={{ color: "#9CA3AF", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mb-3 px-3 py-2.5 rounded-xl text-xs font-mono" style={{
          background: "#F8FAFC",
          border: "1px solid #E5EAF2",
          color: "#6B7280",
          lineHeight: 1.8,
          whiteSpace: "pre-wrap",
          maxHeight: 160,
          overflow: "auto",
        }}>
          {chain}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function MessageBubble({ msg }: { msg: Message & { thinkTime?: string; thinking?: string } }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: isUser ? "#E67E22" : "#163A70" }}>
        <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>{isUser ? "我" : "AI"}</span>
      </div>
      <div className={`flex flex-col gap-1 max-w-[80%]`}>
        {/* Thinking chain for assistant */}
        {!isUser && (msg as any).thinkTime && (
          <ThinkingChainBlock chain={(msg as any).thinking ?? THINKING_CHAIN} thinkTime={(msg as any).thinkTime} />
        )}
        <div className="rounded-2xl px-4 py-3" style={{
          background: isUser ? "#163A70" : "#fff",
          border: isUser ? "none" : "1px solid #E5EAF2",
          color: isUser ? "#fff" : "#1F2937",
          fontSize: 13,
          lineHeight: 1.75,
          boxShadow: isUser ? "none" : "0 1px 3px rgba(0,0,0,0.04)",
        }}>
          <div dangerouslySetInnerHTML={{ __html: msg.content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br/>')
          }} />
        </div>
        {/* Sources */}
        {msg.sources && msg.sources.length > 0 && (
          <div className="flex flex-col gap-1 mt-1">
            {msg.sources.map((s, i) => (
              <div key={i} className="px-3 py-2 rounded-xl" style={{ background: "#F7F9FC", border: "1px solid #E5EAF2", fontSize: 12 }}>
                <div style={{ color: "#163A70", fontWeight: 500, marginBottom: 2 }}>📎 {s.title}</div>
                <div style={{ color: "#6B7280" }}>{s.excerpt}</div>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, color: "#C4C9D4", textAlign: isUser ? "right" : "left", marginTop: 2 }}>{msg.timestamp}</div>
      </div>
    </div>
  );
}

function downloadTextFile(filename: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildReportHtml() {
  const top = DISTRICTS[0];
  const latest = TREND_DATA[TREND_DATA.length - 1];
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>重庆二手房市场分析报告</title></head>
<body style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.8;color:#1F2937;">
<h1>2026年H1重庆二手房挂牌价市场分析报告</h1>
<h2>一、核心结论</h2>
<p>截至 ${latest.month}，全市样例挂牌均价为 ${latest.avgPrice.toLocaleString()} 元/㎡，样本量覆盖 ${DISTRICTS.reduce((sum, item) => sum + item.count, 0).toLocaleString()} 套。</p>
<h2>二、区域对比</h2>
<p>${top.name} 挂牌均价 ${top.avgPrice.toLocaleString()} 元/㎡，在当前样例数据中位居第一；渝北、江北、南岸为重点样本覆盖区域。</p>
<h2>三、数据证据</h2>
<ul>
<li>工具 query_market_stats：返回区县均价、样本量、同比变化。</li>
<li>工具 get_chart_series：返回 12 个月挂牌均价趋势。</li>
<li>工具 get_model_result：返回模型 R²、MAE、RMSE 与特征重要性。</li>
</ul>
<h2>四、建议</h2>
<p>答辩展示时建议先展示重庆区县地图，再进入异常采集日志、模型解释和 Agent 工具调用证据。</p>
</body></html>`;
}

function buildAnswer(question: string): { content: string; traces: ToolTrace[]; thinking: string } {
  const normalized = question.trim();
  const yuBei = DISTRICTS.find(item => item.name === "渝北区")!;
  const nanAn = DISTRICTS.find(item => item.name === "南岸区")!;
  const top = [...DISTRICTS].sort((a, b) => b.change - a.change)[0];
  const latest = TREND_DATA[TREND_DATA.length - 1];

  const marketTrace: ToolTrace = {
    id: `TR${Date.now()}A`,
    tool: "query_market_stats",
    input: { question: normalized, metrics: ["avgPrice", "listing_count", "change"] },
    output: { total_districts: DISTRICTS.length, latest_month: latest.month, city_avg_price: latest.avgPrice },
    duration: 186,
    status: "success",
  };

  if (normalized.includes("报告")) {
    return {
      content: `**结论**\n已生成《2026年H1重庆二手房挂牌价市场分析报告》，右侧面板可下载可打印 HTML 或 Word 文档。\n\n**关键证据**\n- 当前样例覆盖 ${DISTRICTS.length} 个重庆区县\n- ${latest.month} 全市挂牌均价 ${latest.avgPrice.toLocaleString()} 元/㎡\n- ${DISTRICTS[0].name} 均价 ${DISTRICTS[0].avgPrice.toLocaleString()} 元/㎡，位居样例数据第一\n\n**可执行建议**\n答辩时按“地图分布 → 区县排行 → 模型指标 → Agent 工具调用证据”的顺序展示。`,
      traces: [
        marketTrace,
        {
          id: `TR${Date.now()}B`,
          tool: "generate_report",
          input: { title: "2026年H1重庆二手房挂牌价市场分析报告", sections: ["价格走势", "区域对比", "模型解释", "采集建议"] },
          output: { report_id: `RPT_${Date.now()}`, status: "generated", export_formats: ["html", "doc"] },
          duration: 942,
          status: "success",
        },
      ],
      thinking: "识别为报告生成请求...\n→ 调用 query_market_stats 获取市场统计...\n→ 调用 generate_report 生成报告结构...\n→ 返回报告摘要与下载入口...",
    };
  }

  if (normalized.includes("渝北") || normalized.includes("南岸")) {
    return {
      content: `**结论**\n渝北区样本量更大，挂牌均价为 ${yuBei.avgPrice.toLocaleString()} 元/㎡；南岸区挂牌均价为 ${nanAn.avgPrice.toLocaleString()} 元/㎡，当前高于渝北区。\n\n**关键证据**\n- 渝北区样本量 ${yuBei.count.toLocaleString()} 套，同比 ${yuBei.change > 0 ? "+" : ""}${yuBei.change}%\n- 南岸区样本量 ${nanAn.count.toLocaleString()} 套，同比 +${nanAn.change}%\n\n**可执行建议**\n如果要补采，优先对渝北区做增量维护，对南岸区做价格变化快照跟踪。`,
      traces: [
        marketTrace,
        {
          id: `TR${Date.now()}B`,
          tool: "get_chart_series",
          input: { districts: ["渝北区", "南岸区"], series: "price_trend" },
          output: { months: TREND_DATA.length, latest_avg_price: latest.avgPrice },
          duration: 121,
          status: "success",
        },
      ],
      thinking: THINKING_CHAIN,
    };
  }

  return {
    content: `**结论**\n当前样例数据中，${top.name} 同比涨幅最高，为 +${top.change}%；${latest.month} 全市挂牌均价为 ${latest.avgPrice.toLocaleString()} 元/㎡。\n\n**关键证据**\n- 区县覆盖：${DISTRICTS.length} 个\n- 总样本量：${DISTRICTS.reduce((sum, item) => sum + item.count, 0).toLocaleString()} 套\n- 数据质量均值：${(DISTRICTS.reduce((sum, item) => sum + item.quality, 0) / DISTRICTS.length).toFixed(1)} 分\n\n**可执行建议**\n可以继续追问某个区县，或点击右侧报告按钮生成答辩材料。`,
    traces: [marketTrace],
    thinking: "识别为市场问数请求...\n→ 调用 query_market_stats...\n→ 汇总区县指标并生成回答...",
  };
}

// Tool trace panel (right, collapsible)
function ActivityPanel({
  open,
  onClose,
  elapsed,
  traces,
  report,
}: {
  open: boolean;
  onClose: () => void;
  elapsed: number;
  traces: ToolTrace[];
  report?: GeneratedReport | null;
}) {
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  return (
    <div
      className="flex-shrink-0 flex flex-col transition-all duration-300 overflow-hidden"
      style={{
        width: open ? 320 : 0,
        borderLeft: open ? "1px solid #E5EAF2" : "none",
        background: "#fff",
      }}
    >
      {open && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid #E5EAF2" }}>
            <div className="flex items-center gap-2">
              <Activity size={14} style={{ color: "#163A70" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>活动</span>
              <span style={{ fontSize: 12, color: "#9CA3AF", fontFamily: "monospace" }}>· {formatTime(elapsed)}</span>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors">
              <X size={14} style={{ color: "#9CA3AF" }} />
            </button>
          </div>

          {/* Thinking section */}
          <div className="px-4 py-3" style={{ borderBottom: "1px solid #E5EAF2" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 8 }}>思考</div>
            <div className="flex flex-col gap-1.5">
              {traces.map(t => (
                <Collapsible key={t.id} open={expandedTool === t.id} onOpenChange={v => setExpandedTool(v ? t.id : null)}>
                  <CollapsibleTrigger className="w-full flex items-center gap-2 text-left group">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.status === "success" ? "#16A34A" : "#DC2626" }} />
                    <span style={{ fontSize: 12, color: "#374151", flex: 1 }}>{t.tool}</span>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>{t.duration}ms</span>
                    <ChevronDown size={11} style={{ color: "#9CA3AF", transform: expandedTool === t.id ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-1.5 rounded-lg p-2.5 font-mono" style={{ background: "#0F172A", fontSize: 10 }}>
                      <div style={{ color: "#475569", marginBottom: 3 }}>// input</div>
                      <pre style={{ color: "#CBD5E1", whiteSpace: "pre-wrap", overflowWrap: "break-word", margin: 0 }}>
                        {JSON.stringify(t.input, null, 2)}
                      </pre>
                      <div style={{ color: "#475569", marginBottom: 3, marginTop: 6 }}>// output</div>
                      <pre style={{ color: "#86EFAC", whiteSpace: "pre-wrap", overflowWrap: "break-word", margin: 0 }}>
                        {JSON.stringify(t.output, null, 2)}
                      </pre>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </div>

          {/* Report preview */}
          <ScrollArea className="flex-1">
            <div className="px-4 py-3">
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", marginBottom: 8 }}>报告预览</div>
              <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E5EAF2" }}>
                <div className="px-3 py-2.5" style={{ background: "#163A70" }}>
                  <div style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>{report?.title ?? "重庆二手房挂牌价市场分析报告"}</div>
                </div>
                <div className="p-3 flex flex-col gap-3">
                  <p style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.7 }}>
                    {report?.content?.split("\n").find(line => line.startsWith("- "))?.replace("- ", "") ??
                      "等待 Agent 通过 generate_report 工具生成可追踪报告。"}
                  </p>
                  <div className="h-16 rounded-lg flex items-center justify-center" style={{ background: "#F7F9FC", border: "1px dashed #E5EAF2" }}>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>{report ? `报告 #${report.id}` : "报告预览"}</span>
                  </div>
                  <ul style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.8, paddingLeft: 14, listStyle: "disc", margin: 0 }}>
                    <li>工具调用记录已保存到 agent_tool_calls</li>
                    <li>报告证据已保存到 generated_reports.evidence_json</li>
                    <li>所有价格口径均为挂牌价/报价</li>
                  </ul>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" style={{ background: "#163A70", color: "#fff", fontSize: 11, height: 30 }}
                      onClick={() => {
                        downloadTextFile("重庆二手房挂牌价市场分析报告.html", reportToHtml(report), "text/html;charset=utf-8");
                        toast.success("已导出可打印 HTML 报告");
                      }}>
                      <Download size={11} className="mr-1" />PDF
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" style={{ fontSize: 11, height: 30 }}
                      onClick={() => {
                        downloadTextFile("重庆二手房挂牌价市场分析报告.doc", reportToHtml(report), "application/msword;charset=utf-8");
                        toast.success("已导出 Word 报告");
                      }}>
                      <FileText size={11} className="mr-1" />Word
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}

export function AgentPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<(Message & { thinkTime?: string; thinking?: string })[]>(
    MESSAGES.map((m, i) => i === 1 ? { ...m, thinkTime: "1m 36s", thinking: THINKING_CHAIN } : m)
  );
  const [thinking, setThinking] = useState(false);
  const [activityOpen, setActivityOpen] = useState(true);
  const [toolTraces, setToolTraces] = useState<ToolTrace[]>(TOOL_TRACES);
  const [latestReport, setLatestReport] = useState<GeneratedReport | null>(null);
  const thinkElapsed = useTimer(thinking);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Session management state
  const [sessions, setSessions] = useState(SESSIONS.map((s, i) => ({ ...s, pinned: i === 0 })));
  const [activeSession, setActiveSession] = useState(SESSIONS[0].id);
  const [hoveredSession, setHoveredSession] = useState<string | null>(null);
  const [menuSession, setMenuSession] = useState<string | null>(null);
  const [renamingSession, setRenamingSession] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const startRename = (id: string, currentTitle: string) => {
    setRenamingSession(id);
    setRenameValue(currentTitle);
    setMenuSession(null);
    setTimeout(() => renameRef.current?.focus(), 50);
  };

  const confirmRename = (id: string) => {
    if (renameValue.trim()) {
      setSessions(prev => prev.map(s => s.id === id ? { ...s, title: renameValue.trim() } : s));
      toast.success("会话已重命名");
    }
    setRenamingSession(null);
  };

  const togglePin = (id: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, pinned: !s.pinned } : s));
    setMenuSession(null);
  };

  const archiveSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSession === id) {
      const next = sessions.find(s => s.id !== id);
      if (next) setActiveSession(next.id);
    }
    setMenuSession(null);
    toast.success("会话已归档");
  };

  const deleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSession === id) {
      const next = sessions.find(s => s.id !== id);
      if (next) setActiveSession(next.id);
    }
    setMenuSession(null);
    toast.success("会话已删除");
  };

  const createSession = () => {
    const id = `S${Date.now()}`;
    setSessions(prev => [{ id, title: "新的市场问数", preview: "等待输入问题...", time: "刚刚", messageCount: 0, pinned: false } as any, ...prev]);
    setActiveSession(id);
    setMessages([
      {
        id: `M${Date.now()}`,
        role: "assistant",
        content: "你好，我可以基于重庆二手房挂牌价统计、采集日志和模型结果回答问题。请直接输入区县、趋势、异常或报告需求。",
        timestamp: "刚刚",
      },
    ]);
    setToolTraces([]);
    setLatestReport(null);
  };

  const sortedSessions = [...sessions].sort((a, b) => Number((b as any).pinned) - Number((a as any).pinned));

  const sendMessage = async () => {
    if (!input.trim()) return;
    const newMsg: Message = { id: `M${Date.now()}`, role: "user", content: input, timestamp: "刚刚" };
    setMessages(prev => [...prev, newMsg]);
    setInput("");
    setThinking(true);
    try {
      const result = await api.chatAgent({ session_id: activeSession, question: newMsg.content });
      setThinking(false);
      setMessages(prev => [...prev, {
        id: `R${Date.now()}`, role: "assistant",
        content: result.answer,
        timestamp: "刚刚",
        thinkTime: `${Math.max(1, thinkElapsed)}s`,
        thinking: result.thinking,
      }]);
      setToolTraces(result.tool_calls.map(toToolTrace));
      if (result.report) {
        setLatestReport(result.report);
      }
      setSessions(prev => prev.map(s => s.id === activeSession ? { ...s, preview: newMsg.content, messageCount: (s.messageCount || 0) + 2, time: "刚刚" } : s));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent 请求失败";
      setThinking(false);
      setMessages(prev => [...prev, {
        id: `R${Date.now()}`,
        role: "assistant",
        content: `**结论**\nAgent 请求失败。\n\n**关键证据**\n- 错误信息：${message}\n\n**可执行建议**\n请先确认后端服务和数据库连接正常，再重新发送问题。`,
        timestamp: "刚刚",
      }]);
      toast.error(message);
    }
  };

  return (
    <div className="flex gap-0" style={{ height: "calc(100vh - 130px)" }}>
      {/* Left: session list */}
      <div className="w-52 flex-shrink-0 flex flex-col rounded-xl overflow-hidden mr-4" style={{ border: "1px solid #E5EAF2", background: "#fff" }}>
        <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid #E5EAF2" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>会话历史</span>
        </div>
        <div className="flex-1 overflow-auto" style={{ scrollbarWidth: "none" } as React.CSSProperties}>
          <div className="flex flex-col p-2 gap-0.5">
            {sortedSessions.map((s) => {
              const isActive = s.id === activeSession;
              const isHovered = hoveredSession === s.id;
              const isRenaming = renamingSession === s.id;
              const showMenu = menuSession === s.id;
              return (
                <div key={s.id} className="relative group"
                  onMouseEnter={() => setHoveredSession(s.id)}
                  onMouseLeave={() => { setHoveredSession(null); if (!showMenu) setMenuSession(null); }}>
                  <button
                    className="text-left px-3 py-2.5 rounded-lg transition-colors w-full"
                    style={{ background: isActive ? "#EFF6FF" : isHovered ? "#F7F9FC" : "transparent" }}
                    onClick={() => { setActiveSession(s.id); setMenuSession(null); }}>
                    {/* Pin indicator */}
                    {(s as any).pinned && (
                      <Pin size={9} style={{ position: "absolute", top: 6, right: 28, color: "#163A70", opacity: 0.5 }} />
                    )}
                    {isRenaming ? (
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <input
                          ref={renameRef}
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") confirmRename(s.id); if (e.key === "Escape") setRenamingSession(null); }}
                          className="flex-1 rounded px-1.5 py-0.5 outline-none"
                          style={{ fontSize: 12, border: "1px solid #BFDBFE", background: "#fff", color: "#163A70", minWidth: 0 }}
                        />
                        <button onClick={() => confirmRename(s.id)} style={{ color: "#16A34A", flexShrink: 0 }}>
                          <Check size={13} />
                        </button>
                        <button onClick={() => setRenamingSession(null)} style={{ color: "#9CA3AF", flexShrink: 0 }}>
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? "#163A70" : "#374151", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: isHovered ? 18 : 0 }}>{s.title}</div>
                        <div style={{ fontSize: 11, color: "#9CA3AF" }}>{s.time}</div>
                      </>
                    )}
                  </button>
                  {/* Action menu trigger */}
                  {!isRenaming && isHovered && (
                    <button
                      className="absolute top-1/2 -translate-y-1/2 rounded"
                      style={{ right: 6, padding: "2px 3px", background: isActive ? "#DBEAFE" : "#E5EAF2", color: "#6B7280" }}
                      onClick={e => { e.stopPropagation(); setMenuSession(showMenu ? null : s.id); }}>
                      <MoreHorizontal size={12} />
                    </button>
                  )}
                  {/* Dropdown menu */}
                  {showMenu && (
                    <div
                      className="absolute z-50 rounded-lg shadow-lg overflow-hidden"
                      style={{ top: "calc(100% - 4px)", left: 8, right: 8, background: "#fff", border: "1px solid #E5EAF2" }}
                      onMouseLeave={() => setMenuSession(null)}>
                      <button className="w-full flex items-center gap-2 px-3 py-2 transition-colors hover:bg-[#F7F9FC]"
                        style={{ fontSize: 12, color: "#374151" }}
                        onClick={e => { e.stopPropagation(); togglePin(s.id); }}>
                        <Pin size={12} style={{ color: (s as any).pinned ? "#163A70" : "#9CA3AF" }} />
                        {(s as any).pinned ? "取消固定" : "固定到顶部"}
                      </button>
                      <button className="w-full flex items-center gap-2 px-3 py-2 transition-colors hover:bg-[#F7F9FC]"
                        style={{ fontSize: 12, color: "#374151" }}
                        onClick={e => { e.stopPropagation(); startRename(s.id, s.title); }}>
                        <Pencil size={12} style={{ color: "#9CA3AF" }} />
                        重命名
                      </button>
                      <button className="w-full flex items-center gap-2 px-3 py-2 transition-colors hover:bg-[#F7F9FC]"
                        style={{ fontSize: 12, color: "#374151" }}
                        onClick={e => { e.stopPropagation(); archiveSession(s.id); }}>
                        <Archive size={12} style={{ color: "#9CA3AF" }} />
                        归档
                      </button>
                      <div style={{ height: 1, background: "#E5EAF2", margin: "2px 0" }} />
                      <button className="w-full flex items-center gap-2 px-3 py-2 transition-colors hover:bg-[#FEF2F2]"
                        style={{ fontSize: 12, color: "#DC2626" }}
                        onClick={e => { e.stopPropagation(); deleteSession(s.id); }}>
                        <Trash2 size={12} />
                        删除
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="p-3 flex-shrink-0" style={{ borderTop: "1px solid #E5EAF2" }}>
          <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg"
            style={{ border: "1px dashed #CBD5E1", color: "#9CA3AF", fontSize: 12 }}
            onClick={createSession}>
            <MessageSquare size={12} />新建会话
          </button>
        </div>
      </div>

      {/* Center + Right: chat + activity panel */}
      <div className="flex flex-1 min-w-0 rounded-xl overflow-hidden" style={{ border: "1px solid #E5EAF2" }}>
        {/* Chat */}
        <div className="flex-1 flex flex-col min-w-0" style={{ background: "#FAFBFC" }}>
          {/* Chat header */}
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ background: "#fff", borderBottom: "1px solid #E5EAF2" }}>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-full" style={{ background: "#EFF6FF" }}>
                <Sparkles size={12} style={{ color: "#163A70" }} />
                <span style={{ fontSize: 12, color: "#163A70" }}>DeepSeek-V3</span>
              </div>
            </div>
            <button
              onClick={() => setActivityOpen(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: activityOpen ? "#EFF6FF" : "#F7F9FC", border: "1px solid", borderColor: activityOpen ? "#BFDBFE" : "#E5EAF2" }}
            >
              <Activity size={13} style={{ color: activityOpen ? "#163A70" : "#9CA3AF" }} />
              <span style={{ fontSize: 12, color: activityOpen ? "#163A70" : "#9CA3AF" }}>活动</span>
              <ChevronRight size={12} style={{ color: "#9CA3AF", transform: activityOpen ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.2s" }} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto px-6 py-5">
            <div className="flex flex-col gap-5 max-w-2xl mx-auto">
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
              {thinking && <ThinkingBubble elapsed={thinkElapsed} />}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Suggestions */}
          <div className="px-6 pt-2 flex gap-2 flex-wrap max-w-2xl mx-auto w-full">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => setInput(s)}
                className="px-3 py-1.5 rounded-full border transition-colors"
                style={{ fontSize: 12, color: "#163A70", borderColor: "#BFDBFE", background: "#EFF6FF" }}>
                {s}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="px-6 py-4 max-w-2xl mx-auto w-full">
            <div className="flex gap-2 items-center px-4 py-2 rounded-2xl" style={{ background: "#fff", border: "1px solid #E5EAF2", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="输入问题，例：近12月均价走势..."
                className="border-none shadow-none focus-visible:ring-0 p-0"
                style={{ fontSize: 13, background: "transparent" }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || thinking}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                style={{ background: input.trim() && !thinking ? "#163A70" : "#E5EAF2" }}
              >
                <Send size={14} style={{ color: input.trim() && !thinking ? "#fff" : "#9CA3AF" }} />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Activity panel */}
        <ActivityPanel open={activityOpen} onClose={() => setActivityOpen(false)} elapsed={thinkElapsed} traces={toolTraces} report={latestReport} />
      </div>
    </div>
  );
}

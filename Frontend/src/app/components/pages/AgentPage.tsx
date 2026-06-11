import { useState, useEffect, useRef } from "react";
import { Send, ChevronRight, Download, Sparkles, MessageSquare, X, Activity, ChevronDown, Clock, Pin, Pencil, Archive, Trash2, MoreHorizontal, Check } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { toast } from "sonner";
import { api, reportPdfUrl, type AgentToolCall, type GeneratedReport } from "../../services/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: { title: string; excerpt: string }[];
}

interface ToolTrace {
  id: string;
  tool: string;
  input: unknown;
  output: unknown;
  duration: number;
  status: "success" | "error";
}

interface Session {
  id: string;
  title: string;
  preview: string;
  time: string;
  messageCount: number;
  pinned: boolean;
}

const SUGGESTIONS = [
  "近12月重庆房价走势如何？",
  "渝北区性价比最高的户型是？",
  "帮我生成市场分析报告",
  "哪个区县均价涨幅最大？",
];

const INITIAL_SESSION: Session = {
  id: "local-default",
  title: "新的市场问数",
  preview: "等待输入问题...",
  time: "刚刚",
  messageCount: 1,
  pinned: true,
};

const INITIAL_MESSAGES: Message[] = [
  {
    id: "welcome",
    role: "assistant",
    content: "你好，我可以基于后端统计、采集日志、模型结果和报告工具回答问题。所有具体数值都会来自真实工具调用。",
    timestamp: "刚刚",
  },
];

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
        {!isUser && msg.thinkTime && msg.thinking && (
          <ThinkingChainBlock chain={msg.thinking} thinkTime={msg.thinkTime} />
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
                  <div style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>{report?.title ?? "暂无真实报告"}</div>
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
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={!report}
                      style={{ background: report ? "#163A70" : "#CBD5E1", color: "#fff", fontSize: 11, height: 30 }}
                      onClick={() => {
                        if (!report) return;
                        window.open(reportPdfUrl(report.id), "_blank");
                      }}>
                      <Download size={11} className="mr-1" />下载 PDF
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
  const [messages, setMessages] = useState<(Message & { thinkTime?: string; thinking?: string })[]>(INITIAL_MESSAGES);
  const [thinking, setThinking] = useState(false);
  const [activityOpen, setActivityOpen] = useState(true);
  const [toolTraces, setToolTraces] = useState<ToolTrace[]>([]);
  const [latestReport, setLatestReport] = useState<GeneratedReport | null>(null);
  const thinkElapsed = useTimer(thinking);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Session management state
  const [sessions, setSessions] = useState<Session[]>([INITIAL_SESSION]);
  const [activeSession, setActiveSession] = useState(INITIAL_SESSION.id);
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
    setSessions(prev => [{ id, title: "新的市场问数", preview: "等待输入问题...", time: "刚刚", messageCount: 1, pinned: false }, ...prev]);
    setActiveSession(id);
    setMessages([{ ...INITIAL_MESSAGES[0], id: `M${Date.now()}` }]);
    setToolTraces([]);
    setLatestReport(null);
  };

  const sortedSessions = [...sessions].sort((a, b) => Number(b.pinned) - Number(a.pinned));

  const sendMessage = async () => {
    if (!input.trim()) return;
    const newMsg: Message = { id: `M${Date.now()}`, role: "user", content: input, timestamp: "刚刚" };
    setMessages(prev => [...prev, newMsg]);
    setInput("");
    setToolTraces([]);
    setLatestReport(null);
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
      setLatestReport(result.report ?? null);
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
                    {s.pinned && (
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
                        <Pin size={12} style={{ color: s.pinned ? "#163A70" : "#9CA3AF" }} />
                        {s.pinned ? "取消固定" : "固定到顶部"}
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

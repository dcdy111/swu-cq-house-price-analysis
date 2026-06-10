import { useState, useEffect, useRef } from "react";
import { Send, ChevronRight, Download, FileText, Sparkles, MessageSquare, X, Activity, ChevronDown, Clock, Pin, Pencil, Archive, Trash2, MoreHorizontal, Check } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import { SESSIONS, MESSAGES, TOOL_TRACES, Message } from "../../mock/chat";
import { toast } from "sonner";

const SUGGESTIONS = [
  "近12月重庆房价走势如何？",
  "渝北区性价比最高的户型是？",
  "帮我生成市场分析报告",
  "哪个区县均价涨幅最大？",
];

// Mock thinking chain shown before assistant reply
const THINKING_CHAIN = `分析用户问题：比较渝北区与南岸区的二手房价格走势...

→ 查询数据库：SELECT district, avg(unit_price), COUNT(*) FROM listings WHERE district IN ('渝北区','南岸区') GROUP BY month...

→ 获取到12个月数据点，渝北区均价呈微下行趋势（-0.5% YoY），南岸区受弹子石CBD开发驱动上涨2.5%...

→ 调用预测模型对两区下半年走势进行推断，置信区间95%...

→ 整合数据，准备生成对比分析回复。`;

function useTimer(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  return elapsed;
}

function formatTime(s: number) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
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

// Tool trace panel (right, collapsible)
function ActivityPanel({ open, onClose, elapsed }: { open: boolean; onClose: () => void; elapsed: number }) {
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
              {TOOL_TRACES.map(t => (
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
                  <div style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>2026年H1重庆二手房市场分析报告</div>
                </div>
                <div className="p-3 flex flex-col gap-3">
                  <p style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.7 }}>
                    2026年上半年重庆二手房市场整体呈稳中有升态势，全市均价达14,120元/㎡，同比上涨7.1%。
                  </p>
                  <div className="h-16 rounded-lg flex items-center justify-center" style={{ background: "#F7F9FC", border: "1px dashed #E5EAF2" }}>
                    <span style={{ fontSize: 11, color: "#9CA3AF" }}>图表占位</span>
                  </div>
                  <ul style={{ fontSize: 12, color: "#4B5563", lineHeight: 1.8, paddingLeft: 14, listStyle: "disc", margin: 0 }}>
                    <li>渝中区均价 22,450 元/㎡，涨幅 3.2%</li>
                    <li>3室2厅为主流需求，占比35%</li>
                    <li>地铁沿线溢价约 8-12%</li>
                  </ul>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" style={{ background: "#163A70", color: "#fff", fontSize: 11, height: 30 }}
                      onClick={() => toast.info("演示模式")}>
                      <Download size={11} className="mr-1" />PDF
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" style={{ fontSize: 11, height: 30 }}
                      onClick={() => toast.info("演示模式")}>
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

  const archiveSession = () => {
    setMenuSession(null);
    toast.info("归档功能可在「系统设置 → 数据源」中配置自动归档规则");
  };

  const deleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    setMenuSession(null);
    toast.success("会话已删除");
  };

  const sortedSessions = [...sessions].sort((a, b) => Number((b as any).pinned) - Number((a as any).pinned));

  const sendMessage = () => {
    if (!input.trim()) return;
    const newMsg: Message = { id: `M${Date.now()}`, role: "user", content: input, timestamp: "刚刚" };
    setMessages(prev => [...prev, newMsg]);
    setInput("");
    setThinking(true);
    // Simulate thinking + response
    setTimeout(() => {
      setThinking(false);
      setMessages(prev => [...prev, {
        id: `R${Date.now()}`, role: "assistant",
        content: "正在分析重庆房源数据库中的历史记录...（演示模式，返回占位回复）",
        timestamp: "刚刚",
        thinkTime: "8s",
        thinking: "分析用户问题...\n→ 查询相关数据...\n→ 整合分析结果...",
      }]);
    }, 2500);
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
                        onClick={e => { e.stopPropagation(); archiveSession(); }}>
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
            style={{ border: "1px dashed #CBD5E1", color: "#9CA3AF", fontSize: 12 }}>
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
        <ActivityPanel open={activityOpen} onClose={() => setActivityOpen(false)} elapsed={thinkElapsed} />
      </div>
    </div>
  );
}

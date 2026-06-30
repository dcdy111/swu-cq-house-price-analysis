import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ChevronRight, Download, MessageSquare, Send, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { toast } from "sonner";
import {
  api,
  reportPdfUrl,
  type AgentSessionDetail,
  type AgentSessionSummary,
  type AgentToolCall,
  type AgentTurn,
  type GeneratedReport,
  type ListingItem,
} from "../../services/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  turnId?: string;
  toolTraces?: ToolTrace[];
  report?: GeneratedReport | null;
  executionSummary?: string;
  runtimeText?: string;
  elapsedSeconds?: number;
  model?: string;
}

interface ToolTrace {
  id: string;
  tool: string;
  input: unknown;
  output: unknown;
  duration: number;
  status: "success" | "error";
}

interface RecommendationCard {
  listing: ListingItem;
  recommendation_score: number;
  reasons?: string[];
}

interface SessionCard {
  id: string;
  title: string;
  time: string;
  turns: number;
}

const QUICK_QUESTIONS = [
  "渝北区挂牌均价是多少？",
  "近12月重庆挂牌价走势如何？",
  "帮我生成重庆二手房挂牌价市场分析报告",
];

function useTimer(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return elapsed;
}

function formatRelativeTime(value?: string | null) {
  if (!value) return "刚刚";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const diff = Date.now() - parsed.getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}分钟前`;
  if (diff < 86_400_000) return `${Math.max(1, Math.floor(diff / 3_600_000))}小时前`;
  return `${Math.max(1, Math.floor(diff / 86_400_000))}天前`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function durationSeconds(start?: string | null, end?: string | null) {
  if (!start || !end) return 0;
  const startedAt = new Date(start).getTime();
  const finishedAt = new Date(end).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return 0;
  return Math.max(1, Math.round((finishedAt - startedAt) / 1000));
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

function toSessionCard(item: AgentSessionSummary): SessionCard {
  return {
    id: item.session_id,
    title: item.title || "未命名会话",
    time: formatRelativeTime(item.updated_at ?? item.created_at),
    turns: item.turn_count,
  };
}

function assistantMessageFromTurn(turn: AgentTurn): Message {
  const elapsed = durationSeconds(turn.created_at, turn.finished_at);
  return {
    id: `assistant-${turn.turn_id}`,
    role: "assistant",
    content: turn.answer || "",
    timestamp: formatRelativeTime(turn.finished_at ?? turn.created_at),
    turnId: turn.turn_id,
    toolTraces: (turn.tool_calls || []).map(toToolTrace),
    report: turn.report ?? null,
    executionSummary: turn.thinking ?? "",
    runtimeText: elapsed ? formatDuration(elapsed) : "",
    elapsedSeconds: elapsed,
    model: turn.model ?? undefined,
  };
}

function messagesFromSession(detail: AgentSessionDetail): Message[] {
  const items: Message[] = [];
  for (const turn of detail.turns || []) {
    items.push({
      id: `user-${turn.turn_id}`,
      role: "user",
      content: turn.question,
      timestamp: formatRelativeTime(turn.created_at),
      turnId: turn.turn_id,
    });
    if (turn.answer) {
      items.push(assistantMessageFromTurn(turn));
    }
  }
  return items;
}

function extractRecommendationCards(traces: ToolTrace[]): RecommendationCard[] {
  const trace = traces.find(item => item.tool === "recommend_buy_options");
  const items = trace && typeof trace.output === "object"
    ? (trace.output as { items?: RecommendationCard[] }).items
    : undefined;
  return Array.isArray(items) ? items : [];
}

function ThinkingBubble({ elapsed }: { elapsed: number }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: "#163A70", color: "#fff", fontSize: 11, fontWeight: 700 }}
      >
        AI
      </div>
      <div
        className="rounded-2xl px-4 py-3"
        style={{ background: "#fff", border: "1px solid #E5EAF2", color: "#374151", fontSize: 13 }}
      >
        <div style={{ fontWeight: 600, color: "#163A70" }}>模型处理中</div>
        <div style={{ color: "#6B7280", fontSize: 12, marginTop: 4 }}>已耗时 {formatDuration(elapsed)}</div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onSelect,
}: {
  message: Message;
  onSelect?: (message: Message) => void;
}) {
  const isUser = message.role === "user";
  const hasActivity = !isUser && ((message.toolTraces?.length ?? 0) > 0 || Boolean(message.report));

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          background: isUser ? "#E67E22" : "#163A70",
          color: "#fff",
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {isUser ? "我" : "AI"}
      </div>
      <div className={`max-w-[82%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1.5`}>
        <button
          type="button"
          onClick={() => hasActivity && onSelect?.(message)}
          style={{
            background: isUser ? "#163A70" : "#fff",
            color: isUser ? "#fff" : "#1F2937",
            border: isUser ? "none" : "1px solid #E5EAF2",
            boxShadow: isUser ? "none" : "0 1px 3px rgba(15, 23, 42, 0.04)",
            cursor: hasActivity ? "pointer" : "default",
          }}
          className="rounded-2xl px-4 py-3 text-left"
        >
          <div
            style={{ fontSize: 13, lineHeight: 1.8 }}
            dangerouslySetInnerHTML={{
              __html: message.content.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br/>"),
            }}
          />
          {hasActivity && (
            <div
              className="mt-3 inline-flex items-center gap-1 rounded-full px-2 py-1"
              style={{ background: "#EFF6FF", color: "#163A70", fontSize: 11, fontWeight: 600 }}
            >
              <Activity size={11} />
              查看本轮调用
            </div>
          )}
        </button>
        {!isUser && (message.model || message.runtimeText) && (
          <div style={{ fontSize: 11, color: "#9CA3AF" }}>
            {[message.model, message.runtimeText].filter(Boolean).join(" · ")}
          </div>
        )}
        <div style={{ fontSize: 11, color: "#C4C9D4" }}>{message.timestamp}</div>
      </div>
    </div>
  );
}

function ActivityPanel({
  open,
  onClose,
  traces,
  report,
  executionSummary,
  elapsed,
}: {
  open: boolean;
  onClose: () => void;
  traces: ToolTrace[];
  report: GeneratedReport | null;
  executionSummary: string;
  elapsed: number;
}) {
  const recommendationCards = useMemo(() => extractRecommendationCards(traces), [traces]);

  if (!open) return null;

  return (
    <div
      className="w-[340px] flex-shrink-0 flex flex-col"
      style={{ borderLeft: "1px solid #E5EAF2", background: "#fff" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid #E5EAF2" }}
      >
        <div className="flex items-center gap-2">
          <Activity size={14} style={{ color: "#163A70" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>工具调用</span>
          {elapsed > 0 && <span style={{ fontSize: 11, color: "#9CA3AF" }}>{formatDuration(elapsed)}</span>}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ color: "#9CA3AF", fontSize: 12 }}
        >
          收起
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 flex flex-col gap-4">
          {executionSummary && (
            <div className="rounded-xl p-3" style={{ background: "#F8FAFC", border: "1px solid #E5EAF2" }}>
              <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 6 }}>执行摘要</div>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 11,
                  color: "#374151",
                  lineHeight: 1.7,
                }}
              >
                {executionSummary}
              </pre>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {traces.length === 0 && (
              <div className="rounded-xl p-3" style={{ background: "#F8FAFC", border: "1px solid #E5EAF2", color: "#9CA3AF", fontSize: 12 }}>
                当前轮次没有工具调用记录。
              </div>
            )}
            {traces.map(trace => (
              <details
                key={trace.id}
                className="rounded-xl border"
                style={{ borderColor: "#E5EAF2", background: "#fff" }}
              >
                <summary
                  className="list-none cursor-pointer px-3 py-3 flex items-center justify-between gap-3"
                  style={{ fontSize: 12, color: "#1F2937", fontWeight: 600 }}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full"
                      style={{ background: trace.status === "success" ? "#16A34A" : "#DC2626" }}
                    />
                    {trace.tool}
                  </span>
                  <span style={{ color: "#9CA3AF", fontWeight: 400 }}>{trace.duration}ms</span>
                </summary>
                <div className="px-3 pb-3 flex flex-col gap-2">
                  <div className="rounded-lg p-3" style={{ background: "#0F172A" }}>
                    <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4 }}>input</div>
                    <pre
                      style={{
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontSize: 10,
                        color: "#CBD5E1",
                        lineHeight: 1.7,
                      }}
                    >
                      {JSON.stringify(trace.input, null, 2)}
                    </pre>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: "#0F172A" }}>
                    <div style={{ fontSize: 10, color: "#64748B", marginBottom: 4 }}>output</div>
                    <pre
                      style={{
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontSize: 10,
                        color: "#86EFAC",
                        lineHeight: 1.7,
                      }}
                    >
                      {JSON.stringify(trace.output, null, 2)}
                    </pre>
                  </div>
                </div>
              </details>
            ))}
          </div>

          {recommendationCards.length > 0 && (
            <div className="flex flex-col gap-3">
              <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>候选房源</div>
              {recommendationCards.map(item => (
                <div
                  key={`${item.listing.id}-${item.listing.link}`}
                  className="rounded-xl p-3"
                  style={{ border: "1px solid #E5EAF2", background: "#fff" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div style={{ fontSize: 12, color: "#1F2937", fontWeight: 700, lineHeight: 1.6 }}>
                      {item.listing.title}
                    </div>
                    <div
                      className="px-2 py-1 rounded-full"
                      style={{ background: "#EFF6FF", color: "#163A70", fontSize: 11, fontWeight: 700 }}
                    >
                      {item.recommendation_score.toFixed(1)} 分
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#6B7280", marginTop: 6, lineHeight: 1.7 }}>
                    {item.listing.district} · {item.listing.community || "未识别小区"} · {item.listing.layout || "户型待补充"}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="rounded-lg px-2.5 py-2" style={{ background: "#F8FAFC" }}>
                      <div style={{ fontSize: 10, color: "#9CA3AF" }}>挂牌总价</div>
                      <div style={{ fontSize: 12, color: "#1F2937", fontWeight: 700 }}>{item.listing.total_price ?? "-"} 万</div>
                    </div>
                    <div className="rounded-lg px-2.5 py-2" style={{ background: "#F8FAFC" }}>
                      <div style={{ fontSize: 10, color: "#9CA3AF" }}>挂牌单价</div>
                      <div style={{ fontSize: 12, color: "#1F2937", fontWeight: 700 }}>
                        {item.listing.unit_price?.toLocaleString?.() ?? "-"} 元/㎡
                      </div>
                    </div>
                  </div>
                  {(item.reasons?.length ?? 0) > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.reasons?.map(reason => (
                        <span
                          key={reason}
                          className="px-2 py-1 rounded-full"
                          style={{ background: "#F7F9FC", color: "#4B5563", fontSize: 10 }}
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E5EAF2" }}>
            <div className="px-3 py-2.5" style={{ background: "#163A70", color: "#fff", fontSize: 12, fontWeight: 700 }}>
              {report?.title || "报告"}
            </div>
            <div className="p-3">
              <div style={{ fontSize: 12, color: report ? "#1F2937" : "#9CA3AF", lineHeight: 1.7 }}>
                {report ? report.content.split("\n").slice(0, 8).join("\n") : "当前轮次没有生成报告。"}
              </div>
              <Button
                size="sm"
                disabled={!report}
                onClick={() => report && window.open(reportPdfUrl(report.id), "_blank")}
                className="mt-3 w-full"
                style={{ background: report ? "#163A70" : "#CBD5E1", color: "#fff", fontSize: 12 }}
              >
                <Download size={12} className="mr-1.5" />
                下载 PDF
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

export function AgentPage() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [activityOpen, setActivityOpen] = useState(true);
  const [toolTraces, setToolTraces] = useState<ToolTrace[]>([]);
  const [latestReport, setLatestReport] = useState<GeneratedReport | null>(null);
  const [executionSummary, setExecutionSummary] = useState("");
  const [activityElapsed, setActivityElapsed] = useState(0);
  const [sessions, setSessions] = useState<SessionCard[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingElapsed = useTimer(sending);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const selectActivity = (message: Message) => {
    setToolTraces(message.toolTraces ?? []);
    setLatestReport(message.report ?? null);
    setExecutionSummary(message.executionSummary ?? "");
    if (message.runtimeText) {
      setActivityElapsed(message.elapsedSeconds ?? 0);
    }
    setActivityOpen(true);
  };

  const resetComposer = () => {
    setActiveSession(null);
    setMessages([]);
    setToolTraces([]);
    setLatestReport(null);
    setExecutionSummary("");
    setActivityElapsed(0);
  };

  const openSession = async (sessionId: string) => {
    setActiveSession(sessionId);
    const detail = await api.getAgentSession(sessionId);
    const sessionMessages = messagesFromSession(detail);
    setMessages(sessionMessages);
    const lastAssistant = [...sessionMessages].reverse().find(item => item.role === "assistant");
    if (lastAssistant) {
      selectActivity(lastAssistant);
    } else {
      setToolTraces([]);
      setLatestReport(null);
      setExecutionSummary("");
      setActivityElapsed(0);
    }
  };

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const result = await api.getAgentSessions(50);
      const items = result.items.map(toSessionCard);
      setSessions(items);
      resetComposer();
    } catch (error) {
      const message = error instanceof Error ? error.message : "会话加载失败";
      toast.error(message);
      setSessions([]);
      resetComposer();
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    void loadSessions();
  }, []);

  const sendMessage = async () => {
    const question = input.trim();
    if (!question || sending) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
      timestamp: "刚刚",
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setSending(true);
    setToolTraces([]);
    setLatestReport(null);
    setExecutionSummary("");
    const startedAt = Date.now();

    try {
      const result = await api.chatAgent(activeSession ? { session_id: activeSession, question } : { question });
      const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.answer,
        timestamp: "刚刚",
        turnId: result.turn_id,
        toolTraces: result.tool_calls.map(toToolTrace),
        report: result.report ?? null,
        executionSummary: result.thinking,
        runtimeText: formatDuration(elapsed),
        elapsedSeconds: elapsed,
        model: result.model,
      };

      setMessages(prev => [...prev, assistantMessage]);
      setActiveSession(result.session_id);
      setToolTraces(assistantMessage.toolTraces ?? []);
      setLatestReport(assistantMessage.report ?? null);
      setExecutionSummary(result.thinking ?? "");
      setActivityElapsed(elapsed);
      setSessions(prev => {
        const next: SessionCard = {
          id: result.session_id,
          title: question.slice(0, 20),
          time: "刚刚",
          turns: (prev.find(item => item.id === result.session_id)?.turns ?? 0) + 1,
        };
        return [next, ...prev.filter(item => item.id !== result.session_id)];
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "问答请求失败";
      const payload = (error as Error & { data?: any }).data;
      if (payload?.session_id) {
        setActiveSession(payload.session_id);
      }
      if (Array.isArray(payload?.tool_calls)) {
        setToolTraces(payload.tool_calls.map(toToolTrace));
      }
      if (payload?.report) {
        setLatestReport(payload.report);
      }
      if (payload?.execution) {
        setExecutionSummary(payload.execution);
      }
      setActivityElapsed(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex gap-4" style={{ height: "calc(100vh - 130px)" }}>
      <div
        className="w-56 flex-shrink-0 rounded-xl overflow-hidden"
        style={{ border: "1px solid #E5EAF2", background: "#fff" }}
      >
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #E5EAF2" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>会话</span>
          <button
            type="button"
            onClick={resetComposer}
            style={{ fontSize: 12, color: "#163A70" }}
          >
            新建
          </button>
        </div>
        <div className="overflow-auto" style={{ maxHeight: "100%" }}>
          <div className="p-2 flex flex-col gap-1.5">
            {loadingSessions && (
              <div style={{ fontSize: 12, color: "#9CA3AF", padding: 12 }}>正在读取会话...</div>
            )}
            {!loadingSessions && sessions.length === 0 && (
              <div style={{ fontSize: 12, color: "#9CA3AF", padding: 12 }}>暂无历史会话</div>
            )}
            {sessions.map(session => (
              <button
                key={session.id}
                type="button"
                onClick={() => void openSession(session.id)}
                className="text-left rounded-lg px-3 py-2.5"
                style={{
                  background: activeSession === session.id ? "#EFF6FF" : "transparent",
                  border: activeSession === session.id ? "1px solid #BFDBFE" : "1px solid transparent",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: activeSession === session.id ? "#163A70" : "#374151",
                    lineHeight: 1.6,
                  }}
                >
                  {session.title}
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 4 }}>
                  {session.time} · {session.turns} 轮
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className="flex flex-1 min-w-0 rounded-xl overflow-hidden"
        style={{ border: "1px solid #E5EAF2", background: "#FAFBFC" }}
      >
        <div className="flex-1 min-w-0 flex flex-col">
          <div
            className="flex items-center justify-between px-5 py-3"
            style={{ background: "#fff", borderBottom: "1px solid #E5EAF2" }}
          >
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-full" style={{ background: "#EFF6FF" }}>
                <Sparkles size={12} style={{ color: "#163A70" }} />
                <span style={{ fontSize: 12, color: "#163A70" }}>真实问答</span>
              </div>
              {activeSession && <span style={{ fontSize: 11, color: "#9CA3AF" }}>{activeSession}</span>}
            </div>
            <button
              type="button"
              onClick={() => setActivityOpen(value => !value)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
              style={{
                background: activityOpen ? "#EFF6FF" : "#F7F9FC",
                border: "1px solid",
                borderColor: activityOpen ? "#BFDBFE" : "#E5EAF2",
              }}
            >
              <Activity size={13} style={{ color: activityOpen ? "#163A70" : "#9CA3AF" }} />
              <span style={{ fontSize: 12, color: activityOpen ? "#163A70" : "#9CA3AF" }}>工具调用</span>
              <ChevronRight size={12} style={{ color: "#9CA3AF", transform: activityOpen ? "rotate(0deg)" : "rotate(180deg)" }} />
            </button>
          </div>

          <div className="flex-1 overflow-auto px-6 py-5">
            <div className="max-w-3xl mx-auto flex flex-col gap-5">
              {messages.length === 0 && !sending && (
                <div
                  className="rounded-2xl p-6"
                  style={{ background: "#fff", border: "1px solid #E5EAF2", textAlign: "center" }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#163A70" }}>直接提问</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 8, lineHeight: 1.8 }}>
                    发送问题开始新会话。
                  </div>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {QUICK_QUESTIONS.map(question => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => setInput(question)}
                        className="px-3 py-1.5 rounded-full"
                        style={{ background: "#EFF6FF", color: "#163A70", fontSize: 12, border: "1px solid #BFDBFE" }}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map(message => (
                <MessageBubble key={message.id} message={message} onSelect={selectActivity} />
              ))}

              {sending && <ThinkingBubble elapsed={sendingElapsed} />}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="px-6 py-4">
            <div
              className="max-w-3xl mx-auto flex items-center gap-2 rounded-2xl px-4 py-2"
              style={{ background: "#fff", border: "1px solid #E5EAF2", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
            >
              <Input
                value={input}
                onChange={event => setInput(event.target.value)}
                onKeyDown={event => event.key === "Enter" && !event.shiftKey && void sendMessage()}
                placeholder="输入问题"
                className="border-none shadow-none focus-visible:ring-0 p-0"
                style={{ fontSize: 13, background: "transparent" }}
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={!input.trim() || sending}
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: input.trim() && !sending ? "#163A70" : "#E5EAF2" }}
              >
                <Send size={14} style={{ color: input.trim() && !sending ? "#fff" : "#9CA3AF" }} />
              </button>
            </div>
          </div>
        </div>

        <ActivityPanel
          open={activityOpen}
          onClose={() => setActivityOpen(false)}
          traces={toolTraces}
          report={latestReport}
          executionSummary={executionSummary}
          elapsed={sending ? sendingElapsed : activityElapsed}
        />
      </div>
    </div>
  );
}

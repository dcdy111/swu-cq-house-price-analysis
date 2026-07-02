import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronRight,
  Clipboard,
  Download,
  Pencil,
  Plus,
  RefreshCcw,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
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
  pending?: boolean;
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
  latestHasAnswer: boolean;
  latestQuestion?: string | null;
}

interface SpeechState {
  messageId: string | null;
  speaking: boolean;
}

const QUICK_QUESTIONS = [
  "两江新区挂牌均价是多少？",
  "按区县统计房源数量和平均挂牌单价，并按数量排序",
  "近12月重庆挂牌价走势如何？",
  "帮我生成重庆二手房挂牌价市场分析报告",
];
const ACTIVE_SESSION_STORAGE_KEY = "swu-agent-active-session";
const TOOL_LABELS: Record<string, string> = {
  query_market_stats: "市场统计查询",
  query_readonly_sql: "自然语言 SQL 查询",
  get_listing_detail: "房源详情查询",
  compare_districts: "区县对比",
  get_chart_series: "图表数据查询",
  get_crawl_status: "采集状态查询",
  get_model_result: "模型结果查询",
  generate_report: "报告生成",
};

function toolLabel(name: string) {
  return TOOL_LABELS[name] ?? name;
}

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

function parseBackendDate(value?: string | null) {
  if (!value) return null;
  const text = value.trim();
  if (!text) return null;
  const hasExplicitTimezone = /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(text);
  const normalized = hasExplicitTimezone
    ? text
    : /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
      ? `${text.replace(" ", "T")}Z`
      : text;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatRelativeTime(value?: string | null) {
  if (!value) return "刚刚";
  const parsed = parseBackendDate(value);
  if (!parsed) return value;
  const diff = Math.max(0, Date.now() - parsed.getTime());
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
  const startedAt = parseBackendDate(start)?.getTime();
  const finishedAt = parseBackendDate(end)?.getTime();
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
    latestHasAnswer: Boolean(item.latest_has_answer),
    latestQuestion: item.latest_question ?? null,
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

function ThinkingBubble({
  elapsed,
  toolCount,
  onOpenActivity,
}: {
  elapsed: number;
  toolCount: number;
  onOpenActivity?: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: "#163A70", color: "#fff", fontSize: 11, fontWeight: 700 }}
      >
        助
      </div>
      <div className="max-w-[82%] flex flex-col gap-2">
        <button
          type="button"
          onClick={onOpenActivity}
          className="inline-flex items-center gap-1 self-start rounded-full px-2.5 py-1"
          style={{ background: "#F3F6FB", border: "1px solid #E5EAF2", color: "#6B7280", fontSize: 12 }}
        >
          已思考 {formatDuration(elapsed)}
          <ChevronRight size={12} />
        </button>
        <div
          className="rounded-2xl px-4 py-3"
          style={{ background: "#fff", border: "1px solid #E5EAF2", color: "#374151", fontSize: 13, boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles size={14} style={{ color: "#163A70" }} />
            <div style={{ fontWeight: 600, color: "#111827" }}>正在组织回答</div>
            <div style={{ color: "#9CA3AF", fontSize: 12 }}>用时 {formatDuration(elapsed)}</div>
          </div>
          <div style={{ color: "#6B7280", fontSize: 12, marginTop: 10, lineHeight: 1.8 }}>
            {toolCount > 0
              ? `已完成 ${toolCount} 次工具调用，正在整理证据并生成最终回答。`
              : "正在读取工具结果并组织最终回答，请稍候。"}
          </div>
          <div
            className="mt-3 inline-flex items-center gap-1 rounded-full px-2 py-1"
            style={{ background: "#EFF6FF", color: "#163A70", fontSize: 11, fontWeight: 600 }}
          >
            <Activity size={11} />
            {toolCount > 0 ? "查看工具执行" : "等待工具返回"}
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onSelect,
  onCopy,
  onReplay,
  onToggleSpeech,
  speaking,
  liveElapsed,
}: {
  message: Message;
  onSelect?: (message: Message) => void;
  onCopy?: (message: Message) => void;
  onReplay?: (message: Message) => void;
  onToggleSpeech?: (message: Message) => void;
  speaking?: boolean;
  liveElapsed?: number;
}) {
  const isUser = message.role === "user";
  const hasActivity = !isUser && ((message.toolTraces?.length ?? 0) > 0 || Boolean(message.report));
  const hasStreamedContent = Boolean(message.content?.trim());
  const runtimeMeta = !isUser
    ? [
        message.model,
        message.pending
          ? `已思考 ${formatDuration(liveElapsed ?? message.elapsedSeconds ?? 0)}`
          : message.runtimeText,
      ].filter(Boolean).join(" · ")
    : "";

  if (!isUser && message.pending && !hasStreamedContent) {
    return (
      <ThinkingBubble
        elapsed={liveElapsed ?? message.elapsedSeconds ?? 0}
        toolCount={message.toolTraces?.length ?? 0}
        onOpenActivity={() => onSelect?.(message)}
      />
    );
  }

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
        {isUser ? "我" : "助"}
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
        {!isUser && (
          <div className="flex items-center gap-2" style={{ marginTop: 2 }}>
            <button
              type="button"
              onClick={() => onCopy?.(message)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1"
              style={{ background: "#F7F9FC", color: "#6B7280", fontSize: 11 }}
            >
              <Clipboard size={11} />
              复制
            </button>
            <button
              type="button"
              onClick={() => onToggleSpeech?.(message)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1"
              style={{ background: speaking ? "#EFF6FF" : "#F7F9FC", color: speaking ? "#163A70" : "#6B7280", fontSize: 11 }}
            >
              {speaking ? <VolumeX size={11} /> : <Volume2 size={11} />}
              {speaking ? "停止朗读" : "朗读"}
            </button>
            <button
              type="button"
              onClick={() => onReplay?.(message)}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1"
              style={{ background: "#F7F9FC", color: "#6B7280", fontSize: 11 }}
            >
              <RefreshCcw size={11} />
              重新生成
            </button>
          </div>
        )}
        {!isUser && runtimeMeta && (
          <div style={{ fontSize: 11, color: "#9CA3AF" }}>
            {runtimeMeta}
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
      className="absolute inset-y-0 right-0 z-20 flex w-full flex-shrink-0 flex-col sm:w-[320px] xl:static xl:z-auto xl:w-[320px]"
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
                    {toolLabel(trace.tool)}
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
  const [openingSession, setOpeningSession] = useState(false);
  const [activityOpen, setActivityOpen] = useState(true);
  const [toolTraces, setToolTraces] = useState<ToolTrace[]>([]);
  const [latestReport, setLatestReport] = useState<GeneratedReport | null>(null);
  const [executionSummary, setExecutionSummary] = useState("");
  const [activityElapsed, setActivityElapsed] = useState(0);
  const [sessions, setSessions] = useState<SessionCard[]>([]);
  const [activeSession, setActiveSession] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [speechState, setSpeechState] = useState<SpeechState>({ messageId: null, speaking: false });
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sendingElapsed = useTimer(sending);
  const activeSessionCard = useMemo(
    () => sessions.find(item => item.id === activeSession) ?? null,
    [sessions, activeSession],
  );
  const hasMessages = messages.length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, openingSession]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeSession) {
      window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, activeSession);
    } else {
      window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    }
  }, [activeSession]);

  const selectActivity = (message: Message) => {
    setToolTraces(message.toolTraces ?? []);
    setLatestReport(message.report ?? null);
    setExecutionSummary(message.executionSummary ?? "");
    if (message.runtimeText) {
      setActivityElapsed(message.elapsedSeconds ?? 0);
    }
    setActivityOpen(true);
  };

  const clearConversation = (sessionId: string | null = null) => {
    setActiveSession(sessionId);
    setMessages([]);
    setToolTraces([]);
    setLatestReport(null);
    setExecutionSummary("");
    setActivityElapsed(0);
  };

  const upsertSessionCard = (sessionId: string, title: string, turnDelta = 0) => {
    setSessions(prev => {
      const existing = prev.find(item => item.id === sessionId);
      const next: SessionCard = {
        id: sessionId,
        title: title || existing?.title || "未命名会话",
        time: "刚刚",
        turns: Math.max(0, (existing?.turns ?? 0) + turnDelta),
        latestHasAnswer: turnDelta > 0 ? true : (existing?.latestHasAnswer ?? false),
        latestQuestion: existing?.latestQuestion ?? null,
      };
      return [next, ...prev.filter(item => item.id !== sessionId)];
    });
  };

  const openSession = async (sessionId: string) => {
    try {
      setOpeningSession(true);
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "会话读取失败";
      toast.error(message);
      clearConversation(sessionId);
    } finally {
      setOpeningSession(false);
    }
  };

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const result = await api.getAgentSessions(50);
      const items = result.items.map(toSessionCard);
      setSessions(items);
      if (activeSession && !items.some(item => item.id === activeSession)) {
        clearConversation();
      }

      const storedSessionId =
        typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) : null;
      const latestAnsweredSessionId = items.find(item => item.latestHasAnswer)?.id ?? null;
      const preferredSessionId =
        (activeSession && items.some(item => item.id === activeSession) && activeSession)
        || latestAnsweredSessionId
        || (storedSessionId && items.some(item => item.id === storedSessionId) && storedSessionId)
        || items[0]?.id
        || null;

      if (preferredSessionId) {
        await openSession(preferredSessionId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "会话加载失败";
      toast.error(message);
      setSessions([]);
      clearConversation();
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    void loadSessions();
  }, []);

  const createSession = async () => {
    if (sending) return;
    try {
      const session = await api.createAgentSession();
      upsertSessionCard(session.session_id, session.title, 0);
      clearConversation(session.session_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "会话创建失败";
      toast.error(message);
    }
  };

  const copyMessage = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success("回答已复制");
    } catch {
      toast.error("复制失败，请检查浏览器权限");
    }
  };

  const toggleSpeech = (message: Message) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("当前浏览器不支持朗读");
      return;
    }
    if (speechState.speaking && speechState.messageId === message.id) {
      window.speechSynthesis.cancel();
      setSpeechState({ messageId: null, speaking: false });
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.content.replace(/\*\*/g, ""));
    utterance.lang = "zh-CN";
    utterance.onend = () => setSpeechState({ messageId: null, speaking: false });
    utterance.onerror = () => setSpeechState({ messageId: null, speaking: false });
    setSpeechState({ messageId: message.id, speaking: true });
    window.speechSynthesis.speak(utterance);
  };

  const findUserQuestionForAssistant = (message: Message) => {
    if (!message.turnId) return null;
    const index = messages.findIndex(item => item.id === message.id);
    if (index <= 0) return null;
    for (let pointer = index - 1; pointer >= 0; pointer -= 1) {
      const item = messages[pointer];
      if (item.role === "user" && item.turnId === message.turnId) {
        return item.content;
      }
    }
    return null;
  };

  const renameSession = async (session: SessionCard) => {
    const nextTitle = window.prompt("输入新的会话名称", session.title);
    if (!nextTitle) return;
    const trimmed = nextTitle.trim();
    if (!trimmed || trimmed === session.title) return;
    try {
      const updated = await api.renameAgentSession(session.id, trimmed);
      upsertSessionCard(updated.session_id, updated.title, 0);
      if (activeSession === session.id) {
        setActiveSession(updated.session_id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "会话重命名失败";
      toast.error(message);
    }
  };

  const deleteSession = async (session: SessionCard) => {
    const confirmed = window.confirm(`确认删除会话“${session.title}”吗？该会话下的问答和报告记录会一起移除。`);
    if (!confirmed) return;
    try {
      await api.deleteAgentSession(session.id);
      setSessions(prev => prev.filter(item => item.id !== session.id));
      if (activeSession === session.id) {
        clearConversation();
      }
      toast.success("会话已删除");
    } catch (error) {
      const message = error instanceof Error ? error.message : "会话删除失败";
      toast.error(message);
    }
  };

  const sendMessage = async (overrideQuestion?: string) => {
    const question = (overrideQuestion ?? input).trim();
    if (!question || sending) return;
    const assistantMessageId = `assistant-${Date.now()}`;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
      timestamp: "刚刚",
    };

    setMessages(prev => [
      ...prev,
      userMessage,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        timestamp: "思考中",
        pending: true,
        elapsedSeconds: 0,
        toolTraces: [],
      },
    ]);
    if (!overrideQuestion) {
      setInput("");
    }
    setSending(true);
    setToolTraces([]);
    setLatestReport(null);
    setExecutionSummary("");
    setActivityOpen(true);
    const startedAt = Date.now();

    try {
      let currentSessionTitle = activeSessionCard?.title || question.slice(0, 20) || "新的市场问数";

      await api.streamAgentChat(
        activeSession ? { session_id: activeSession, question } : { question },
        {
          onSession: event => {
            currentSessionTitle = event.title || currentSessionTitle;
            setActiveSession(event.session_id);
            upsertSessionCard(event.session_id, currentSessionTitle, 0);
          },
          onToolCall: call => {
            const trace = toToolTrace(call);
            setToolTraces(prev => [...prev, trace]);
            setMessages(prev => prev.map(item => (
              item.id === assistantMessageId
                ? {
                    ...item,
                    toolTraces: [...(item.toolTraces ?? []), trace],
                  }
                : item
            )));
            setActivityOpen(true);
          },
          onDelta: chunk => {
            setMessages(prev => prev.map(item => (
              item.id === assistantMessageId
                ? {
                    ...item,
                    content: `${item.content}${chunk}`,
                  }
                : item
            )));
          },
          onReplace: content => {
            setMessages(prev => prev.map(item => (
              item.id === assistantMessageId ? { ...item, content } : item
            )));
          },
          onDone: result => {
            const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
            const finalMessage = result.turn ? assistantMessageFromTurn(result.turn) : {
              id: assistantMessageId,
              role: "assistant" as const,
              content: result.answer,
              timestamp: "刚刚",
              pending: false,
              turnId: result.turn_id,
              toolTraces: result.tool_calls.map(toToolTrace),
              report: result.report ?? null,
              executionSummary: result.thinking,
              runtimeText: formatDuration(elapsed),
              elapsedSeconds: elapsed,
              model: result.model,
            };
            setMessages(prev => prev.map(item => (
              item.id === assistantMessageId
                ? { ...finalMessage, id: assistantMessageId }
                : item
            )));
            setActiveSession(result.session_id);
            setToolTraces(finalMessage.toolTraces ?? []);
            setLatestReport(finalMessage.report ?? null);
            setExecutionSummary(result.thinking ?? "");
            setActivityElapsed(finalMessage.elapsedSeconds ?? elapsed);
            upsertSessionCard(result.session_id, currentSessionTitle, 1);
          },
          onError: error => {
            const payload = error.data as {
              session_id?: string;
              tool_calls?: AgentToolCall[];
              report?: GeneratedReport | null;
              execution?: string;
            } | undefined;
            if (payload?.session_id) {
              setActiveSession(payload.session_id);
              upsertSessionCard(payload.session_id, currentSessionTitle, 0);
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
          },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "问答请求失败";
      setMessages(prev => prev.map(item => (
        item.id === assistantMessageId
          ? {
              ...item,
              pending: false,
              content: "本轮回答未完成，请查看右侧工具调用与证据记录。",
              timestamp: "刚刚",
              runtimeText: formatDuration(Math.max(1, Math.round((Date.now() - startedAt) / 1000))),
            }
          : item
      )));
      toast.error(message);
    } finally {
      setSending(false);
    }
  };

  const replayMessage = async (message: Message) => {
    const question = findUserQuestionForAssistant(message);
    if (!question) {
      toast.error("未找到对应提问，无法重新生成");
      return;
    }
    await sendMessage(question);
  };

  return (
    <div className="flex flex-col gap-4 lg:flex-row" style={{ height: "calc(100vh - 130px)", minHeight: 0 }}>
      <div
        className="h-32 w-full flex-shrink-0 overflow-hidden rounded-xl lg:h-auto lg:w-56"
        style={{ border: "1px solid #E5EAF2", background: "#fff" }}
      >
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid #E5EAF2" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#1F2937" }}>会话</span>
          <button
            type="button"
            onClick={() => void createSession()}
            disabled={sending}
            className="inline-flex items-center gap-1"
            style={{ fontSize: 12, color: "#163A70" }}
          >
            <Plus size={12} />
            新建
          </button>
        </div>
        <div className="overflow-auto" style={{ maxHeight: "100%" }}>
          <div className="p-2 flex flex-col gap-1.5">
            {loadingSessions && (
              <div style={{ fontSize: 12, color: "#9CA3AF", padding: 12 }}>正在加载会话记录...</div>
            )}
            {!loadingSessions && sessions.length === 0 && (
              <div style={{ fontSize: 12, color: "#9CA3AF", padding: 12 }}>暂无历史会话</div>
            )}
            {sessions.map(session => (
              <div
                key={session.id}
                className="rounded-lg px-3 py-2.5"
                style={{
                  background: activeSession === session.id ? "#EFF6FF" : "transparent",
                  border: activeSession === session.id ? "1px solid #BFDBFE" : "1px solid transparent",
                }}
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => void openSession(session.id)}
                    className="min-w-0 flex-1 text-left"
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
                  <div className="flex items-center gap-1 pt-0.5">
                    <button
                      type="button"
                      title="重命名会话"
                      onClick={() => void renameSession(session)}
                      style={{ color: "#9CA3AF" }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      title="删除会话"
                      onClick={() => void deleteSession(session)}
                      style={{ color: "#9CA3AF" }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl"
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
                <span style={{ fontSize: 12, color: "#163A70" }}>实时问答</span>
              </div>
              <span style={{ fontSize: 12, color: "#4B5563" }}>
                {activeSessionCard?.title || "未命名会话"}
              </span>
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

          <div ref={scrollContainerRef} className="flex-1 overflow-auto px-6 py-5" style={{ minHeight: 0 }}>
            <div className="max-w-3xl mx-auto flex flex-col gap-5">
              {openingSession && (
                <div
                  className="rounded-2xl p-6"
                  style={{ background: "#fff", border: "1px solid #E5EAF2", textAlign: "center" }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#163A70" }}>正在读取会话</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 8 }}>正在加载历史问答与工具调用证据。</div>
                </div>
              )}

              {!openingSession && messages.length === 0 && !sending && (
                <div
                  className="rounded-2xl p-6"
                  style={{ background: "#fff", border: "1px solid #E5EAF2", textAlign: "center" }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#163A70" }}>智能问数</div>
                  <div style={{ fontSize: 12, color: "#6B7280", marginTop: 8, lineHeight: 1.8 }}>
                    数值结论必须来自白名单工具证据；如果数值证据不足，系统只保留定性结论并明确说明。
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
                <MessageBubble
                  key={message.id}
                  message={message}
                  onSelect={selectActivity}
                  onCopy={copyMessage}
                  onReplay={replayMessage}
                  onToggleSpeech={toggleSpeech}
                  speaking={speechState.speaking && speechState.messageId === message.id}
                  liveElapsed={message.pending ? sendingElapsed : message.elapsedSeconds}
                />
              ))}

              <div ref={bottomRef} />
            </div>
          </div>

          <div className="px-6 py-4" style={{ borderTop: "1px solid #E5EAF2", background: "rgba(250,251,252,0.96)" }}>
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

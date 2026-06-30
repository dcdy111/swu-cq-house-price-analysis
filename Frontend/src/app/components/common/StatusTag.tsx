type StatusType = "success" | "warn" | "danger" | "info" | "default";

const STATUS_MAP: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  success: { bg: "rgba(22, 163, 74, 0.2)", text: "#4ADE80", dot: "#4ADE80", label: "" },
  warn: { bg: "rgba(245, 158, 11, 0.2)", text: "#FBBF24", dot: "#FBBF24", label: "" },
  danger: { bg: "rgba(220, 38, 38, 0.2)", text: "#F87171", dot: "#F87171", label: "" },
  info: { bg: "rgba(79, 125, 189, 0.2)", text: "#60A5FA", dot: "#60A5FA", label: "" },
  default: { bg: "rgba(255, 255, 255, 0.1)", text: "rgba(255, 255, 255, 0.6)", dot: "rgba(255, 255, 255, 0.4)", label: "" },
  running: { bg: "rgba(79, 125, 189, 0.2)", text: "#60A5FA", dot: "#60A5FA", label: "运行中" },
  pending: { bg: "rgba(255, 255, 255, 0.1)", text: "rgba(255, 255, 255, 0.6)", dot: "rgba(255, 255, 255, 0.4)", label: "待运行" },
  paused: { bg: "rgba(245, 158, 11, 0.2)", text: "#FBBF24", dot: "#FBBF24", label: "已暂停" },
  failed: { bg: "rgba(220, 38, 38, 0.2)", text: "#F87171", dot: "#F87171", label: "失败" },
  partial_failed: { bg: "rgba(245, 158, 11, 0.2)", text: "#FBBF24", dot: "#FBBF24", label: "部分失败" },
  active: { bg: "rgba(22, 163, 74, 0.2)", text: "#4ADE80", dot: "#4ADE80", label: "在售" },
  sold: { bg: "rgba(255, 255, 255, 0.1)", text: "rgba(255, 255, 255, 0.6)", dot: "rgba(255, 255, 255, 0.4)", label: "已售" },
};

export function StatusTag({ status, label }: { status: string; label?: string }) {
  const s = STATUS_MAP[status] || STATUS_MAP.default;
  const displayLabel = label ?? s.label ?? status;
  return (
    <span 
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full transition-all duration-200" 
      style={{ 
        background: s.bg, 
        fontSize: 11, 
        color: s.text,
        border: `1px solid ${s.dot}33`
      }}
    >
      <span 
        className="w-1.5 h-1.5 rounded-full" 
        style={{ 
          background: s.dot,
          boxShadow: `0 0 4px ${s.dot}`
        }} 
      />
      {displayLabel}
    </span>
  );
}

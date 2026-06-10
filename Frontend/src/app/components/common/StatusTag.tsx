type StatusType = "success" | "warn" | "danger" | "info" | "default";

const STATUS_MAP: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  success: { bg: "#F0FDF4", text: "#16A34A", dot: "#16A34A", label: "" },
  warn: { bg: "#FFFBEB", text: "#F59E0B", dot: "#F59E0B", label: "" },
  danger: { bg: "#FEF2F2", text: "#DC2626", dot: "#DC2626", label: "" },
  info: { bg: "#EFF6FF", text: "#1F4E8C", dot: "#4F7DBD", label: "" },
  default: { bg: "#F3F4F6", text: "#6B7280", dot: "#9CA3AF", label: "" },
  running: { bg: "#EFF6FF", text: "#1F4E8C", dot: "#4F7DBD", label: "运行中" },
  pending: { bg: "#F3F4F6", text: "#6B7280", dot: "#9CA3AF", label: "待运行" },
  paused: { bg: "#FFFBEB", text: "#F59E0B", dot: "#F59E0B", label: "已暂停" },
  failed: { bg: "#FEF2F2", text: "#DC2626", dot: "#DC2626", label: "失败" },
  active: { bg: "#F0FDF4", text: "#16A34A", dot: "#16A34A", label: "在售" },
  sold: { bg: "#F3F4F6", text: "#6B7280", dot: "#9CA3AF", label: "已售" },
};

export function StatusTag({ status, label }: { status: string; label?: string }) {
  const s = STATUS_MAP[status] || STATUS_MAP.default;
  const displayLabel = label ?? s.label ?? status;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full" style={{ background: s.bg, fontSize: 12, color: s.text }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {displayLabel}
    </span>
  );
}

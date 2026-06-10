import { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string;
  unit?: string;
  change?: number;
  changeLabel?: string;
  icon?: ReactNode;
  accent?: boolean;
}

export function KpiCard({ title, value, unit, change, changeLabel, icon, accent }: KpiCardProps) {
  const isPos = change !== undefined && change >= 0;
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3"
      style={{ background: accent ? "#163A70" : "#fff", border: accent ? "none" : "1px solid #E5EAF2", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
    >
      <div className="flex items-start justify-between">
        <span style={{ fontSize: 13, color: accent ? "rgba(255,255,255,0.7)" : "#6B7280" }}>{title}</span>
        {icon && (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: accent ? "rgba(255,255,255,0.15)" : "#F7F9FC" }}>
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-end gap-1.5">
        <span style={{ fontSize: 28, fontWeight: 700, color: accent ? "#fff" : "#1F2937", lineHeight: 1 }}>{value}</span>
        {unit && <span style={{ fontSize: 13, color: accent ? "rgba(255,255,255,0.6)" : "#9CA3AF", marginBottom: 2 }}>{unit}</span>}
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1">
          {isPos ? <TrendingUp size={12} style={{ color: "#16A34A" }} /> : <TrendingDown size={12} style={{ color: "#DC2626" }} />}
          <span style={{ fontSize: 12, color: isPos ? "#16A34A" : "#DC2626" }}>
            {isPos ? "+" : ""}{change}%
          </span>
          {changeLabel && <span style={{ fontSize: 12, color: accent ? "rgba(255,255,255,0.5)" : "#9CA3AF" }}>{changeLabel}</span>}
        </div>
      )}
    </div>
  );
}

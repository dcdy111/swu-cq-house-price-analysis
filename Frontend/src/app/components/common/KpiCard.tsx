import { ReactNode, useEffect, useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string;
  unit?: string;
  change?: number;
  changeLabel?: string;
  icon?: ReactNode;
  accent?: boolean;
  delay?: number;
}

export function KpiCard({ title, value, unit, change, changeLabel, icon, accent, delay = 0 }: KpiCardProps) {
  const isPos = change !== undefined && change >= 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`rounded-lg p-4 flex min-w-0 flex-col gap-3 fade-in-up ${visible ? "" : "opacity-0"}`}
      style={{ 
        animationDelay: `${delay}ms`,
        background: accent ? "#163A70" : "#fff",
        border: accent ? "none" : "1px solid #E5EAF2",
        boxShadow: "0 2px 12px rgba(22, 58, 112, 0.08)",
        transition: "all 0.3s ease"
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(22, 58, 112, 0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 2px 12px rgba(22, 58, 112, 0.08)";
      }}
    >
      <div className="flex items-start justify-between">
        <span style={{ fontSize: 13, color: accent ? "rgba(255,255,255,0.7)" : "#6B7280" }}>{title}</span>
        {icon && (
          <div 
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ 
              background: accent ? "rgba(255,255,255,0.15)" : "#F7F9FC"
            }}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1">
        <span 
          style={{ 
            fontSize: 26,
            fontWeight: 700, 
            color: accent ? "#fff" : "#1F2937",
            lineHeight: 1,
            fontFamily: "'SF Mono', 'Consolas', monospace"
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 13, color: accent ? "rgba(255,255,255,0.6)" : "#9CA3AF", marginBottom: 2 }}>
            {unit}
          </span>
        )}
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1">
          {isPos ? (
            <TrendingUp size={12} style={{ color: "#16A34A" }} />
          ) : (
            <TrendingDown size={12} style={{ color: "#DC2626" }} />
          )}
          <span style={{ fontSize: 12, color: isPos ? "#16A34A" : "#DC2626" }}>
            {isPos ? "+" : ""}{change}%
          </span>
          {changeLabel && (
            <span style={{ fontSize: 12, color: accent ? "rgba(255,255,255,0.5)" : "#9CA3AF" }}>
              {changeLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

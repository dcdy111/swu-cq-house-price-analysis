import { ReactNode, useEffect, useState, useRef } from "react";
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

function AnimatedNumber({ value }: { value: string }) {
  const [displayValue, setDisplayValue] = useState("0");
  const [hasAnimated, setHasAnimated] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);
          // 提取数字
          const numStr = value.replace(/[^0-9.]/g, "");
          if (numStr) {
            const target = parseFloat(numStr);
            const duration = 1500;
            const startTime = performance.now();
            const start = 0;

            const animate = (currentTime: number) => {
              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);
              // 使用 easeOutExpo
              const easeProgress = 1 - Math.pow(1 - progress, 4);
              const current = Math.floor(start + (target - start) * easeProgress);
              setDisplayValue(current.toLocaleString());

              if (progress < 1) {
                requestAnimationFrame(animate);
              } else {
                setDisplayValue(value);
              }
            };

            requestAnimationFrame(animate);
          } else {
            setDisplayValue(value);
          }
        }
      },
      { threshold: 0.5 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [value, hasAnimated]);

  return <span ref={ref}>{displayValue}</span>;
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
      className={`rounded-xl p-5 flex flex-col gap-3 kpi-glass ${visible ? "fade-in-up" : "opacity-0"}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between">
        <span style={{ fontSize: 13, color: "var(--dark-text-secondary)" }}>{title}</span>
        {icon && (
          <div 
            className="w-10 h-10 rounded-lg flex items-center justify-center pulse-glow"
            style={{ 
              background: accent ? "rgba(230, 126, 34, 0.2)" : "rgba(79, 125, 189, 0.15)",
              border: `1px solid ${accent ? "rgba(230, 126, 34, 0.3)" : "rgba(79, 125, 189, 0.2)"}`
            }}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-end gap-1.5">
        <span 
          style={{ 
            fontSize: 30, 
            fontWeight: 700, 
            color: accent ? "#fff" : "var(--dark-text-primary)",
            lineHeight: 1,
            fontFamily: "'SF Mono', 'Consolas', monospace"
          }}
        >
          <AnimatedNumber value={value} />
        </span>
        {unit && (
          <span style={{ fontSize: 13, color: "var(--dark-text-muted)", marginBottom: 2 }}>
            {unit}
          </span>
        )}
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1">
          {isPos ? (
            <TrendingUp size={12} style={{ color: "#4ADE80" }} />
          ) : (
            <TrendingDown size={12} style={{ color: "#F87171" }} />
          )}
          <span style={{ fontSize: 12, color: isPos ? "#4ADE80" : "#F87171" }}>
            {isPos ? "+" : ""}{change}%
          </span>
          {changeLabel && (
            <span style={{ fontSize: 12, color: "var(--dark-text-muted)" }}>
              {changeLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

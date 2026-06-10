import { ReactNode } from "react";

interface SectionCardProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  noPad?: boolean;
}

export function SectionCard({ title, subtitle, action, children, className = "", noPad }: SectionCardProps) {
  return (
    <div
      className={`rounded-xl ${className}`}
      style={{ background: "#fff", border: "1px solid #E5EAF2", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
    >
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #E5EAF2" }}>
          <div>
            {title && <h3 style={{ fontSize: 14, fontWeight: 600, color: "#1F2937" }}>{title}</h3>}
            {subtitle && <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={noPad ? "" : "p-5"}>{children}</div>
    </div>
  );
}

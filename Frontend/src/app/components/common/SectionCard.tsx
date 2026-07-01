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
      style={{ 
        background: "#fff", 
        border: "1px solid #E5EAF2", 
        boxShadow: "0 2px 12px rgba(22, 58, 112, 0.06)",
        overflow: "hidden"
      }}
    >
      {(title || action) && (
        <div 
          className="flex flex-col items-start gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
          style={{ 
            borderBottom: "1px solid #E5EAF2",
            background: "linear-gradient(90deg, #F8FAFC 0%, #fff 100%)"
          }}
        >
          <div className="min-w-0">
            {title && (
              <h3 style={{ 
                fontSize: 14, 
                fontWeight: 600, 
                color: "#1F2937",
                display: "flex",
                alignItems: "center",
                gap: 8
              }}>
                <span style={{
                  width: 3,
                  height: 14,
                  background: "linear-gradient(180deg, #163A70 0%, #4F7DBD 100%)",
                  borderRadius: 2,
                  display: "inline-block"
                }} />
                {title}
              </h3>
            )}
            {subtitle && (
              <p style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2, lineHeight: 1.5 }}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div className="w-full sm:w-auto">{action}</div>}
        </div>
      )}
      <div className={noPad ? "" : "p-5"}>
        {children}
      </div>
    </div>
  );
}

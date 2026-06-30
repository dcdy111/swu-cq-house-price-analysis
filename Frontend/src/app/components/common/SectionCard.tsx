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
      className={`rounded-xl ${className} glass-card`}
      style={{ overflow: "hidden" }}
    >
      {(title || action) && (
        <div 
          className="flex items-center justify-between px-5 py-4"
          style={{ 
            borderBottom: "1px solid var(--dark-card-border)",
            background: "linear-gradient(90deg, rgba(79, 125, 189, 0.08) 0%, transparent 100%)"
          }}
        >
          <div>
            {title && (
              <h3 style={{ 
                fontSize: 14, 
                fontWeight: 600, 
                color: "var(--dark-text-primary)",
                display: "flex",
                alignItems: "center",
                gap: 8
              }}>
                <span style={{
                  width: 3,
                  height: 14,
                  background: "linear-gradient(180deg, #4F7DBD 0%, #E67E22 100%)",
                  borderRadius: 2,
                  display: "inline-block"
                }} />
                {title}
              </h3>
            )}
            {subtitle && (
              <p style={{ fontSize: 12, color: "var(--dark-text-muted)", marginTop: 2 }}>
                {subtitle}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className={noPad ? "" : "p-5"} style={{ color: "var(--dark-text-primary)" }}>
        {children}
      </div>
    </div>
  );
}

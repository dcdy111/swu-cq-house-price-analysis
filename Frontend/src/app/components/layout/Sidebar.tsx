import { useNavigate, useLocation } from "react-router";
import {
  LayoutDashboard, Database, Radio, BarChart2, MessageSquare,
  Settings, ChevronLeft, ChevronRight, ShieldCheck
} from "lucide-react";

const NAV_ITEMS = [
  { path: "/dashboard", label: "首页总览", icon: LayoutDashboard },
  { path: "/listings", label: "房源数据管理", icon: Database },
  { path: "/crawl", label: "采集任务管理", icon: Radio },
  { path: "/quality", label: "数据清洗质量", icon: ShieldCheck },
  { path: "/analysis", label: "分析建模", icon: BarChart2 },
  { path: "/agent", label: "智能问答与报告", icon: MessageSquare },
  { path: "/settings", label: "系统设置", icon: Settings },
];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside
      className="hidden md:flex flex-col h-full transition-all duration-300 relative sidebar-dark"
      style={{ width: collapsed ? 72 : 220, flexShrink: 0 }}
    >
      {/* 装饰性顶部光效 */}
      <div 
        className="absolute top-0 left-0 right-0 h-1"
        style={{
          background: "linear-gradient(90deg, #163A70 0%, #4F7DBD 50%, #E67E22 100%)"
        }}
      />

      {/* Logo */}
      <div 
        className="flex items-center gap-3 px-4 py-5 border-b"
        style={{ borderColor: "rgba(255,255,255,0.08)" }}
      >
        <div 
          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center breathe"
          style={{ 
            background: "linear-gradient(135deg, #163A70 0%, #4F7DBD 100%)",
            boxShadow: "0 4px 12px rgba(22, 58, 112, 0.4)"
          }}
        >
          <span style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>西</span>
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, whiteSpace: "nowrap" }}>
              重庆房价分析
            </div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, whiteSpace: "nowrap" }}>
              西南大学 · 数据平台
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 overflow-hidden">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const active = location.pathname === path || (path === "/dashboard" && location.pathname === "/");
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`w-full flex items-center gap-3 px-4 py-3 transition-all duration-200 text-left nav-item-dark ${active ? "active" : ""}`}
              style={{
                color: active ? "#fff" : "rgba(255,255,255,0.6)",
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  e.currentTarget.style.color = "#fff";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "rgba(255,255,255,0.6)";
                }
              }}
            >
              <Icon 
                size={18} 
                style={{ 
                  flexShrink: 0,
                  filter: active ? "drop-shadow(0 0 4px rgba(79, 125, 189, 0.6))" : "none"
                }} 
              />
              {!collapsed && (
                <span style={{ fontSize: 13, whiteSpace: "nowrap" }}>{label}</span>
              )}
              {active && (
                <span 
                  className="ml-auto w-1.5 h-1.5 rounded-full breathe"
                  style={{ background: "#E67E22", boxShadow: "0 0 8px rgba(230, 126, 34, 0.6)" }}
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="flex items-center justify-center py-3 border-t transition-all duration-200 hover:bg-white/5"
        style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "rgba(255,255,255,0.8)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "rgba(255,255,255,0.4)";
        }}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {/* 底部装饰光效 */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(79, 125, 189, 0.3) 50%, transparent 100%)"
        }}
      />
    </aside>
  );
}

export function MobileNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav
      aria-label="移动端主导航"
      className="fixed inset-x-0 bottom-0 z-50 flex h-16 overflow-x-auto border-t sidebar-dark"
      style={{ borderColor: "rgba(255,255,255,0.1)" }}
    >
      {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
        const active = location.pathname === path || (path === "/dashboard" && location.pathname === "/");
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="flex min-w-[72px] flex-1 flex-col items-center justify-center gap-1 px-2 transition-all duration-200"
            style={{
              color: active ? "#fff" : "rgba(255,255,255,0.5)",
              borderTop: active ? "2px solid #E67E22" : "2px solid transparent",
              background: active ? "rgba(79, 125, 189, 0.2)" : "transparent",
            }}
          >
            <Icon size={17} />
            <span style={{ fontSize: 10, whiteSpace: "nowrap" }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

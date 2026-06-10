import { useState } from "react";
import { useNavigate, useLocation } from "react-router";
import {
  LayoutDashboard, Database, Radio, BarChart2, MessageSquare,
  Settings, ChevronLeft, ChevronRight, Home
} from "lucide-react";

const NAV_ITEMS = [
  { path: "/dashboard", label: "首页总览", icon: LayoutDashboard },
  { path: "/listings", label: "房源数据管理", icon: Database },
  { path: "/crawl", label: "采集任务管理", icon: Radio },
  { path: "/analysis", label: "分析建模", icon: BarChart2 },
  { path: "/agent", label: "智能问答与报告", icon: MessageSquare },
  { path: "/settings", label: "系统设置", icon: Settings },
];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside
      className="flex flex-col h-full transition-all duration-300 relative"
      style={{ width: collapsed ? 64 : 220, background: "#163A70", flexShrink: 0 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#E67E22" }}>
          <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>西</span>
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div style={{ color: "#fff", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>重庆房价分析</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, whiteSpace: "nowrap" }}>西南大学 · 数据平台</div>
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
              className="w-full flex items-center gap-3 px-4 py-3 transition-colors text-left"
              style={{
                background: active ? "rgba(255,255,255,0.15)" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,0.65)",
                borderLeft: active ? "3px solid #E67E22" : "3px solid transparent",
              }}
            >
              <Icon size={18} style={{ flexShrink: 0 }} />
              {!collapsed && <span style={{ fontSize: 13, whiteSpace: "nowrap" }}>{label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="flex items-center justify-center py-3 border-t"
        style={{ borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
}

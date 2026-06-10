import { Bell, Search, User, Circle } from "lucide-react";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";

export function Topbar() {
  return (
    <header
      className="flex items-center justify-between px-6 gap-4 flex-shrink-0"
      style={{ height: 64, background: "#fff", borderBottom: "1px solid #E5EAF2" }}
    >
      {/* Left: title */}
      <div className="flex items-center gap-3">
        <span style={{ color: "#163A70", fontSize: 16, fontWeight: 700 }}>重庆二手房价格数据分析与智能可视化系统</span>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
          <Input placeholder="搜索房源、区域..." className="pl-9 h-8 w-52" style={{ fontSize: 13 }} />
        </div>

        {/* Last update */}
        <span style={{ color: "#9CA3AF", fontSize: 12 }}>数据更新: 2026-06-09 10:30</span>

        {/* Bell */}
        <button className="relative">
          <Bell size={18} style={{ color: "#6B7280" }} />
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "#DC2626", fontSize: 10, color: "#fff" }}>3</span>
        </button>

        {/* System status */}
        <div className="flex items-center gap-1.5">
          <Circle size={8} fill="#16A34A" stroke="none" />
          <span style={{ color: "#16A34A", fontSize: 12 }}>系统运行中</span>
        </div>

        {/* User */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background: "#F7F9FC" }}>
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#163A70" }}>
            <User size={12} style={{ color: "#fff" }} />
          </div>
          <div className="text-left">
            <div style={{ fontSize: 12, fontWeight: 600, color: "#1F2937", lineHeight: 1.2 }}>admin</div>
            <div style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.2 }}>研究员</div>
          </div>
        </div>
      </div>
    </header>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Bell, Search, User, Circle, LogOut, Settings, CheckCircle2 } from "lucide-react";
import { Input } from "../ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { toast } from "sonner";
import { api, getStoredUser } from "../../services/api";

export function Topbar({ onLogout }: { onLogout: () => void }) {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState(sessionStorage.getItem("listingSearch") ?? "");
  const [latestUpdatedAt, setLatestUpdatedAt] = useState<string | null>(null);
  const user = getStoredUser();

  useEffect(() => {
    api.getOverview().then(data => setLatestUpdatedAt(data.kpis.latest_updated_at ?? null)).catch(() => setLatestUpdatedAt(null));
  }, []);

  const submitSearch = () => {
    const text = keyword.trim();
    if (!text) {
      toast.info("请输入要检索的区县、小区或标题关键词");
      return;
    }
    sessionStorage.setItem("listingSearch", text);
    navigate("/listings");
    window.dispatchEvent(new Event("listing-search"));
    setKeyword("");
    toast.success(`已跳转到房源检索：${text}`);
  };

  return (
    <header
      className="flex items-center justify-between px-3 md:px-6 gap-2 md:gap-4 flex-shrink-0 transition-all duration-300"
      style={{ 
        height: 64, 
        background: "rgba(13, 27, 42, 0.8)", 
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)"
      }}
    >
      {/* Left: title */}
      <div className="flex min-w-0 items-center gap-3">
        <span 
          className="hidden sm:inline truncate gradient-text" 
          style={{ fontSize: 16, fontWeight: 700 }}
        >
          重庆二手房价格数据分析与智能可视化系统
        </span>
        <span 
          className="sm:hidden truncate gradient-text" 
          style={{ fontSize: 14, fontWeight: 700 }}
        >
          重庆房价分析
        </span>
      </div>

      {/* Right: actions */}
      <div className="flex flex-shrink-0 items-center gap-1 sm:gap-4">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search 
            size={14} 
            className="absolute left-3 top-1/2 -translate-y-1/2" 
            style={{ color: "var(--dark-text-muted)" }} 
          />
          <Input
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") submitSearch();
            }}
            placeholder="搜索房源、区域..."
            className="pl-9 h-9 w-56 dark-input"
            style={{ fontSize: 13 }}
          />
        </div>

        {/* Last update */}
        <span 
          className="hidden lg:inline breathe" 
          style={{ color: "var(--dark-text-muted)", fontSize: 12 }}
        >
          数据更新: {latestUpdatedAt?.slice(0, 16) ?? "暂无"}
        </span>

        {/* Bell */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              type="button" 
              aria-label="系统通知" 
              className="relative rounded-lg p-2 transition-all duration-200 hover:bg-white/5"
              style={{ color: "var(--dark-text-secondary)" }}
            >
              <Bell size={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            align="end" 
            className="w-80"
            style={{ 
              background: "rgba(27, 38, 59, 0.95)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)"
            }}
          >
            <DropdownMenuLabel 
              className="gradient-text" 
              style={{ fontSize: 13 }}
            >
              系统通知
            </DropdownMenuLabel>
            <DropdownMenuSeparator style={{ background: "rgba(255, 255, 255, 0.1)" }} />
            <DropdownMenuItem className="items-start gap-2 py-2 cursor-pointer" style={{ color: "var(--dark-text-primary)" }}>
              <CheckCircle2 size={14} style={{ color: "#4ADE80", marginTop: 2 }} />
              <div className="flex flex-col gap-0.5">
                <span style={{ fontSize: 12, fontWeight: 600 }}>暂无未读通知</span>
                <span style={{ fontSize: 11, color: "var(--dark-text-muted)" }}>系统只展示后端返回的真实业务数据。</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* System status */}
        <div className="hidden sm:flex items-center gap-1.5">
          <Circle 
            size={8} 
            fill="#4ADE80" 
            stroke="none" 
            className="breathe"
          />
          <span style={{ color: "#4ADE80", fontSize: 12 }}>系统运行中</span>
        </div>

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="用户菜单"
              title="用户菜单"
              className="flex min-w-10 items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200 hover:bg-white/5"
              style={{ background: "rgba(255, 255, 255, 0.05)" }}
            >
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ 
                  background: "linear-gradient(135deg, #163A70 0%, #4F7DBD 100%)",
                  boxShadow: "0 2px 8px rgba(22, 58, 112, 0.4)"
                }}
              >
                <User size={14} style={{ color: "#fff" }} />
              </div>
              <div className="hidden sm:block text-left">
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--dark-text-primary)", lineHeight: 1.2 }}>
                  {user?.username ?? "admin"}
                </div>
                <div style={{ fontSize: 11, color: "var(--dark-text-muted)", lineHeight: 1.2 }}>研究员</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            align="end" 
            sideOffset={8} 
            className="w-44 z-[100]"
            style={{ 
              background: "rgba(27, 38, 59, 0.95)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)"
            }}
          >
            <DropdownMenuLabel style={{ fontSize: 12, color: "var(--dark-text-primary)" }}>
              {user?.username ?? "admin"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator style={{ background: "rgba(255, 255, 255, 0.1)" }} />
            <DropdownMenuItem 
              onSelect={() => navigate("/settings")}
              style={{ color: "var(--dark-text-primary)", cursor: "pointer" }}
              className="hover:bg-white/5"
            >
              <Settings size={14} />
              系统设置
            </DropdownMenuItem>
            <DropdownMenuItem 
              onSelect={() => api.me().then(() => toast.success("当前用户会话有效")).catch(error => toast.error(error.message))}
              style={{ color: "var(--dark-text-primary)", cursor: "pointer" }}
              className="hover:bg-white/5"
            >
              <CheckCircle2 size={14} />
              检查会话
            </DropdownMenuItem>
            <DropdownMenuSeparator style={{ background: "rgba(255, 255, 255, 0.1)" }} />
            <DropdownMenuItem 
              onSelect={() => { api.logout().catch(() => null); onLogout(); navigate("/login"); }}
              style={{ color: "#F87171", cursor: "pointer" }}
              className="hover:bg-red-500/10"
            >
              <LogOut size={14} />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

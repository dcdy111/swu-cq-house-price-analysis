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
      className="flex items-center justify-between px-3 md:px-6 gap-2 md:gap-4 flex-shrink-0"
      style={{ 
        height: 64, 
        background: "#fff", 
        borderBottom: "1px solid #E5EAF2"
      }}
    >
      {/* Left: title */}
      <div className="flex min-w-0 items-center gap-3">
        <span 
          className="hidden sm:inline truncate" 
          style={{ fontSize: 16, fontWeight: 700, color: "#163A70" }}
        >
          重庆二手房价格数据分析与智能可视化系统
        </span>
        <span 
          className="sm:hidden truncate" 
          style={{ fontSize: 14, fontWeight: 700, color: "#163A70" }}
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
            style={{ color: "#9CA3AF" }} 
          />
          <Input
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") submitSearch();
            }}
            placeholder="搜索房源、区域..."
            className="pl-9 h-9 w-56"
            style={{ fontSize: 13 }}
          />
        </div>

        {/* Last update */}
        <span 
          className="hidden lg:inline" 
          style={{ color: "#9CA3AF", fontSize: 12 }}
        >
          数据更新: {latestUpdatedAt?.slice(0, 16) ?? "暂无"}
        </span>

        {/* Bell */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              type="button" 
              aria-label="系统通知" 
              className="relative rounded-lg p-2 hover:bg-gray-100 transition-colors"
              style={{ color: "#6B7280" }}
            >
              <Bell size={18} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            align="end" 
            className="w-80"
          >
            <DropdownMenuLabel style={{ color: "#163A70", fontSize: 13 }}>
              系统通知
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="items-start gap-2 py-2 cursor-pointer">
              <CheckCircle2 size={14} style={{ color: "#16A34A", marginTop: 2 }} />
              <div className="flex flex-col gap-0.5">
                <span style={{ fontSize: 12, fontWeight: 600, color: "#1F2937" }}>暂无未读通知</span>
                <span style={{ fontSize: 11, color: "#6B7280" }}>系统只展示后端返回的真实业务数据。</span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* System status */}
        <div className="hidden sm:flex items-center gap-1.5">
          <Circle size={8} fill="#16A34A" stroke="none" />
          <span style={{ color: "#16A34A", fontSize: 12 }}>系统运行中</span>
        </div>

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="用户菜单"
              title="用户菜单"
              className="flex min-w-10 items-center gap-2 px-3 py-1.5 rounded-lg transition-colors hover:bg-gray-100"
              style={{ background: "#F7F9FC" }}
            >
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ 
                  background: "linear-gradient(135deg, #163A70 0%, #4F7DBD 100%)"
                }}
              >
                <User size={14} style={{ color: "#fff" }} />
              </div>
              <div className="hidden sm:block text-left">
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1F2937", lineHeight: 1.2 }}>
                  {user?.username ?? "admin"}
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.2 }}>研究员</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="w-44 z-[100]">
            <DropdownMenuLabel style={{ fontSize: 12, color: "#1F2937" }}>
              {user?.username ?? "admin"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onSelect={() => navigate("/settings")}
              style={{ color: "#1F2937", cursor: "pointer" }}
            >
              <Settings size={14} />
              系统设置
            </DropdownMenuItem>
            <DropdownMenuItem 
              onSelect={() => { api.logout().catch(() => null); onLogout(); navigate("/login"); }}
              style={{ color: "#DC2626", cursor: "pointer" }}
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

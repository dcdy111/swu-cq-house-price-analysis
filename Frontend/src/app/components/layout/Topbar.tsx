import { useState } from "react";
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

const NOTIFICATIONS = [
  { title: "安居客任务部分失败", desc: "南岸区第 18-22 页触发频率限制", level: "warn" },
  { title: "数据质量报告已更新", desc: "全市完整率 94.6%，较昨日提升 0.4%", level: "success" },
  { title: "模型训练完成", desc: "XGBoost v2.3.1，R²=0.842", level: "success" },
];

export function Topbar() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState(sessionStorage.getItem("listingSearch") ?? "");
  const [unread, setUnread] = useState(NOTIFICATIONS.length);

  const submitSearch = () => {
    const text = keyword.trim();
    if (!text) {
      toast.info("请输入要检索的区县、小区或标题关键词");
      return;
    }
    sessionStorage.setItem("listingSearch", text);
    navigate("/listings");
    toast.success(`已跳转到房源检索：${text}`);
  };

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
          <Input
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") submitSearch();
            }}
            placeholder="搜索房源、区域..."
            className="pl-9 h-8 w-56"
            style={{ fontSize: 13 }}
          />
        </div>

        {/* Last update */}
        <span style={{ color: "#9CA3AF", fontSize: 12 }}>数据更新: 2026-06-09 10:30</span>

        {/* Bell */}
        <DropdownMenu onOpenChange={open => open && setUnread(0)}>
          <DropdownMenuTrigger asChild>
            <button className="relative rounded-full p-1.5 hover:bg-[#F7F9FC] transition-colors">
              <Bell size={18} style={{ color: "#6B7280" }} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: "#DC2626", fontSize: 10, color: "#fff" }}>
                  {unread}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel style={{ color: "#163A70", fontSize: 13 }}>系统通知</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {NOTIFICATIONS.map(item => (
              <DropdownMenuItem key={item.title} className="items-start gap-2 py-2">
                <CheckCircle2 size={14} style={{ color: item.level === "success" ? "#16A34A" : "#F59E0B", marginTop: 2 }} />
                <div className="flex flex-col gap-0.5">
                  <span style={{ fontSize: 12, color: "#1F2937", fontWeight: 600 }}>{item.title}</span>
                  <span style={{ fontSize: 11, color: "#6B7280" }}>{item.desc}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* System status */}
        <div className="flex items-center gap-1.5">
          <Circle size={8} fill="#16A34A" stroke="none" />
          <span style={{ color: "#16A34A", fontSize: 12 }}>系统运行中</span>
        </div>

        {/* User */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-[#EFF6FF] transition-colors" style={{ background: "#F7F9FC" }}>
              <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "#163A70" }}>
                <User size={12} style={{ color: "#fff" }} />
              </div>
              <div className="text-left">
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1F2937", lineHeight: 1.2 }}>admin</div>
                <div style={{ fontSize: 11, color: "#9CA3AF", lineHeight: 1.2 }}>研究员</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuLabel style={{ fontSize: 12 }}>张浩博</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/settings")}>
              <Settings size={14} />
              系统设置
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => toast.success("已刷新当前用户会话")}>
              <CheckCircle2 size={14} />
              检查会话
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/login")} variant="destructive">
              <LogOut size={14} />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

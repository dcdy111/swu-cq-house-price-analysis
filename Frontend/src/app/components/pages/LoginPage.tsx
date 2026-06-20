import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { ChongqingSkyline } from "../common/ChongqingSkyline";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { api, saveAuth } from "../../services/api";
import { toast } from "sonner";

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate();
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("swu@2026");

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      toast.error("请输入用户名和密码");
      return;
    }
    setLoading(true);
    try {
      const result = await api.login({ username: username.trim(), password });
      saveAuth(result);
      onLogin();
      navigate("/dashboard");
      toast.success("登录成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen" style={{ background: "#F7F9FC" }}>
      {/* Left: skyline */}
      <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #163A70 0%, #1F4E8C 60%, #4F7DBD 100%)" }}>
        <div className="absolute inset-0 flex flex-col items-center justify-center p-12 gap-8">
          {/* SWU Badge */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full border-4 flex items-center justify-center" style={{ borderColor: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.1)" }}>
              <span style={{ color: "#fff", fontSize: 28, fontWeight: 700 }}>西大</span>
            </div>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 700, letterSpacing: 2 }}>西南大学</div>
            <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>Southwest University · 商贸学院</div>
          </div>

          <div className="text-center">
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, lineHeight: 1.4 }}>重庆二手房价格数据</h1>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, lineHeight: 1.4 }}>分析与智能可视化系统</h1>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 12 }}>scikit-learn · DeepSeek Agent · ECharts / Recharts</p>
          </div>

          <div className="w-full" style={{ maxWidth: 480 }}>
            <ChongqingSkyline />
          </div>
        </div>

        {/* 1906 watermark */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center">
          <span style={{ color: "rgba(255,255,255,0.08)", fontSize: 80, fontWeight: 900 }}>1906</span>
        </div>
      </div>

      {/* Right: login form */}
      <div className="flex flex-col items-center justify-center w-full lg:w-96 xl:w-[420px] px-8 gap-8" style={{ background: "#fff" }}>
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#163A70" }}>欢迎登录</h2>
            <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>请输入您的账号和密码</p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label style={{ fontSize: 13 }}>用户名</Label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
                <Input value={username} onChange={event => setUsername(event.target.value)} className="pl-9" placeholder="输入用户名" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label style={{ fontSize: 13 }}>密码</Label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
                <Input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter") void handleLogin();
                  }}
                  className="pl-9 pr-10"
                  placeholder="输入密码"
                />
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPwd(v => !v)}
                >
                  {showPwd ? <EyeOff size={14} style={{ color: "#9CA3AF" }} /> : <Eye size={14} style={{ color: "#9CA3AF" }} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox id="remember" defaultChecked />
                <Label htmlFor="remember" style={{ fontSize: 12, fontWeight: 400, cursor: "pointer" }}>记住我</Label>
              </div>
              <span style={{ fontSize: 12, color: "#9CA3AF" }}>课程演示环境</span>
            </div>
          </div>

          <Button
            onClick={handleLogin}
            disabled={loading}
            className="w-full h-10"
            style={{ background: "#163A70", color: "#fff", fontSize: 14 }}
          >
            {loading ? "登录中..." : "登 录"}
          </Button>

          <p className="text-center" style={{ fontSize: 12, color: "#9CA3AF" }}>
            当前版本仅提供本地管理员登录，不包含统一身份认证。
          </p>
        </div>

        <p style={{ fontSize: 12, color: "#9CA3AF" }}>© 2026 西南大学商贸学院 · 数据科学与大数据技术</p>
      </div>
    </div>
  );
}

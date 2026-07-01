import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { api, saveAuth } from "../../services/api";
import { toast } from "sonner";

const badgeUrl = "/brand/swu-badge.png";
const campusPhotoUrl = "/brand/swu-campus-aerial.png";

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate();
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

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
      <div
        className="hidden lg:flex flex-col flex-1 relative overflow-hidden"
        style={{ background: "#0F2D57" }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(135deg, rgba(9, 25, 48, 0.82) 0%, rgba(22, 58, 112, 0.48) 44%, rgba(9, 25, 48, 0.72) 100%), url(${campusPhotoUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center center",
            transform: "scale(1.04)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 20% 18%, rgba(255,255,255,0.14), transparent 24%), linear-gradient(180deg, rgba(255,255,255,0.04), transparent 42%)",
          }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center p-12 gap-8" style={{ zIndex: 1 }}>
          <div className="flex flex-col items-center gap-3">
            <div
              className="rounded-full p-2"
              style={{ background: "rgba(255,255,255,0.92)", boxShadow: "0 20px 50px rgba(8, 26, 52, 0.28)" }}
            >
              <img
                src={badgeUrl}
                alt="西南大学校徽"
                style={{ width: 104, height: 104, objectFit: "contain" }}
              />
            </div>
            <div style={{ color: "#fff", fontSize: 18, fontWeight: 700, letterSpacing: 1.5 }}>西南大学商贸学院</div>
            <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 13 }}>
              大数据管理与应用专业
            </div>
          </div>

          <div className="text-center">
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, lineHeight: 1.4 }}>重庆二手房价格数据</h1>
            <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, lineHeight: 1.4 }}>分析与智能可视化系统</h1>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 12 }}>
              基于 MySQL 真实房源数据的采集、清洗、建模与智能问答
            </p>
          </div>
        </div>

        <div className="absolute bottom-8 left-0 right-0 flex justify-center" style={{ zIndex: 1 }}>
          <span style={{ color: "rgba(255,255,255,0.08)", fontSize: 80, fontWeight: 900 }}>1906</span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center w-full lg:w-96 xl:w-[420px] px-8 gap-8" style={{ background: "#fff" }}>
        <div className="w-full max-w-sm flex flex-col gap-6">
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: "#163A70" }}>欢迎登录</h2>
            <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>请输入您的账号和密码</p>
          </div>

          <form
            className="flex flex-col gap-4"
            autoComplete="off"
            onSubmit={event => {
              event.preventDefault();
              void handleLogin();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label style={{ fontSize: 13 }}>用户名</Label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
                <Input
                  value={username}
                  onChange={event => setUsername(event.target.value)}
                  className="pl-9"
                  placeholder="输入用户名"
                  autoComplete="off"
                />
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
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  onClick={() => setShowPwd(v => !v)}
                >
                  {showPwd ? <EyeOff size={14} style={{ color: "#9CA3AF" }} /> : <Eye size={14} style={{ color: "#9CA3AF" }} />}
                </button>
              </div>
            </div>
          </form>

          <Button
            onClick={handleLogin}
            disabled={loading}
            className="w-full h-10"
            style={{ background: "#163A70", color: "#fff", fontSize: 14 }}
          >
            {loading ? "登录中..." : "登 录"}
          </Button>
        </div>

        <p style={{ fontSize: 12, color: "#9CA3AF" }}>© 2026 西南大学商贸学院 · 大数据管理与应用专业</p>
      </div>
    </div>
  );
}

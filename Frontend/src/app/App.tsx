import { MemoryRouter, Routes, Route, Navigate } from "react-router";
import { useEffect, useState } from "react";
import { Toaster } from "./components/ui/sonner";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./components/pages/LoginPage";
import { DashboardPage } from "./components/pages/DashboardPage";
import { ListingsPage } from "./components/pages/ListingsPage";
import { CrawlTasksPage } from "./components/pages/CrawlTasksPage";
import { QualityPage } from "./components/pages/QualityPage";
import { AnalysisPage } from "./components/pages/AnalysisPage";
import { AgentPage } from "./components/pages/AgentPage";
import { SettingsPage } from "./components/pages/SettingsPage";
import { api, AUTH_EXPIRED_EVENT, clearAuthToken, hasAuthToken } from "./services/api";

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(!hasAuthToken());

  useEffect(() => {
    let active = true;

    const handleAuthExpired = () => {
      clearAuthToken();
      if (!active) return;
      setAuthenticated(false);
      setAuthChecked(true);
    };

    if (typeof window !== "undefined") {
      window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    }

    const verifyToken = async () => {
      if (!hasAuthToken()) {
        if (!active) return;
        setAuthenticated(false);
        setAuthChecked(true);
        return;
      }
      try {
        await api.me();
        if (!active) return;
        setAuthenticated(true);
      } catch (error) {
        const unauthorized = typeof error === "object" && error !== null && (error as { status?: number }).status === 401;
        if (unauthorized) {
          clearAuthToken();
        }
        if (!active) return;
        setAuthenticated(!unauthorized);
      } finally {
        if (active) {
          setAuthChecked(true);
        }
      }
    };

    void verifyToken();

    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
      }
    };
  }, []);

  const handleLogout = () => {
    clearAuthToken();
    setAuthenticated(false);
    setAuthChecked(true);
  };

  if (!authChecked) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F5F7FB",
          color: "#163A70",
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        正在校验登录状态...
      </div>
    );
  }

  return (
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route
          path="/login"
          element={authenticated ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={() => { setAuthenticated(true); setAuthChecked(true); }} />}
        />
        <Route element={authenticated ? <AppShell onLogout={handleLogout} /> : <Navigate to="/login" replace />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/listings" element={<ListingsPage />} />
          <Route path="/crawl" element={<CrawlTasksPage />} />
          <Route path="/quality" element={<QualityPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <Toaster richColors position="top-right" />
    </MemoryRouter>
  );
}

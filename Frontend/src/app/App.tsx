import { MemoryRouter, Routes, Route, Navigate } from "react-router";
import { useState } from "react";
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
import { clearAuthToken, hasAuthToken } from "./services/api";

export default function App() {
  const [authenticated, setAuthenticated] = useState(hasAuthToken());

  const handleLogout = () => {
    clearAuthToken();
    setAuthenticated(false);
  };

  return (
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={authenticated ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={() => setAuthenticated(true)} />} />
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

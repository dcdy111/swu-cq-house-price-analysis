import { MemoryRouter, Routes, Route, Navigate } from "react-router";
import { Toaster } from "./components/ui/sonner";
import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./components/pages/LoginPage";
import { DashboardPage } from "./components/pages/DashboardPage";
import { ListingsPage } from "./components/pages/ListingsPage";
import { CrawlTasksPage } from "./components/pages/CrawlTasksPage";
import { AnalysisPage } from "./components/pages/AnalysisPage";
import { AgentPage } from "./components/pages/AgentPage";
import { SettingsPage } from "./components/pages/SettingsPage";

export default function App() {
  return (
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/listings" element={<ListingsPage />} />
          <Route path="/crawl" element={<CrawlTasksPage />} />
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

import { useState } from "react";
import { Outlet } from "react-router";
import { MobileNavigation, Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ onLogout }: { onLogout: () => void }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#F7F9FC" }}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar onLogout={onLogout} />
        <main className="flex-1 overflow-auto p-3 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

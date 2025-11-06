"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Toolbar } from "./toolbar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeSection: string;
  setActiveSection: (section: string) => void;
  totalSessions?: number;
  totalMinutes?: number;
  avgScore?: number;
}

export function DashboardLayout({
  children,
  activeSection,
  setActiveSection,
  totalSessions,
  totalMinutes,
  avgScore,
}: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        totalSessions={totalSessions}
        totalMinutes={totalMinutes}
        avgScore={avgScore}
      />

      {/* Mobile Overlay */}
      {!sidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Main Content */}
      <div className={`flex-1 flex flex-col ${!sidebarCollapsed ? "md:ml-0" : ""}`}>
        {/* Top Toolbar */}
        <Toolbar activeSection={activeSection} />

        {/* Dashboard Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

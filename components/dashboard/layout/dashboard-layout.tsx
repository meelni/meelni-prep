"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeSection: string;
  setActiveSection: (section: string) => void;
  totalSessions?: number;
  totalMinutes?: number;
  avgScore?: number;
  user?: any;
  onSignOut?: () => void;
}

export function DashboardLayout({
  children,
  activeSection,
  setActiveSection,
  totalSessions,
  totalMinutes,
  avgScore,
  user,
  onSignOut,
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
        user={user}
        onSignOut={onSignOut}
      />

      {/* Mobile Overlay */}
      {!sidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Main Content - NO TOOLBAR */}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}

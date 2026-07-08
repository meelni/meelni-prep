"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeSection: string;
  totalSessions?: number;
  totalMinutes?: number;
  avgScore?: number;
  user?: DashboardUser | null;
  onSignOut?: () => void;
}

export interface DashboardUser {
  email?: string | null;
  user_metadata?: {
    full_name?: string | null;
  };
}

export const DASHBOARD_CONTENT_PANEL_CLASS_NAME =
  "border-dashboard-panel-border bg-dashboard-panel min-h-full overflow-hidden rounded-[10px] border";

export const DASHBOARD_SIDEBAR_SHELL_CLASS_NAME = "hidden md:block";

export function DashboardLayout({
  children,
  activeSection,
  totalSessions,
  totalMinutes,
  avgScore,
  user,
  onSignOut,
}: DashboardLayoutProps) {
  // Initialize from localStorage to prevent animation on page load
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sidebar-collapsed");
      return saved === "true";
    }
    return false;
  });

  // Persist to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  return (
    <div className="bg-dashboard-canvas text-dashboard-foreground flex h-screen [--accent:#24242a] [--border:var(--dashboard-panel-border)] [--card:var(--dashboard-panel)] [--foreground:var(--dashboard-foreground)] [--muted-foreground:var(--dashboard-muted)] [--muted:#2a2a31] [--secondary:#24242a]">
      {/* Sidebar */}
      <div className={DASHBOARD_SIDEBAR_SHELL_CLASS_NAME}>
        <Sidebar
          key={`sidebar-${activeSection}`}
          activeSection={activeSection}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          totalSessions={totalSessions}
          totalMinutes={totalMinutes}
          avgScore={avgScore}
          user={user}
          onSignOut={onSignOut}
        />
      </div>

      {/* Preserve the shell overlay token without blocking mobile content. */}
      <div className="bg-overlay/50 fixed inset-0 z-40 hidden md:hidden" />

      <main className="bg-dashboard-canvas min-w-0 flex-1 overflow-auto p-2 sm:p-3">
        <section className={DASHBOARD_CONTENT_PANEL_CLASS_NAME}>
          {children}
        </section>
      </main>
    </div>
  );
}

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
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
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

      {/* Mobile Overlay */}
      {!sidebarCollapsed && (
        <div
          className="fixed inset-0 bg-overlay/50 z-40 md:hidden"
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

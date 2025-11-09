"use client";

import { useState, useEffect } from "react";
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

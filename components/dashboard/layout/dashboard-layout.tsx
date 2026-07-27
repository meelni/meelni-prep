"use client";

import { useEffect, useState } from "react";
import { type DashboardActiveSection } from "./dashboard-navigation";
import {
  DashboardMobileNavigation,
  DASHBOARD_MOBILE_NAV_CLASS_NAME,
} from "./dashboard-mobile-navigation";
import { Sidebar } from "./sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeSection: DashboardActiveSection;
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
  "border-dashboard-panel-border bg-dashboard-panel flex h-full min-h-0 flex-col overflow-hidden rounded-[10px] border";

export function getInitialSidebarCollapsed({
  isMobile,
  savedCollapsed,
}: {
  isMobile: boolean;
  savedCollapsed: boolean;
}) {
  return isMobile || savedCollapsed;
}

export function getSidebarCollapsedForViewport({
  isMobile,
}: {
  isMobile: boolean;
}) {
  return isMobile;
}

export const DASHBOARD_SIDEBAR_SHELL_CLASS_NAME = "hidden md:block";

export { DASHBOARD_MOBILE_NAV_CLASS_NAME };

export function DashboardLayout({
  children,
  activeSection,
  user,
  onSignOut,
}: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hasSyncedSidebarPreference, setHasSyncedSidebarPreference] =
    useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    setSidebarCollapsed(
      getInitialSidebarCollapsed({
        isMobile: window.matchMedia("(max-width: 767px)").matches,
        savedCollapsed: saved === "true",
      })
    );
    setHasSyncedSidebarPreference(true);
  }, []);

  // Persist desktop preference without letting mobile visits overwrite it.
  useEffect(() => {
    if (!hasSyncedSidebarPreference) {
      return;
    }

    if (window.matchMedia("(min-width: 768px)").matches) {
      localStorage.setItem("sidebar-collapsed", String(sidebarCollapsed));
    }
  }, [hasSyncedSidebarPreference, sidebarCollapsed]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const syncSidebarForViewport = (
      event: MediaQueryListEvent | MediaQueryList
    ) => {
      setSidebarCollapsed(
        getSidebarCollapsedForViewport({ isMobile: event.matches })
      );
    };

    syncSidebarForViewport(media);
    media.addEventListener("change", syncSidebarForViewport);
    return () => media.removeEventListener("change", syncSidebarForViewport);
  }, []);

  return (
    <div className="bg-dashboard-canvas text-dashboard-foreground flex h-dvh flex-col [--accent:#24242a] [--background:var(--dashboard-panel)] [--border:var(--dashboard-panel-border)] [--card:var(--dashboard-panel)] [--foreground:var(--dashboard-foreground)] [--input:var(--dashboard-panel-border)] [--muted-foreground:var(--dashboard-muted)] [--muted:#2a2a31] [--popover-foreground:var(--dashboard-foreground)] [--popover:var(--dashboard-panel)] [--primary-foreground:var(--dashboard-accent-foreground)] [--primary:var(--dashboard-accent)] [--ring:var(--dashboard-accent)] [--secondary:#24242a] md:flex-row">
      {/* Sidebar */}
      <div className={DASHBOARD_SIDEBAR_SHELL_CLASS_NAME}>
        <Sidebar
          key={`sidebar-${activeSection}`}
          activeSection={activeSection}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          user={user}
          onSignOut={onSignOut}
        />
      </div>

      {/* Preserve the shell overlay token without blocking mobile content. */}
      <div className="bg-overlay/50 fixed inset-0 z-40 hidden md:hidden" />

      <DashboardMobileNavigation
        activeSection={activeSection}
        user={user}
        onSignOut={onSignOut}
      />

      <main className="bg-dashboard-canvas min-h-0 min-w-0 flex-1 overflow-hidden p-3">
        <section className={DASHBOARD_CONTENT_PANEL_CLASS_NAME}>
          {children}
        </section>
      </main>
    </div>
  );
}

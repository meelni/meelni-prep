"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  type DashboardActiveSection,
  DASHBOARD_NAVIGATION_ITEMS,
} from "./dashboard-navigation";
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

export const DASHBOARD_MOBILE_NAV_CLASS_NAME =
  "border-dashboard-panel-border bg-dashboard-canvas shrink-0 border-b px-3 py-2 md:hidden";

export function DashboardLayout({
  children,
  activeSection,
  user,
  onSignOut,
}: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [hasSyncedSidebarPreference, setHasSyncedSidebarPreference] =
    useState(false);
  const activeMobileLinkRef = useRef<HTMLAnchorElement>(null);

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

  useEffect(() => {
    activeMobileLinkRef.current?.scrollIntoView?.({
      block: "nearest",
      inline: "nearest",
    });
  }, [activeSection]);

  return (
    <div className="bg-dashboard-canvas text-dashboard-foreground flex h-screen flex-col [--accent:#24242a] [--border:var(--dashboard-panel-border)] [--card:var(--dashboard-panel)] [--foreground:var(--dashboard-foreground)] [--muted-foreground:var(--dashboard-muted)] [--muted:#2a2a31] [--secondary:#24242a] md:flex-row">
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

      <nav aria-label="Workspace" className={DASHBOARD_MOBILE_NAV_CLASS_NAME}>
        <div className="grid grid-cols-3 gap-1 py-0.5">
          <Link
            ref={
              activeSection === "new-interview"
                ? activeMobileLinkRef
                : undefined
            }
            href="/dashboard/new-interview"
            aria-current={
              activeSection === "new-interview" ? "page" : undefined
            }
            className={cn(
              "focus-visible:ring-ring flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-center text-xs leading-tight font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              activeSection === "new-interview"
                ? "bg-primary text-primary-foreground"
                : "bg-dashboard-panel text-dashboard-foreground hover:bg-dashboard-muted"
            )}
          >
            <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>New Mock Interview</span>
          </Link>
          {DASHBOARD_NAVIGATION_ITEMS.map((item) => {
            const selected = activeSection === item.id;

            return (
              <Link
                key={item.id}
                ref={selected ? activeMobileLinkRef : undefined}
                href={item.href}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring bg-dashboard-canvas flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-center text-xs leading-tight font-semibold focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                  selected
                    ? "bg-dashboard-panel text-dashboard-foreground"
                    : "text-dashboard-muted hover:bg-dashboard-muted/10 hover:text-dashboard-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <main className="bg-dashboard-canvas min-h-0 min-w-0 flex-1 overflow-hidden p-3">
        <section className={DASHBOARD_CONTENT_PANEL_CLASS_NAME}>
          {children}
        </section>
      </main>
    </div>
  );
}

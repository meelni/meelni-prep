"use client";

import {
  ChevronLeft,
  Monitor,
  History,
  BarChart3,
  Settings,
  LogOut,
  BookOpen,
  Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSurface } from "@/components/ui/app-surface";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { DashboardUser } from "./dashboard-layout";

interface SidebarProps {
  activeSection: string;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  totalSessions?: number;
  totalMinutes?: number;
  avgScore?: number;
  user?: DashboardUser | null;
  onSignOut?: () => void;
}

export function Sidebar({
  activeSection,
  collapsed,
  setCollapsed,
  user,
  onSignOut,
}: SidebarProps) {
  const navigationItems = [
    {
      id: "overview",
      icon: Monitor,
      label: "Practice Home",
      href: "/dashboard",
    },
    {
      id: "history",
      icon: History,
      label: "Interview History",
      href: "/dashboard/history",
    },
    {
      id: "questions",
      icon: BookOpen,
      label: "Question Bank",
      href: "/dashboard/questions",
    },
    {
      id: "analytics",
      icon: BarChart3,
      label: "Analytics",
      href: "/dashboard/analytics",
    },
    {
      id: "settings",
      icon: Settings,
      label: "Settings",
      href: "/dashboard/settings",
    },
  ];

  // All navigation items are always visible - empty states handle no-data scenarios
  const visibleNavItems = navigationItems;

  // Animation variants - width only for smooth collapse/expand
  const sidebarVariants = {
    expanded: {
      width: 280,
      transition: {
        type: "spring" as const,
        stiffness: 400,
        damping: 30,
      },
    },
    collapsed: {
      width: 64,
      transition: {
        type: "spring" as const,
        stiffness: 400,
        damping: 30,
      },
    },
  };

  return (
    <motion.aside
      variants={sidebarVariants}
      initial={collapsed ? "collapsed" : "expanded"}
      animate={collapsed ? "collapsed" : "expanded"}
      className="bg-dashboard-canvas text-dashboard-foreground relative z-50 flex h-screen shrink-0 flex-col p-3 md:z-auto"
    >
      <div className="flex h-10 items-center justify-between px-2">
        <Link href="/dashboard" className={cn("block", collapsed && "hidden")}>
          <div className="hover:text-primary font-sans text-base leading-5 font-medium text-white transition-colors">
            meelni
          </div>
        </Link>
        <div className={cn("flex items-center gap-1", collapsed && "mx-auto")}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="text-dashboard-muted h-8 w-8 rounded-lg hover:bg-white/5 hover:text-white"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft
              className={cn(
                "transition-transform duration-300",
                collapsed && "rotate-180"
              )}
              size={16}
            />
          </Button>
        </div>
      </div>

      <div className="flex h-full flex-col gap-3">
        <nav className="flex flex-col gap-1.5 py-2" aria-label="Workspace">
          {!collapsed && (
            <div className="px-0 pb-1 font-sans text-[11px] font-bold tracking-[0.6px] text-[#6b7280] uppercase">
              Workspace
            </div>
          )}
          {visibleNavItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "relative flex h-8 items-center rounded-md text-[13px] leading-4 transition-colors duration-200",
                collapsed ? "justify-center px-2" : "gap-2.5 px-2",
                activeSection === item.id
                  ? "font-semibold text-white"
                  : "font-medium text-[#9ca3af] hover:bg-white/5 hover:text-white"
              )}
              aria-label={`Navigate to ${item.label}`}
              aria-current={activeSection === item.id ? "page" : undefined}
            >
              <item.icon
                className={cn(
                  "size-4 flex-shrink-0 transition-opacity",
                  activeSection === item.id ? "opacity-100" : "opacity-70"
                )}
                aria-hidden="true"
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        <AppSurface
          size="none"
          className={cn(
            "border-0 bg-transparent pt-2 text-dashboard-foreground shadow-none",
            collapsed ? "flex justify-center" : ""
          )}
        >
          <Button
            asChild
            size={collapsed ? "icon" : "sm"}
            className={cn(
              "h-9 rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
              collapsed ? "w-9" : "w-full justify-center gap-2 px-2.5"
            )}
          >
            <Link
              href="/setup"
              aria-label={collapsed ? "Start a new practice rep" : undefined}
              title={collapsed ? "New rep" : undefined}
            >
              <Mic className="size-4 shrink-0" aria-hidden="true" />
              {!collapsed && <span>New rep</span>}
            </Link>
          </Button>
        </AppSurface>

        <div className="flex-1" />

        {!collapsed ? (
          <div className="flex h-10 items-center gap-2.5 px-2">
            {user && (
              <>
                <div className="border-primary/30 bg-primary/10 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[14px] border">
                  <span className="text-primary text-xs leading-4 font-bold">
                    {(user?.user_metadata?.full_name || user?.email || "U")
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] leading-4 font-semibold text-white">
                    {user?.user_metadata?.full_name ||
                      user?.email?.split("@")[0] ||
                      "User"}
                  </div>
                  <div className="truncate text-xs leading-4 text-[#6b7280]">
                    {user?.email}
                  </div>
                </div>
              </>
            )}
            {onSignOut && (
              <Button
                type="button"
                variant="ghost"
                onClick={onSignOut}
                className="text-dashboard-muted h-8 w-8 rounded-lg p-0 hover:bg-white/5 hover:text-white"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={14} />
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {user && (
              <div className="border-primary/30 bg-primary/10 flex h-8 w-8 items-center justify-center rounded-[14px] border">
                <span className="text-primary text-xs font-bold">
                  {(user?.user_metadata?.full_name || user?.email || "U")
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </span>
              </div>
            )}
            {onSignOut && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onSignOut}
                className="text-dashboard-muted h-8 w-8 rounded-lg hover:bg-white/5 hover:text-white"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.aside>
  );
}

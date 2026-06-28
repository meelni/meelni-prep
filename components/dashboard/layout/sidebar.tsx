"use client";

import {
  ChevronLeft,
  Monitor,
  History,
  BarChart3,
  Settings,
  Sparkles,
  LogOut,
  Moon,
  Sun,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSurface } from "@/components/ui/app-surface";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
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
  totalSessions = 0,
  totalMinutes = 0,
  avgScore = 0,
  user,
  onSignOut,
}: SidebarProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleThemeToggle = async () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);

    // Save to database immediately
    try {
      await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: newTheme }),
      });
    } catch (err) {
      console.error("Failed to save theme:", err);
    }
  };

  const navigationItems = [
    { id: "overview", icon: Monitor, label: "Overview", href: "/dashboard" },
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

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

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
      className="bg-card border-border relative flex h-screen flex-col border-r"
    >
      {/* Header Section - Branding + Theme + Collapse Toggle */}
      <div className="border-border/30 flex items-center justify-between border-b px-4 py-6">
        <Link href="/dashboard" className={cn("block", collapsed && "hidden")}>
          <div className="font-display text-foreground hover:text-primary text-xl font-semibold tracking-tight transition-colors">
            meelni
          </div>
        </Link>
        <div className={cn("flex items-center gap-1", collapsed && "mx-auto")}>
          {/* Theme Toggle - Only show when expanded */}
          {mounted && !collapsed && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleThemeToggle}
              className="h-8 w-8 rounded-lg"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <Sun
                  size={16}
                  className="transition-opacity"
                  aria-hidden="true"
                />
              ) : (
                <Moon
                  size={16}
                  className="transition-opacity"
                  aria-hidden="true"
                />
              )}
            </Button>
          )}
          {/* Collapse Toggle */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="h-8 w-8 rounded-lg"
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

      <div className="flex h-full flex-col gap-6 px-4 py-6">
        {/* New Interview CTA - Gradient Glow */}
        <Button
          type="button"
          variant="glow"
          onClick={() => router.push("/setup")}
          className={cn(
            "relative flex items-center rounded-lg text-sm font-medium transition-all duration-300",
            collapsed
              ? "justify-center px-3 py-3"
              : "justify-center gap-2 px-4 py-2.5"
          )}
          aria-label="Start new interview"
        >
          <Sparkles
            size={18}
            className="h-[18px] w-[18px] flex-shrink-0"
            aria-hidden="true"
          />
          {!collapsed && <span className="ml-2">New Interview</span>}
        </Button>

        {/* Divider */}
        <div className="bg-border/50 h-px" />

        {/* Navigation Items */}
        <nav className="flex flex-col gap-1">
          {visibleNavItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "relative flex items-center rounded-lg text-sm transition-all duration-200",
                collapsed ? "justify-center px-3 py-3" : "gap-3 px-3 py-2",
                activeSection === item.id
                  ? "bg-primary/15 text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/50"
              )}
              aria-label={`Navigate to ${item.label}`}
              aria-current={activeSection === item.id ? "page" : undefined}
            >
              {/* Subtle gradient accent for active state */}
              {activeSection === item.id && !collapsed && (
                <div className="from-primary/50 via-primary to-primary/50 absolute top-0 bottom-0 left-0 w-1 rounded-r bg-gradient-to-b" />
              )}
              <item.icon
                size={18}
                className={cn(
                  "h-[18px] w-[18px] flex-shrink-0 transition-opacity",
                  activeSection === item.id ? "opacity-100" : "opacity-70"
                )}
                aria-hidden="true"
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* Divider */}
        <div className="bg-border/50 h-px" />

        {/* Stats Card - Compact */}
        {!collapsed && (
          <AppSurface variant="muted" size="md" className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Sessions</span>
              <span className="text-foreground text-sm font-semibold">
                {totalSessions}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Minutes</span>
              <span className="text-foreground text-sm font-semibold">
                {formatMinutes(totalMinutes)}
              </span>
            </div>
            {avgScore > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs">Avg Score</span>
                <span className="text-foreground text-sm font-semibold">
                  {avgScore.toFixed(1)}/10
                </span>
              </div>
            )}
          </AppSurface>
        )}

        {/* Flexible Spacer */}
        <div className="flex-1" />

        {/* User Section - Card Design at Bottom */}
        {!collapsed ? (
          <AppSurface variant="muted" size="md" className="space-y-3">
            {user && (
              <div className="flex items-center gap-3">
                {/* Avatar Circle */}
                <div className="bg-primary/10 border-primary/30 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border">
                  <span className="text-primary text-sm font-medium">
                    {(user?.user_metadata?.full_name || user?.email || "U")
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </span>
                </div>
                {/* User Info */}
                <div className="min-w-0 flex-1">
                  <div className="text-foreground truncate text-sm font-medium">
                    {user?.user_metadata?.full_name ||
                      user?.email?.split("@")[0] ||
                      "User"}
                  </div>
                  <div className="text-muted-foreground truncate text-xs">
                    {user?.email}
                  </div>
                </div>
              </div>
            )}
            {onSignOut && (
              <Button
                type="button"
                variant="quiet"
                onClick={onSignOut}
                className="w-full gap-2 rounded-md px-3 py-2 text-sm"
              >
                <LogOut size={14} />
                Sign out
              </Button>
            )}
          </AppSurface>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {/* User Avatar Circle */}
            {user && (
              <div className="bg-primary/10 border-primary/30 flex h-10 w-10 items-center justify-center rounded-full border">
                <span className="text-primary text-sm font-medium">
                  {(user?.user_metadata?.full_name || user?.email || "U")
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)}
                </span>
              </div>
            )}
            {/* Sign Out Icon */}
            {onSignOut && (
              <Button
                type="button"
                variant="quiet"
                size="icon"
                onClick={onSignOut}
                className="h-10 w-10 rounded-lg"
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

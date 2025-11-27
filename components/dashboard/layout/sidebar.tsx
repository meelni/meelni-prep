"use client";

import { ChevronLeft, Monitor, History, BarChart3, Settings, Sparkles, LogOut, Moon, Sun, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface SidebarProps {
  activeSection: string;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  totalSessions?: number;
  totalMinutes?: number;
  avgScore?: number;
  user?: any;
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
      await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: newTheme })
      });
    } catch (err) {
      console.error('Failed to save theme:', err);
    }
  };

  const navigationItems = [
    { id: "overview", icon: Monitor, label: "Overview", href: "/dashboard" },
    { id: "history", icon: History, label: "Interview History", href: "/dashboard/history" },
    { id: "questions", icon: BookOpen, label: "Question Bank", href: "/dashboard/questions" },
    { id: "analytics", icon: BarChart3, label: "Analytics", href: "/dashboard/analytics" },
    { id: "settings", icon: Settings, label: "Settings", href: "/dashboard/settings" },
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
      className="relative h-screen bg-card border-r border-border flex flex-col"
    >
      {/* Header Section - Branding + Theme + Collapse Toggle */}
      <div className="flex items-center justify-between px-4 py-6 border-b border-border/30">
        <Link href="/dashboard" className={cn("block", collapsed && "hidden")}>
          <div className="text-xl font-display font-semibold text-foreground tracking-tight hover:text-primary transition-colors">
            meelni
          </div>
        </Link>
        <div className={cn("flex items-center gap-1", collapsed && "mx-auto")}>
          {/* Theme Toggle - Only show when expanded */}
          {mounted && !collapsed && (
            <button
              onClick={handleThemeToggle}
              className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <Sun size={16} className="transition-opacity" aria-hidden="true" />
              ) : (
                <Moon size={16} className="transition-opacity" aria-hidden="true" />
              )}
            </button>
          )}
          {/* Collapse Toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 rounded-lg hover:bg-muted/50 transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft
              className={cn("transition-transform duration-300", collapsed && "rotate-180")}
              size={16}
            />
          </button>
        </div>
      </div>

      <div className="flex flex-col h-full px-4 py-6 gap-6">
        {/* New Interview CTA - Gradient Glow */}
        <button
          onClick={() => router.push("/setup")}
          className={cn(
            "relative rounded-lg text-white font-medium text-sm transition-all duration-300 flex items-center",
            collapsed ? "px-3 py-3 justify-center" : "px-4 py-2.5 justify-center gap-2",
            "bg-gradient-to-r from-primary via-purple-500 to-primary",
            "shadow-[0_0_20px_rgba(120,75,255,0.3)]",
            "hover:shadow-[0_0_30px_rgba(120,75,255,0.5)]"
          )}
          aria-label="Start new interview"
        >
          <Sparkles size={18} className="flex-shrink-0 w-[18px] h-[18px]" aria-hidden="true" />
          {!collapsed && <span className="ml-2">New Interview</span>}
        </button>

        {/* Divider */}
        <div className="h-px bg-border/50" />

        {/* Navigation Items */}
        <nav className="flex flex-col gap-1">
          {visibleNavItems.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "relative flex items-center rounded-lg text-sm transition-all duration-200",
                collapsed ? "px-3 py-3 justify-center" : "px-3 py-2 gap-3",
                activeSection === item.id
                  ? "bg-primary/15 text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/50"
              )}
              aria-label={`Navigate to ${item.label}`}
              aria-current={activeSection === item.id ? "page" : undefined}
            >
              {/* Subtle gradient accent for active state */}
              {activeSection === item.id && !collapsed && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary/50 via-primary to-primary/50 rounded-r" />
              )}
              <item.icon
                size={18}
                className={cn(
                  "flex-shrink-0 w-[18px] h-[18px] transition-opacity",
                  activeSection === item.id ? "opacity-100" : "opacity-70"
                )}
                aria-hidden="true"
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          ))}
        </nav>

        {/* Divider */}
        <div className="h-px bg-border/50" />

        {/* Stats Card - Compact */}
        {!collapsed && (
          <div className="p-4 rounded-lg bg-card/50 border border-border/50 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Sessions</span>
              <span className="text-sm font-semibold text-foreground">{totalSessions}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Minutes</span>
              <span className="text-sm font-semibold text-foreground">{formatMinutes(totalMinutes)}</span>
            </div>
            {avgScore > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Avg Score</span>
                <span className="text-sm font-semibold text-foreground">{avgScore.toFixed(1)}/10</span>
              </div>
            )}
          </div>
        )}

        {/* Flexible Spacer */}
        <div className="flex-1" />

        {/* User Section - Card Design at Bottom */}
        {!collapsed ? (
          <div className="p-4 rounded-lg bg-card/50 border border-border/50 space-y-3">
            {user && (
              <div className="flex items-center gap-3">
                {/* Avatar Circle */}
                <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-medium text-primary">
                    {(user?.user_metadata?.full_name || user?.email || "U")
                      .split(" ")
                      .map((n: string) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </span>
                </div>
                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {user?.email}
                  </div>
                </div>
              </div>
            )}
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-muted/50 hover:bg-muted transition-colors text-sm text-muted-foreground hover:text-foreground"
              >
                <LogOut size={14} />
                Sign out
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {/* User Avatar Circle */}
            {user && (
              <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                <span className="text-sm font-medium text-primary">
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
              <button
                onClick={onSignOut}
                className="p-2.5 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        )}
      </div>
    </motion.aside>
  );
}

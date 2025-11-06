"use client";

import { ChevronRight, Monitor, History, BarChart3, Lightbulb, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import Link from "next/link";

interface SidebarProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  totalSessions?: number;
  totalMinutes?: number;
  avgScore?: number;
}

export function Sidebar({
  activeSection,
  setActiveSection,
  collapsed,
  setCollapsed,
  totalSessions = 0,
  totalMinutes = 0,
  avgScore = 0,
}: SidebarProps) {
  const navigationItems = [
    { id: "overview", icon: Monitor, label: "Overview" },
    { id: "history", icon: History, label: "Interview History" },
    { id: "analytics", icon: BarChart3, label: "Analytics" },
    { id: "feedback", icon: Lightbulb, label: "Feedback & Insights" },
    { id: "settings", icon: Settings, label: "Settings" },
  ];

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <div
      className={`${collapsed ? "w-16" : "w-70"} bg-card border-r border-border transition-all duration-300 fixed md:relative z-50 md:z-auto h-full md:h-auto`}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-8">
          <div className={`${collapsed ? "hidden" : "block"}`}>
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <Icons.logo className="w-6 h-6 text-primary transition-transform duration-300 group-hover:scale-110" />
              <div>
                <h1 className="text-primary font-display font-light text-xl tracking-tight">Meelni</h1>
                <p className="text-muted-foreground text-xs font-sans">Interview Coach</p>
              </div>
            </Link>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="text-muted-foreground hover:text-primary"
          >
            <ChevronRight
              className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${collapsed ? "" : "rotate-180"}`}
            />
          </Button>
        </div>

        <nav className="space-y-2">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-3 p-3 rounded transition-colors ${
                activeSection === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <item.icon className="w-5 h-5 md:w-5 md:h-5 sm:w-6 sm:h-6" />
              {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            </button>
          ))}
        </nav>

        {!collapsed && (
          <div className="mt-8 p-4 bg-muted border border-border rounded">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
              <span className="text-xs text-foreground font-display font-light tracking-wide">READY TO PRACTICE</span>
            </div>
            <div className="text-xs text-muted-foreground space-y-1 font-mono">
              <div>SESSIONS: {totalSessions} COMPLETED</div>
              <div>TOTAL TIME: {formatMinutes(totalMinutes)}</div>
              {avgScore > 0 && <div>AVG SCORE: {avgScore.toFixed(1)}/10</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

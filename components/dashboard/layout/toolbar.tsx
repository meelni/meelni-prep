"use client";

import { Bell, RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/providers/auth-provider";
import { useRouter } from "next/navigation";

interface ToolbarProps {
  activeSection: string;
}

export function Toolbar({ activeSection }: ToolbarProps) {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const getSectionLabel = (section: string) => {
    const labels: Record<string, string> = {
      overview: "OVERVIEW",
      history: "INTERVIEW HISTORY",
      analytics: "ANALYTICS",
      feedback: "FEEDBACK & INSIGHTS",
      settings: "SETTINGS",
    };
    return labels[section] || section.toUpperCase();
  };

  // Get user's display name
  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  // Get current date/time
  const now = new Date();
  const formattedDate = now.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const formattedTime = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <div className="h-16 bg-muted border-b border-border flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <div className="text-sm text-muted-foreground font-mono">
          DASHBOARD / <span className="text-primary">{getSectionLabel(activeSection)}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-xs text-muted-foreground font-mono hidden sm:block">
          LAST UPDATE: {formattedDate} {formattedTime} UTC
        </div>
        <div className="text-sm text-foreground font-medium hidden md:block">
          {displayName}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-primary"
          title="Notifications (Coming Soon)"
        >
          <Bell className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-primary"
          onClick={() => window.location.reload()}
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSignOut}
          className="text-muted-foreground hover:text-destructive"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

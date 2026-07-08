"use client";

import { LogOut, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/app/providers/auth-provider";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface ToolbarProps {
  activeSection: string;
}

export function Toolbar({ activeSection }: ToolbarProps) {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully", {
      description: "You can sign back in anytime.",
      action: {
        label: "Sign In",
        onClick: () => router.push("/auth/signin"),
      },
    });
    router.push("/");
  };

  const getSectionLabel = (section: string) => {
    const labels: Record<string, string> = {
      overview: "Overview",
      history: "Interview History",
      analytics: "Analytics",
      feedback: "Feedback & Insights",
      settings: "Settings",
    };
    return labels[section] || section;
  };

  // Get user's display name
  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

  return (
    <div className="h-16 bg-background/80 backdrop-blur-sm border-b border-border flex items-center justify-between px-6">
      {/* Left: Section Title Only (no breadcrumb) */}
      <div>
        <h1 className="text-lg font-display font-light text-foreground">
          {getSectionLabel(activeSection)}
        </h1>
      </div>

      {/* Right: Primary actions only */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground hidden md:block">
          {displayName}
        </span>

        <Button
          variant="glow"
          size="sm"
          onClick={() => router.push("/dashboard/new-rep")}
        >
          <Mic className="h-4 w-4 mr-2" />
          New Interview
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

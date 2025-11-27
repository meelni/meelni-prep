"use client";

import { DashboardLayout } from "@/components/dashboard/layout/dashboard-layout";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface DashboardErrorProps {
  error: Error;
  reset?: () => void;
}

export function DashboardError({ error, reset }: DashboardErrorProps) {
  const handleRetry = () => {
    if (reset) {
      reset();
    } else {
      window.location.reload();
    }
  };

  return (
    <DashboardLayout
      activeSection="overview"
      totalSessions={0}
      totalMinutes={0}
      avgScore={0}
    >
      <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="bg-card rounded-lg border border-border p-8 max-w-md w-full text-center">
            {/* Error Icon */}
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-orange-500" />
              </div>
            </div>

            {/* Error Message */}
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Unable to Load Dashboard
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {error.message ||
                "We encountered an issue while loading your dashboard data. Please try again."}
            </p>

            {/* Retry Button */}
            <Button onClick={handleRetry} className="w-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>

            {/* Help Text */}
            <p className="text-xs text-muted-foreground mt-4">
              If this issue persists, please contact support.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

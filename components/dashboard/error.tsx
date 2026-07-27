"use client";

import { DashboardStateCard } from "@/components/dashboard/dashboard-surface";
import { DashboardPage } from "@/components/dashboard/layout/dashboard-page";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface DashboardErrorProps {
  error: Error;
  reset?: () => void;
  label?: string;
}

export function DashboardError({
  error,
  reset,
  label = "Dashboard",
}: DashboardErrorProps) {
  const handleRetry = () => {
    if (reset) {
      reset();
    } else {
      window.location.reload();
    }
  };

  return (
    <DashboardPage label={label}>
      <div className="flex min-h-[60vh] items-center justify-center">
        <DashboardStateCard
          role="alert"
          className="w-full max-w-md"
          tone="danger"
          icon={<AlertTriangle className="h-8 w-8" aria-hidden="true" />}
          title={`Unable to load ${label.toLowerCase()}`}
          description={
            error.message ||
            "We encountered an issue while loading this section. Please try again."
          }
          action={
            <Button type="button" onClick={handleRetry} className="w-full">
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          }
        >
          <p className="text-dashboard-muted mt-4 text-xs">
            If this issue persists, please contact support.
          </p>
        </DashboardStateCard>
      </div>
    </DashboardPage>
  );
}

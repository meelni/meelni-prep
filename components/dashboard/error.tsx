"use client";

import { DashboardLayout } from "@/components/dashboard/layout/dashboard-layout";
import { DashboardStateCard } from "@/components/dashboard/dashboard-surface";
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
    <DashboardLayout activeSection="overview">
      <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        <div className="flex min-h-[60vh] items-center justify-center">
          <DashboardStateCard
            className="w-full max-w-md"
            tone="danger"
            icon={<AlertTriangle className="h-8 w-8" />}
            title="Unable to Load Dashboard"
            description={
              error.message ||
              "We encountered an issue while loading your dashboard data. Please try again."
            }
            action={
              <Button onClick={handleRetry} className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            }
          >
            <p className="text-muted-foreground mt-4 text-xs">
              If this issue persists, please contact support.
            </p>
          </DashboardStateCard>
        </div>
      </div>
    </DashboardLayout>
  );
}

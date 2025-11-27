"use client";

import { lazy, Suspense, useEffect } from "react";
import { useSessions } from "@/lib/api/queries";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import { Loader2 } from "lucide-react";
import { DashboardError } from "@/components/dashboard/error";

// Lazy load history section
const HistorySection = lazy(() => import("@/components/dashboard/sections/history").then(m => ({ default: m.HistorySection })));

// Section loading fallback component
function SectionLoading() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading section...</p>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  // Track Web Vitals performance
  useWebVitals('dashboard_history');

  // Track dashboard section views
  useEffect(() => {
    const { analytics } = require('@/lib/analytics/analytics-service');
    analytics.track('dashboard_viewed', {
      section: 'history',
    });
  }, []);

  // Fetch sessions using React Query
  const {
    data,
    isLoading: sessionsLoading,
    error,
    refetch,
  } = useSessions(20);

  // Error state
  if (error) {
    return <DashboardError error={error as Error} reset={() => refetch()} />;
  }

  // Extract data from React Query response
  const sessions = data?.sessions || [];

  return (
    <Suspense fallback={<SectionLoading />}>
      <HistorySection sessions={sessions} loadingSessions={sessionsLoading} />
    </Suspense>
  );
}

"use client";

import { lazy, Suspense, useEffect } from "react";
import { useSessions } from "@/lib/api/queries";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import { DashboardError } from "@/components/dashboard/error";
import { analytics } from "@/lib/analytics/analytics-service";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-surface";

// Lazy load history section
const HistorySection = lazy(() => import("@/components/dashboard/sections/history").then(m => ({ default: m.HistorySection })));

export default function HistoryPage() {
  // Track Web Vitals performance
  useWebVitals('dashboard_history');

  // Track dashboard section views
  useEffect(() => {
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
    <Suspense fallback={<DashboardLoadingState />}>
      <HistorySection sessions={sessions} loadingSessions={sessionsLoading} />
    </Suspense>
  );
}

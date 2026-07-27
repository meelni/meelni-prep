"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { useSessions } from "@/lib/api/queries";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import { DashboardError } from "@/components/dashboard/error";
import { analytics } from "@/lib/analytics/analytics-service";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-surface";

// Lazy load history section
const HistorySection = lazy(() =>
  import("@/components/dashboard/sections/history").then((m) => ({
    default: m.HistorySection,
  }))
);
const HISTORY_PAGE_SIZE = 20;

export default function HistoryPage() {
  const [offset, setOffset] = useState(0);
  // Track Web Vitals performance
  useWebVitals("dashboard_history");

  // Track dashboard section views
  useEffect(() => {
    analytics.track("dashboard_viewed", {
      section: "history",
    });
  }, []);

  // Fetch sessions using React Query
  const {
    data,
    isLoading: sessionsLoading,
    error,
    refetch,
  } = useSessions(HISTORY_PAGE_SIZE, offset);

  // Error state
  if (error) {
    return (
      <DashboardError
        error={error as Error}
        label="Interview History"
        reset={() => refetch()}
      />
    );
  }

  // Extract data from React Query response
  const sessions = data?.sessions || [];
  const pagination = data?.pagination ?? {
    total: 0,
    limit: HISTORY_PAGE_SIZE,
    offset,
    hasMore: false,
  };

  return (
    <Suspense fallback={<DashboardLoadingState />}>
      <HistorySection
        sessions={sessions}
        loadingSessions={sessionsLoading}
        pagination={pagination}
        onPageChange={setOffset}
      />
    </Suspense>
  );
}

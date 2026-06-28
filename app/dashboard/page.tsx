"use client";

import { lazy, Suspense } from "react";
import { FirstTimeUserExperience } from "@/components/dashboard/first-time-user-experience";
import { useSessions } from "@/lib/api/queries";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import { DashboardError } from "@/components/dashboard/error";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-surface";
import { useEffect } from "react";
import { analytics } from "@/lib/analytics/analytics-service";

// Lazy load overview section
const OverviewSection = lazy(() => import("@/components/dashboard/sections/overview").then(m => ({ default: m.OverviewSection })));

export default function DashboardPage() {
  // Track Web Vitals performance
  useWebVitals('dashboard_overview');

  // Track dashboard section views
  useEffect(() => {
    analytics.track('dashboard_viewed', {
      section: 'overview',
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
  const stats = data?.stats || {
    totalSessions: 0,
    totalMinutes: 0,
    avgScore: 0,
    completionRate: 0,
  };

  // Check if first-time user
  const isFirstTimeUser = stats.totalSessions === 0;

  // Show FTUE for first-time users
  if (isFirstTimeUser) {
    return <FirstTimeUserExperience />;
  }

  return (
    <Suspense fallback={<DashboardLoadingState />}>
      <OverviewSection
        sessions={sessions}
        loadingSessions={sessionsLoading}
        totalSessions={stats.totalSessions}
        avgScore={stats.avgScore || undefined}
        totalMinutes={stats.totalMinutes}
        completionRate={stats.completionRate}
      />
    </Suspense>
  );
}

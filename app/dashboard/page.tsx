"use client";

import { lazy, Suspense } from "react";
import { FirstTimeUserExperience } from "@/components/dashboard/first-time-user-experience";
import { useSessions } from "@/lib/api/queries";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import { Loader2 } from "lucide-react";
import { DashboardError } from "@/components/dashboard/error";
import { useEffect } from "react";
import { analytics } from "@/lib/analytics/analytics-service";

// Lazy load overview section
const OverviewSection = lazy(() => import("@/components/dashboard/sections/overview").then(m => ({ default: m.OverviewSection })));

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
    <Suspense fallback={<SectionLoading />}>
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

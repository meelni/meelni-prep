"use client";

import { lazy, Suspense, useEffect } from "react";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import { analytics } from "@/lib/analytics/analytics-service";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-surface";

// Lazy load analytics section
const AnalyticsSection = lazy(() =>
  import("@/components/dashboard/sections/analytics").then((m) => ({
    default: m.AnalyticsSection,
  }))
);

export default function AnalyticsPage() {
  // Track Web Vitals performance
  useWebVitals("dashboard_analytics");

  // Track dashboard section views
  useEffect(() => {
    analytics.track("dashboard_viewed", {
      section: "analytics",
    });
  }, []);

  return (
    <Suspense fallback={<DashboardLoadingState />}>
      <AnalyticsSection />
    </Suspense>
  );
}

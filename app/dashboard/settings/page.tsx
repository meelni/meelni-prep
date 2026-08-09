"use client";

import { lazy, Suspense, useEffect } from "react";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import { analytics } from "@/lib/analytics/analytics-service";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-surface";

// Lazy load settings section
const SettingsSection = lazy(() =>
  import("@/components/dashboard/sections/settings").then((m) => ({
    default: m.SettingsSection,
  }))
);

export default function SettingsPage() {
  // Track Web Vitals performance
  useWebVitals("dashboard_settings");

  // Track dashboard section views
  useEffect(() => {
    analytics.track("dashboard_viewed", {
      section: "settings",
    });
  }, []);

  return (
    <Suspense fallback={<DashboardLoadingState />}>
      <SettingsSection />
    </Suspense>
  );
}

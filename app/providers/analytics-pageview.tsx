"use client";

/**
 * Analytics Pageview Component
 * Client component that tracks pageviews automatically
 */

import { Suspense } from "react";
import { useAnalyticsPageview } from "@/lib/analytics/use-analytics-pageview";

function PageviewTracker() {
  useAnalyticsPageview();
  return null;
}

export function AnalyticsPageview() {
  return (
    <Suspense fallback={null}>
      <PageviewTracker />
    </Suspense>
  );
}

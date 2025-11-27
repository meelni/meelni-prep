"use client";

import { lazy, Suspense, useEffect } from "react";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import { Loader2 } from "lucide-react";

// Lazy load analytics section
const AnalyticsSection = lazy(() => import("@/components/dashboard/sections/analytics").then(m => ({ default: m.AnalyticsSection })));

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

export default function AnalyticsPage() {
  // Track Web Vitals performance
  useWebVitals('dashboard_analytics');

  // Track dashboard section views
  useEffect(() => {
    const { analytics } = require('@/lib/analytics/analytics-service');
    analytics.track('dashboard_viewed', {
      section: 'analytics',
    });
  }, []);

  return (
    <Suspense fallback={<SectionLoading />}>
      <AnalyticsSection />
    </Suspense>
  );
}

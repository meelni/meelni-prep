"use client";

import { lazy, Suspense, useEffect } from "react";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import { Loader2 } from "lucide-react";
import { analytics } from "@/lib/analytics/analytics-service";

// Lazy load settings section
const SettingsSection = lazy(() => import("@/components/dashboard/sections/settings").then(m => ({ default: m.SettingsSection })));

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

export default function SettingsPage() {
  // Track Web Vitals performance
  useWebVitals('dashboard_settings');

  // Track dashboard section views
  useEffect(() => {
    analytics.track('dashboard_viewed', {
      section: 'settings',
    });
  }, []);

  return (
    <Suspense fallback={<SectionLoading />}>
      <SettingsSection />
    </Suspense>
  );
}

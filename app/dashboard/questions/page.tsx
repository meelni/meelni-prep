"use client";

import { lazy, Suspense, useEffect } from "react";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import { analytics } from "@/lib/analytics/analytics-service";
import { DashboardLoadingState } from "@/components/dashboard/dashboard-surface";

// Lazy load questions section
const QuestionsSection = lazy(() => import("@/components/dashboard/sections/questions").then(m => ({ default: m.QuestionsSection })));

export default function QuestionsPage() {
  // Track Web Vitals performance
  useWebVitals('dashboard_questions');

  // Track dashboard section views
  useEffect(() => {
    analytics.track('dashboard_viewed', {
      section: 'questions',
    });
  }, []);

  return (
    <Suspense fallback={<DashboardLoadingState />}>
      <QuestionsSection />
    </Suspense>
  );
}

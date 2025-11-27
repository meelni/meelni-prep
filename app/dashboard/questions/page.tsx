"use client";

import { lazy, Suspense, useEffect } from "react";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import { Loader2 } from "lucide-react";

// Lazy load questions section
const QuestionsSection = lazy(() => import("@/components/dashboard/sections/questions").then(m => ({ default: m.QuestionsSection })));

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

export default function QuestionsPage() {
  // Track Web Vitals performance
  useWebVitals('dashboard_questions');

  // Track dashboard section views
  useEffect(() => {
    const { analytics } = require('@/lib/analytics/analytics-service');
    analytics.track('dashboard_viewed', {
      section: 'questions',
    });
  }, []);

  return (
    <Suspense fallback={<SectionLoading />}>
      <QuestionsSection />
    </Suspense>
  );
}

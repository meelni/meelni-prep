"use client";

import { useEffect } from "react";
import { useAnalyticsConsent } from "@/app/providers/analytics-consent-provider";
import { analytics } from "./analytics-service";

export function useWebVitals(pageName: string) {
  const { decision, resolved } = useAnalyticsConsent();

  useEffect(() => {
    if (
      !resolved ||
      decision !== "accepted" ||
      typeof performance === "undefined"
    )
      return;
    const timer = window.setTimeout(() => {
      const navigation = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      const firstPaint = performance.getEntriesByName(
        "first-contentful-paint"
      )[0];
      analytics.track("page_performance", {
        page: pageName,
        ttfb: navigation ? Math.round(navigation.responseStart) : undefined,
        fcp: firstPaint ? Math.round(firstPaint.startTime) : undefined,
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [decision, pageName, resolved]);
}

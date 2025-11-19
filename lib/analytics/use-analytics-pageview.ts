"use client";

/**
 * Analytics Pageview Hook
 * Automatic pageview tracking on route changes
 */

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { analytics } from "./analytics-service";

/**
 * Hook to track pageviews automatically
 * Call this in root layout or page components
 *
 * Note: This hook must be wrapped in a Suspense boundary
 * when used in pages (not needed in layout.tsx)
 */
export function useAnalyticsPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname) {
      // Build full URL with sanitized query params
      const params = searchParams ? searchParams.toString() : "";
      const url = params ? `${pathname}?${params}` : pathname;

      // Track pageview
      analytics.pageview(url);
    }
  }, [pathname, searchParams]);
}

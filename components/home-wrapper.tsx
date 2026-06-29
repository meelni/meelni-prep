"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/sections/header";
import { Hero } from "@/components/sections/hero";
import { DiscontinuedBanner } from "@/components/discontinued-banner";
import { analytics } from "@/lib/analytics/analytics-service";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";
import { FEATURE_EVENTS, FEATURE_GATES } from "@/lib/feature-flags/gates";
import { useFeatureFlag, useFeatureFlags } from "@/lib/feature-flags";

interface HomeWrapperProps {
  children: React.ReactNode;
}

export function HomeWrapper({ children }: HomeWrapperProps) {
  const searchParams = useSearchParams();
  const reactivationEnabled = useFeatureFlag(FEATURE_GATES.meelniReactivationAccess);
  const { localDevId, logEvent, ready } = useFeatureFlags();

  // Track Web Vitals performance
  useWebVitals('landing_page');

  // Track landing page view
  useEffect(() => {
    analytics.track('landing_page_viewed', {
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      utm_source: searchParams?.get('utm_source') || undefined,
      utm_medium: searchParams?.get('utm_medium') || undefined,
      utm_campaign: searchParams?.get('utm_campaign') || undefined,
    });
  }, [searchParams]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    logEvent(
      FEATURE_EVENTS.reactivationGateViewed,
      reactivationEnabled ? "enabled" : "disabled",
      {
        gate: FEATURE_GATES.meelniReactivationAccess,
        local_dev_id: localDevId ?? "unknown",
      }
    );
  }, [localDevId, logEvent, ready, reactivationEnabled]);

  return (
    <>
      {!reactivationEnabled && <DiscontinuedBanner />}
      <Header />
      <Hero />
      {children}
    </>
  );
}

"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/sections/header";
import { Hero } from "@/components/sections/hero";
import { DiscontinuedBanner } from "@/components/discontinued-banner";
import { analytics } from "@/lib/analytics/analytics-service";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";

interface HomeWrapperProps {
  children: React.ReactNode;
}

export function HomeWrapper({ children }: HomeWrapperProps) {
  const searchParams = useSearchParams();

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

  return (
    <>
      <DiscontinuedBanner />
      <Header />
      <Hero />
      {children}
    </>
  );
}

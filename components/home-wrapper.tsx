"use client";

import { useEffect } from "react";
import { Header } from "@/components/sections/header";
import { Hero } from "@/components/sections/hero";
import { analytics } from "@/lib/analytics/analytics-service";
import { useWebVitals } from "@/lib/analytics/use-web-vitals";

interface HomeWrapperProps {
  children: React.ReactNode;
}

export function HomeWrapper({ children }: HomeWrapperProps) {
  // Track Web Vitals performance
  useWebVitals("landing_page");

  // Track landing page view
  useEffect(() => {
    analytics.track("landing_page_viewed", {});
  }, []);

  return (
    <>
      <Header />
      <Hero />
      {children}
    </>
  );
}

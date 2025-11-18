"use client";

import { useState, createContext, useContext, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Header } from "@/components/sections/header";
import { Hero } from "@/components/sections/hero";
import { analytics } from "@/lib/analytics/analytics-service";

interface HomeWrapperProps {
  children: React.ReactNode;
}

// Create context for demo modal state
const DemoModalContext = createContext<(open: boolean) => void>(() => {});

export function HomeWrapper({ children }: HomeWrapperProps) {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const searchParams = useSearchParams();

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
    <DemoModalContext.Provider value={setIsDemoModalOpen}>
      <Header isDemoModalOpen={isDemoModalOpen} />
      <Hero
        isDemoModalOpen={isDemoModalOpen}
        setIsDemoModalOpen={setIsDemoModalOpen}
      />
      {children}
    </DemoModalContext.Provider>
  );
}

// Export hook to use demo modal context
export function useDemoModal() {
  return useContext(DemoModalContext);
}

"use client";

import { useState, createContext, useContext } from "react";
import { Header } from "@/components/sections/header";
import { Hero } from "@/components/sections/hero";

interface HomeWrapperProps {
  children: React.ReactNode;
}

// Create context for demo modal state
const DemoModalContext = createContext<(open: boolean) => void>(() => {});

export function HomeWrapper({ children }: HomeWrapperProps) {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);

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

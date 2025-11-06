"use client";

import { useState } from "react";
import { Header } from "@/components/sections/header";
import { Hero } from "@/components/sections/hero";

interface HomeWrapperProps {
  children: React.ReactNode;
}

export function HomeWrapper({ children }: HomeWrapperProps) {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);

  return (
    <>
      <Header isDemoModalOpen={isDemoModalOpen} />
      <Hero
        isDemoModalOpen={isDemoModalOpen}
        setIsDemoModalOpen={setIsDemoModalOpen}
      />
      {children}
    </>
  );
}

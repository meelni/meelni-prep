"use client";

import { AuroraText } from "@/components/aurora-text";
import { Icons } from "@/components/icons";
import { Section } from "@/components/section";
import { buttonVariants } from "@/components/ui/button";
import { DotPattern } from "@/components/ui/dot-pattern";
import { AnimatedBars } from "@/components/ui/animated-bars";
import CheckeredBackground from "@/components/ui/checkered-background";
import { DemoModal } from "@/components/demo-modal";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

const ease = [0.16, 1, 0.3, 1];

function HeroPill() {
  return (
    <motion.a
      href="/blog/introducing-dev-ai"
      className="flex w-auto items-center space-x-2 rounded-full bg-primary/20 px-2 py-1 ring-1 ring-accent whitespace-pre"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease }}
    >
      <div className="w-fit rounded-full bg-accent px-2 py-0.5 text-left text-label text-primary">
        ✨ New
      </div>
      <p className="text-label text-primary">
        AI-Powered Mock Interviews
      </p>
      <svg
        width="12"
        height="12"
        className="ml-1"
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8.78141 5.33312L5.20541 1.75712L6.14808 0.814453L11.3334 5.99979L6.14808 11.1851L5.20541 10.2425L8.78141 6.66645H0.666748V5.33312H8.78141Z"
          fill="hsl(var(--primary))"
        />
      </svg>
    </motion.a>
  );
}

function HeroTitles() {
  return (
    <div className="flex w-full max-w-3xl flex-col pt-8">
      <motion.h1
        className="text-left text-display-xl md:text-[56px] md:leading-[56px] font-display font-light text-foreground tracking-tight"
        initial={{ filter: "blur(10px)", opacity: 0, y: 50 }}
        animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
        transition={{
          duration: 1,
          ease,
          staggerChildren: 0.2,
        }}
      >
        <motion.span
          className="inline-block text-balance bg-gradient-to-r from-foreground via-foreground/90 to-foreground/80 bg-clip-text text-transparent"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.8,
            delay: 0.5,
            ease,
          }}
        >
          {siteConfig.hero.title}
        </motion.span>
      </motion.h1>
      <motion.p
        className="text-left max-w-xl mt-4 text-body text-muted-foreground text-balance"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: 0.6,
          duration: 0.8,
          ease,
        }}
      >
        {siteConfig.hero.description}
      </motion.p>
    </div>
  );
}

interface HeroCTAProps {
  isDemoModalOpen: boolean;
  setIsDemoModalOpen: (open: boolean) => void;
}

function HeroCTA({ isDemoModalOpen, setIsDemoModalOpen }: HeroCTAProps) {
  return (
    <>
      <div className="relative mt-8">
        <motion.div
          className="flex w-full max-w-2xl flex-col items-start justify-start gap-4 sm:flex-row"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.8, ease }}
        >
          {/* Primary CTA - Start A Mock (routes to dashboard with auth) */}
          <Link
            href="/dashboard"
            className="group relative w-full sm:w-auto overflow-hidden rounded-xl bg-gradient-to-r from-primary via-primary/90 to-primary/80 px-8 py-4 text-background font-semibold shadow-lg transition-all duration-300 hover:shadow-xl hover:shadow-primary/25 hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="relative z-10 flex items-center gap-3">
              <svg
                className="w-5 h-5 transition-transform duration-300 group-hover:scale-110"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>Start A Mock</span>
              <svg
                className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </div>
            {/* Shimmer effect on hover */}
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-background/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          </Link>

          {/* Secondary CTA - Talk to Meelni (opens demo modal, no auth) */}
          <button
            onClick={() => setIsDemoModalOpen(true)}
            className="group relative w-full sm:w-auto overflow-hidden rounded-xl border-2 border-border bg-background/50 backdrop-blur-sm px-8 py-4 font-semibold transition-all duration-300 hover:border-primary/50 hover:bg-background/80 hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="relative z-10 flex items-center gap-3">
              <svg
                className="w-5 h-5 transition-transform duration-300 group-hover:scale-110"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
              <span>Talk to Meelni</span>
            </div>
          </button>
      </motion.div>

        {/* Subtle helper text */}
        <motion.p
          className="mt-4 text-body text-muted-foreground/80"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.6 }}
        >
          Try a quick demo or customize your full interview
        </motion.p>
      </div>

      {/* Demo Modal */}
      <DemoModal isOpen={isDemoModalOpen} onClose={() => setIsDemoModalOpen(false)} />
    </>
  );
}

interface HeroProps {
  isDemoModalOpen: boolean;
  setIsDemoModalOpen: (open: boolean) => void;
}

export function Hero({ isDemoModalOpen, setIsDemoModalOpen }: HeroProps) {
  const [isMobile, setIsMobile] = useState(true);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return (
    <Section id="hero" className="max-w-none relative pb-4 bg-background overflow-hidden">
      {/* Checkered background layer */}
      <CheckeredBackground
        className="absolute inset-0 z-0"
        cellSize="50px"
        strokeWidth="1.5px"
        color="#8b5cf6"
        opacity={0.25}
        fade={false}
      />

      {/* Gradient overlays for text readability */}
      {/* Top gradient - fades near header */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-background via-background/80 to-transparent z-[1]" />

      {/* Left side gradient - protects text area */}
      <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-background via-background/60 to-transparent z-[1]" />

      {/* Bottom gradient - smooth transition to next section */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent z-[1]" />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-x-8 w-full px-6 pt-12 pb-4 lg:px-24 lg:pt-16 lg:pb-4 lg:h-[550px] items-center">
        <div className="flex flex-col justify-center items-start lg:col-span-1">
          <HeroTitles />
          <HeroCTA
            isDemoModalOpen={isDemoModalOpen}
            setIsDemoModalOpen={setIsDemoModalOpen}
          />
        </div>
        {!isMobile && (
          <div className="relative h-[500px] lg:col-span-1 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              className="flex items-center justify-center"
            >
              <AnimatedBars barCount={60} />
            </motion.div>
          </div>
        )}
      </div>
    </Section>
  );
}

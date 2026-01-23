"use client";

import { Section } from "@/components/section";
import { AnimatedBars } from "@/components/ui/animated-bars";
import CheckeredBackground from "@/components/ui/checkered-background";
import { DemoModal } from "@/components/demo-modal";
import { siteConfig } from "@/lib/config";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const ease = [0.16, 1, 0.3, 1] as const;

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
  onDemoClick: () => void;
}

function HeroCTA({ onDemoClick }: HeroCTAProps) {
  return (
    <div className="relative mt-8">
      <motion.div
        className="flex w-full max-w-2xl flex-col items-start justify-start"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.8, ease }}
      >
        {/* Demo button */}
        <button
          onClick={onDemoClick}
          className="group relative w-full sm:w-auto overflow-hidden rounded-xl border-2 border-primary/60 bg-primary/10 backdrop-blur-md px-8 py-4 font-semibold transition-all duration-300 hover:border-primary hover:bg-primary/20 hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="relative z-10 flex items-center gap-3">
            <svg
              className="w-5 h-5 text-primary transition-transform duration-300 group-hover:scale-110"
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
            <span className="text-primary">Talk to Meelni</span>
          </div>
        </button>
      </motion.div>
    </div>
  );
}

export function Hero() {
  const [isMobile, setIsMobile] = useState(true);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);

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
    <>
      <Section id="hero" className="max-w-none relative pb-4 bg-background overflow-hidden">
        {/* Checkered background layer - vibrant purple glow */}
        <CheckeredBackground
          className="absolute inset-0 z-0"
          cellSize="50px"
          strokeWidth="1.5px"
          color="hsl(var(--primary))"
          opacity={0.15}
          fade={false}
        />

        {/* Radial glow effect for depth */}
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent" />

        {/* Gradient overlays for visual depth */}
        {/* Top gradient - fades near header */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-background via-background/90 to-transparent z-[1]" />

        {/* Left side gradient - creates depth */}
        <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-background via-background/70 to-transparent z-[1]" />

        {/* Bottom gradient - smooth transition to next section */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent z-[1]" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-x-8 w-full px-6 pt-12 pb-4 lg:px-24 lg:pt-16 lg:pb-4 lg:h-[550px] items-center">
          <div className="flex flex-col justify-center items-start lg:col-span-1">
            <HeroTitles />
            <HeroCTA onDemoClick={() => setIsDemoModalOpen(true)} />
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

      {/* Demo Modal */}
      <DemoModal isOpen={isDemoModalOpen} onClose={() => setIsDemoModalOpen(false)} />
    </>
  );
}

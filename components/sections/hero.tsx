"use client";

import { Section } from "@/components/section";
import { AnimatedBars } from "@/components/ui/animated-bars";
import { Button } from "@/components/ui/button";
import CheckeredBackground from "@/components/ui/checkered-background";
import { DemoModal } from "@/components/demo-modal";
import { siteConfig } from "@/lib/config";
import { motion } from "framer-motion";
import { Mic } from "lucide-react";
import { useEffect, useState } from "react";

const ease = [0.16, 1, 0.3, 1] as const;

function HeroTitles() {
  return (
    <div className="flex w-full max-w-3xl flex-col pt-8">
      <motion.h1
        className="text-display-hero text-foreground text-left tracking-tight"
        initial={{ filter: "blur(10px)", opacity: 0, y: 50 }}
        animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
        transition={{
          duration: 1,
          ease,
          staggerChildren: 0.2,
        }}
      >
        <motion.span
          className="from-foreground via-foreground/90 to-foreground/80 inline-block bg-gradient-to-r bg-clip-text text-balance text-transparent"
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
        className="text-body text-muted-foreground mt-4 max-w-xl text-left text-balance"
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
        <Button
          type="button"
          onClick={onDemoClick}
          variant="outline"
          className="group border-primary/60 bg-primary/10 text-primary hover:border-primary hover:bg-primary/20 relative h-auto w-full overflow-hidden rounded-xl border-2 px-8 py-4 font-semibold backdrop-blur-md transition-all duration-300 sm:w-auto"
        >
          <div className="relative z-10 flex items-center gap-3">
            <Mic className="text-primary h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
            <span className="text-primary">Talk to Meelni</span>
          </div>
        </Button>
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
      <Section
        id="hero"
        className="bg-background relative max-w-none overflow-hidden pb-4"
      >
        {/* Checkered background layer - vibrant purple glow */}
        <CheckeredBackground
          className="absolute inset-0 z-0"
          cellSize="50px"
          strokeWidth="1.5px"
          color="var(--primary)"
          opacity={0.15}
          fade={false}
        />

        {/* Radial glow effect for depth */}
        <div className="from-primary/20 absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] via-transparent to-transparent" />

        {/* Gradient overlays for visual depth */}
        {/* Top gradient - fades near header */}
        <div className="from-background via-background/90 absolute top-0 right-0 left-0 z-[1] h-32 bg-gradient-to-b to-transparent" />

        {/* Left side gradient - creates depth */}
        <div className="from-background via-background/70 absolute inset-y-0 left-0 z-[1] w-1/2 bg-gradient-to-r to-transparent" />

        {/* Bottom gradient - smooth transition to next section */}
        <div className="from-background absolute right-0 bottom-0 left-0 z-[1] h-24 bg-gradient-to-t to-transparent" />

        <div className="relative z-10 grid w-full grid-cols-1 items-center gap-x-8 px-6 pt-12 pb-4 lg:h-[550px] lg:grid-cols-2 lg:px-24 lg:pt-16 lg:pb-4">
          <div className="flex flex-col items-start justify-center lg:col-span-1">
            <HeroTitles />
            <HeroCTA onDemoClick={() => setIsDemoModalOpen(true)} />
          </div>
          {!isMobile && (
            <div className="relative flex h-[500px] items-center justify-center lg:col-span-1">
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
      <DemoModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
      />
    </>
  );
}

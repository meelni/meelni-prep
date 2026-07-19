"use client";

import { Section } from "@/components/section";
import { AnimatedBars } from "@/components/ui/animated-bars";
import { Button } from "@/components/ui/button";
import CheckeredBackground from "@/components/ui/checkered-background";
import { DemoModal } from "@/components/demo-modal";
import { siteConfig } from "@/lib/config";
import { motion } from "framer-motion";
import { ArrowRight, Mic } from "lucide-react";
import { useRef, useState } from "react";
import { PublicActivationButton } from "@/components/public-activation-action";
import { NEW_INTERVIEW_PATH } from "@/lib/navigation/interview-launch";
import { PUBLIC_ACTIVATION_PAUSED_LABEL } from "@/lib/feature-flags/public-activation";
import { usePublicActivationDecision } from "@/lib/feature-flags/public-activation-client";

const ease = [0.16, 1, 0.3, 1] as const;

function HeroTitles() {
  return (
    <div className="flex w-full max-w-3xl flex-col pt-8">
      <h1 className="text-display-hero text-foreground text-left text-balance">
        {siteConfig.hero.title}
      </h1>
      <p className="text-body text-muted-foreground mt-5 max-w-xl text-left text-balance">
        {siteConfig.hero.description}
      </p>
    </div>
  );
}

interface HeroCTAProps {
  onDemoClick: () => void;
  demoTriggerRef: React.RefObject<HTMLButtonElement | null>;
}

function HeroCTA({ onDemoClick, demoTriggerRef }: HeroCTAProps) {
  const activation = usePublicActivationDecision();

  return (
    <div className="relative mt-8">
      <motion.div
        className="flex w-full max-w-2xl flex-col items-start justify-start gap-3 sm:flex-row"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.8, ease }}
      >
        <PublicActivationButton
          href={NEW_INTERVIEW_PATH}
          size="lg"
          className="h-12 w-full rounded-lg px-5 sm:w-auto"
        >
          {siteConfig.hero.cta}
          <ArrowRight className="ml-2 h-4 w-4" />
        </PublicActivationButton>
        <Button
          ref={demoTriggerRef}
          type="button"
          onClick={activation.canActivate ? onDemoClick : undefined}
          disabled={!activation.canActivate}
          variant="outline"
          size="lg"
          className="group border-primary/40 bg-background/80 text-primary hover:border-primary hover:bg-primary/10 h-12 w-full rounded-lg px-5 font-semibold backdrop-blur-md sm:w-auto"
        >
          {activation.canActivate && (
            <Mic className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" />
          )}
          {activation.canActivate
            ? "Try voice demo"
            : PUBLIC_ACTIVATION_PAUSED_LABEL}
        </Button>
      </motion.div>
    </div>
  );
}

export function Hero() {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const demoTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Section
        id="hero"
        className="bg-background relative max-w-none overflow-hidden"
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

        <div className="relative z-10 mx-auto grid w-full max-w-[1216px] grid-cols-1 items-center gap-10 px-6 pt-12 pb-10 lg:min-h-[560px] lg:grid-cols-2 lg:px-8 lg:pt-16">
          <div className="flex flex-col items-start justify-center lg:col-span-1">
            <HeroTitles />
            <HeroCTA
              demoTriggerRef={demoTriggerRef}
              onDemoClick={() => setIsDemoModalOpen(true)}
            />
          </div>
          <div className="relative hidden h-[420px] items-center justify-center lg:flex">
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.45, ease }}
              className="flex items-center justify-center"
              aria-hidden="true"
            >
              <AnimatedBars barCount={60} />
            </motion.div>
          </div>
        </div>
      </Section>

      {/* Demo Modal */}
      <DemoModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
        returnFocusRef={demoTriggerRef}
      />
    </>
  );
}

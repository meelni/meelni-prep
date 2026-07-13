"use client";

import { Section } from "@/components/section";
import { AnimatedBars } from "@/components/ui/animated-bars";
import { Button } from "@/components/ui/button";
import CheckeredBackground from "@/components/ui/checkered-background";
import { siteConfig } from "@/lib/config";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

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

function HeroCTA() {
  return (
    <div className="relative mt-8">
      <motion.div
        className="flex w-full max-w-2xl items-start justify-start"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.8, ease }}
      >
        <Button
          asChild
          size="lg"
          className="h-12 w-full rounded-lg px-5 sm:w-auto"
        >
          <Link href="/dashboard/new-interview">
            {siteConfig.hero.cta}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </motion.div>
    </div>
  );
}

export function Hero() {
  return (
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
          <HeroCTA />
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
  );
}

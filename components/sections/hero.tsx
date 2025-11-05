'use client';

import { AuroraText } from '@/components/aurora-text';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { siteConfig } from '@/lib/config';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import Link from 'next/link';

const ease = [0.16, 1, 0.3, 1] as const;

function HeroPill() {
  return (
    <motion.div
      className="flex w-auto items-center space-x-2 rounded-full bg-indigo-500/10 px-3 py-1.5 ring-1 ring-indigo-500/20 whitespace-pre"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease }}
    >
      <div className="w-fit rounded-full bg-indigo-500 px-2 py-0.5 text-left text-xs font-medium text-white">
        ✨ New
      </div>
      <p className="text-xs font-medium text-foreground sm:text-sm">
        AI-Powered PM Interview Prep
      </p>
    </motion.div>
  );
}

function HeroTitles() {
  return (
    <div className="flex w-full max-w-3xl flex-col overflow-hidden pt-8">
      <motion.h1
        className="text-left text-4xl font-semibold leading-tight text-foreground sm:text-5xl md:text-6xl tracking-tighter"
        initial={{ filter: 'blur(10px)', opacity: 0, y: 50 }}
        animate={{ filter: 'blur(0px)', opacity: 1, y: 0 }}
        transition={{
          duration: 1,
          ease,
          staggerChildren: 0.2,
        }}
      >
        <motion.span
          className="inline-block text-balance"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.8,
            delay: 0.5,
            ease,
          }}
        >
          <AuroraText className="leading-normal font-bold">
            {siteConfig.hero.title}
          </AuroraText>{' '}
        </motion.span>
      </motion.h1>
      <motion.p
        className="text-left max-w-xl leading-normal text-muted-foreground sm:text-lg sm:leading-normal text-balance mt-6"
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

function HeroCTA() {
  return (
    <div className="relative mt-8">
      <motion.div
        className="flex w-full max-w-2xl flex-col items-start justify-start space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.8, ease }}
      >
        <Link href="/setup" className="w-full sm:w-auto">
          <Button variant="glow" size="lg" className="w-full">
            {siteConfig.hero.cta}
          </Button>
        </Link>
      </motion.div>
      <motion.p
        className="mt-4 text-sm text-muted-foreground text-left"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.0, duration: 0.8 }}
      >
        {siteConfig.hero.ctaDescription}
      </motion.p>
    </div>
  );
}

export function Hero() {
  return (
    <Section id="hero">
      <div className="relative grid grid-cols-1 gap-x-8 w-full p-6 lg:p-16 border-x overflow-hidden min-h-[600px] items-center">
        <div className="flex flex-col justify-start items-start">
          <HeroPill />
          <HeroTitles />
          <HeroCTA />
        </div>
      </div>
    </Section>
  );
}

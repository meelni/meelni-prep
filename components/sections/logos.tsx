"use client";

import { Section } from "@/components/section";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";

const companies = [
  "Google",
  "Microsoft",
  "Amazon",
  "Netflix",
  "YouTube",
  "Instagram",
];

const companies2 = ["Spotify", "Dropbox", "Tinder", "Slack", "Zoom", "Shopify"];

export function Logos() {
  const [currentSet, setCurrentSet] = useState(companies);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSet((prev) => (prev === companies ? companies2 : companies));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Section id="logos">
      <div className="w-full">
        {/* Mobile layout: vertical stack */}
        <div className="md:hidden space-y-6">
          {/* Title */}
          <div className="text-center">
            <p className="text-sm font-semibold text-foreground/90 leading-snug tracking-tight">
              Built for PMs interviewing at
            </p>
          </div>

          {/* Logo grid - 3 columns on mobile */}
          <div className="grid grid-cols-3 gap-4">
            {companies.slice(0, 6).map((_, idx) => (
              <div
                key={idx}
                className="flex items-center justify-center p-3 rounded-lg border border-border/50 bg-card/30"
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentSet[idx]}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{
                      duration: 0.5,
                      ease: "easeInOut",
                      delay: Math.random() * 0.5,
                    }}
                  >
                    <Image
                      width={80}
                      height={32}
                      src={`https://cdn.magicui.design/companies/${currentSet[idx]}.svg`}
                      className="h-8 w-20 dark:brightness-0 dark:invert grayscale opacity-40"
                      alt={currentSet[idx]}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop layout: original grid */}
        <div className="hidden md:block border rounded-lg overflow-hidden">
          <div className="grid grid-cols-6">
            {/* First box - static intro text */}
            <div className="flex items-center justify-center p-6 border-r bg-gradient-to-br from-accent/5 to-transparent">
              <p className="text-sm font-semibold text-foreground/90 text-center leading-snug tracking-tight max-w-[140px]">
                Built for PMs interviewing&nbsp;at
              </p>
            </div>

            {/* Remaining boxes with rotating companies */}
            {companies.slice(0, 5).map((_, idx) => (
              <div
                key={idx}
                className="flex group items-center justify-center p-6 border-r last:border-r-0"
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentSet[idx]}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{
                      duration: 0.5,
                      ease: "easeInOut",
                      delay: Math.random() * 0.5,
                    }}
                  >
                    <Image
                      width={112}
                      height={40}
                      src={`https://cdn.magicui.design/companies/${currentSet[idx]}.svg`}
                      className="h-10 w-28 dark:brightness-0 dark:invert grayscale hover:grayscale-0 hover:brightness-100 dark:hover:brightness-0 dark:hover:invert transition-all duration-200 ease-out opacity-30 hover:opacity-100"
                      alt={currentSet[idx]}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

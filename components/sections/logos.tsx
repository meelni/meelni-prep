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
  "Stripe",
  "Airbnb",
];

const companies2 = [
  "Uber",
  "DoorDash",
  "Coinbase",
  "Atlassian",
  "Adobe",
  "Shopify",
];

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
        <div className="space-y-6 md:hidden">
          {/* Title */}
          <div className="text-center">
            <p className="text-foreground/90 text-sm leading-snug font-semibold tracking-tight">
              Built for PMs interviewing at
            </p>
          </div>

          {/* Logo grid - 3 columns on mobile */}
          <div className="grid grid-cols-3 gap-4">
            {currentSet.map((company, idx) => (
              <div
                key={company}
                className="border-border/50 bg-card/30 flex items-center justify-center rounded-lg border p-3"
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={company}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{
                      duration: 0.5,
                      ease: "easeInOut",
                      delay: idx * 0.05,
                    }}
                  >
                    <Image
                      width={80}
                      height={32}
                      src={`https://cdn.magicui.design/companies/${company}.svg`}
                      className="h-8 w-20 opacity-40 grayscale dark:brightness-0 dark:invert"
                      alt={company}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop layout: original grid */}
        <div className="hidden overflow-hidden rounded-lg border md:block">
          <div className="grid grid-cols-7">
            {/* First box - static intro text */}
            <div className="from-accent/5 flex items-center justify-center border-r bg-gradient-to-br to-transparent p-6">
              <p className="text-foreground/90 max-w-[140px] text-center text-sm leading-snug font-semibold tracking-tight">
                Built for PMs interviewing&nbsp;at
              </p>
            </div>

            {/* Remaining boxes with rotating companies */}
            {currentSet.map((company, idx) => (
              <div
                key={company}
                className="group flex items-center justify-center border-r p-6 last:border-r-0"
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={company}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{
                      duration: 0.5,
                      ease: "easeInOut",
                      delay: idx * 0.05,
                    }}
                  >
                    <Image
                      width={112}
                      height={40}
                      src={`https://cdn.magicui.design/companies/${company}.svg`}
                      className="h-10 w-28 opacity-30 grayscale transition-all duration-200 ease-out hover:opacity-100 hover:brightness-100 hover:grayscale-0 dark:brightness-0 dark:invert dark:hover:brightness-0 dark:hover:invert"
                      alt={company}
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

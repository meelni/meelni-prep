"use client";

import { motion } from "framer-motion";

interface AnimatedBarsProps {
  barCount?: number;
  className?: string;
}

export function AnimatedBars({ barCount = 50, className = "" }: AnimatedBarsProps) {
  return (
    <div className={`flex items-center justify-center gap-0.5 h-32 max-w-md ${className}`}>
      {Array.from({ length: barCount }).map((_, i) => {
        const delay = i * 0.05;
        const duration = 0.5 + Math.random() * 0.5;

        return (
          <motion.div
            key={i}
            className="w-1 bg-gradient-to-t from-primary/40 via-primary/60 to-primary/80 rounded-full"
            initial={{ height: "8px" }}
            animate={{
              height: ["8px", `${16 + Math.random() * 80}px`, "8px"],
            }}
            transition={{
              duration,
              repeat: Infinity,
              repeatType: "reverse",
              ease: "easeInOut",
              delay,
            }}
          />
        );
      })}
    </div>
  );
}

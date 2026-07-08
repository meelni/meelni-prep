"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

interface AnimatedBarsProps {
  barCount?: number;
  className?: string;
}

export function AnimatedBars({
  barCount = 50,
  className = "",
}: AnimatedBarsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const [isInView, setIsInView] = useState(true);
  const bars = useMemo(
    () =>
      Array.from({ length: barCount }).map((_, i) => ({
        delay: i * 0.04,
        duration: 0.7 + ((i * 17) % 8) * 0.06,
        peak: 0.35 + ((i * 13) % 10) * 0.055,
      })),
    [barCount]
  );

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0.05 }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`flex h-32 max-w-md items-center justify-center gap-0.5 ${className}`}
    >
      {bars.map(({ delay, duration, peak }, i) => {
        return (
          <motion.div
            key={i}
            className="from-primary/40 via-primary/60 to-primary/80 h-24 w-1 origin-center rounded-full bg-gradient-to-t"
            initial={{ scaleY: 0.12 }}
            animate={
              isInView && !prefersReducedMotion
                ? { scaleY: [0.12, peak, 0.12] }
                : { scaleY: 0.12 }
            }
            transition={
              isInView && !prefersReducedMotion
                ? {
                    duration,
                    repeat: Infinity,
                    repeatType: "reverse",
                    ease: "easeInOut",
                    delay,
                  }
                : { duration: 0.2 }
            }
            style={{ willChange: isInView ? "transform" : "auto" }}
          />
        );
      })}
    </div>
  );
}

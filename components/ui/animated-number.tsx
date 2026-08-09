"use client";

import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface AnimatedNumberProps {
  value: number; // Target value to animate to
  decimals?: number; // Number of decimal places (default: 0)
  duration?: number; // Animation duration in ms (default: 1000)
  delay?: number; // Delay before starting (default: 0)
  suffix?: string; // Text to append (e.g., '%', ' min')
  prefix?: string; // Text to prepend (e.g., '$')
  className?: string; // Additional CSS classes
  useThousandsSeparator?: boolean; // Format with commas (default: true)
  onComplete?: () => void; // Callback when animation finishes
}

/**
 * AnimatedNumber Component
 *
 * Animates a number from 0 to a target value with smooth spring easing.
 * Uses Framer Motion for 60fps performance.
 *
 * @example
 * // Basic integer
 * <AnimatedNumber value={42} />
 *
 * @example
 * // With decimals and suffix
 * <AnimatedNumber value={87.3} decimals={1} suffix="%" />
 *
 * @example
 * // With delay for staggered animations
 * <AnimatedNumber value={240} suffix=" min" delay={200} />
 *
 * @example
 * // With thousands separator
 * <AnimatedNumber value={1234} useThousandsSeparator />
 * // Output: "1,234"
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 1000,
  delay = 0,
  suffix = "",
  prefix = "",
  className,
  useThousandsSeparator = true,
  onComplete,
}: AnimatedNumberProps) {
  const [hasStarted, setHasStarted] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Skip animation if value is 0 (just show 0 immediately)
  const shouldAnimate = value !== 0;

  // Create spring animation with optimized physics
  const spring = useSpring(0, {
    duration,
    bounce: 0.25,
    stiffness: 100,
    damping: 20,
  });

  // Use state to track the current display value for SSR compatibility
  const [displayValue, setDisplayValue] = useState(() => {
    const formatted = (0).toFixed(decimals);
    return useThousandsSeparator ? "0" : formatted;
  });

  // Transform the spring value to formatted string
  const display = useTransform(spring, (latest) => {
    // Format the number with proper decimals
    const formatted = latest.toFixed(decimals);
    const num = parseFloat(formatted);

    // Apply thousands separator if enabled
    if (useThousandsSeparator && decimals === 0) {
      return num.toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    } else if (useThousandsSeparator && decimals > 0) {
      return num.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    }

    return formatted;
  });

  // Subscribe to display changes and update state for SSR
  useEffect(() => {
    const unsubscribe = display.on("change", (latest) => {
      setDisplayValue(latest);
    });
    return unsubscribe;
  }, [display]);

  // Start animation when component mounts or value changes
  useEffect(() => {
    if (!shouldAnimate) {
      setHasStarted(true);
      if (onComplete) onComplete();
      return;
    }

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Start animation after delay
    timeoutRef.current = setTimeout(() => {
      setHasStarted(true);
      spring.set(value);

      // Call onComplete after animation duration
      setTimeout(() => {
        onComplete?.();
      }, duration);
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay, duration, shouldAnimate, spring, onComplete]);

  // Handle value changes (re-animate if value changes)
  useEffect(() => {
    if (hasStarted && shouldAnimate) {
      spring.set(value);
    }
  }, [value, hasStarted, shouldAnimate, spring]);

  // If value is 0, just render static 0
  if (!shouldAnimate) {
    const formatted = useThousandsSeparator ? (0).toLocaleString("en-US") : "0";
    return (
      <span className={cn("tabular-nums", className)}>
        {prefix}
        {formatted}
        {suffix}
      </span>
    );
  }

  return (
    <motion.span
      className={cn("tabular-nums", className)}
      style={{
        // Optimize rendering performance
        willChange: hasStarted ? "auto" : "transform",
      }}
    >
      {prefix}
      {displayValue}
      {suffix}
    </motion.span>
  );
}

/**
 * Test harness component for development and testing
 *
 * Usage: Import and add to a page to test the component
 */
export function AnimatedNumberTest() {
  const [trigger, setTrigger] = useState(0);

  return (
    <div className="bg-background min-h-screen space-y-8 p-8">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold">AnimatedNumber Test Suite</h2>
        <Button type="button" onClick={() => setTrigger((t) => t + 1)}>
          Re-trigger All Animations
        </Button>
      </div>

      {/* Basic Integer */}
      <div className="space-y-2">
        <h3 className="text-muted-foreground text-lg font-semibold">
          Basic Integer
        </h3>
        <div
          key={`int-${trigger}`}
          className="text-foreground font-mono text-4xl font-bold"
        >
          <AnimatedNumber value={42} />
        </div>
      </div>

      {/* With Decimals and Suffix */}
      <div className="space-y-2">
        <h3 className="text-muted-foreground text-lg font-semibold">
          With Decimals and Suffix (%)
        </h3>
        <div
          key={`decimal-${trigger}`}
          className="text-foreground font-mono text-4xl font-bold"
        >
          <AnimatedNumber value={87.3} decimals={1} suffix="%" />
        </div>
      </div>

      {/* With Delay */}
      <div className="space-y-2">
        <h3 className="text-muted-foreground text-lg font-semibold">
          With Delay (200ms) and Suffix
        </h3>
        <div
          key={`delay-${trigger}`}
          className="text-foreground font-mono text-2xl"
        >
          <AnimatedNumber value={240} suffix=" min" delay={200} />
        </div>
      </div>

      {/* Multiple with Stagger */}
      <div className="space-y-2">
        <h3 className="text-muted-foreground text-lg font-semibold">
          Multiple Numbers (Staggered)
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div
            key={`stagger1-${trigger}`}
            className="text-foreground font-mono text-xl"
          >
            Sessions: <AnimatedNumber value={15} delay={0} />
          </div>
          <div
            key={`stagger2-${trigger}`}
            className="text-foreground font-mono text-xl"
          >
            Score: <AnimatedNumber value={86} decimals={1} delay={100} />
          </div>
          <div
            key={`stagger3-${trigger}`}
            className="text-foreground font-mono text-xl"
          >
            Minutes: <AnimatedNumber value={240} delay={200} />
          </div>
          <div
            key={`stagger4-${trigger}`}
            className="text-foreground font-mono text-xl"
          >
            Rate: <AnimatedNumber value={92} suffix="%" delay={300} />
          </div>
        </div>
      </div>

      {/* Thousands Separator */}
      <div className="space-y-2">
        <h3 className="text-muted-foreground text-lg font-semibold">
          Thousands Separator
        </h3>
        <div
          key={`thousands-${trigger}`}
          className="text-foreground font-mono text-3xl font-bold"
        >
          <AnimatedNumber value={1234} useThousandsSeparator />
        </div>
      </div>

      {/* Large Number */}
      <div className="space-y-2">
        <h3 className="text-muted-foreground text-lg font-semibold">
          Large Number with Thousands Separator
        </h3>
        <div
          key={`large-${trigger}`}
          className="text-foreground font-mono text-3xl font-bold"
        >
          <AnimatedNumber value={1234567} useThousandsSeparator />
        </div>
      </div>

      {/* Zero Value */}
      <div className="space-y-2">
        <h3 className="text-muted-foreground text-lg font-semibold">
          Zero Value (No Animation)
        </h3>
        <div
          key={`zero-${trigger}`}
          className="text-foreground font-mono text-3xl font-bold"
        >
          <AnimatedNumber value={0} />
        </div>
      </div>

      {/* Negative Number */}
      <div className="space-y-2">
        <h3 className="text-muted-foreground text-lg font-semibold">
          Negative Number
        </h3>
        <div
          key={`negative-${trigger}`}
          className="text-destructive font-mono text-3xl font-bold"
        >
          <AnimatedNumber value={-42} />
        </div>
      </div>

      {/* Prefix Example */}
      <div className="space-y-2">
        <h3 className="text-muted-foreground text-lg font-semibold">
          With Prefix ($)
        </h3>
        <div
          key={`prefix-${trigger}`}
          className="text-success font-mono text-3xl font-bold"
        >
          <AnimatedNumber
            value={1234.56}
            decimals={2}
            prefix="$"
            useThousandsSeparator
          />
        </div>
      </div>

      {/* Custom Duration */}
      <div className="space-y-2">
        <h3 className="text-muted-foreground text-lg font-semibold">
          Custom Duration (2s)
        </h3>
        <div
          key={`duration-${trigger}`}
          className="text-foreground font-mono text-3xl font-bold"
        >
          <AnimatedNumber value={1500} duration={2000} />
        </div>
      </div>

      {/* Stats Card Simulation (10+ numbers) */}
      <div className="space-y-2">
        <h3 className="text-muted-foreground text-lg font-semibold">
          Performance Test: 12 Numbers Simultaneously
        </h3>
        <div className="grid grid-cols-4 gap-4">
          {[12, 86, 240, 95, 8, 72, 180, 88, 15, 91, 360, 100].map(
            (val, idx) => (
              <div
                key={`perf-${idx}-${trigger}`}
                className="bg-surface border-border rounded-lg border p-4"
              >
                <div className="text-foreground font-mono text-2xl font-bold">
                  <AnimatedNumber
                    value={val}
                    decimals={idx % 3 === 0 ? 1 : 0}
                    suffix={idx % 4 === 0 ? "%" : ""}
                    delay={idx * 50}
                  />
                </div>
                <div className="text-muted-foreground mt-1 text-xs">
                  Stat {idx + 1}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Completion Callback */}
      <div className="space-y-2">
        <h3 className="text-muted-foreground text-lg font-semibold">
          With Completion Callback
        </h3>
        <div
          key={`callback-${trigger}`}
          className="text-foreground font-mono text-3xl font-bold"
        >
          <AnimatedNumber
            value={100}
            duration={1500}
            onComplete={() => console.log("Animation completed!")}
          />
        </div>
        <p className="text-muted-foreground text-sm">
          Check console for completion callback
        </p>
      </div>
    </div>
  );
}

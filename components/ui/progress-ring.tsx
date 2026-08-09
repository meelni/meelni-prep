"use client";

import { motion } from "framer-motion";
import { useEffect, useState, useMemo } from "react";

interface ProgressRingProps {
  progress: number; // 0-100 percentage
  size?: number; // Diameter in pixels (default: 80)
  strokeWidth?: number; // Ring thickness (default: 4)
  color?: string; // Ring color (default: 'primary')
  backgroundColor?: string; // Track color (default: 'border')
  duration?: number; // Animation duration ms (default: 1200)
  delay?: number; // Animation delay ms (default: 0)
  children?: React.ReactNode; // Content inside ring (icon)
  showPercentage?: boolean; // Show "X%" label (default: false)
  className?: string;
}

export function ProgressRing({
  progress,
  size = 80,
  strokeWidth = 4,
  color = "var(--primary)",
  backgroundColor = "var(--border)",
  duration = 1200,
  delay = 0,
  children,
  showPercentage = false,
  className = "",
}: ProgressRingProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Clamp progress between 0 and 100
  const clampedProgress = useMemo(() => {
    return Math.max(0, Math.min(100, progress));
  }, [progress]);

  // Calculate SVG circle dimensions
  const { radius, circumference, strokeDashoffset, center } = useMemo(() => {
    const r = (size - strokeWidth) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ - (clampedProgress / 100) * circ;
    const c = size / 2;

    return {
      radius: r,
      circumference: circ,
      strokeDashoffset: offset,
      center: c,
    };
  }, [size, strokeWidth, clampedProgress]);

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        className="-rotate-90 transform"
        style={{ willChange: "transform" }}
      >
        {/* Background circle (track) */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
        />

        {/* Progress circle with spring animation */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={mounted ? { strokeDashoffset } : {}}
          transition={{
            duration: duration / 1000,
            delay: delay / 1000,
            ease: [0.34, 1.56, 0.64, 1], // Spring easing with overshoot
          }}
          style={{
            strokeDasharray: circumference,
          }}
        />
      </svg>

      {/* Content (icon or percentage) */}
      <div className="absolute inset-0 flex items-center justify-center">
        {showPercentage ? (
          <span className="text-xs font-bold" style={{ color }}>
            {Math.round(clampedProgress)}%
          </span>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

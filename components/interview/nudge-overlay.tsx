"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import {
  TrendingUp,
  ArrowRight,
  HelpCircle,
  Lightbulb,
  X,
  CheckCircle,
  Circle,
} from "lucide-react";

// Nudge Types
export type NudgeType =
  | "metric_missing"
  | "move_on"
  | "clarify_first"
  | "framework_element";

export interface Nudge {
  type: NudgeType;
  message: string;
}

export interface FrameworkElement {
  name: string;
  covered: boolean;
}

export type FrameworkCoverage = FrameworkElement[];

interface NudgeOverlayProps {
  nudge: Nudge | null;
  frameworkCoverage: FrameworkCoverage;
  onDismiss: () => void;
}

// Nudge config for icons and colors
const nudgeConfig: Record<
  NudgeType,
  { icon: typeof TrendingUp; label: string; color: string }
> = {
  metric_missing: {
    icon: TrendingUp,
    label: "Quantify",
    color: "text-blue-500",
  },
  move_on: {
    icon: ArrowRight,
    label: "Move Forward",
    color: "text-purple-500",
  },
  clarify_first: {
    icon: HelpCircle,
    label: "Clarify",
    color: "text-amber-500",
  },
  framework_element: {
    icon: Lightbulb,
    label: "Framework",
    color: "text-primary",
  },
};

// Animation variants
const nudgeVariants = {
  initial: {
    opacity: 0,
    x: 100,
    scale: 0.9,
  },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 300,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    x: 50,
    scale: 0.95,
    transition: {
      duration: 0.2,
      ease: [0.4, 0, 0.2, 1] as const,
    },
  },
};

const progressDotVariants = {
  covered: {
    scale: [1, 1.2, 1],
    transition: {
      duration: 0.3,
      ease: "easeInOut" as const,
    },
  },
};

export function NudgeOverlay({
  nudge,
  frameworkCoverage,
  onDismiss,
}: NudgeOverlayProps) {
  // Auto-dismiss after 5 seconds
  useEffect(() => {
    if (!nudge) return;

    const timer = setTimeout(() => {
      onDismiss();
    }, 5000);

    return () => clearTimeout(timer);
  }, [nudge, onDismiss]);

  // Keyboard dismissal (Escape key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && nudge) {
        onDismiss();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nudge, onDismiss]);

  // Calculate coverage progress
  const coveredCount = frameworkCoverage.filter((el) => el.covered).length;
  const totalCount = frameworkCoverage.length;
  const progressPercentage =
    totalCount > 0 ? (coveredCount / totalCount) * 100 : 0;

  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-3 pointer-events-none">
      {/* Nudge Toast */}
      <AnimatePresence mode="wait">
        {nudge && (
          <motion.div
            key={nudge.type}
            variants={nudgeVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="pointer-events-auto"
            role="alert"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-xl overflow-hidden max-w-sm">
              {/* Nudge Header */}
              <div className="flex items-start gap-3 p-4">
                <div
                  className={`flex-shrink-0 p-2 bg-primary/10 rounded-lg ${
                    nudgeConfig[nudge.type].color
                  }`}
                >
                  {(() => {
                    const Icon = nudgeConfig[nudge.type].icon;
                    return <Icon className="w-5 h-5" aria-hidden="true" />;
                  })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-foreground">
                      {nudgeConfig[nudge.type].label}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {nudge.message}
                  </p>
                </div>
                <button
                  onClick={onDismiss}
                  className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
                  aria-label="Dismiss nudge"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Progress Bar (visual feedback for auto-dismiss) */}
              <div className="h-1 bg-muted/30 overflow-hidden">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{
                    duration: 5,
                    ease: "linear",
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Framework Progress Indicator (always visible) */}
      {frameworkCoverage.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card/95 backdrop-blur-md border border-border rounded-lg shadow-lg p-4 pointer-events-auto"
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Framework Progress
              </h3>
              <p className="text-xs text-muted-foreground">
                {coveredCount}/{totalCount} elements covered
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold text-primary">
                {Math.round(progressPercentage)}%
              </p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-3 h-2 bg-muted/30 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-primary/70 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 25,
              }}
            />
          </div>

          {/* Framework Elements (Dots) */}
          <div className="flex items-center gap-2">
            {frameworkCoverage.map((element, index) => (
              <div key={index} className="flex flex-col items-center gap-1">
                <motion.div
                  variants={progressDotVariants}
                  animate={element.covered ? "covered" : "initial"}
                  className="relative"
                >
                  {element.covered ? (
                    <CheckCircle
                      className="w-5 h-5 text-primary"
                      aria-label={`${element.name} covered`}
                    />
                  ) : (
                    <Circle
                      className="w-5 h-5 text-muted-foreground/40"
                      aria-label={`${element.name} not covered`}
                    />
                  )}
                </motion.div>
                <span
                  className={`text-[10px] leading-tight text-center max-w-[60px] ${
                    element.covered
                      ? "text-primary font-medium"
                      : "text-muted-foreground/60"
                  }`}
                  title={element.name}
                >
                  {element.name.length > 8
                    ? element.name.substring(0, 7) + "..."
                    : element.name}
                </span>
              </div>
            ))}
          </div>

          {/* Accessibility: Screen reader announcement */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            Framework progress: {coveredCount} out of {totalCount} elements
            covered ({Math.round(progressPercentage)}%)
          </div>
        </motion.div>
      )}
    </div>
  );
}

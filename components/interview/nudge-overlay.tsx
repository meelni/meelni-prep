"use client";

import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import {
  TrendingUp,
  ArrowRight,
  HelpCircle,
  Lightbulb,
  X,
} from "lucide-react";

// Nudge Types
export type NudgeType =
  | "quantify"
  | "move_on"
  | "clarify"
  | "missing_element"
  | "time_limit";

export interface Nudge {
  type: NudgeType;
  message: string;
}

interface NudgeOverlayProps {
  nudge: Nudge | null;
  onDismiss: () => void;
}

// Nudge config for icons and colors
const nudgeConfig: Record<
  NudgeType,
  { icon: typeof TrendingUp; label: string; color: string; surface: string }
> = {
  quantify: {
    icon: TrendingUp,
    label: "Quantify",
    color: "text-info",
    surface: "bg-info/10",
  },
  move_on: {
    icon: ArrowRight,
    label: "Move Forward",
    color: "text-primary",
    surface: "bg-primary/10",
  },
  clarify: {
    icon: HelpCircle,
    label: "Clarify",
    color: "text-warning",
    surface: "bg-warning/10",
  },
  missing_element: {
    icon: Lightbulb,
    label: "Structure",
    color: "text-primary",
    surface: "bg-primary/10",
  },
  time_limit: {
    icon: ArrowRight,
    label: "Keep Moving",
    color: "text-primary",
    surface: "bg-primary/10",
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

export function NudgeOverlay({
  nudge,
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
                  className={`flex-shrink-0 p-2 rounded-lg ${
                    nudgeConfig[nudge.type].surface
                  } ${
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
                    <p className="text-label text-foreground">
                      {nudgeConfig[nudge.type].label}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {nudge.message}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onDismiss}
                  className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  aria-label="Dismiss nudge"
                >
                  <X className="w-4 h-4" />
                </Button>
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
    </div>
  );
}

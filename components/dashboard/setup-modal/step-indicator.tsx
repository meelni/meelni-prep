"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

const STEP_LABELS = ["Interview Type", "Mode", "Voice Settings"];

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {/* Step Counter */}
      <div className="text-sm text-muted-foreground">
        Step {currentStep} of {totalSteps}
      </div>

      {/* Progress Dots */}
      <div className="flex items-center gap-2">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => {
          const isCompleted = step < currentStep;
          const isActive = step === currentStep;
          const isFuture = step > currentStep;

          return (
            <div key={step} className="flex items-center gap-2 flex-1">
              {/* Dot */}
              <motion.div
                className={`
                  relative flex items-center justify-center
                  ${step === 1 ? "" : "flex-1"}
                `}
                onHoverStart={() => setHoveredStep(step)}
                onHoverEnd={() => setHoveredStep(null)}
              >
                <motion.div
                  initial={false}
                  animate={{
                    scale: isActive ? 1.2 : 1,
                  }}
                  className={`
                    w-6 h-6 rounded-full flex items-center justify-center transition-colors
                    ${
                      isCompleted
                        ? "bg-primary"
                        : isActive
                        ? "bg-primary ring-4 ring-primary/20"
                        : "bg-border"
                    }
                  `}
                  transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 30,
                  }}
                >
                  {/* Completed Checkmark */}
                  <AnimatePresence mode="wait">
                    {isCompleted && (
                      <motion.div
                        key="check"
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: 180 }}
                        transition={{
                          type: 'spring',
                          stiffness: 400,
                          damping: 25,
                        }}
                      >
                        <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                      </motion.div>
                    )}
                    {isActive && (
                      <motion.div
                        key="pulse"
                        className="w-2 h-2 rounded-full bg-white"
                        animate={{
                          scale: [1, 1.2, 1],
                          opacity: [1, 0.8, 1],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* Hover Tooltip */}
                <AnimatePresence>
                  {hoveredStep === step && !isActive && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md bg-popover border border-border shadow-lg whitespace-nowrap z-10"
                    >
                      <span className="text-xs font-medium text-foreground">
                        {STEP_LABELS[step - 1]}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Active Step Label */}
                {isActive && (
                  <motion.span
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium text-foreground whitespace-nowrap"
                  >
                    {STEP_LABELS[step - 1]}
                  </motion.span>
                )}
              </motion.div>

              {/* Progress Line */}
              {step < totalSteps && (
                <div className="flex-1 h-0.5 bg-border rounded-full overflow-hidden">
                  <motion.div
                    initial={false}
                    animate={{
                      scaleX: isCompleted ? 1 : 0,
                    }}
                    transition={{
                      duration: 0.4,
                      ease: [0.34, 1.56, 0.64, 1],
                    }}
                    className="h-full bg-primary origin-left"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

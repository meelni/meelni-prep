"use client";

import { motion } from "framer-motion";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

const STEP_LABELS = ["Interview Type", "Mode", "Voice Settings"];

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <div className="space-y-3">
      {/* Step Counter */}
      <div className="text-sm text-muted-foreground">
        Step {currentStep} of {totalSteps}
      </div>

      {/* Progress Dots */}
      <div className="flex items-center gap-2">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
          <div key={step} className="flex items-center gap-2 flex-1">
            {/* Dot */}
            <motion.div
              className={`
                relative flex items-center justify-center
                ${step === 1 ? "" : "flex-1"}
              `}
            >
              <motion.div
                initial={false}
                animate={{
                  scale: step === currentStep ? 1 : 0.8,
                }}
                className={`
                  w-2 h-2 rounded-full transition-colors
                  ${
                    step <= currentStep
                      ? "bg-primary"
                      : "bg-border"
                  }
                `}
              />

              {/* Active Step Label */}
              {step === currentStep && (
                <motion.span
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
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
                    scaleX: step < currentStep ? 1 : 0,
                  }}
                  transition={{
                    duration: 0.3,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                  className="h-full bg-primary origin-left"
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

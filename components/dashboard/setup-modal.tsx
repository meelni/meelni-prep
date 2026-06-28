"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  ArrowLeft,
  ArrowRight,
  Lightbulb,
  Target,
  Users,
  TrendingUp,
  Zap,
  ChevronDown,
  Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SelectableCard,
  SelectableCardCheck,
  SelectableCardIcon,
} from "@/components/ui/selectable-card";
import { StepIndicator } from "./setup-modal/step-indicator";
import { SmartDefaultsCard } from "./setup-modal/smart-defaults-card";

// Types
export interface InterviewConfig {
  roundType: "product_sense" | "analytical" | "leadership" | "strategy" | null;
  mode: "mock_interview" | "practice" | "learning" | null;
  voiceSettings: {
    voice: string;
    speed: number;
    emotion: string;
  };
}

interface SetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: InterviewConfig;
  updateConfig: (partial: Partial<InterviewConfig>) => void;
  canProceedToNextStep: (step: number) => boolean;
  onSubmit: () => void;
  onUseSmartDefaults: () => void;
}

// Interview type options
const INTERVIEW_TYPES = [
  {
    id: "product_sense" as const,
    icon: Lightbulb,
    title: "Product Sense",
    description: "Practice product design and feature prioritization questions",
  },
  {
    id: "analytical" as const,
    icon: TrendingUp,
    title: "Analytical Thinking",
    description: "Work through data analysis and metrics-driven problems",
  },
  {
    id: "leadership" as const,
    icon: Users,
    title: "Leadership & Drive",
    description: "Demonstrate leadership skills through behavioral questions",
  },
  {
    id: "strategy" as const,
    icon: Target,
    title: "Strategy",
    description: "Tackle complex business strategy and go-to-market scenarios",
  },
];

// Mode options
const MODE_OPTIONS = [
  {
    id: "mock_interview" as const,
    title: "Mock Interview",
    description: "Full realistic interview experience with comprehensive feedback",
  },
  {
    id: "practice" as const,
    title: "Quick Practice",
    description: "Faster, focused practice with immediate feedback",
  },
  {
    id: "learning" as const,
    title: "Learning Mode",
    description: "Guided practice with framework explanations and coaching",
  },
];

// Voice emotions
const EMOTION_OPTIONS = [
  { value: "confident", label: "Confident" },
  { value: "friendly", label: "Friendly" },
  { value: "professional", label: "Professional" },
  { value: "encouraging", label: "Encouraging" },
  { value: "neutral", label: "Neutral" },
];

const MotionSelectableCard = motion.create(SelectableCard);

export function SetupModal({
  isOpen,
  onClose,
  config,
  updateConfig,
  canProceedToNextStep,
  onSubmit,
  onUseSmartDefaults,
}: SetupModalProps) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(0);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Reset step when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setShowAdvancedSettings(false);
    }
  }, [isOpen]);

  // ESC key handler
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Focus trap
  useEffect(() => {
    if (isOpen) {
      const focusableElements = document.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      firstElement?.focus();
    }
  }, [isOpen]);

  const handleSmartDefaults = useCallback(() => {
    onUseSmartDefaults();
  }, [onUseSmartDefaults]);

  const handleNext = () => {
    if (step < 3) {
      setDirection(1); // Moving forward
      setStep(step + 1);
    } else {
      // Final step: submit
      onSubmit();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setDirection(-1); // Moving backward
      setStep(step - 1);
    }
  };

  const selectInterviewType = (type: NonNullable<InterviewConfig["roundType"]>) => {
    updateConfig({ roundType: type });
  };

  const selectMode = (mode: NonNullable<InterviewConfig["mode"]>) => {
    updateConfig({ mode });
  };

  const updateVoiceSettings = (updates: Partial<InterviewConfig["voiceSettings"]>) => {
    updateConfig({
      voiceSettings: { ...config.voiceSettings, ...updates },
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-modal-title"
    >
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="space-y-1">
            <h2 id="setup-modal-title" className="text-xl font-semibold">
              Setup Your Interview
            </h2>
            <p className="text-sm text-muted-foreground">
              Configure your practice session
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 pt-6">
          <StepIndicator currentStep={step} totalSteps={3} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <AnimatePresence mode="wait" custom={direction}>
            {/* Step 1: Interview Type */}
            {step === 1 && (
              <motion.div
                key="step1"
                custom={direction}
                initial={{
                  x: direction > 0 ? 20 : -20,
                  opacity: 0,
                  scale: 0.95,
                }}
                animate={{
                  x: 0,
                  opacity: 1,
                  scale: 1,
                }}
                exit={{
                  x: direction < 0 ? 20 : -20,
                  opacity: 0,
                  scale: 0.95,
                }}
                transition={{
                  duration: 0.4,
                  ease: [0.34, 1.56, 0.64, 1],
                }}
                className="space-y-4"
              >
                {/* Smart Defaults Card */}
                <SmartDefaultsCard onClick={handleSmartDefaults} />

                {/* Divider */}
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    Or customize
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Interview Type Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {INTERVIEW_TYPES.map((type) => {
                    const isSelected = config.roundType === type.id;
                    return (
                      <MotionSelectableCard
                        key={type.id}
                        selected={isSelected}
                        onClick={() => selectInterviewType(type.id)}
                        className="p-4"
                        whileHover={{
                          y: -2,
                          scale: 1.01,
                          boxShadow: isSelected
                            ? '0 8px 30px color-mix(in oklab, var(--primary) 25%, transparent)'
                            : '0 4px 20px rgb(0 0 0 / 0.1)',
                        }}
                        whileTap={{ scale: 0.98, y: 0 }}
                        transition={{
                          type: 'spring',
                          stiffness: 400,
                          damping: 30,
                        }}
                        animate={isSelected ? {
                          boxShadow: '0 4px 20px color-mix(in oklab, var(--primary) 15%, transparent)',
                        } : {}}
                      >
                        {/* Selection Glow Effect */}
                        {isSelected && (
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/10 to-primary/0"
                            animate={{
                              x: ['-100%', '100%'],
                            }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              ease: 'linear',
                            }}
                          />
                        )}

                        <div className="relative flex items-start gap-3">
                          <motion.div
                            whileHover={{
                              scale: 1.05,
                            }}
                            transition={{
                              type: 'spring',
                              stiffness: 400,
                              damping: 25,
                            }}
                          >
                            <SelectableCardIcon selected={isSelected}>
                              <type.icon className="w-5 h-5" />
                            </SelectableCardIcon>
                          </motion.div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm mb-1">{type.title}</h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {type.description}
                            </p>
                          </div>
                          <div className="h-5 w-5 shrink-0">
                            {isSelected && <SelectableCardCheck size="sm" />}
                          </div>
                        </div>
                      </MotionSelectableCard>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Step 2: Mode Selection */}
            {step === 2 && (
              <motion.div
                key="step2"
                custom={direction}
                initial={{
                  x: direction > 0 ? 20 : -20,
                  opacity: 0,
                  scale: 0.95,
                }}
                animate={{
                  x: 0,
                  opacity: 1,
                  scale: 1,
                }}
                exit={{
                  x: direction < 0 ? 20 : -20,
                  opacity: 0,
                  scale: 0.95,
                }}
                transition={{
                  duration: 0.4,
                  ease: [0.34, 1.56, 0.64, 1],
                }}
                className="space-y-3"
              >
                <div className="space-y-2 mb-4">
                  <h3 className="text-lg font-semibold">Choose Interview Mode</h3>
                  <p className="text-sm text-muted-foreground">
                    Select how you want to practice
                  </p>
                </div>

                {MODE_OPTIONS.map((mode) => {
                  const isSelected = config.mode === mode.id;
                  return (
                    <MotionSelectableCard
                      key={mode.id}
                      selected={isSelected}
                      onClick={() => selectMode(mode.id)}
                      className="p-4"
                      whileHover={{
                        y: -2,
                        scale: 1.005,
                        boxShadow: isSelected
                          ? '0 6px 25px color-mix(in oklab, var(--primary) 20%, transparent)'
                          : '0 4px 15px rgb(0 0 0 / 0.08)',
                      }}
                      whileTap={{ scale: 0.99, y: 0 }}
                      transition={{
                        type: 'spring',
                        stiffness: 400,
                        damping: 30,
                      }}
                      animate={isSelected ? {
                        boxShadow: '0 4px 15px color-mix(in oklab, var(--primary) 12%, transparent)',
                      } : {}}
                    >
                      {/* Selection Glow */}
                      {isSelected && (
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/8 to-primary/0"
                          animate={{
                            x: ['-100%', '100%'],
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: 'linear',
                          }}
                        />
                      )}

                      <div className="relative flex items-center gap-3">
                        <div className="h-5 w-5 shrink-0">
                          {isSelected && <SelectableCardCheck size="sm" />}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm mb-0.5">{mode.title}</h4>
                          <p className="text-xs text-muted-foreground">{mode.description}</p>
                        </div>
                      </div>
                    </MotionSelectableCard>
                  );
                })}
              </motion.div>
            )}

            {/* Step 3: Voice Settings */}
            {step === 3 && (
              <motion.div
                key="step3"
                custom={direction}
                initial={{
                  x: direction > 0 ? 20 : -20,
                  opacity: 0,
                  scale: 0.95,
                }}
                animate={{
                  x: 0,
                  opacity: 1,
                  scale: 1,
                }}
                exit={{
                  x: direction < 0 ? 20 : -20,
                  opacity: 0,
                  scale: 0.95,
                }}
                transition={{
                  duration: 0.4,
                  ease: [0.34, 1.56, 0.64, 1],
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Voice Settings</h3>
                  <p className="text-sm text-muted-foreground">
                    Customize the interviewer's voice (optional)
                  </p>
                </div>

                {/* Collapsible Advanced Settings */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className="h-auto w-full justify-between rounded-lg p-4"
                >
                  <div className="flex items-center gap-3">
                    <motion.div
                      animate={showAdvancedSettings ? {
                        rotate: [0, -10, 10, 0],
                      } : {}}
                      transition={{
                        duration: 0.5,
                        ease: [0.34, 1.56, 0.64, 1],
                      }}
                    >
                      <Mic className="w-5 h-5 text-muted-foreground" />
                    </motion.div>
                    <span className="font-medium text-sm">
                      {showAdvancedSettings ? "Hide" : "Show"} Advanced Settings
                    </span>
                  </div>
                  <motion.div
                    animate={{
                      rotate: showAdvancedSettings ? 180 : 0,
                    }}
                    transition={{
                      type: 'spring',
                      stiffness: 300,
                      damping: 25,
                    }}
                  >
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  </motion.div>
                </Button>

                <AnimatePresence>
                  {showAdvancedSettings && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-4 overflow-hidden"
                    >
                      {/* Speed Slider */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center justify-between">
                          <span>Speech Speed</span>
                          <span className="text-muted-foreground">
                            {config.voiceSettings?.speed.toFixed(1)}x
                          </span>
                        </label>
                        <Input
                          type="range"
                          min="0.8"
                          max="1.2"
                          step="0.1"
                          value={config.voiceSettings?.speed || 1.0}
                          onChange={(e) =>
                            updateVoiceSettings({ speed: parseFloat(e.target.value) })
                          }
                          className="h-2 w-full cursor-pointer rounded-full border-0 bg-muted p-0 accent-primary"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Slower</span>
                          <span>Faster</span>
                        </div>
                      </div>

                      {/* Emotion Dropdown */}
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Voice Emotion</label>
                        <select
                          value={config.voiceSettings?.emotion || "confident"}
                          onChange={(e) => updateVoiceSettings({ emotion: e.target.value })}
                          className="w-full p-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          {EMOTION_OPTIONS.map((emotion) => (
                            <option key={emotion.value} value={emotion.value}>
                              {emotion.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Default Settings Note */}
                {!showAdvancedSettings && (
                  <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
                    <p className="text-xs text-muted-foreground">
                      Using default settings: Tessa voice at 1.0x speed with confident tone
                    </p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-6 border-t border-border">
          {step > 1 && (
            <Button variant="outline" onClick={handleBack} className="flex-1">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          <Button
            onClick={handleNext}
            disabled={!canProceedToNextStep(step)}
            className="flex-1"
            variant="glow"
          >
            {step === 3 ? "Start Interview" : "Next"}
            {step < 3 && <ArrowRight className="w-4 h-4 ml-2" />}
            {step === 3 && <Zap className="w-4 h-4 ml-2" />}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// Test harness (uncomment to test in isolation)
// export default function SetupModalTest() {
//   const [isOpen, setIsOpen] = useState(true);
//   return (
//     <SetupModal
//       isOpen={isOpen}
//       onClose={() => setIsOpen(false)}
//       onSubmit={(config) => {
//         console.log('Config:', config);
//         setIsOpen(false);
//       }}
//     />
//   );
// }

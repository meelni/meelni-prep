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
      setStep(step + 1);
    } else {
      // Final step: submit
      onSubmit();
    }
  };

  const handleBack = () => {
    if (step > 1) {
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
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 pt-6">
          <StepIndicator currentStep={step} totalSteps={3} />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <AnimatePresence mode="wait">
            {/* Step 1: Interview Type */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
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
                  {INTERVIEW_TYPES.map((type) => (
                    <motion.button
                      key={type.id}
                      onClick={() => selectInterviewType(type.id)}
                      className={`
                        group relative p-4 rounded-lg border-2 text-left transition-all
                        ${
                          config.roundType === type.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/30 hover:bg-accent/50"
                        }
                      `}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`
                          p-2 rounded-lg transition-colors
                          ${
                            config.roundType === type.id
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground group-hover:text-primary"
                          }
                        `}
                        >
                          <type.icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm mb-1">{type.title}</h3>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {type.description}
                          </p>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 2: Mode Selection */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                <div className="space-y-2 mb-4">
                  <h3 className="text-lg font-semibold">Choose Interview Mode</h3>
                  <p className="text-sm text-muted-foreground">
                    Select how you want to practice
                  </p>
                </div>

                {MODE_OPTIONS.map((mode) => (
                  <motion.button
                    key={mode.id}
                    onClick={() => selectMode(mode.id)}
                    className={`
                      w-full p-4 rounded-lg border-2 text-left transition-all
                      ${
                        config.mode === mode.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30 hover:bg-accent/50"
                      }
                    `}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`
                        w-5 h-5 rounded-full border-2 flex items-center justify-center
                        ${
                          config.mode === mode.id
                            ? "border-primary bg-primary"
                            : "border-muted-foreground"
                        }
                      `}
                      >
                        {config.mode === mode.id && (
                          <div className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-sm mb-0.5">{mode.title}</h4>
                        <p className="text-xs text-muted-foreground">{mode.description}</p>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </motion.div>
            )}

            {/* Step 3: Voice Settings */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Voice Settings</h3>
                  <p className="text-sm text-muted-foreground">
                    Customize the interviewer's voice (optional)
                  </p>
                </div>

                {/* Collapsible Advanced Settings */}
                <button
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  className="w-full p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Mic className="w-5 h-5 text-muted-foreground" />
                    <span className="font-medium text-sm">
                      {showAdvancedSettings ? "Hide" : "Show"} Advanced Settings
                    </span>
                  </div>
                  <ChevronDown
                    className={`w-5 h-5 text-muted-foreground transition-transform ${
                      showAdvancedSettings ? "rotate-180" : ""
                    }`}
                  />
                </button>

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
                        <input
                          type="range"
                          min="0.8"
                          max="1.2"
                          step="0.1"
                          value={config.voiceSettings?.speed || 1.0}
                          onChange={(e) =>
                            updateVoiceSettings({ speed: parseFloat(e.target.value) })
                          }
                          className="w-full accent-primary"
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

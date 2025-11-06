"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Settings2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  InterviewConfig,
  FEEDBACK_MODES,
  DURATION_OPTIONS,
  EMOTION_OPTIONS,
  FeedbackMode,
} from "@/lib/interview-config";

interface AdvancedSettingsProps {
  config: InterviewConfig;
  onChange: (config: Partial<InterviewConfig>) => void;
}

export function AdvancedSettings({ config, onChange }: AdvancedSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Card className="overflow-hidden">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <Settings2 className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold">Advanced Settings</h3>
            <p className="text-xs text-muted-foreground">
              Optional: Customize voice, feedback, and timing
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && (
            <Badge variant="outline" className="text-xs">
              Optional
            </Badge>
          )}
          {isOpen ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Collapsible content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border"
          >
            <div className="p-6 space-y-6">
              {/* Duration */}
              <div className="space-y-3">
                <label className="text-sm font-medium">
                  Interview Duration
                </label>
                <div className="grid gap-2 grid-cols-3">
                  {DURATION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => onChange({ duration: option.value })}
                      className={`
                        px-4 py-3 rounded-lg border-2 text-sm font-medium transition-all
                        ${
                          config.duration === option.value
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border hover:border-primary/50"
                        }
                      `}
                    >
                      <div>{option.label}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {option.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Feedback Mode */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Feedback Mode</label>
                <div className="space-y-2">
                  {(Object.keys(FEEDBACK_MODES) as FeedbackMode[]).map(
                    (mode) => (
                      <button
                        key={mode}
                        onClick={() => onChange({ feedback_mode: mode })}
                        className={`
                          w-full px-4 py-3 rounded-lg border-2 text-left transition-all
                          ${
                            config.feedback_mode === mode
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }
                        `}
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-medium text-sm">
                              {FEEDBACK_MODES[mode].label}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {FEEDBACK_MODES[mode].description}
                            </div>
                          </div>
                          {config.feedback_mode === mode && (
                            <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                              <svg
                                className="w-2.5 h-2.5 text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Speech Speed */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Speech Speed</label>
                  <span className="text-sm text-muted-foreground">
                    {config.speed}x
                  </span>
                </div>
                <input
                  type="range"
                  min="0.6"
                  max="1.5"
                  step="0.1"
                  value={config.speed}
                  onChange={(e) =>
                    onChange({ speed: parseFloat(e.target.value) })
                  }
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Slower</span>
                  <span>Normal</span>
                  <span>Faster</span>
                </div>
              </div>

              {/* Volume */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Volume</label>
                  <span className="text-sm text-muted-foreground">
                    {Math.round(config.volume * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={config.volume}
                  onChange={(e) =>
                    onChange({ volume: parseFloat(e.target.value) })
                  }
                  className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Quieter</span>
                  <span>Normal</span>
                  <span>Louder</span>
                </div>
              </div>

              {/* Emotion */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Voice Emotion</label>
                <select
                  value={config.emotion}
                  onChange={(e) => onChange({ emotion: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-lg border-2 border-border bg-background text-sm focus:outline-none focus:border-primary transition-colors"
                >
                  {EMOTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                <Settings2 className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  These settings will be applied to your interview session. You
                  can adjust them again later from your dashboard.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

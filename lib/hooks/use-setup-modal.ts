"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// Storage key
const STORAGE_KEY = "meelni:setup-modal:last-config";

// Interface definitions
export interface InterviewConfig {
  roundType: "product_sense" | "analytical" | "leadership" | "strategy" | null;
  mode: "mock_interview" | "practice" | "learning" | null;
  voiceSettings: {
    voice: string;
    speed: number;
    emotion: string;
  };
  questionId?: string; // Optional: pre-selected question from question bank
}

export interface UseSetupModalReturn {
  // Modal state
  isOpen: boolean;
  open: () => void;
  close: () => void;

  // Form state
  config: InterviewConfig;
  updateConfig: (partial: Partial<InterviewConfig>) => void;
  resetConfig: () => void;

  // Validation
  canProceedToNextStep: (step: number) => boolean;
  isConfigComplete: boolean;

  // Submission
  submitConfig: () => void;

  // Smart defaults
  useSmartDefaults: () => void;
}

// Smart defaults configuration
const SMART_DEFAULTS: InterviewConfig = {
  roundType: "product_sense",
  mode: "mock_interview",
  voiceSettings: {
    voice: "6ccbfb76-1fc6-48f7-b71d-91ac6298247b", // Tessa
    speed: 1.0,
    emotion: "confident",
  },
};

// Empty config (for reset)
const EMPTY_CONFIG: InterviewConfig = {
  roundType: null,
  mode: null,
  voiceSettings: {
    voice: "6ccbfb76-1fc6-48f7-b71d-91ac6298247b", // Tessa
    speed: 1.0,
    emotion: "confident",
  },
};

/**
 * Custom hook for managing Setup Modal state with localStorage persistence
 */
export function useSetupModal(): UseSetupModalReturn {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<InterviewConfig>(EMPTY_CONFIG);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Validate that parsed data has expected structure
        if (parsed && typeof parsed === "object") {
          setConfig({
            roundType: parsed.roundType || null,
            mode: parsed.mode || null,
            voiceSettings: {
              voice:
                parsed.voiceSettings?.voice ||
                "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
              speed: parsed.voiceSettings?.speed || 1.0,
              emotion: parsed.voiceSettings?.emotion || "confident",
            },
          });
        }
      } catch (e) {
        console.error("Failed to parse saved config:", e);
        // Clear invalid data
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Save to localStorage on config change
  useEffect(() => {
    // Only save if user has made selections
    if (config.roundType || config.mode) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  }, [config]);

  // Modal controls
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Config update
  const updateConfig = useCallback((partial: Partial<InterviewConfig>) => {
    setConfig((prev) => {
      // Handle nested voiceSettings updates
      if (partial.voiceSettings) {
        return {
          ...prev,
          ...partial,
          voiceSettings: {
            ...prev.voiceSettings,
            ...partial.voiceSettings,
          },
        };
      }
      return { ...prev, ...partial };
    });
  }, []);

  // Reset config
  const resetConfig = useCallback(() => {
    setConfig(EMPTY_CONFIG);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Validation: can proceed to next step
  const canProceedToNextStep = useCallback(
    (step: number): boolean => {
      switch (step) {
        case 1:
          return config.roundType !== null;
        case 2:
          return config.mode !== null;
        case 3:
          return true; // Voice settings are optional
        default:
          return false;
      }
    },
    [config]
  );

  // Check if config is complete
  const isConfigComplete = config.roundType !== null && config.mode !== null;

  // Submit configuration
  const submitConfig = useCallback(() => {
    if (!isConfigComplete) {
      console.error("Config incomplete");
      return;
    }

    // Navigate to interview with config as query params
    const params = new URLSearchParams({
      roundType: config.roundType!,
      mode: config.mode!,
      voice: config.voiceSettings.voice,
      speed: config.voiceSettings.speed.toString(),
      emotion: config.voiceSettings.emotion,
    });

    // Add questionId if present
    if (config.questionId) {
      params.append("questionId", config.questionId);
    }

    router.push(`/interview?${params.toString()}`);
    close();
  }, [config, isConfigComplete, router, close]);

  // Use smart defaults
  const useSmartDefaults = useCallback(() => {
    setConfig(SMART_DEFAULTS);

    // Immediately submit with defaults
    const params = new URLSearchParams({
      roundType: SMART_DEFAULTS.roundType!,
      mode: SMART_DEFAULTS.mode!,
      voice: SMART_DEFAULTS.voiceSettings.voice,
      speed: SMART_DEFAULTS.voiceSettings.speed.toString(),
      emotion: SMART_DEFAULTS.voiceSettings.emotion,
    });

    router.push(`/interview?${params.toString()}`);
    close();
  }, [router, close]);

  return {
    isOpen,
    open,
    close,
    config,
    updateConfig,
    resetConfig,
    canProceedToNextStep,
    isConfigComplete,
    submitConfig,
    useSmartDefaults,
  };
}

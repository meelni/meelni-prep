/**
 * Custom hook for persisting setup configuration to localStorage
 *
 * Automatically saves and restores setup state when users navigate away
 * and return to the setup page.
 */

import { useState, useEffect } from "react";
import { InterviewConfig, RoundType, DifficultyLevel } from "../interview-config";

const STORAGE_KEY = "meelni_setup_state";
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface SetupState {
  step: number;
  roundType: RoundType | null;
  difficulty: DifficultyLevel | null;
  config: InterviewConfig;
  timestamp: number;
}

export function useSetupPersistence() {
  const [isInitialized, setIsInitialized] = useState(false);

  /**
   * Load state from localStorage
   */
  const loadState = (): SetupState | null => {
    if (typeof window === "undefined") return null;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;

      const state: SetupState = JSON.parse(stored);

      // Check if state has expired
      if (Date.now() - state.timestamp > EXPIRY_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }

      return state;
    } catch (error) {
      console.error("Failed to load setup state:", error);
      return null;
    }
  };

  /**
   * Save state to localStorage
   */
  const saveState = (state: Omit<SetupState, "timestamp">) => {
    if (typeof window === "undefined") return;

    try {
      const stateWithTimestamp: SetupState = {
        ...state,
        timestamp: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateWithTimestamp));
    } catch (error) {
      console.error("Failed to save setup state:", error);
    }
  };

  /**
   * Clear saved state
   */
  const clearState = () => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(STORAGE_KEY);
  };

  return {
    loadState,
    saveState,
    clearState,
    isInitialized,
    setIsInitialized,
  };
}

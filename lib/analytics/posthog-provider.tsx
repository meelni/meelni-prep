"use client";

/**
 * PostHog Provider
 * Client-side PostHog initialization and React context
 */

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";
import { clientConfig } from "./config";

/**
 * Initialize PostHog client
 * Only runs on client-side
 */
function initializePostHog() {
  if (typeof window === "undefined") {
    return;
  }

  if (!clientConfig.enabled) {
    if (clientConfig.debug) {
      console.log("[Analytics] PostHog disabled");
    }
    return;
  }

  // Check if already initialized
  if (posthog.__loaded) {
    return;
  }

  posthog.init(clientConfig.apiKey, {
    api_host: clientConfig.host,

    // Privacy Settings
    autocapture: !clientConfig.privacy.disableAutocapture,
    capture_pageview: !clientConfig.privacy.disablePageviewTracking,
    ip: !clientConfig.privacy.anonymizeIp,

    // Session Recording
    // Keep replay disabled even if a future config change accidentally enables
    // sampling; live voice/interview transcripts must never enter recordings.
    disable_session_recording: true,
    session_recording: {
      maskAllInputs: clientConfig.sessionRecording.maskTextInputs,
      recordCrossOriginIframes: false,
    },

    // Disable optional features that cause console errors
    // These modules try to load lazily and show errors if blocked by CSP
    capture_dead_clicks: false, // Disable dead clicks tracking
    capture_performance: false, // Disable Web Vitals tracking
    enable_recording_console_log: false, // Don't record console logs

    // CRITICAL: Prevent PostHog from loading external scripts (unpkg.com, etc.)
    // This eliminates CSP violations and console errors
    disable_external_dependency_loading: true,

    // Advanced options
    opt_out_capturing_by_default: false, // Don't opt out by default
    advanced_disable_decide: false, // Keep feature flags enabled

    // Performance
    loaded: (ph) => {
      if (clientConfig.debug) {
        console.log("[Analytics] PostHog loaded", ph);
      }
    },
  });

  if (clientConfig.debug) {
    posthog.debug();
    console.log("[Analytics] PostHog initialized in debug mode");
  }
}

/**
 * PostHog Provider Component
 * Wraps app to provide PostHog context
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initializePostHog();
  }, []);

  // If analytics disabled, just render children
  if (!clientConfig.enabled) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

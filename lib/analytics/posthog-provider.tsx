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
    disable_session_recording: !clientConfig.sessionRecording.enabled,
    session_recording: {
      maskAllInputs: clientConfig.sessionRecording.maskTextInputs,
      recordCrossOriginIframes: false,
    },

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

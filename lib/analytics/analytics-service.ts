"use client";

import posthog from "posthog-js";

import { clientConfig } from "./config";
import {
  sanitizeAnalyticsEventProperties,
  sanitizeAnalyticsTraits,
} from "./event-policy";
import { sanitizeAnalyticsPath } from "./privacy";
import type { AnalyticsEvent, EventProperties, UserTraits } from "./types";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";

let consentCaptureAllowed = false;

export function setAnalyticsCaptureAllowed(allowed: boolean): void {
  consentCaptureAllowed = allowed;
}

export class AnalyticsService {
  track<E extends AnalyticsEvent>(
    event: E,
    properties: E extends keyof EventProperties
      ? EventProperties[E]
      : Record<string, unknown>
  ): void {
    if (!this.canCapture()) return;

    try {
      const safeProperties = sanitizeAnalyticsEventProperties(
        event,
        properties as Record<string, unknown>
      );
      if (!safeProperties) return;
      posthog.capture(event, safeProperties);
    } catch (error) {
      console.error("[Analytics] Event delivery failed", {
        ...toSafeErrorLog(error),
      });
    }
  }

  identify(userId: string, traits?: Partial<UserTraits>): void {
    if (!this.canCapture()) return;

    try {
      posthog.identify(
        userId,
        traits
          ? sanitizeAnalyticsTraits(traits as Record<string, unknown>)
          : undefined
      );
    } catch (error) {
      console.error("[Analytics] Identity delivery failed", {
        ...toSafeErrorLog(error),
      });
    }
  }

  pageview(path?: string): void {
    if (!this.canCapture()) return;

    try {
      posthog.capture("$pageview", {
        $current_url: sanitizeAnalyticsPath(path),
      });
    } catch (error) {
      console.error("[Analytics] Pageview delivery failed", {
        ...toSafeErrorLog(error),
      });
    }
  }

  /**
   * Identity cleanup is a privacy operation, so it must run even when capture
   * is disabled.
   */
  reset(): void {
    consentCaptureAllowed = false;
    if (!posthog.__loaded) return;

    try {
      posthog.stopSessionRecording();
      posthog.reset(true);
      posthog.opt_out_capturing();
    } catch (error) {
      console.error("[Analytics] Identity reset failed", {
        ...toSafeErrorLog(error),
      });
    }
  }

  private canCapture(): boolean {
    if (
      !consentCaptureAllowed ||
      !clientConfig.enabled ||
      typeof window === "undefined"
    ) {
      return false;
    }

    return (
      posthog.__loaded === true && posthog.has_opted_in_capturing() === true
    );
  }
}

export const analytics = new AnalyticsService();

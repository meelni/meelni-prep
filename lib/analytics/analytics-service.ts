import posthog from "posthog-js";

import { clientConfig } from "./config";
import { sanitizeAnalyticsPath } from "./privacy";
import {
  sanitizeAnalyticsEventProperties,
  sanitizeAnalyticsTraits,
} from "./event-policy";
import type { AnalyticsEvent, EventProperties, UserTraits } from "./types";

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
      posthog.capture(
        event,
        sanitizeAnalyticsEventProperties(
          event,
          properties as Record<string, unknown>
        )
      );
    } catch (error) {
      console.error("[Analytics] Error tracking event:", event, error);
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
      console.error("[Analytics] Error identifying user:", error);
    }
  }

  pageview(path?: string): void {
    if (!this.canCapture()) return;
    try {
      posthog.capture("$pageview", {
        $current_url: sanitizeAnalyticsPath(path),
      });
    } catch (error) {
      console.error("[Analytics] Error tracking pageview:", error);
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

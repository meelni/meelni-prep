/**
 * Analytics Service
 * Type-safe wrapper around PostHog with PII sanitization
 */

import posthog from "posthog-js";
import { clientConfig } from "./config";
import type { AnalyticsEvent, EventProperties, UserTraits } from "./types";

/**
 * PII patterns to detect and sanitize
 */
const PII_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  ssn: /\d{3}-\d{2}-\d{4}/g,
  creditCard: /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g,
};

/**
 * Analytics Service Class
 * Provides type-safe event tracking with PII sanitization
 */
export class AnalyticsService {
  private initialized = false;

  constructor() {
    // PostHog will be initialized by PostHogProvider
  }

  /**
   * Track an analytics event
   * @param event - Event name (must be in AnalyticsEvent type)
   * @param properties - Event properties (type-safe per event)
   */
  track<E extends AnalyticsEvent>(
    event: E,
    properties: E extends keyof EventProperties ? EventProperties[E] : Record<string, unknown>
  ): void {
    if (!clientConfig.enabled) {
      if (clientConfig.debug) {
        console.log("[Analytics] Tracking disabled", { event, properties });
      }
      return;
    }

    try {
      // Sanitize properties before sending
      const sanitizedProperties = this.sanitizeProperties(properties) as Record<string, unknown>;

      // Track event
      posthog.capture(event, sanitizedProperties);

      if (clientConfig.debug) {
        console.log("[Analytics] Event tracked:", event, sanitizedProperties);
      }
    } catch (error) {
      // Never throw errors from analytics
      console.error("[Analytics] Error tracking event:", event, error);
    }
  }

  /**
   * Identify a user
   * @param userId - Unique user identifier
   * @param traits - User traits (will be sanitized)
   */
  identify(userId: string, traits?: Partial<UserTraits>): void {
    if (!clientConfig.enabled) {
      if (clientConfig.debug) {
        console.log("[Analytics] Identify disabled", { userId, traits });
      }
      return;
    }

    try {
      // Sanitize email if present
      const sanitizedTraits = traits
        ? {
            ...traits,
            email: traits.email ? this.sanitizeEmail(traits.email) : undefined,
          }
        : undefined;

      posthog.identify(userId, sanitizedTraits);

      if (clientConfig.debug) {
        console.log("[Analytics] User identified:", userId, sanitizedTraits);
      }
    } catch (error) {
      console.error("[Analytics] Error identifying user:", error);
    }
  }

  /**
   * Track a pageview
   * @param path - URL path
   */
  pageview(path?: string): void {
    if (!clientConfig.enabled) {
      return;
    }

    try {
      const sanitizedPath = path ? this.sanitizePath(path) : undefined;

      posthog.capture("$pageview", {
        $current_url: sanitizedPath,
      });

      if (clientConfig.debug) {
        console.log("[Analytics] Pageview tracked:", sanitizedPath);
      }
    } catch (error) {
      console.error("[Analytics] Error tracking pageview:", error);
    }
  }

  /**
   * Reset user identity (call on sign out)
   */
  reset(): void {
    if (!clientConfig.enabled) {
      return;
    }

    try {
      posthog.reset();

      if (clientConfig.debug) {
        console.log("[Analytics] User reset");
      }
    } catch (error) {
      console.error("[Analytics] Error resetting user:", error);
    }
  }

  // =============================================================================
  // PII Sanitization Methods
  // =============================================================================

  /**
   * Sanitize properties by removing PII
   */
  private sanitizeProperties(properties: unknown): unknown {
    if (typeof properties !== "object" || properties === null) {
      return properties;
    }

    if (Array.isArray(properties)) {
      return properties.map((item) => this.sanitizeProperties(item));
    }

    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(properties)) {
      // Skip email fields entirely (too risky)
      if (key.toLowerCase().includes("email")) {
        sanitized[key] = "[REDACTED]";
        continue;
      }

      if (typeof value === "string") {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === "object" && value !== null) {
        sanitized[key] = this.sanitizeProperties(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Sanitize a string by removing PII patterns
   */
  private sanitizeString(value: string): string {
    let sanitized = value;

    // Remove emails
    sanitized = sanitized.replace(PII_PATTERNS.email, "[EMAIL_REDACTED]");

    // Remove phone numbers
    sanitized = sanitized.replace(PII_PATTERNS.phone, "[PHONE_REDACTED]");

    // Remove SSNs
    sanitized = sanitized.replace(PII_PATTERNS.ssn, "[SSN_REDACTED]");

    // Remove credit cards
    sanitized = sanitized.replace(PII_PATTERNS.creditCard, "[CC_REDACTED]");

    return sanitized;
  }

  /**
   * Sanitize email by hashing
   */
  private sanitizeEmail(email: string): string {
    // For now, just redact domain to preserve uniqueness
    // Example: user@example.com -> user@[DOMAIN]
    const parts = email.split("@");
    if (parts.length === 2) {
      return `${parts[0]}@[DOMAIN]`;
    }
    return "[EMAIL_REDACTED]";
  }

  /**
   * Sanitize URL path by removing potential PII
   */
  private sanitizePath(path: string): string {
    // Remove email query params
    let sanitized = path.replace(/([?&])email=[^&]*/g, "$1email=[REDACTED]");

    // Remove token/session query params
    sanitized = sanitized.replace(/([?&])(token|session|key)=[^&]*/g, "$1$2=[REDACTED]");

    return sanitized;
  }
}

/**
 * Singleton analytics service instance
 */
export const analytics = new AnalyticsService();

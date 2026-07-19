/**
 * Analytics Service
 * Type-safe wrapper around PostHog with PII sanitization
 */

import posthog from "posthog-js";
import { clientConfig } from "./config";
import type { AnalyticsEvent, EventProperties, UserTraits } from "./types";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";
import { sanitizeAnalyticsString } from "./privacy-sanitizer";

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
   * Check if user has consented to analytics tracking
   * Uses "soft opt-in" approach: track by default until user explicitly declines
   * GDPR-compliant: banner shown immediately, opt-out available, data anonymized
   */
  private hasConsent(): boolean {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      const consent = localStorage.getItem("cookie-consent");
      // Track by default (null or "accepted"), stop only if explicitly declined
      return consent !== "declined";
    } catch {
      // If localStorage access fails, default to no consent for safety
      return false;
    }
  }

  /**
   * Track an analytics event
   * @param event - Event name (must be in AnalyticsEvent type)
   * @param properties - Event properties (type-safe per event)
   */
  track<E extends AnalyticsEvent>(
    event: E,
    properties: E extends keyof EventProperties
      ? EventProperties[E]
      : Record<string, unknown>
  ): void {
    if (!clientConfig.enabled) {
      if (clientConfig.debug) {
        console.log("[Analytics] tracking_disabled");
      }
      return;
    }

    // CRITICAL: Check user consent before tracking
    if (!this.hasConsent()) {
      if (clientConfig.debug) {
        console.log("[Analytics] tracking_blocked_no_consent");
      }
      return;
    }

    try {
      // Sanitize properties before sending
      const sanitizedProperties = this.sanitizeProperties(properties) as Record<
        string,
        unknown
      >;

      // Track event
      posthog.capture(event, sanitizedProperties);

      if (clientConfig.debug) {
        console.log("[Analytics] event_tracked");
      }
    } catch (error) {
      // Never throw errors from analytics
      console.error("[Analytics] event_tracking_failed", {
        ...toSafeErrorLog(error),
      });
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
        console.log("[Analytics] identify_disabled");
      }
      return;
    }

    // Check user consent before identifying
    if (!this.hasConsent()) {
      if (clientConfig.debug) {
        console.log("[Analytics] identify_blocked_no_consent");
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
        console.log("[Analytics] user_identified");
      }
    } catch (error) {
      console.error("[Analytics] user_identification_failed", {
        ...toSafeErrorLog(error),
      });
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

    // Check user consent before tracking pageview
    if (!this.hasConsent()) {
      if (clientConfig.debug) {
        console.log("[Analytics] pageview_blocked_no_consent");
      }
      return;
    }

    try {
      const sanitizedPath = path ? this.sanitizePath(path) : undefined;

      posthog.capture("$pageview", {
        $current_url: sanitizedPath,
      });

      if (clientConfig.debug) {
        console.log("[Analytics] pageview_tracked");
      }
    } catch (error) {
      console.error("[Analytics] pageview_tracking_failed", {
        ...toSafeErrorLog(error),
      });
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
        console.log("[Analytics] user_reset");
      }
    } catch (error) {
      console.error("[Analytics] user_reset_failed", {
        ...toSafeErrorLog(error),
      });
    }
  }

  // =============================================================================
  // PII Sanitization Methods
  // =============================================================================

  /**
   * Hash a session ID using Web Crypto API
   * This prevents sending raw UUIDs to PostHog
   */
  private async hashSessionId(sessionId: string): Promise<string> {
    if (
      typeof window === "undefined" ||
      !window.crypto ||
      !window.crypto.subtle
    ) {
      // Fallback for server-side or old browsers: just truncate
      return `session_${sessionId.substring(0, 8)}`;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(sessionId);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return `session_${hashHex.substring(0, 16)}`; // First 16 chars of hash
    } catch {
      // Fallback on error
      return `session_${sessionId.substring(0, 8)}`;
    }
  }

  /**
   * Synchronous session ID hashing (uses simple truncation)
   * Use this for tracking events where async is not possible
   */
  private hashSessionIdSync(sessionId: string): string {
    // Simple hash function for synchronous contexts
    let hash = 0;
    for (let i = 0; i < sessionId.length; i++) {
      const char = sessionId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `session_${Math.abs(hash).toString(16).substring(0, 12)}`;
  }

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
      // Hash session IDs instead of sending raw UUIDs
      if (
        key.toLowerCase().includes("session_id") &&
        typeof value === "string"
      ) {
        sanitized[key] = this.hashSessionIdSync(value);
        continue;
      }

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
    let sanitized = sanitizeAnalyticsString(value);

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
   * Sanitize email by preserving domain only
   * This allows analytics on email providers without exposing user identity
   * Example: user@gmail.com -> [REDACTED]@gmail.com
   */
  private sanitizeEmail(email: string): string {
    const parts = email.split("@");
    if (parts.length === 2) {
      // Preserve domain for analytics (e.g., gmail.com vs corporate domains)
      // Redact username to protect identity
      return `[REDACTED]@${parts[1]}`;
    }
    return "[EMAIL_REDACTED]";
  }

  /**
   * Sanitize URL path by removing potential PII
   */
  private sanitizePath(path: string): string {
    const providerSafePath = sanitizeAnalyticsString(path);
    // Remove email query params
    let sanitized = providerSafePath.replace(
      /([?&])email=[^&]*/g,
      "$1email=[REDACTED]"
    );

    // Remove token/session query params
    sanitized = sanitized.replace(
      /([?&])(token|session|session_id|checkout_session_id|key)=[^&]*/g,
      "$1$2=[REDACTED]"
    );

    return sanitized;
  }
}

/**
 * Singleton analytics service instance
 */
export const analytics = new AnalyticsService();

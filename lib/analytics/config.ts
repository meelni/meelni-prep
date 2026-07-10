/**
 * Analytics Configuration
 * Environment-based configuration for PostHog
 */

export interface AnalyticsConfig {
  /** PostHog API key (public) */
  apiKey: string;
  /** PostHog host URL */
  host: string;
  /** Enable/disable analytics */
  enabled: boolean;
  /** Enable debug mode (logs events to console) */
  debug: boolean;
  /** Session recording configuration */
  sessionRecording: {
    enabled: boolean;
    sampleRate: number; // 0.0 to 1.0 (0% to 100%)
    maskTextInputs: boolean;
    maskEmails: boolean;
  };
  /** Privacy settings */
  privacy: {
    disableAutocapture: boolean;
    disablePageviewTracking: boolean; // We do manual pageview tracking
    anonymizeIp: boolean;
  };
}

/**
 * Get analytics configuration based on environment
 */
export function getAnalyticsConfig(
  env: Record<string, string | undefined> = process.env
): AnalyticsConfig {
  const isProduction = env.NODE_ENV === "production";
  const isDevelopment = env.NODE_ENV === "development";
  const isTest = env.NODE_ENV === "test";

  // Disable in test environment
  if (isTest) {
    return {
      apiKey: "",
      host: "",
      enabled: false,
      debug: false,
      sessionRecording: {
        enabled: false,
        sampleRate: 0,
        maskTextInputs: true,
        maskEmails: true,
      },
      privacy: {
        disableAutocapture: true,
        disablePageviewTracking: true,
        anonymizeIp: true,
      },
    };
  }

  const apiKey = env.NEXT_PUBLIC_POSTHOG_KEY || "";
  const host = env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  // Warn if missing API key in production
  if (isProduction && !apiKey) {
    console.warn("[Analytics] PostHog API key not configured");
  }

  return {
    apiKey,
    host,
    enabled: !!apiKey && !isTest,
    debug: isDevelopment,
    sessionRecording: {
      // Voice and interview surfaces render live transcript text. Recording is
      // globally disabled so privacy does not depend on DOM masking conventions.
      enabled: false,
      sampleRate: 0,
      maskTextInputs: true,
      maskEmails: true,
    },
    privacy: {
      disableAutocapture: true, // Manual event tracking only
      disablePageviewTracking: true, // Manual pageview tracking
      anonymizeIp: true,
    },
  };
}

/**
 * Client-side analytics config (browser only)
 */
export const clientConfig = getAnalyticsConfig();

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
    maskAllText: boolean;
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
export function getAnalyticsConfig(): AnalyticsConfig {
  const isProduction = process.env.NODE_ENV === "production";
  const isDevelopment = process.env.NODE_ENV === "development";
  const isTest = process.env.NODE_ENV === "test";

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
        maskAllText: true,
        maskEmails: true,
      },
      privacy: {
        disableAutocapture: true,
        disablePageviewTracking: true,
        anonymizeIp: true,
      },
    };
  }

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

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
      enabled: true,
      sampleRate: isProduction ? 0.3 : 1.0, // 30% in prod, 100% in dev
      maskTextInputs: true,
      maskAllText: true,
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

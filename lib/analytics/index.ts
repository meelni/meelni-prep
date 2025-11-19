/**
 * Analytics Module
 * Public API exports for analytics system
 */

// Types (can be used anywhere)
export type { AnalyticsEvent, EventProperties, UserTraits } from "./types";

// Re-export client components from their files directly
// Import these directly from their files to avoid bundler issues:
// - PostHogProvider from "@/lib/analytics/posthog-provider"
// - useAnalyticsPageview from "@/lib/analytics/use-analytics-pageview"
// - analytics from "@/lib/analytics/analytics-service"

// Server-side utilities (safe to export from index)
export { getServerPostHog, trackServerEvent, identifyServerUser } from "./posthog-server";

// Config (server-safe)
export { clientConfig } from "./config";

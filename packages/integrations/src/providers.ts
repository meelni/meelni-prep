export const INTEGRATION_PROVIDERS = [
  "supabase",
  "livekit",
  "stripe",
  "posthog",
  "opik",
  "google_sheets",
  "inngest",
] as const;

export type IntegrationProvider = (typeof INTEGRATION_PROVIDERS)[number];

export function isIntegrationProvider(
  value: unknown
): value is IntegrationProvider {
  return (
    typeof value === "string" &&
    (INTEGRATION_PROVIDERS as readonly string[]).includes(value)
  );
}

/**
 * PostHog Server Client
 * Server-side PostHog client for API routes
 */

import { PostHog } from "posthog-node";
import {
  isCurrentAnalyticsAcceptance,
  type AnalyticsConsentSnapshot,
} from "./consent-contract";
import {
  sanitizeAnalyticsEventProperties,
  sanitizeAnalyticsTraits,
} from "./event-policy";
import { createAnalyticsPseudonym } from "./pseudonym";

let serverPostHog: PostHog | null = null;

/**
 * Get or create PostHog server client
 * Singleton pattern for server-side usage
 */
export function getServerPostHog(): PostHog | null {
  // PostHog capture uses the project API key (phc_), including on the server.
  // Personal API keys (phx_) are for management APIs and must never be used as
  // an ingestion token.
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  // Return null if no API key configured
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Analytics Server] PostHog project key not configured");
    }
    return null;
  }

  // Return existing instance if already initialized
  if (serverPostHog) {
    return serverPostHog;
  }

  // Create new instance
  serverPostHog = new PostHog(apiKey, {
    host,
    flushAt: 1,
    flushInterval: 0,
    requestTimeout: 2_000,
    fetchRetryCount: 0,
    preloadFeatureFlags: false,
    disableRemoteConfig: true,
    disableSurveys: true,
  });

  // Shutdown handler for graceful cleanup
  const shutdown = async () => {
    if (serverPostHog) {
      await serverPostHog.shutdown();
      serverPostHog = null;
    }
  };

  // Register shutdown handlers
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return serverPostHog;
}

/**
 * Track server-side event
 * Helper function for API routes
 */
export async function trackServerEvent(
  event: string,
  properties: Record<string, unknown>,
  subject?: { anonymousId?: string; userId?: string },
  consent?: AnalyticsConsentSnapshot
): Promise<void> {
  if (!consent || !isCurrentAnalyticsAcceptance(consent)) return;
  const distinctId = subject?.userId
    ? createAnalyticsPseudonym(subject.userId)
    : (subject?.anonymousId ?? "anonymous");
  if (!distinctId) return;
  const client = getServerPostHog();

  if (!client) {
    return;
  }

  try {
    await deliverPostHogCapture(client, {
      distinctId,
      event,
      properties: sanitizeAnalyticsEventProperties(event, properties),
    });
  } catch (error) {
    console.error("[Analytics Server] Error tracking event:", error);
  }
}

/**
 * Identify server-side user
 * Helper function for API routes
 */
export async function identifyServerUser(
  userId: string,
  properties?: Record<string, unknown>,
  consent?: AnalyticsConsentSnapshot
): Promise<void> {
  if (!consent || !isCurrentAnalyticsAcceptance(consent)) return;
  const distinctId = createAnalyticsPseudonym(userId);
  if (!distinctId) return;
  const client = getServerPostHog();

  if (!client) {
    return;
  }

  try {
    client.identify({
      distinctId,
      properties: properties ? sanitizeAnalyticsTraits(properties) : undefined,
    });
    await client.flush();
  } catch (error) {
    console.error("[Analytics Server] Error identifying user:", error);
  }
}

interface FlushablePostHogClient {
  capture(message: {
    distinctId: string;
    event: string;
    properties: Record<string, unknown>;
  }): void;
  flush(): Promise<unknown>;
}

export async function deliverPostHogCapture(
  client: FlushablePostHogClient,
  message: {
    distinctId: string;
    event: string;
    properties: Record<string, unknown>;
  }
): Promise<void> {
  client.capture(message);
  await client.flush();
}

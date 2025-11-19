/**
 * PostHog Server Client
 * Server-side PostHog client for API routes
 */

import { PostHog } from "posthog-node";

let serverPostHog: PostHog | null = null;

/**
 * Get or create PostHog server client
 * Singleton pattern for server-side usage
 */
export function getServerPostHog(): PostHog | null {
  // Use server-side key (not exposed to client)
  const apiKey = process.env.POSTHOG_SERVER_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  // Return null if no API key configured
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Analytics Server] PostHog server key not configured");
    }
    return null;
  }

  // Warn if using client key instead of server key
  if (!process.env.POSTHOG_SERVER_KEY && process.env.NODE_ENV !== "production") {
    console.warn(
      "[Analytics Server] Using NEXT_PUBLIC_POSTHOG_KEY (client key) instead of POSTHOG_SERVER_KEY. " +
        "Please set POSTHOG_SERVER_KEY for production."
    );
  }

  // Return existing instance if already initialized
  if (serverPostHog) {
    return serverPostHog;
  }

  // Create new instance
  serverPostHog = new PostHog(apiKey, {
    host,
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
export function trackServerEvent(
  event: string,
  properties: Record<string, unknown>,
  distinctId?: string
): void {
  const client = getServerPostHog();

  if (!client) {
    return;
  }

  try {
    client.capture({
      distinctId: distinctId || "anonymous",
      event,
      properties,
    });
  } catch (error) {
    console.error("[Analytics Server] Error tracking event:", error);
  }
}

/**
 * Identify server-side user
 * Helper function for API routes
 */
export function identifyServerUser(
  userId: string,
  properties?: Record<string, unknown>
): void {
  const client = getServerPostHog();

  if (!client) {
    return;
  }

  try {
    client.identify({
      distinctId: userId,
      properties,
    });
  } catch (error) {
    console.error("[Analytics Server] Error identifying user:", error);
  }
}

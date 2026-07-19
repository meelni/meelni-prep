/**
 * Consent-aware server-side PostHog delivery.
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
import {
  sanitizeAnalyticsString,
  sanitizeAnalyticsValue,
} from "./privacy-sanitizer";
import { toSafeErrorLog } from "@/lib/privacy/safe-error";

let serverPostHog: PostHog | null = null;

export function getServerPostHog(): PostHog | null {
  const apiKey =
    process.env.POSTHOG_SERVER_KEY || process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  if (!apiKey) return null;
  if (serverPostHog) return serverPostHog;

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

  const shutdown = async () => {
    if (!serverPostHog) return;
    await serverPostHog.shutdown();
    serverPostHog = null;
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return serverPostHog;
}

export async function trackServerEvent(
  event: string,
  properties: Record<string, unknown>,
  subject: { anonymousId?: string; userId?: string },
  consent?: AnalyticsConsentSnapshot
): Promise<void> {
  if (!consent || !isCurrentAnalyticsAcceptance(consent)) return;

  const distinctId = subject.userId
    ? createAnalyticsPseudonym(subject.userId)
    : subject.anonymousId;
  if (!distinctId) return;

  const client = getServerPostHog();
  if (!client) return;

  try {
    await deliverPostHogCapture(client, {
      distinctId,
      event,
      properties: sanitizeAnalyticsEventProperties(event, properties),
    });
  } catch (error) {
    console.error("[AnalyticsServer] Optional event delivery failed", {
      ...toSafeErrorLog(error),
    });
  }
}

export async function identifyServerUser(
  userId: string,
  properties: Record<string, unknown> | undefined,
  consent?: AnalyticsConsentSnapshot
): Promise<void> {
  if (!consent || !isCurrentAnalyticsAcceptance(consent)) return;

  const distinctId = createAnalyticsPseudonym(userId);
  if (!distinctId) return;

  const client = getServerPostHog();
  if (!client) return;

  try {
    client.identify(
      buildServerIdentifyPayload(
        distinctId,
        properties ? sanitizeAnalyticsTraits(properties) : undefined
      )
    );
    await client.flush();
  } catch (error) {
    console.error("[AnalyticsServer] Optional identity delivery failed", {
      ...toSafeErrorLog(error),
    });
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
  const { distinctId, event, properties } = message;
  client.capture(buildServerCapturePayload(event, properties, distinctId));
  await client.flush();
}

export function buildServerCapturePayload(
  event: string,
  properties: Record<string, unknown>,
  distinctId?: string
) {
  return {
    distinctId: sanitizeAnalyticsString(distinctId || "anonymous"),
    event: sanitizeAnalyticsString(event),
    properties: sanitizeAnalyticsValue(properties) as Record<string, unknown>,
  };
}

export function buildServerIdentifyPayload(
  distinctId: string,
  properties?: Record<string, unknown>
) {
  return {
    distinctId: sanitizeAnalyticsString(distinctId),
    properties: properties
      ? (sanitizeAnalyticsValue(properties) as Record<string, unknown>)
      : undefined,
  };
}

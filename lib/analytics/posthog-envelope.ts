import {
  sanitizeAnalyticsEventProperties,
  sanitizeAnalyticsTraits,
  hasAnalyticsEventPolicy,
} from "./event-policy";
import { sanitizeAnalyticsPath } from "./privacy";
import { sanitizeAnalyticsString } from "./privacy-sanitizer";

export interface PostHogCaptureEnvelope {
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
  event: string;
  properties: Record<string, unknown>;
  timestamp?: Date;
  uuid: string;
}

const SAFE_PROVIDER_PROPERTY_KEYS = [
  "token",
  "distinct_id",
  "$anon_distinct_id",
  "$lib",
  "$lib_version",
] as const;

export function sanitizePostHogCaptureEnvelope(
  envelope: PostHogCaptureEnvelope | null,
  appOrigin?: string
): PostHogCaptureEnvelope | null {
  if (!envelope) return null;

  const providerProperties = pickProviderProperties(envelope.properties);
  if (envelope.event === "$pageview") {
    const currentPath = sanitizePostHogPageLocation(
      stringValue(envelope.properties.$current_url),
      appOrigin
    );
    return {
      ...envelope,
      properties: currentPath
        ? { ...providerProperties, $current_url: currentPath }
        : providerProperties,
      $set: undefined,
      $set_once: undefined,
    };
  }

  if (envelope.event === "$identify") {
    return {
      ...envelope,
      properties: providerProperties,
      $set: envelope.$set ? sanitizeAnalyticsTraits(envelope.$set) : undefined,
      $set_once: undefined,
    };
  }

  if (envelope.event === "$opt_in") {
    return {
      ...envelope,
      properties: providerProperties,
      $set: undefined,
      $set_once: undefined,
    };
  }

  const safeProperties = sanitizeAnalyticsEventProperties(
    envelope.event,
    envelope.properties
  );
  if (!hasAnalyticsEventPolicy(envelope.event)) {
    return null;
  }
  return {
    ...envelope,
    properties: { ...providerProperties, ...safeProperties },
    $set: undefined,
    $set_once: undefined,
  };
}

export function sanitizePostHogPageLocation(
  value: string | undefined,
  appOrigin?: string
): string | undefined {
  if (!value) return undefined;
  try {
    const baseOrigin = appOrigin
      ? new URL(appOrigin).origin
      : "https://meelni.invalid";
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(value);
    const url = new URL(value, baseOrigin);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    if (!absolute || (appOrigin && url.origin === baseOrigin)) {
      return sanitizeAnalyticsPath(url.pathname || "/");
    }
    return url.origin;
  } catch {
    return undefined;
  }
}

function pickProviderProperties(
  properties: Record<string, unknown>
): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const key of SAFE_PROVIDER_PROPERTY_KEYS) {
    const value = stringValue(properties[key]);
    if (value) safe[key] = sanitizeAnalyticsString(value).slice(0, 256);
  }
  return safe;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

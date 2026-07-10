import { createHash } from "node:crypto";

import type Stripe from "stripe";

export const REDACTED_STRIPE_EVENT_PAYLOAD = "{}";
export const STRIPE_WEBHOOK_PROCESSING_FAILURE_CODE =
  "stripe_webhook_processing_failed";

export interface StripeDeletionSubject {
  kind: "customer" | "subscription";
  providerId: string | null;
  fingerprint: string;
}

export function fingerprintStripeSubject(identifier?: string | null) {
  return identifier
    ? createHash("sha256").update(identifier).digest("hex")
    : null;
}

export function buildStripeDeletionSubjects(input: {
  subscriptionId?: string | null;
  subscriptionCustomerId?: string | null;
  mappedCustomerIds: Array<string | null | undefined>;
}): StripeDeletionSubject[] {
  const candidates: Array<{
    kind: StripeDeletionSubject["kind"];
    providerId?: string | null;
  }> = [
    { kind: "subscription", providerId: input.subscriptionId },
    { kind: "customer", providerId: input.subscriptionCustomerId },
    ...input.mappedCustomerIds.map((providerId) => ({
      kind: "customer" as const,
      providerId,
    })),
  ];
  const seen = new Set<string>();
  const subjects: StripeDeletionSubject[] = [];
  for (const candidate of candidates) {
    const fingerprint = fingerprintStripeSubject(candidate.providerId);
    if (!candidate.providerId || !fingerprint || seen.has(fingerprint))
      continue;
    seen.add(fingerprint);
    subjects.push({
      kind: candidate.kind,
      providerId: candidate.providerId,
      fingerprint,
    });
  }
  return subjects;
}

export function getStripeEventSubject(event: Stripe.Event): {
  customerId: string | null;
  subscriptionId: string | null;
  fingerprint: string | null;
} {
  const object = event.data.object as unknown;
  const customerId = providerId(object, "customer");
  const subscriptionId = providerId(object, "subscription");
  return {
    customerId,
    subscriptionId,
    fingerprint: fingerprintStripeSubject(customerId ?? subscriptionId),
  };
}

export function payloadContainsProviderIdentifier(
  payload: string,
  identifiers: Array<string | null | undefined>
): boolean {
  const expected = new Set(
    identifiers.filter((value): value is string => !!value)
  );
  if (expected.size === 0) return false;
  try {
    return containsValue(JSON.parse(payload), expected);
  } catch {
    return false;
  }
}

function providerId(value: unknown, kind: "customer" | "subscription") {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const direct = record[kind];
  if (typeof direct === "string") return direct;
  if (direct && typeof direct === "object") {
    const id = (direct as Record<string, unknown>).id;
    if (typeof id === "string") return id;
  }
  if (record.object === kind && typeof record.id === "string") {
    return record.id;
  }
  return null;
}

function containsValue(value: unknown, expected: Set<string>): boolean {
  if (typeof value === "string") return expected.has(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsValue(item, expected));
  }
  if (value && typeof value === "object") {
    return Object.values(value).some((item) => containsValue(item, expected));
  }
  return false;
}

import { createHash } from "node:crypto";

import type Stripe from "stripe";

export interface StripeDeletionSubject {
  kind: "charge" | "customer" | "invoice" | "payment_intent" | "subscription";
  providerId: string | null;
  fingerprint: string;
}

const STRIPE_DELETION_SUBJECT_KINDS = new Set<StripeDeletionSubject["kind"]>([
  "charge",
  "customer",
  "invoice",
  "payment_intent",
  "subscription",
]);

export function normalizeStripeDeletionSubjects(
  value: unknown
): StripeDeletionSubject[] {
  if (!Array.isArray(value)) throw invalidDeletionSubjects();
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw invalidDeletionSubjects();
    }
    const record = candidate as Record<string, unknown>;
    const kind = record.kind;
    const providerId = record.providerId;
    const fingerprint = record.fingerprint;
    if (
      typeof kind !== "string" ||
      !STRIPE_DELETION_SUBJECT_KINDS.has(
        kind as StripeDeletionSubject["kind"]
      ) ||
      (providerId !== null && typeof providerId !== "string") ||
      typeof fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(fingerprint) ||
      (typeof providerId === "string" &&
        fingerprintStripeSubject(providerId) !== fingerprint)
    ) {
      throw invalidDeletionSubjects();
    }
    return {
      kind: kind as StripeDeletionSubject["kind"],
      providerId,
      fingerprint,
    };
  });
}

function invalidDeletionSubjects(): Error & { code: string } {
  return Object.assign(new Error("Account deletion subjects are invalid"), {
    code: "account_deletion_subjects_invalid",
  });
}

export function buildStripeDeletionSubject(
  kind: StripeDeletionSubject["kind"],
  providerId?: string | null
): StripeDeletionSubject | null {
  const fingerprint = fingerprintStripeSubject(providerId);
  return providerId && fingerprint ? { kind, providerId, fingerprint } : null;
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
    const subject = buildStripeDeletionSubject(
      candidate.kind,
      candidate.providerId
    );
    if (!subject || seen.has(subject.fingerprint)) continue;
    seen.add(subject.fingerprint);
    subjects.push(subject);
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

import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";

import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export const CONTACT_REASONS = [
  "account",
  "billing",
  "interview",
  "feedback",
  "privacy",
  "other",
] as const;

export type ContactReason = (typeof CONTACT_REASONS)[number];

export type ContactSubmissionError =
  | "invalid_contact_request"
  | "contact_configuration_unavailable"
  | "trusted_ip_unavailable"
  | "contact_rate_limited"
  | "contact_storage_unavailable";

export interface ContactSubmissionInput {
  name: string;
  email: string;
  reason: ContactReason;
  message: string;
  idempotencyKey?: string;
  ipAddress: string;
  secret: string | undefined;
}

export interface ContactSubmissionResult {
  ok: boolean;
  status: number;
  body: {
    receiptId?: string;
    receivedAt?: string;
    duplicate?: boolean;
    error?: ContactSubmissionError;
  };
  retryAfterSeconds?: number;
}

interface SubmitSupportRequestRow {
  [key: string]: unknown;
  submission_id: string | null;
  created_at: Date | string | null;
  duplicate: boolean;
  rate_limited: boolean;
  limiting_scope: string | null;
  retry_after_seconds: number;
}

const MAX_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const MAX_MESSAGE_LENGTH = 4_000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

export async function submitContactRequest(
  input: ContactSubmissionInput
): Promise<ContactSubmissionResult> {
  const normalized = normalizeContactSubmission(input);
  if (!normalized.ok) {
    return {
      ok: false,
      status: 400,
      body: { error: "invalid_contact_request" },
    };
  }

  if (!input.secret?.trim()) {
    return {
      ok: false,
      status: 503,
      body: { error: "contact_configuration_unavailable" },
    };
  }

  const ipHash = hashContactValue(
    input.secret,
    "ip",
    normalized.data.ipAddress
  );
  const emailHash = hashContactValue(
    input.secret,
    "email",
    normalized.data.email
  );
  const idempotencyHash = hashContactValue(
    input.secret,
    "idempotency",
    normalized.data.idempotencyKey ??
      stableSubmissionFingerprint({
        name: normalized.data.name,
        email: normalized.data.email,
        reason: normalized.data.reason,
        message: normalized.data.message,
      })
  );

  try {
    const rows = await db.execute<SubmitSupportRequestRow>(sql`
      SELECT submission_id, created_at, duplicate, rate_limited,
        limiting_scope, retry_after_seconds
      FROM public.submit_support_request(
        ${idempotencyHash},
        ${ipHash},
        ${emailHash},
        ${normalized.data.name},
        ${normalized.data.email},
        ${normalized.data.reason},
        ${normalized.data.message}
      )
    `);
    const row = rows[0];
    const parsed = parseSubmissionRow(row);
    if (!parsed.ok) {
      throw new Error("Invalid contact submission result");
    }
    if (parsed.data.rateLimited) {
      return {
        ok: false,
        status: 429,
        retryAfterSeconds: parsed.data.retryAfterSeconds,
        body: { error: "contact_rate_limited" },
      };
    }
    return {
      ok: true,
      status: 202,
      body: {
        receiptId: parsed.data.submissionId,
        receivedAt: parsed.data.createdAt.toISOString(),
        duplicate: parsed.data.duplicate,
      },
    };
  } catch {
    return {
      ok: false,
      status: 503,
      body: { error: "contact_storage_unavailable" },
    };
  }
}

export function normalizeContactSubmission(input: {
  name: unknown;
  email: unknown;
  reason: unknown;
  message: unknown;
  idempotencyKey?: unknown;
  ipAddress: unknown;
}):
  | {
      ok: true;
      data: {
        name: string;
        email: string;
        reason: ContactReason;
        message: string;
        idempotencyKey?: string;
        ipAddress: string;
      };
    }
  | { ok: false } {
  const name = normalizeSingleLine(input.name, MAX_NAME_LENGTH);
  const email = normalizeEmail(input.email);
  const message = normalizeMessage(input.message);
  const reason = input.reason;
  const ipAddress =
    typeof input.ipAddress === "string" && isIP(input.ipAddress)
      ? input.ipAddress
      : null;
  const idempotencyKey =
    typeof input.idempotencyKey === "string" &&
    IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)
      ? input.idempotencyKey
      : undefined;

  if (
    !name ||
    !email ||
    !message ||
    !isContactReason(reason) ||
    !ipAddress ||
    (input.idempotencyKey !== undefined && !idempotencyKey)
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    data: { name, email, reason, message, idempotencyKey, ipAddress },
  };
}

export function createContactIdempotencyKey(): string {
  return randomUUID();
}

function parseSubmissionRow(row: SubmitSupportRequestRow | undefined):
  | {
      ok: true;
      data:
        | {
            rateLimited: true;
            retryAfterSeconds: number;
          }
        | {
            rateLimited: false;
            submissionId: string;
            createdAt: Date;
            duplicate: boolean;
            retryAfterSeconds: 0;
          };
    }
  | { ok: false } {
  if (
    !row ||
    typeof row.duplicate !== "boolean" ||
    typeof row.rate_limited !== "boolean" ||
    !Number.isInteger(row.retry_after_seconds) ||
    row.retry_after_seconds < 0 ||
    row.retry_after_seconds > 24 * 60 * 60 ||
    (row.rate_limited && row.retry_after_seconds < 1) ||
    (!row.rate_limited && row.retry_after_seconds !== 0)
  ) {
    return { ok: false };
  }

  if (row.rate_limited) {
    return {
      ok: true,
      data: {
        rateLimited: true,
        retryAfterSeconds: row.retry_after_seconds,
      },
    };
  }

  const createdAt =
    row.created_at instanceof Date
      ? row.created_at
      : typeof row.created_at === "string"
        ? new Date(row.created_at)
        : null;
  if (
    !isUuid(row.submission_id) ||
    !createdAt ||
    Number.isNaN(createdAt.getTime())
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    data: {
      rateLimited: false,
      submissionId: row.submission_id,
      createdAt,
      duplicate: row.duplicate,
      retryAfterSeconds: 0,
    },
  };
}

function normalizeSingleLine(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function normalizeEmail(value: unknown): string | null {
  const normalized = normalizeSingleLine(
    value,
    MAX_EMAIL_LENGTH
  )?.toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (!normalized || normalized.length > MAX_MESSAGE_LENGTH) return null;
  return normalized;
}

function isContactReason(value: unknown): value is ContactReason {
  return CONTACT_REASONS.includes(value as ContactReason);
}

function stableSubmissionFingerprint(input: {
  name: string;
  email: string;
  reason: ContactReason;
  message: string;
}): string {
  return JSON.stringify(input);
}

function hashContactValue(
  secret: string,
  scope: "ip" | "email" | "idempotency",
  value: string
): string {
  return createHmac("sha256", secret)
    .update(`meelni/contact/${scope}/v1:${value}`)
    .digest("hex");
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

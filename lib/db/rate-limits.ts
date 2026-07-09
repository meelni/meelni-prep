import { sql } from "drizzle-orm";

import { db } from "./index";

export interface ReconnectRateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
  resetAt: Date;
}

interface ReconnectRateLimitRow {
  [key: string]: unknown;
  allowed: boolean;
  retry_after_seconds: number;
  remaining: number;
  reset_at: Date | string;
}

export async function consumeReconnectRateLimit(
  authenticatedUserId: string
): Promise<ReconnectRateLimitDecision> {
  const rows = await db.execute<ReconnectRateLimitRow>(sql`
    SELECT allowed, retry_after_seconds, remaining, reset_at
    FROM public.consume_livekit_reconnect_rate_limit(${authenticatedUserId}::uuid)
  `);
  const row = rows[0];
  const rawResetAt = row?.reset_at;
  const resetAt =
    rawResetAt instanceof Date || typeof rawResetAt === "string"
      ? new Date(rawResetAt)
      : null;

  if (
    !row ||
    typeof row.allowed !== "boolean" ||
    !Number.isInteger(row.retry_after_seconds) ||
    row.retry_after_seconds < 0 ||
    row.retry_after_seconds > 60 ||
    !Number.isInteger(row.remaining) ||
    row.remaining < 0 ||
    row.remaining > 9 ||
    !resetAt ||
    Number.isNaN(resetAt.getTime()) ||
    (row.allowed && (row.retry_after_seconds !== 0 || row.remaining > 9)) ||
    (!row.allowed && (row.retry_after_seconds < 1 || row.remaining !== 0))
  ) {
    throw new Error("Invalid reconnect rate-limit result");
  }

  return {
    allowed: row.allowed,
    retryAfterSeconds: row.retry_after_seconds,
    remaining: row.remaining,
    resetAt,
  };
}

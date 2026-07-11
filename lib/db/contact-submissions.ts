import { eq, sql } from "drizzle-orm";

import type {
  ContactSubmissionStore,
  ContactSubmissionStoreInput,
} from "@/lib/workflows/submit-contact-request";
import { lockAccountIdentity } from "@/lib/db/account-identity-lock";

import { db } from "./index";
import { accountDeletionRequest, appUser, contactSubmission } from "./schema";

const EMAIL_REQUESTS_PER_HOUR = 3;
const CLIENT_REQUESTS_PER_HOUR = 10;
const CLIENT_ATTEMPTS_PER_HOUR = 60;
const GLOBAL_REQUESTS_PER_HOUR = 10_000;

type ContactSubmissionDatabase = typeof db;

interface ContactRateLimitRow {
  [key: string]: unknown;
  allowed: boolean;
  retry_after_seconds: number;
  remaining: number;
  reset_at: Date | string;
}

class ContactRateLimitExceeded extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("contact_rate_limited");
  }
}

class ContactAccountUnavailable extends Error {
  constructor() {
    super("contact_account_unavailable");
  }
}

export function createDrizzleContactSubmissionStore(
  database: ContactSubmissionDatabase = db
): ContactSubmissionStore {
  return {
    async accept(input) {
      try {
        return await database.transaction(async (transaction) => {
          if (input.userId) {
            await lockAccountIdentity(transaction, input.userId);
            const [user] = await transaction
              .select({ id: appUser.id })
              .from(appUser)
              .where(eq(appUser.id, input.userId))
              .limit(1)
              .for("update");
            const [deletion] = await transaction
              .select({ userId: accountDeletionRequest.userId })
              .from(accountDeletionRequest)
              .where(eq(accountDeletionRequest.userId, input.userId))
              .limit(1);

            if (!user || deletion) {
              throw new ContactAccountUnavailable();
            }
          }

          await transaction.execute(sql`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${input.idempotencyKey}, 0)
            )
          `);

          const existing = await transaction
            .select()
            .from(contactSubmission)
            .where(eq(contactSubmission.idempotencyKey, input.idempotencyKey))
            .limit(1);

          if (existing[0]) {
            return submissionMatches(existing[0], input)
              ? {
                  disposition: "replayed" as const,
                  receiptId: existing[0].id,
                }
              : { disposition: "idempotency_conflict" as const };
          }

          const identities = [
            {
              hash: input.rateLimitIdentities.email,
              limit: EMAIL_REQUESTS_PER_HOUR,
            },
            {
              hash: input.rateLimitIdentities.client,
              limit: CLIENT_REQUESTS_PER_HOUR,
            },
            {
              hash: input.rateLimitIdentities.global,
              limit: GLOBAL_REQUESTS_PER_HOUR,
            },
          ].sort((left, right) => left.hash.localeCompare(right.hash));

          for (const identity of identities) {
            const rows = await transaction.execute<ContactRateLimitRow>(sql`
              SELECT allowed, retry_after_seconds, remaining, reset_at
              FROM public.consume_contact_submission_rate_limit(
                ${identity.hash},
                ${identity.limit}
              )
            `);
            const decision = parseRateLimitDecision(rows[0], identity.limit);
            if (!decision.allowed) {
              throw new ContactRateLimitExceeded(decision.retryAfterSeconds);
            }
          }

          const inserted = await transaction
            .insert(contactSubmission)
            .values(input)
            .returning({ id: contactSubmission.id });

          if (!inserted[0]) {
            throw new Error("contact_submission_insert_failed");
          }

          return {
            disposition: "stored" as const,
            receiptId: inserted[0].id,
          };
        });
      } catch (error) {
        if (error instanceof ContactRateLimitExceeded) {
          return {
            disposition: "rate_limited",
            retryAfterSeconds: error.retryAfterSeconds,
          };
        }
        throw error;
      }
    },
  };
}

export async function consumeContactSubmissionAttemptBudget(
  identityHash: string,
  database: ContactSubmissionDatabase = db
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  return consumeContactRateLimit(
    database,
    identityHash,
    CLIENT_ATTEMPTS_PER_HOUR
  );
}

function submissionMatches(
  existing: typeof contactSubmission.$inferSelect,
  input: ContactSubmissionStoreInput
): boolean {
  return (
    existing.name === input.name &&
    existing.email === input.email &&
    existing.reason === input.reason &&
    existing.subject === input.subject &&
    existing.message === input.message
  );
}

function parseRateLimitDecision(
  row: ContactRateLimitRow | undefined,
  limit: number
): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const retryAfterSeconds = row?.retry_after_seconds;
  const remaining = row?.remaining;
  const resetAt = row?.reset_at;
  const parsedResetAt =
    resetAt instanceof Date || typeof resetAt === "string"
      ? new Date(resetAt)
      : null;

  if (
    !row ||
    typeof row.allowed !== "boolean" ||
    typeof retryAfterSeconds !== "number" ||
    !Number.isInteger(retryAfterSeconds) ||
    retryAfterSeconds < 0 ||
    retryAfterSeconds > 3600 ||
    typeof remaining !== "number" ||
    !Number.isInteger(remaining) ||
    remaining < 0 ||
    remaining >= limit ||
    !parsedResetAt ||
    Number.isNaN(parsedResetAt.getTime()) ||
    (row.allowed && retryAfterSeconds !== 0) ||
    (!row.allowed && (retryAfterSeconds < 1 || remaining !== 0))
  ) {
    throw new Error("invalid_contact_rate_limit_result");
  }

  return { allowed: row.allowed, retryAfterSeconds };
}

export const contactSubmissionRateLimitPolicy = {
  clientAttemptsPerHour: CLIENT_ATTEMPTS_PER_HOUR,
  emailRequestsPerHour: EMAIL_REQUESTS_PER_HOUR,
  clientRequestsPerHour: CLIENT_REQUESTS_PER_HOUR,
  globalRequestsPerHour: GLOBAL_REQUESTS_PER_HOUR,
} as const;

async function consumeContactRateLimit(
  database: ContactSubmissionDatabase,
  identityHash: string,
  limit: number
) {
  const rows = await database.execute<ContactRateLimitRow>(sql`
    SELECT allowed, retry_after_seconds, remaining, reset_at
    FROM public.consume_contact_submission_rate_limit(${identityHash}, ${limit})
  `);
  return parseRateLimitDecision(rows[0], limit);
}

export async function cleanupStaleContactRateLimits(
  batchSize: number
): Promise<number> {
  const rows = await db.execute<{ deleted: number }>(sql`
    SELECT public.cleanup_contact_submission_rate_limits(${batchSize}) AS deleted
  `);
  const deleted = rows[0]?.deleted;
  if (
    typeof deleted !== "number" ||
    !Number.isInteger(deleted) ||
    deleted < 0 ||
    deleted > batchSize
  ) {
    throw new Error("invalid_contact_rate_limit_cleanup_result");
  }
  return deleted;
}

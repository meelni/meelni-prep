import { and, eq, inArray, lt, ne, or, sql } from "drizzle-orm";

import {
  buildStripeDeletionSubjects,
  payloadContainsProviderIdentifier,
  type StripeDeletionSubject,
} from "@/lib/billing/stripe-privacy";

import { db } from "./index";
import {
  accountDeletionRequest,
  appUser,
  feedback,
  interviewSession,
  livekitReconnectRateLimit,
  sessionQuestion,
  stripeEventLog,
  stripeCustomerMapping,
  subscription,
  transcriptTurn,
  userSettings,
} from "./schema";

export type AccountDeletionStatus =
  | "pending"
  | "processing"
  | "failed"
  | "completed";

export interface AccountDeletionRecord {
  userId: string;
  status: AccountDeletionStatus;
  stripeSubjects: StripeDeletionSubject[];
  attempts: number;
}

export async function loadAccountDeletionSubjects(userId: string) {
  const [currentSubscription] = await db
    .select({
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      stripeCustomerId: subscription.stripeCustomerId,
    })
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);
  const customerMappings = await db
    .select({ stripeCustomerId: stripeCustomerMapping.stripeCustomerId })
    .from(stripeCustomerMapping)
    .where(eq(stripeCustomerMapping.userId, userId));

  return buildStripeDeletionSubjects({
    subscriptionId: currentSubscription?.stripeSubscriptionId,
    subscriptionCustomerId: currentSubscription?.stripeCustomerId,
    mappedCustomerIds: customerMappings.map(
      ({ stripeCustomerId }) => stripeCustomerId
    ),
  });
}

export async function requestAccountDeletion(input: {
  userId: string;
  stripeSubjects: StripeDeletionSubject[];
}): Promise<AccountDeletionRecord> {
  const [record] = await db
    .insert(accountDeletionRequest)
    .values({
      userId: input.userId,
      stripeSubjects: input.stripeSubjects,
    })
    .onConflictDoUpdate({
      target: accountDeletionRequest.userId,
      set: {
        status: "pending",
        stripeSubjects: input.stripeSubjects,
        lastErrorCode: null,
        completedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  if (!record) throw new Error("Account deletion request was not persisted");
  return toDeletionRecord(record);
}

export async function getAccountDeletionRequest(
  userId: string
): Promise<AccountDeletionRecord | undefined> {
  const record = await db.query.accountDeletionRequest.findFirst({
    where: eq(accountDeletionRequest.userId, userId),
  });
  return record ? toDeletionRecord(record) : undefined;
}

export async function hasAccountDeletionTombstone(
  userId: string
): Promise<boolean> {
  return Boolean(await getAccountDeletionRequest(userId));
}

export async function markAccountDeletionProcessing(userId: string) {
  await db
    .update(accountDeletionRequest)
    .set({
      status: "processing",
      attempts: sql`${accountDeletionRequest.attempts} + 1`,
      lastErrorCode: null,
      updatedAt: new Date(),
    })
    .where(eq(accountDeletionRequest.userId, userId));
}

export async function markAccountDeletionFailed(
  userId: string,
  errorCode: string
) {
  await db
    .update(accountDeletionRequest)
    .set({
      status: "failed",
      lastErrorCode: errorCode,
      updatedAt: new Date(),
    })
    .where(eq(accountDeletionRequest.userId, userId));
}

export async function markAccountDeletionCompleted(userId: string) {
  const now = new Date();
  const request = await getAccountDeletionRequest(userId);
  if (!request) throw new Error("Account deletion tombstone is missing");
  await db
    .update(accountDeletionRequest)
    .set({
      status: "completed",
      lastErrorCode: null,
      completedAt: now,
      stripeSubjects: request.stripeSubjects.map((subject) => ({
        ...subject,
        providerId: null,
      })),
      updatedAt: now,
    })
    .where(eq(accountDeletionRequest.userId, userId));
}

export async function hasStripeDeletionTombstone(
  fingerprint: string
): Promise<boolean> {
  const row = await db.query.accountDeletionRequest.findFirst({
    where: sql`${accountDeletionRequest.stripeSubjects} @> ${JSON.stringify([
      { fingerprint },
    ])}::jsonb`,
    columns: { userId: true },
  });
  return Boolean(row);
}

export async function redactStripeEventLogs(request: AccountDeletionRecord) {
  const fingerprints = new Set(
    request.stripeSubjects.map(({ fingerprint }) => fingerprint)
  );
  const identifiers = request.stripeSubjects.map(
    ({ providerId }) => providerId
  );
  const rows = await db
    .select({
      id: stripeEventLog.id,
      payload: stripeEventLog.payload,
      subjectFingerprint: stripeEventLog.subjectFingerprint,
    })
    .from(stripeEventLog)
    .where(ne(stripeEventLog.payload, "{}"));

  for (const row of rows) {
    const fingerprintMatch =
      row.subjectFingerprint && fingerprints.has(row.subjectFingerprint);
    const legacyPayloadMatch = payloadContainsProviderIdentifier(
      row.payload,
      identifiers
    );
    if (!fingerprintMatch && !legacyPayloadMatch) continue;

    const matchedLegacySubject = request.stripeSubjects.find(({ providerId }) =>
      payloadContainsProviderIdentifier(row.payload, [providerId])
    );
    await db
      .update(stripeEventLog)
      .set({
        payload: "{}",
        lastError: null,
        subjectFingerprint:
          row.subjectFingerprint ?? matchedLegacySubject?.fingerprint ?? null,
      })
      .where(eq(stripeEventLog.id, row.id));
  }
}

export async function listRecoverableAccountDeletions(
  staleBefore: Date,
  limit = 50
): Promise<string[]> {
  const rows = await db
    .select({ userId: accountDeletionRequest.userId })
    .from(accountDeletionRequest)
    .where(
      or(
        inArray(accountDeletionRequest.status, ["pending", "failed"]),
        and(
          eq(accountDeletionRequest.status, "processing"),
          lt(accountDeletionRequest.updatedAt, staleBefore)
        )
      )
    )
    .limit(limit);
  return rows.map(({ userId }) => userId);
}

export async function deleteUserApplicationData(userId: string) {
  await db.transaction(async (tx) => {
    const sessions = await tx
      .select({ id: interviewSession.id })
      .from(interviewSession)
      .where(eq(interviewSession.userId, userId));

    for (const { id: sessionId } of sessions) {
      await tx.delete(feedback).where(eq(feedback.sessionId, sessionId));
      await tx
        .delete(transcriptTurn)
        .where(eq(transcriptTurn.sessionId, sessionId));
      await tx
        .delete(sessionQuestion)
        .where(eq(sessionQuestion.sessionId, sessionId));
    }

    await tx
      .delete(interviewSession)
      .where(eq(interviewSession.userId, userId));
    await tx.delete(userSettings).where(eq(userSettings.userId, userId));
    await tx
      .delete(livekitReconnectRateLimit)
      .where(eq(livekitReconnectRateLimit.userId, userId));
    await tx
      .delete(stripeCustomerMapping)
      .where(eq(stripeCustomerMapping.userId, userId));
    await tx.delete(appUser).where(eq(appUser.id, userId));
  });
}

function toDeletionRecord(record: typeof accountDeletionRequest.$inferSelect) {
  return {
    userId: record.userId,
    status: record.status as AccountDeletionStatus,
    stripeSubjects: record.stripeSubjects,
    attempts: record.attempts,
  };
}

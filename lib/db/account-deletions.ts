import { and, eq, inArray, lt, ne, or, sql } from "drizzle-orm";

import {
  buildStripeDeletionSubjects,
  normalizeStripeDeletionSubjects,
  payloadContainsProviderIdentifier,
  type StripeDeletionSubject,
} from "@/lib/billing/stripe-privacy";
import { lockAccountIdentity } from "@/lib/db/account-identity-lock";

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
  transcriptInterruptionMarker,
  transcriptRuntimeSettlement,
  transcriptRuntimeWriter,
  subscription,
  transcriptTurn,
  userInsights,
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

export async function requestAccountDeletion(input: {
  userId: string;
  stripeSubjects: StripeDeletionSubject[];
}): Promise<AccountDeletionRecord> {
  const record = await db.transaction(async (tx) => {
    await lockAccountIdentity(tx, input.userId);
    // Serialize deletion intent with credit-ledger fulfillment. The ledger
    // locks the same app_user row before checking this tombstone, so either a
    // grant commits before deletion intent or it fails closed afterward.
    await tx
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.id, input.userId))
      .limit(1)
      .for("update");

    const [persisted] = await tx
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
    return persisted;
  });
  if (!record) throw new Error("Account deletion request was not persisted");
  return toDeletionRecord(record);
}

export async function requestAccountDeletionWithCurrentSubjects(
  userId: string
): Promise<AccountDeletionRecord> {
  const record = await db.transaction(async (tx) => {
    await lockAccountIdentity(tx, userId);
    await tx
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1)
      .for("update");

    // Billing webhook fulfillment locks the same user row. Taking the subject
    // snapshot after this lock prevents a concurrent subscription/mapping
    // commit from falling between the snapshot and durable tombstone.
    const [currentSubscription] = await tx
      .select({
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        stripeCustomerId: subscription.stripeCustomerId,
      })
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .limit(1);
    const customerMappings = await tx
      .select({ stripeCustomerId: stripeCustomerMapping.stripeCustomerId })
      .from(stripeCustomerMapping)
      .where(eq(stripeCustomerMapping.userId, userId));
    const stripeSubjects = buildStripeDeletionSubjects({
      subscriptionId: currentSubscription?.stripeSubscriptionId,
      subscriptionCustomerId: currentSubscription?.stripeCustomerId,
      mappedCustomerIds: customerMappings.map(
        ({ stripeCustomerId }) => stripeCustomerId
      ),
    });

    const [persisted] = await tx
      .insert(accountDeletionRequest)
      .values({ userId, stripeSubjects })
      .onConflictDoUpdate({
        target: accountDeletionRequest.userId,
        set: {
          status: "pending",
          stripeSubjects,
          lastErrorCode: null,
          completedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return persisted;
  });
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

export async function recordLateStripeDeletionSubjects(
  userId: string,
  incomingSubjects: StripeDeletionSubject[]
): Promise<boolean> {
  if (incomingSubjects.length === 0) return false;
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accountDeletionRequest)
      .where(eq(accountDeletionRequest.userId, userId))
      .limit(1)
      .for("update");
    if (!request) return false;

    const subjects = new Map(
      request.stripeSubjects.map((subject) => [subject.fingerprint, subject])
    );
    for (const subject of incomingSubjects) {
      const existing = subjects.get(subject.fingerprint);
      subjects.set(subject.fingerprint, {
        kind: existing?.kind ?? subject.kind,
        fingerprint: subject.fingerprint,
        // A late provider resource must remain recoverable until its deletion
        // succeeds. The cleanup path clears this raw ID immediately after the
        // provider confirms deletion; only the fingerprint remains afterward.
        providerId: existing?.providerId ?? subject.providerId,
      });
    }
    await tx
      .update(accountDeletionRequest)
      .set({
        stripeSubjects: [...subjects.values()],
        updatedAt: new Date(),
      })
      .where(eq(accountDeletionRequest.userId, userId));
    return true;
  });
}

export async function clearLateStripeDeletionSubjects(
  userId: string,
  fingerprints: string[]
): Promise<boolean> {
  if (fingerprints.length === 0) return false;
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accountDeletionRequest)
      .where(eq(accountDeletionRequest.userId, userId))
      .limit(1)
      .for("update");
    if (!request) return false;

    const cleared = new Set(fingerprints);
    const stripeSubjects = request.stripeSubjects.map((subject) =>
      cleared.has(subject.fingerprint)
        ? { ...subject, providerId: null }
        : subject
    );
    const hasRemainingSubjects = stripeSubjects.some(
      ({ providerId }) => providerId !== null
    );
    await tx
      .update(accountDeletionRequest)
      .set({
        stripeSubjects,
        ...(request.lastErrorCode === "stripe_late_reconciliation_failed"
          ? {
              status: hasRemainingSubjects ? "failed" : "completed",
              lastErrorCode: hasRemainingSubjects
                ? "stripe_late_reconciliation_failed"
                : null,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(accountDeletionRequest.userId, userId));
    return true;
  });
}

export async function markLateStripeReconciliationFailed(userId: string) {
  await db
    .update(accountDeletionRequest)
    .set({
      status: "failed",
      lastErrorCode: "stripe_late_reconciliation_failed",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(accountDeletionRequest.userId, userId),
        eq(accountDeletionRequest.status, "completed")
      )
    );
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

export async function markAccountDeletionCompleted(
  userId: string,
  processedFingerprints: string[]
) {
  const now = new Date();
  await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accountDeletionRequest)
      .where(eq(accountDeletionRequest.userId, userId))
      .limit(1)
      .for("update");
    if (!request) throw new Error("Account deletion tombstone is missing");
    const processed = new Set(processedFingerprints);
    const stripeSubjects = request.stripeSubjects.map((subject) =>
      processed.has(subject.fingerprint)
        ? { ...subject, providerId: null }
        : subject
    );
    const hasUnprocessedSubjects = stripeSubjects.some(
      ({ providerId }) => providerId !== null
    );
    await tx
      .update(accountDeletionRequest)
      .set({
        status: hasUnprocessedSubjects ? "failed" : "completed",
        lastErrorCode: hasUnprocessedSubjects
          ? "stripe_late_reconciliation_failed"
          : null,
        completedAt: hasUnprocessedSubjects ? request.completedAt : now,
        stripeSubjects,
        updatedAt: now,
      })
      .where(eq(accountDeletionRequest.userId, userId));
  });
}

export async function hasStripeDeletionTombstone(
  fingerprint: string
): Promise<boolean> {
  return Boolean(
    await getAccountDeletionRequestByStripeFingerprint(fingerprint)
  );
}

export async function getAccountDeletionRequestByStripeFingerprint(
  fingerprint: string
): Promise<AccountDeletionRecord | undefined> {
  const row = await db.query.accountDeletionRequest.findFirst({
    where: sql`${accountDeletionRequest.stripeSubjects} @> ${JSON.stringify([
      { fingerprint },
    ])}::jsonb`,
  });
  return row ? toDeletionRecord(row) : undefined;
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
          eq(accountDeletionRequest.status, "completed"),
          sql`EXISTS (
            SELECT 1
            FROM jsonb_array_elements(${accountDeletionRequest.stripeSubjects}) subject
            WHERE subject->>'providerId' IS NOT NULL
          )`
        ),
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
        .delete(transcriptInterruptionMarker)
        .where(eq(transcriptInterruptionMarker.sessionId, sessionId));
      await tx
        .delete(transcriptRuntimeSettlement)
        .where(eq(transcriptRuntimeSettlement.sessionId, sessionId));
      await tx
        .delete(transcriptRuntimeWriter)
        .where(eq(transcriptRuntimeWriter.sessionId, sessionId));
      await tx
        .delete(sessionQuestion)
        .where(eq(sessionQuestion.sessionId, sessionId));
    }

    // user_insights.last_session_id has a NO ACTION foreign key to
    // interview_session. Remove the user's aggregate row before deleting the
    // session graph so a populated account cannot wedge durable deletion.
    await tx.delete(userInsights).where(eq(userInsights.userId, userId));
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
    stripeSubjects: normalizeStripeDeletionSubjects(record.stripeSubjects),
    attempts: record.attempts,
  };
}

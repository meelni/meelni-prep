import { createHash } from "node:crypto";

import { and, asc, eq, inArray, isNotNull, lt, ne, or, sql } from "drizzle-orm";

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
  creditReservation,
  feedback,
  interviewSession,
  livekitReconnectRateLimit,
  sessionQuestion,
  stripeEventLog,
  stripeCustomerMapping,
  transcriptInterruptionMarker,
  transcriptRuntimeSettlement,
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
  livekitRooms: LiveKitDeletionRoom[];
  attempts: number;
}

export async function withStripeDeletionSerializationRetry<T>(
  operation: () => Promise<T>,
  options: {
    sleep?: (milliseconds: number) => Promise<void>;
    random?: () => number;
  } = {}
): Promise<T> {
  let lastError: unknown;
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const random = options.random ?? Math.random;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!hasPostgresCode(error, "40001")) throw error;
      if (attempt < 7) {
        const backoff = Math.min(250, 20 * 2 ** attempt);
        await sleep(backoff + Math.floor(random() * 21));
      }
    }
  }
  throw lastError;
}

function hasPostgresCode(error: unknown, code: string): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: unknown }).code === code
    ) {
      return true;
    }
    current =
      typeof current === "object" && "cause" in current
        ? (current as { cause?: unknown }).cause
        : undefined;
  }
  return false;
}

export interface LiveKitDeletionRoom {
  roomName: string | null;
  fingerprint: string;
  generation: number;
  provisioning: boolean;
  provisioningExpiresAt: string | null;
}

export const LIVEKIT_DELETION_PROVISIONING_LEASE_MS = 10 * 60 * 1000;

export type ProcessedLiveKitDeletionRoom = Pick<
  LiveKitDeletionRoom,
  "fingerprint" | "generation"
>;

export async function requestAccountDeletion(input: {
  userId: string;
  stripeSubjects: StripeDeletionSubject[];
  livekitRooms?: LiveKitDeletionRoom[];
}): Promise<AccountDeletionRecord> {
  const record = await withStripeDeletionSerializationRetry(() =>
    db.transaction(async (tx) => {
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

    const [existingRequest] = await tx
      .select()
      .from(accountDeletionRequest)
      .where(eq(accountDeletionRequest.userId, input.userId))
      .limit(1)
      .for("update");
    const stripeSubjects = existingRequest
      ? mergeStripeDeletionSubjects(
          existingRequest.stripeSubjects,
          input.stripeSubjects
        )
      : input.stripeSubjects;
    const livekitRooms = existingRequest
      ? mergeLiveKitDeletionRooms(
          existingRequest.livekitRooms,
          input.livekitRooms ?? []
        )
      : normalizeLiveKitDeletionRooms(input.livekitRooms ?? []);

    const [persisted] = await tx
      .insert(accountDeletionRequest)
      .values({
        userId: input.userId,
        stripeSubjects,
        livekitRooms,
      })
      .onConflictDoUpdate({
        target: accountDeletionRequest.userId,
        set: {
          status: existingRequest?.status ?? "pending",
          stripeSubjects,
          livekitRooms,
          lastErrorCode: existingRequest?.lastErrorCode ?? null,
          completedAt: existingRequest?.completedAt ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
      return persisted;
    })
  );
  if (!record) throw new Error("Account deletion request was not persisted");
  return toDeletionRecord(record);
}

export async function requestAccountDeletionWithCurrentSubjects(
  userId: string
): Promise<AccountDeletionRecord> {
  const record = await withStripeDeletionSerializationRetry(() =>
    db.transaction(async (tx) => {
      await lockAccountIdentity(tx, userId);
      await tx
        .select({ id: appUser.id })
        .from(appUser)
        .where(eq(appUser.id, userId))
        .limit(1)
        .for("update");
      const clockRows = await tx.execute(
        sql<{ now: Date | string }>`select clock_timestamp() as now`
      );
      const clockValue: unknown = clockRows[0]?.now;
      if (!(clockValue instanceof Date) && typeof clockValue !== "string") {
        throw new Error("Database clock is unavailable");
      }
      const databaseNow = new Date(clockValue);

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
      .select({
        stripeCustomerId: stripeCustomerMapping.stripeCustomerId,
        stripeSubscriptionId: stripeCustomerMapping.stripeSubscriptionId,
      })
      .from(stripeCustomerMapping)
      .where(eq(stripeCustomerMapping.userId, userId))
      .orderBy(asc(stripeCustomerMapping.stripeCustomerId));
    const stripeSubjects = buildStripeDeletionSubjects({
      subscriptionId: currentSubscription?.stripeSubscriptionId,
      subscriptionCustomerId: currentSubscription?.stripeCustomerId,
      mappedSubscriptionIds: customerMappings.map(
        ({ stripeSubscriptionId }) => stripeSubscriptionId
      ),
      mappedCustomerIds: customerMappings.map(
        ({ stripeCustomerId }) => stripeCustomerId
      ),
    });
    const roomRows = await tx
      .select({
        roomName: interviewSession.livekitRoomName,
        lifecycleState: interviewSession.lifecycleState,
        terminalReason: interviewSession.terminalReason,
      })
      .from(interviewSession)
      .where(
        and(
          eq(interviewSession.userId, userId),
          isNotNull(interviewSession.livekitRoomName)
        )
      )
      .orderBy(asc(interviewSession.livekitRoomName));
    const livekitRooms = roomRows.flatMap(
      ({ roomName, lifecycleState, terminalReason }) => {
        // Terminal lifecycle truth does not prove provider cleanup. In
        // particular, provider-start failure can terminalize locally while an
        // ambiguous LiveKit create commits late.
        const provisioning =
          lifecycleState === "created" ||
          lifecycleState === "connecting" ||
          terminalReason === "provider_failure";
        return buildLiveKitDeletionRooms([roomName], {
          provisioning,
          provisioningExpiresAt: provisioning
            ? new Date(
                databaseNow.getTime() + LIVEKIT_DELETION_PROVISIONING_LEASE_MS
              ).toISOString()
            : null,
        });
      }
    );

    const [existingRequest] = await tx
      .select()
      .from(accountDeletionRequest)
      .where(eq(accountDeletionRequest.userId, userId))
      .limit(1)
      .for("update");
    const mergedStripeSubjects = existingRequest
      ? mergeStripeDeletionSubjects(
          existingRequest.stripeSubjects,
          stripeSubjects
        )
      : stripeSubjects;
    const mergedLiveKitRooms = existingRequest
      ? mergeLiveKitDeletionRooms(existingRequest.livekitRooms, livekitRooms)
      : normalizeLiveKitDeletionRooms(livekitRooms);

    const [persisted] = await tx
      .insert(accountDeletionRequest)
      .values({
        userId,
        stripeSubjects: mergedStripeSubjects,
        livekitRooms: mergedLiveKitRooms,
      })
      .onConflictDoUpdate({
        target: accountDeletionRequest.userId,
        set: {
          status: existingRequest?.status ?? "pending",
          stripeSubjects: mergedStripeSubjects,
          livekitRooms: mergedLiveKitRooms,
          lastErrorCode: existingRequest?.lastErrorCode ?? null,
          completedAt: existingRequest?.completedAt ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
      return persisted;
    })
  );
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

export async function fenceInterviewRoomAgainstAccountDeletion(
  userId: string,
  roomName: string
): Promise<
  | { deletionPending: false }
  | { deletionPending: true; room: LiveKitDeletionRoom }
> {
  return db.transaction(async (tx) => {
    // This is the post-provider linearization point. Deletion takes the same
    // advisory lock, so either this fence authorizes the created room first or
    // it durably re-enrolls the room in deletion cleanup before credentials can
    // leave the start workflow. Provider I/O never runs while this lock is held.
    await lockAccountIdentity(tx, userId);
    const [request] = await tx
      .select()
      .from(accountDeletionRequest)
      .where(eq(accountDeletionRequest.userId, userId))
      .limit(1)
      .for("update");
    if (!request) return { deletionPending: false };

    const candidate = buildLiveKitDeletionRooms([roomName], {
      provisioning: false,
    })[0]!;
    const rooms = normalizeLiveKitDeletionRooms(request.livekitRooms);
    const existing = rooms.find(
      ({ fingerprint }) => fingerprint === candidate.fingerprint
    );
    const room = {
      ...candidate,
      generation: (existing?.generation ?? 0) + 1,
    };
    const livekitRooms = rooms
      .filter(({ fingerprint }) => fingerprint !== room.fingerprint)
      .concat(room)
      .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
    const reopensCompletedDeletion = request.status === "completed";
    await tx
      .update(accountDeletionRequest)
      .set({
        livekitRooms,
        ...(reopensCompletedDeletion
          ? {
              status: "failed",
              lastErrorCode: "livekit_provider_error",
              completedAt: null,
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(accountDeletionRequest.userId, userId));
    return { deletionPending: true, room };
  });
}

export async function clearLateLiveKitDeletionRoom(
  userId: string,
  processedRoom: ProcessedLiveKitDeletionRoom
): Promise<void> {
  await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accountDeletionRequest)
      .where(eq(accountDeletionRequest.userId, userId))
      .limit(1)
      .for("update");
    if (!request) throw new Error("Account deletion tombstone is missing");

    const livekitRooms = normalizeLiveKitDeletionRooms(
      request.livekitRooms
    ).map((room) =>
      room.fingerprint === processedRoom.fingerprint &&
      room.generation === processedRoom.generation
        ? { ...room, roomName: null }
        : room
    );
    const hasRemainingRooms = livekitRooms.some(
      ({ roomName }) => roomName !== null
    );
    const hasRemainingStripeSubjects = request.stripeSubjects.some(
      ({ providerId }) => providerId !== null
    );
    const completesReopenedDeletion =
      request.status === "failed" &&
      request.lastErrorCode === "livekit_provider_error" &&
      !hasRemainingRooms &&
      !hasRemainingStripeSubjects;
    await tx
      .update(accountDeletionRequest)
      .set({
        livekitRooms,
        ...(completesReopenedDeletion
          ? {
              status: "completed",
              lastErrorCode: null,
              completedAt: new Date(),
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(accountDeletionRequest.userId, userId));
  });
}

export async function isLiveKitProvisioningLeaseExpired(
  userId: string,
  roomIdentity: ProcessedLiveKitDeletionRoom
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [request] = await tx
      .select({ livekitRooms: accountDeletionRequest.livekitRooms })
      .from(accountDeletionRequest)
      .where(eq(accountDeletionRequest.userId, userId))
      .limit(1)
      .for("update");
    if (!request) throw new Error("Account deletion tombstone is missing");
    const room = normalizeLiveKitDeletionRooms(request.livekitRooms).find(
      (candidate) =>
        candidate.fingerprint === roomIdentity.fingerprint &&
        candidate.generation === roomIdentity.generation
    );
    if (!room || room.roomName === null || !room.provisioning) return false;
    if (room.provisioningExpiresAt === null) return false;
    const clockRows = await tx.execute(
      sql<{ now: Date | string }>`select clock_timestamp() as now`
    );
    const clockValue: unknown = clockRows[0]?.now;
    if (!(clockValue instanceof Date) && typeof clockValue !== "string") {
      throw new Error("Database clock is unavailable");
    }
    const databaseNow = new Date(clockValue).getTime();
    const provisioningExpiry = Date.parse(room.provisioningExpiresAt);
    if (!Number.isFinite(databaseNow) || !Number.isFinite(provisioningExpiry)) {
      throw new Error("Database clock comparison is unavailable");
    }
    return databaseNow >= provisioningExpiry;
  });
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
  await db.transaction(async (tx) => {
    const [request] = await tx
      .select()
      .from(accountDeletionRequest)
      .where(eq(accountDeletionRequest.userId, userId))
      .limit(1)
      .for("update");
    if (!request) throw new Error("Account deletion tombstone is missing");
    const clockRows = await tx.execute(
      sql<{ now: Date | string }>`select clock_timestamp() as now`
    );
    const clockValue: unknown = clockRows[0]?.now;
    if (!(clockValue instanceof Date) && typeof clockValue !== "string") {
      throw new Error("Database clock is unavailable");
    }
    const databaseNow = new Date(clockValue);
    const provisioningExpiresAt = new Date(
      databaseNow.getTime() + LIVEKIT_DELETION_PROVISIONING_LEASE_MS
    ).toISOString();
    const livekitRooms = normalizeLiveKitDeletionRooms(
      request.livekitRooms
    ).map((room) =>
      room.provisioning && room.provisioningExpiresAt === null
        ? { ...room, provisioningExpiresAt }
        : room
    );
    await tx
      .update(accountDeletionRequest)
      .set({
        status: "processing",
        attempts: sql`${accountDeletionRequest.attempts} + 1`,
        lastErrorCode: null,
        livekitRooms,
        updatedAt: databaseNow,
      })
      .where(eq(accountDeletionRequest.userId, userId));
  });
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
  processedFingerprints: string[],
  processedLiveKitRooms: ProcessedLiveKitDeletionRoom[] = []
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
    const processedLiveKit = new Set(
      processedLiveKitRooms.map(
        ({ fingerprint, generation }) => `${fingerprint}:${generation}`
      )
    );
    const livekitRooms = normalizeLiveKitDeletionRooms(
      request.livekitRooms
    ).map((room) =>
      processedLiveKit.has(`${room.fingerprint}:${room.generation}`)
        ? { ...room, roomName: null }
        : room
    );
    const hasUnprocessedRooms = livekitRooms.some(
      ({ roomName }) => roomName !== null
    );
    await tx
      .update(accountDeletionRequest)
      .set({
        status:
          hasUnprocessedSubjects || hasUnprocessedRooms
            ? "failed"
            : "completed",
        lastErrorCode: hasUnprocessedSubjects
          ? "stripe_late_reconciliation_failed"
          : hasUnprocessedRooms
            ? "livekit_provider_error"
            : null,
        completedAt:
          hasUnprocessedSubjects || hasUnprocessedRooms
            ? request.completedAt
            : now,
        stripeSubjects,
        livekitRooms,
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

export async function findStripeDeletionTombstoneFingerprint(
  fingerprints: string[]
): Promise<string | null> {
  for (const fingerprint of new Set(fingerprints)) {
    if (await hasStripeDeletionTombstone(fingerprint)) return fingerprint;
  }
  return null;
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
      subjectFingerprints: stripeEventLog.subjectFingerprints,
    })
    .from(stripeEventLog)
    .where(ne(stripeEventLog.payload, "{}"));

  for (const row of rows) {
    const fingerprintMatch =
      (row.subjectFingerprint && fingerprints.has(row.subjectFingerprint)) ||
      row.subjectFingerprints.some((fingerprint) =>
        fingerprints.has(fingerprint)
      );
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
          eq(accountDeletionRequest.status, "completed"),
          sql`EXISTS (
            SELECT 1
            FROM jsonb_array_elements(${accountDeletionRequest.livekitRooms}) room
            WHERE room->>'roomName' IS NOT NULL
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
    // Match the billing settlement lock order: user -> sessions ->
    // reservations. Account deletion is allowed to erase the audit rows, but
    // it must not deadlock a concurrent settlement while doing so.
    const users = await tx
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1)
      .for("update");
    if (!users[0]) return;

    const sessions = await tx
      .select({ id: interviewSession.id })
      .from(interviewSession)
      .where(eq(interviewSession.userId, userId))
      .orderBy(asc(interviewSession.id))
      .for("update");

    // Version-1 reservations reference their interview session with NO ACTION
    // so audit evidence cannot disappear through ordinary session deletion.
    // Account erasure is the authorized exception and removes the user's
    // reservations after acquiring the same parent locks as settlement and
    // before deleting the referenced sessions.
    await tx
      .delete(creditReservation)
      .where(eq(creditReservation.userId, userId));

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
    livekitRooms: normalizeLiveKitDeletionRooms(record.livekitRooms),
    attempts: record.attempts,
  };
}

export function buildLiveKitDeletionRooms(
  roomNames: Array<string | null | undefined>,
  {
    provisioning = false,
    provisioningExpiresAt = null,
  }: { provisioning?: boolean; provisioningExpiresAt?: string | null } = {}
): LiveKitDeletionRoom[] {
  return [...new Set(roomNames.filter((name): name is string => !!name))]
    .sort()
    .map((roomName) => ({
      roomName,
      fingerprint: createHash("sha256").update(roomName).digest("hex"),
      generation: 1,
      provisioning,
      provisioningExpiresAt: provisioning ? provisioningExpiresAt : null,
    }));
}

export function normalizeLiveKitDeletionRooms(
  value: unknown
): LiveKitDeletionRoom[] {
  if (!Array.isArray(value)) throw invalidLiveKitDeletionRooms();
  const rooms = new Map<string, LiveKitDeletionRoom>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") {
      throw invalidLiveKitDeletionRooms();
    }
    const {
      roomName,
      fingerprint,
      generation = 1,
      provisioning = false,
      provisioningExpiresAt = null,
    } = candidate as Record<string, unknown>;
    const normalizedProvisioningExpiresAt = normalizeLiveKitProvisioningExpiry(
      provisioningExpiresAt
    );
    if (
      (roomName !== null && typeof roomName !== "string") ||
      typeof fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/.test(fingerprint) ||
      !Number.isSafeInteger(generation) ||
      (generation as number) < 1 ||
      typeof provisioning !== "boolean" ||
      (typeof roomName === "string" &&
        createHash("sha256").update(roomName).digest("hex") !== fingerprint)
    ) {
      throw invalidLiveKitDeletionRooms();
    }
    const room = {
      roomName,
      fingerprint,
      generation: generation as number,
      provisioning,
      provisioningExpiresAt: provisioning
        ? normalizedProvisioningExpiresAt
        : null,
    };
    const existing = rooms.get(room.fingerprint);
    rooms.set(
      room.fingerprint,
      existing ? mergeNormalizedLiveKitDeletionRoom(existing, room) : room
    );
  }
  return [...rooms.values()].sort((left, right) =>
    left.fingerprint.localeCompare(right.fingerprint)
  );
}

function mergeStripeDeletionSubjects(
  existingValue: unknown,
  incoming: StripeDeletionSubject[]
): StripeDeletionSubject[] {
  const subjects = new Map(
    normalizeStripeDeletionSubjects(existingValue).map((subject) => [
      subject.fingerprint,
      subject,
    ])
  );
  for (const subject of incoming) {
    const existing = subjects.get(subject.fingerprint);
    subjects.set(subject.fingerprint, {
      kind: existing?.kind ?? subject.kind,
      fingerprint: subject.fingerprint,
      providerId: existing ? existing.providerId : subject.providerId,
    });
  }
  return [...subjects.values()].sort((left, right) =>
    left.fingerprint.localeCompare(right.fingerprint)
  );
}

function mergeLiveKitDeletionRooms(
  existingValue: unknown,
  incoming: LiveKitDeletionRoom[]
): LiveKitDeletionRoom[] {
  return normalizeLiveKitDeletionRooms([
    ...normalizeLiveKitDeletionRooms(existingValue),
    ...normalizeLiveKitDeletionRooms(incoming),
  ]);
}

function mergeNormalizedLiveKitDeletionRoom(
  left: LiveKitDeletionRoom,
  right: LiveKitDeletionRoom
): LiveKitDeletionRoom {
  if (left.fingerprint !== right.fingerprint) {
    throw invalidLiveKitDeletionRooms();
  }
  if (
    left.roomName !== null &&
    right.roomName !== null &&
    left.roomName !== right.roomName
  ) {
    throw invalidLiveKitDeletionRooms();
  }

  // A newer post-create fence supersedes the uncertainty state of an older
  // generation. Duplicate snapshots within that winning generation are
  // unioned conservatively and can only extend its provisioning lease.
  const generation = Math.max(left.generation, right.generation);
  const winners = [left, right].filter(
    (room) => room.generation === generation
  );
  const provisioning = winners.some((room) => room.provisioning);
  const provisioningExpiresAt = provisioning
    ? winners.reduce<string | null>(
        (expiry, room) =>
          laterLiveKitProvisioningExpiry(
            expiry,
            room.provisioning ? room.provisioningExpiresAt : null
          ),
        null
      )
    : null;

  return {
    roomName: left.roomName ?? right.roomName,
    fingerprint: left.fingerprint,
    generation,
    provisioning,
    provisioningExpiresAt,
  };
}

function laterLiveKitProvisioningExpiry(
  left: string | null,
  right: string | null
): string | null {
  if (left === null) return normalizeLiveKitProvisioningExpiry(right);
  if (right === null) return normalizeLiveKitProvisioningExpiry(left);
  const leftEpoch = Date.parse(left);
  const rightEpoch = Date.parse(right);
  if (!Number.isFinite(leftEpoch) || !Number.isFinite(rightEpoch)) {
    throw invalidLiveKitDeletionRooms();
  }
  return new Date(Math.max(leftEpoch, rightEpoch)).toISOString();
}

function normalizeLiveKitProvisioningExpiry(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw invalidLiveKitDeletionRooms();
  const epoch = parseExplicitLiveKitProvisioningExpiry(value);
  const canonical = new Date(epoch).toISOString();
  const canonicalMatch = LIVEKIT_PROVISIONING_EXPIRY_PATTERN.exec(canonical);
  if (!canonicalMatch || canonicalMatch[1] === "0000") {
    throw invalidLiveKitDeletionRooms();
  }
  return canonical;
}

const LIVEKIT_PROVISIONING_EXPIRY_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/;

function parseExplicitLiveKitProvisioningExpiry(value: string): number {
  const match = LIVEKIT_PROVISIONING_EXPIRY_PATTERN.exec(value);
  if (!match) throw invalidLiveKitDeletionRooms();
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const fractionText = match[7] ?? "";
  const zone = match[8]!;
  const offsetSign = match[9];
  const offsetHourText = match[10];
  const offsetMinuteText = match[11];
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fractionText.padEnd(3, "0"));
  const offsetHours = zone === "Z" ? 0 : Number(offsetHourText);
  const offsetMinutes = zone === "Z" ? 0 : Number(offsetMinuteText);
  if (
    zone === "-00:00" ||
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHours > 23 ||
    offsetMinutes > 59
  ) {
    throw invalidLiveKitDeletionRooms();
  }

  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, millisecond);
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute ||
    local.getUTCSeconds() !== second
  ) {
    throw invalidLiveKitDeletionRooms();
  }

  const signedOffsetMinutes =
    zone === "Z"
      ? 0
      : (offsetSign === "+" ? 1 : -1) * (offsetHours * 60 + offsetMinutes);
  const epoch = local.getTime() - signedOffsetMinutes * 60_000;
  if (!Number.isFinite(epoch)) throw invalidLiveKitDeletionRooms();
  return epoch;
}

function invalidLiveKitDeletionRooms(): Error & { code: string } {
  return Object.assign(new Error("Account deletion rooms are invalid"), {
    code: "account_deletion_rooms_invalid",
  });
}

import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import {
  projectLegacyInterviewSessionStatus,
  type InterviewLifecycleState,
} from "@meelni/core";

import { db } from "./index";
import { interviewSession } from "./schema";

export interface InterviewReconnectSession {
  sessionId: string;
  userId: string;
  roomName: string;
  state: InterviewLifecycleState;
  version: number;
  terminalReason: string | null;
  config: unknown;
  startedAt: Date | null;
  activatedAt: Date | null;
  runtimeReadyAt: Date | null;
  lastTransitionAt: Date;
  reconnectDeadlineAt: Date | null;
  reconnectDeadlineOwner: "reconnect_grace" | "hard_deadline" | null;
  roomCleanupPending: boolean;
  roomCleanupAttemptedAt: Date | null;
  roomProvisioningPending: boolean;
  roomProvisioningStartedAt: Date | null;
  presenceReconciledAt: Date | null;
  lastTransportEventAt: Date | null;
  lastTransportEventId: string | null;
  lastTransportEventName: string | null;
}

export type InterviewTransportEventName =
  | "participant_joined"
  | "participant_left"
  | "participant_connection_aborted";

export interface InterviewTransportEventCursor {
  occurredAt: Date;
  eventId: string;
  eventName: InterviewTransportEventName;
}

export interface ApplyInterviewTransportTransitionInput {
  sessionId: string;
  expectedState: "connecting" | "active" | "reconnecting";
  expectedVersion: number;
  nextState: "active" | "reconnecting";
  reconnectDeadlineAt: Date | null;
  reconnectDeadlineOwner: "reconnect_grace" | "hard_deadline" | null;
  transportEventAt: Date;
  transportEventId: string;
  transportEventName: InterviewTransportEventName;
  recordTransportEvent: boolean;
  runtimeReadyAt?: Date;
  transitionedAt: Date;
}

export type ApplyInterviewTransportTransitionResult =
  | { applied: true; current: InterviewReconnectSession }
  | {
      applied: false;
      reason: "conflict" | "not_found";
      current: InterviewReconnectSession | null;
    };

export interface InterviewReconnectStore {
  getDatabaseTime(): Promise<Date>;
  getByRoom(roomName: string): Promise<InterviewReconnectSession | null>;
  getById(sessionId: string): Promise<InterviewReconnectSession | null>;
  applyTransportTransition(
    input: ApplyInterviewTransportTransitionInput
  ): Promise<ApplyInterviewTransportTransitionResult>;
  recordTransportObservation(input: {
    sessionId: string;
    expectedState: InterviewLifecycleState;
    expectedVersion: number;
    transportEventAt: Date;
    transportEventId: string;
    transportEventName: InterviewTransportEventName;
  }): Promise<ApplyInterviewTransportTransitionResult>;
  recordRuntimeReady(input: {
    sessionId: string;
    expectedState: "connecting";
    expectedVersion: number;
    runtimeReadyAt: Date;
  }): Promise<ApplyInterviewTransportTransitionResult>;
  markRoomCleanupComplete(input: { sessionId: string }): Promise<void>;
  markRoomCleanupAttempted(input: {
    sessionId: string;
    attemptedAt: Date;
  }): Promise<void>;
  completeRoomProvisioning(input: {
    sessionId: string;
    expectedVersion: number;
  }): Promise<ApplyInterviewTransportTransitionResult>;
  markRoomProvisioningSettled(input: { sessionId: string }): Promise<void>;
  claimStaleProvisioning(input: {
    sessionId: string;
    expectedVersion: number;
    provisioningStartedAt: Date;
    transitionedAt: Date;
  }): Promise<ApplyInterviewTransportTransitionResult>;
  markPresenceReconciled(input: {
    sessionId: string;
    expectedVersion: number;
    checkedAt: Date;
  }): Promise<ApplyInterviewTransportTransitionResult>;
  recoverFromPresence(input: {
    sessionId: string;
    expectedVersion: number;
    deadlineAt: Date;
    joinedAt: Date;
    transitionedAt: Date;
  }): Promise<ApplyInterviewTransportTransitionResult>;
  claimTimeout(input: {
    sessionId: string;
    expectedVersion: number;
    deadlineAt: Date;
    terminalReason: "disconnect_timeout" | "insufficient_signal";
    transitionedAt: Date;
  }): Promise<ApplyInterviewTransportTransitionResult>;
  refineTimeoutClaim(input: {
    sessionId: string;
    expectedVersion: number;
    deadlineAt: Date;
    expectedTerminalReason: "disconnect_timeout";
    terminalReason: "insufficient_signal";
  }): Promise<ApplyInterviewTransportTransitionResult>;
}

export type InterviewReconnectDatabase = Pick<
  typeof db,
  "execute" | "select" | "update"
>;

export const INTERVIEW_ROOM_PROVISIONING_LEASE_MS = 5 * 60 * 1_000;

export function createDrizzleInterviewReconnectStore(
  database: InterviewReconnectDatabase = db
): InterviewReconnectStore {
  const getByCondition = async (
    condition: ReturnType<typeof eq>
  ): Promise<InterviewReconnectSession | null> => {
    const rows = await database
      .select()
      .from(interviewSession)
      .where(condition)
      .limit(1);
    return rows[0] ? mapReconnectSession(rows[0]) : null;
  };

  const store: InterviewReconnectStore = {
    async getDatabaseTime() {
      const rows = (await database.execute(
        sql`SELECT clock_timestamp() AS observed_at`
      )) as unknown as Array<{ observed_at: Date | string }>;
      const observedAt = rows[0]?.observed_at;
      const value =
        observedAt instanceof Date ? observedAt : new Date(String(observedAt));
      if (!Number.isFinite(value.getTime())) {
        throw new Error("Database clock returned an invalid timestamp");
      }
      return value;
    },
    getByRoom: (roomName) =>
      getByCondition(eq(interviewSession.livekitRoomName, roomName)),
    getById: (sessionId) => getByCondition(eq(interviewSession.id, sessionId)),
    async applyTransportTransition(input) {
      const rows = await database
        .update(interviewSession)
        .set({
          lifecycleState: input.nextState,
          lifecycleVersion: sql`${interviewSession.lifecycleVersion} + 1`,
          terminalReason: null,
          status: projectLegacyInterviewSessionStatus({
            state: input.nextState,
          }),
          lastTransitionAt: input.transitionedAt,
          reconnectDeadlineAt: input.reconnectDeadlineAt,
          reconnectDeadlineOwner: input.reconnectDeadlineOwner,
          ...(input.recordTransportEvent
            ? {
                lastTransportEventAt: input.transportEventAt,
                lastTransportEventId: input.transportEventId,
                lastTransportEventName: input.transportEventName,
              }
            : {}),
          ...(input.runtimeReadyAt
            ? {
                runtimeReadyAt: sql`COALESCE(${interviewSession.runtimeReadyAt}, ${input.runtimeReadyAt.toISOString()}::timestamptz)`,
              }
            : {}),
          ...(input.nextState === "active"
            ? {
                activatedAt: sql`COALESCE(${interviewSession.activatedAt}, ${input.transitionedAt.toISOString()}::timestamptz)`,
              }
            : {}),
        })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.lifecycleState, input.expectedState),
            eq(interviewSession.lifecycleVersion, input.expectedVersion),
            ...(input.recordTransportEvent
              ? [
                  transportEventIsNewerThanStored({
                    occurredAt: input.transportEventAt,
                    eventId: input.transportEventId,
                    eventName: input.transportEventName,
                  }),
                ]
              : []),
            ...(input.expectedState === "reconnecting" &&
            input.nextState === "active"
              ? [
                  isNotNull(interviewSession.reconnectDeadlineAt),
                  sql`${input.transportEventAt.toISOString()}::timestamptz < ${interviewSession.reconnectDeadlineAt}`,
                  sql`clock_timestamp() < ${interviewSession.reconnectDeadlineAt}`,
                ]
              : [])
          )
        )
        .returning();

      if (rows[0]) {
        return { applied: true, current: mapReconnectSession(rows[0]) };
      }

      const current = await store.getById(input.sessionId);
      return {
        applied: false,
        reason: current ? "conflict" : "not_found",
        current,
      };
    },
    async recordTransportObservation(input) {
      const rows = await database
        .update(interviewSession)
        .set({
          lastTransportEventAt: input.transportEventAt,
          lastTransportEventId: input.transportEventId,
          lastTransportEventName: input.transportEventName,
        })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.lifecycleState, input.expectedState),
            eq(interviewSession.lifecycleVersion, input.expectedVersion),
            transportEventIsNewerThanStored({
              occurredAt: input.transportEventAt,
              eventId: input.transportEventId,
              eventName: input.transportEventName,
            })
          )
        )
        .returning();

      if (rows[0]) {
        return { applied: true, current: mapReconnectSession(rows[0]) };
      }
      const current = await store.getById(input.sessionId);
      return {
        applied: false,
        reason: current ? "conflict" : "not_found",
        current,
      };
    },
    async recordRuntimeReady(input) {
      const rows = await database
        .update(interviewSession)
        .set({
          runtimeReadyAt: sql`COALESCE(${interviewSession.runtimeReadyAt}, ${input.runtimeReadyAt.toISOString()}::timestamptz)`,
        })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.lifecycleState, input.expectedState),
            eq(interviewSession.lifecycleVersion, input.expectedVersion)
          )
        )
        .returning();

      if (rows[0]) {
        return { applied: true, current: mapReconnectSession(rows[0]) };
      }
      const current = await store.getById(input.sessionId);
      return {
        applied: false,
        reason: current ? "conflict" : "not_found",
        current,
      };
    },
    async markRoomCleanupComplete(input) {
      await database
        .update(interviewSession)
        .set({
          reconnectDeadlineAt: null,
          reconnectDeadlineOwner: null,
          roomCleanupPending: false,
        })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.roomCleanupPending, true)
          )
        );
    },
    async markRoomCleanupAttempted(input) {
      await database
        .update(interviewSession)
        .set({ roomCleanupAttemptedAt: input.attemptedAt })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            or(
              eq(interviewSession.roomCleanupPending, true),
              eq(interviewSession.roomProvisioningPending, true)
            )
          )
        );
    },
    async completeRoomProvisioning(input) {
      const rows = await database
        .update(interviewSession)
        .set({
          roomCleanupPending: false,
          roomProvisioningPending: false,
          roomProvisioningStartedAt: null,
        })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.lifecycleState, "connecting"),
            eq(interviewSession.lifecycleVersion, input.expectedVersion),
            eq(interviewSession.roomProvisioningPending, true)
          )
        )
        .returning();

      if (rows[0]) {
        return { applied: true, current: mapReconnectSession(rows[0]) };
      }
      const current = await store.getById(input.sessionId);
      return {
        applied: false,
        reason: current ? "conflict" : "not_found",
        current,
      };
    },
    async markRoomProvisioningSettled(input) {
      await database
        .update(interviewSession)
        .set({
          roomProvisioningPending: false,
          roomProvisioningStartedAt: null,
        })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.roomProvisioningPending, true)
          )
        );
    },
    async claimStaleProvisioning(input) {
      const rows = await database
        .update(interviewSession)
        .set({
          lifecycleState: "failed",
          lifecycleVersion: sql`${interviewSession.lifecycleVersion} + 1`,
          terminalReason: "provider_failure",
          status: projectLegacyInterviewSessionStatus({
            state: "failed",
            terminalReason: "provider_failure",
          }),
          endingAt: sql`COALESCE(${interviewSession.endingAt}, ${input.transitionedAt.toISOString()}::timestamptz)`,
          endedAt: sql`COALESCE(${interviewSession.endedAt}, ${input.transitionedAt.toISOString()}::timestamptz)`,
          lastTransitionAt: input.transitionedAt,
          roomCleanupPending: true,
        })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.lifecycleState, "connecting"),
            eq(interviewSession.lifecycleVersion, input.expectedVersion),
            eq(interviewSession.roomProvisioningPending, true),
            eq(
              interviewSession.roomProvisioningStartedAt,
              input.provisioningStartedAt
            ),
            sql`${interviewSession.roomProvisioningStartedAt} <= clock_timestamp() - (${INTERVIEW_ROOM_PROVISIONING_LEASE_MS} * interval '1 millisecond')`
          )
        )
        .returning();

      if (rows[0]) {
        return { applied: true, current: mapReconnectSession(rows[0]) };
      }
      const current = await store.getById(input.sessionId);
      return {
        applied: false,
        reason: current ? "conflict" : "not_found",
        current,
      };
    },
    async markPresenceReconciled(input) {
      const rows = await database
        .update(interviewSession)
        .set({ presenceReconciledAt: input.checkedAt })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.lifecycleVersion, input.expectedVersion)
          )
        )
        .returning();

      if (rows[0]) {
        return { applied: true, current: mapReconnectSession(rows[0]) };
      }
      const current = await store.getById(input.sessionId);
      return {
        applied: false,
        reason: current ? "conflict" : "not_found",
        current,
      };
    },
    async recoverFromPresence(input) {
      if (
        !Number.isFinite(input.joinedAt.getTime()) ||
        input.joinedAt.getTime() >= input.deadlineAt.getTime()
      ) {
        const current = await store.getById(input.sessionId);
        return {
          applied: false,
          reason: current ? "conflict" : "not_found",
          current,
        };
      }
      const rows = await database
        .update(interviewSession)
        .set({
          lifecycleState: "active",
          lifecycleVersion: sql`${interviewSession.lifecycleVersion} + 1`,
          terminalReason: null,
          status: projectLegacyInterviewSessionStatus({ state: "active" }),
          lastTransitionAt: input.transitionedAt,
          reconnectDeadlineAt: null,
          reconnectDeadlineOwner: null,
          presenceReconciledAt: input.transitionedAt,
        })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.lifecycleState, "reconnecting"),
            eq(interviewSession.lifecycleVersion, input.expectedVersion),
            eq(interviewSession.reconnectDeadlineAt, input.deadlineAt),
            sql`${input.joinedAt.toISOString()}::timestamptz < ${interviewSession.reconnectDeadlineAt}`,
            sql`clock_timestamp() < ${interviewSession.reconnectDeadlineAt}`
          )
        )
        .returning();

      if (rows[0]) {
        return { applied: true, current: mapReconnectSession(rows[0]) };
      }
      const current = await store.getById(input.sessionId);
      return {
        applied: false,
        reason: current ? "conflict" : "not_found",
        current,
      };
    },
    async claimTimeout(input) {
      const rows = await database
        .update(interviewSession)
        .set({
          lifecycleState: "ending",
          lifecycleVersion: sql`${interviewSession.lifecycleVersion} + 1`,
          terminalReason: input.terminalReason,
          status: projectLegacyInterviewSessionStatus({
            state: "ending",
            terminalReason: input.terminalReason,
          }),
          endingAt: sql`COALESCE(${interviewSession.endingAt}, ${input.transitionedAt.toISOString()}::timestamptz)`,
          lastTransitionAt: input.transitionedAt,
          roomCleanupPending: true,
        })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.lifecycleState, "reconnecting"),
            eq(interviewSession.lifecycleVersion, input.expectedVersion),
            eq(interviewSession.reconnectDeadlineAt, input.deadlineAt),
            eq(interviewSession.reconnectDeadlineOwner, "reconnect_grace"),
            sql`${interviewSession.reconnectDeadlineAt} <= clock_timestamp()`
          )
        )
        .returning();

      if (rows[0]) {
        return { applied: true, current: mapReconnectSession(rows[0]) };
      }
      const current = await store.getById(input.sessionId);
      return {
        applied: false,
        reason: current ? "conflict" : "not_found",
        current,
      };
    },
    async refineTimeoutClaim(input) {
      const rows = await database
        .update(interviewSession)
        .set({
          terminalReason: input.terminalReason,
          status: projectLegacyInterviewSessionStatus({
            state: "ending",
            terminalReason: input.terminalReason,
          }),
        })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.lifecycleState, "ending"),
            eq(interviewSession.lifecycleVersion, input.expectedVersion),
            eq(interviewSession.reconnectDeadlineAt, input.deadlineAt),
            eq(interviewSession.reconnectDeadlineOwner, "reconnect_grace"),
            eq(interviewSession.terminalReason, input.expectedTerminalReason)
          )
        )
        .returning();

      if (rows[0]) {
        return { applied: true, current: mapReconnectSession(rows[0]) };
      }
      const current = await store.getById(input.sessionId);
      return {
        applied: false,
        reason: current ? "conflict" : "not_found",
        current,
      };
    },
  };

  return store;
}

export function compareInterviewTransportEvents(
  candidate: InterviewTransportEventCursor,
  current: {
    occurredAt: Date | null;
    eventId: string | null;
    eventName: string | null;
  }
): number {
  if (!current.occurredAt) return 1;

  const timeDifference =
    candidate.occurredAt.getTime() - current.occurredAt.getTime();
  if (timeDifference !== 0) return timeDifference;

  const precedenceDifference =
    transportEventPrecedence(candidate.eventName) -
    transportEventPrecedence(current.eventName);
  if (precedenceDifference !== 0) return precedenceDifference;

  return compareUtf8Bytes(candidate.eventId, current.eventId ?? "");
}

/**
 * PostgreSQL's C collation orders UTF-8 text by encoded bytes. Mirror that
 * order here so workflow preflight and the database CAS choose the same event.
 */
export function compareUtf8Bytes(left: string, right: string): number {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const sharedLength = Math.min(leftBytes.length, rightBytes.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftBytes[index]! - rightBytes[index]!;
    if (difference !== 0) return difference;
  }

  return leftBytes.length - rightBytes.length;
}

function transportEventPrecedence(eventName: string | null): number {
  switch (eventName) {
    case "participant_joined":
      return 3;
    case "participant_connection_aborted":
      return 2;
    case "participant_left":
      return 1;
    default:
      return 0;
  }
}

function transportEventIsNewerThanStored(
  candidate: InterviewTransportEventCursor
) {
  const candidateOccurredAt = sql`${candidate.occurredAt.toISOString()}::timestamptz`;
  const storedPrecedence = sql<number>`CASE ${interviewSession.lastTransportEventName}
    WHEN 'participant_joined' THEN 3
    WHEN 'participant_connection_aborted' THEN 2
    WHEN 'participant_left' THEN 1
    ELSE 0
  END`;
  const candidatePrecedence = transportEventPrecedence(candidate.eventName);

  return sql`(
    ${interviewSession.lastTransportEventAt} IS NULL
    OR ${interviewSession.lastTransportEventAt} < ${candidateOccurredAt}
    OR (
      ${interviewSession.lastTransportEventAt} = ${candidateOccurredAt}
      AND (
        ${storedPrecedence} < ${candidatePrecedence}
        OR (
          ${storedPrecedence} = ${candidatePrecedence}
          AND COALESCE(${interviewSession.lastTransportEventId}, '') COLLATE "C"
            < (${candidate.eventId}::text COLLATE "C")
        )
      )
    )
  )`;
}

export async function listInterviewReconnectSchedules(limit = 250): Promise<
  Array<{
    sessionId: string;
    expectedVersion: number;
    deadlineAt: string;
  }>
> {
  const rows = await db
    .select({
      sessionId: interviewSession.id,
      state: interviewSession.lifecycleState,
      expectedVersion: interviewSession.lifecycleVersion,
      deadlineAt: interviewSession.reconnectDeadlineAt,
    })
    .from(interviewSession)
    .where(
      and(
        inArray(interviewSession.lifecycleState, [
          "reconnecting",
          "ending",
          "completed",
          "abandoned",
          "failed",
        ]),
        isNotNull(interviewSession.reconnectDeadlineAt),
        eq(interviewSession.reconnectDeadlineOwner, "reconnect_grace")
      )
    )
    .orderBy(asc(interviewSession.reconnectDeadlineAt))
    .limit(limit);

  return rows
    .flatMap((row) =>
      row.deadlineAt
        ? [
            {
              sessionId: row.sessionId,
              expectedVersion:
                row.state === "ending"
                  ? Math.max(1, row.expectedVersion - 1)
                  : row.expectedVersion,
              deadlineAt: row.deadlineAt.toISOString(),
            },
          ]
        : []
    )
    .sort((left, right) => left.deadlineAt.localeCompare(right.deadlineAt));
}

function mapReconnectSession(
  row: typeof interviewSession.$inferSelect
): InterviewReconnectSession {
  if (!row.livekitRoomName) {
    throw new Error("Voice interview reconnect row is missing its room");
  }
  return {
    sessionId: row.id,
    userId: row.userId,
    roomName: row.livekitRoomName,
    state: row.lifecycleState,
    version: row.lifecycleVersion,
    terminalReason: row.terminalReason,
    config: row.config,
    startedAt: row.startedAt,
    activatedAt: row.activatedAt,
    runtimeReadyAt: row.runtimeReadyAt,
    lastTransitionAt: row.lastTransitionAt,
    reconnectDeadlineAt: row.reconnectDeadlineAt,
    reconnectDeadlineOwner: row.reconnectDeadlineOwner,
    roomCleanupPending: row.roomCleanupPending,
    roomCleanupAttemptedAt: row.roomCleanupAttemptedAt,
    roomProvisioningPending: row.roomProvisioningPending,
    roomProvisioningStartedAt: row.roomProvisioningStartedAt,
    presenceReconciledAt: row.presenceReconciledAt,
    lastTransportEventAt: row.lastTransportEventAt,
    lastTransportEventId: row.lastTransportEventId,
    lastTransportEventName: row.lastTransportEventName,
  };
}

export async function listInterviewPresenceReconciliationSessions(
  limit = 250
): Promise<Array<{ sessionId: string }>> {
  return db
    .select({ sessionId: interviewSession.id })
    .from(interviewSession)
    .where(
      and(
        inArray(interviewSession.lifecycleState, [
          "connecting",
          "active",
          "reconnecting",
        ]),
        isNotNull(interviewSession.livekitRoomName),
        isNotNull(interviewSession.startedAt)
      )
    )
    .orderBy(
      sql`${interviewSession.presenceReconciledAt} ASC NULLS FIRST`,
      asc(interviewSession.presenceReconciledAt),
      asc(interviewSession.lastTransitionAt),
      asc(interviewSession.id)
    )
    .limit(limit);
}

export async function listInterviewRoomCleanupSessions(
  limit = 250,
  database: Pick<typeof db, "select"> = db
): Promise<Array<{ sessionId: string }>> {
  return database
    .select({ sessionId: interviewSession.id })
    .from(interviewSession)
    .where(
      and(
        isNotNull(interviewSession.livekitRoomName),
        or(
          and(
            inArray(interviewSession.lifecycleState, [
              "completed",
              "abandoned",
              "failed",
            ]),
            or(
              eq(interviewSession.roomCleanupPending, true),
              eq(interviewSession.roomProvisioningPending, true)
            )
          ),
          and(
            eq(interviewSession.lifecycleState, "connecting"),
            eq(interviewSession.roomProvisioningPending, true),
            isNotNull(interviewSession.roomProvisioningStartedAt),
            sql`${interviewSession.roomProvisioningStartedAt} <= clock_timestamp() - (${INTERVIEW_ROOM_PROVISIONING_LEASE_MS} * interval '1 millisecond')`
          )
        )
      )
    )
    .orderBy(
      sql`${interviewSession.roomCleanupAttemptedAt} ASC NULLS FIRST`,
      asc(interviewSession.roomCleanupAttemptedAt),
      asc(interviewSession.roomProvisioningStartedAt),
      asc(interviewSession.lastTransitionAt),
      asc(interviewSession.id)
    )
    .limit(limit);
}

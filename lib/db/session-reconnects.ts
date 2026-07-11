import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
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
  startedAt: Date;
  activatedAt: Date | null;
  runtimeReadyAt: Date | null;
  lastTransitionAt: Date;
  reconnectDeadlineAt: Date | null;
  roomCleanupPending: boolean;
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

export type InterviewReconnectDatabase = Pick<typeof db, "select" | "update">;

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
          ...(input.recordTransportEvent
            ? {
                lastTransportEventAt: input.transportEventAt,
                lastTransportEventId: input.transportEventId,
                lastTransportEventName: input.transportEventName,
              }
            : {}),
          ...(input.runtimeReadyAt
            ? {
                runtimeReadyAt: sql`COALESCE(${interviewSession.runtimeReadyAt}, ${input.runtimeReadyAt})`,
              }
            : {}),
          ...(input.nextState === "active"
            ? {
                activatedAt: sql`COALESCE(${interviewSession.activatedAt}, ${input.transitionedAt})`,
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
          runtimeReadyAt: sql`COALESCE(${interviewSession.runtimeReadyAt}, ${input.runtimeReadyAt})`,
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
        .set({ reconnectDeadlineAt: null, roomCleanupPending: false })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.roomCleanupPending, true)
          )
        );
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
          endingAt: sql`COALESCE(${interviewSession.endingAt}, ${input.transitionedAt})`,
          lastTransitionAt: input.transitionedAt,
          roomCleanupPending: true,
        })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.lifecycleState, "reconnecting"),
            eq(interviewSession.lifecycleVersion, input.expectedVersion),
            eq(interviewSession.reconnectDeadlineAt, input.deadlineAt)
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
            eq(
              interviewSession.terminalReason,
              input.expectedTerminalReason
            )
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

  return candidate.eventId.localeCompare(current.eventId ?? "");
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
          AND COALESCE(${interviewSession.lastTransportEventId}, '') < ${candidate.eventId}
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
        isNotNull(interviewSession.reconnectDeadlineAt)
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
  if (!row.livekitRoomName || !row.startedAt) {
    throw new Error(
      "Voice interview reconnect row is missing room or start time"
    );
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
    roomCleanupPending: row.roomCleanupPending,
    lastTransportEventAt: row.lastTransportEventAt,
    lastTransportEventId: row.lastTransportEventId,
    lastTransportEventName: row.lastTransportEventName,
  };
}

export async function listInterviewRoomCleanupSessions(
  limit = 250
): Promise<Array<{ sessionId: string }>> {
  return db
    .select({ sessionId: interviewSession.id })
    .from(interviewSession)
    .where(
      and(
        inArray(interviewSession.lifecycleState, [
          "completed",
          "abandoned",
          "failed",
        ]),
        eq(interviewSession.roomCleanupPending, true),
        isNotNull(interviewSession.livekitRoomName)
      )
    )
    .orderBy(asc(interviewSession.lastTransitionAt))
    .limit(limit);
}

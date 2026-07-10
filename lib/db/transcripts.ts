import { db } from "./index";
import {
  interviewSession,
  transcriptInterruptionMarker,
  transcriptRuntimeSettlement,
  transcriptTurn,
} from "./schema";
import { and, asc, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type {
  TranscriptEvent,
  TranscriptInterruptionMarker,
  TranscriptRuntimeSettlement,
} from "@meelni/agent";
import {
  deriveInterviewDeadlineAt,
  isInterviewTerminalState,
  normalizeInterviewDurationMinutes,
} from "@meelni/core";
import {
  isTranscriptEventWithinSessionWindow,
  isTimestampWithinSessionWindow,
  type TranscriptIngestStore,
} from "@/lib/workflows/ingest-transcript-event";
import type { TranscriptInterruptionMarkerStore } from "@/lib/workflows/ingest-transcript-interruption-marker";
import type { TranscriptRuntimeSettlementStore } from "@/lib/workflows/ingest-transcript-runtime-settlement";

export interface CreateTranscriptTurnInput {
  sessionId: string;
  speaker: "user" | "interviewer";
  startedAt?: Date;
  endedAt?: Date;
  text?: string;
  audioMs?: number;
  latencyMs?: number;
  section?: string;
}

export interface UpdateTranscriptTurnInput {
  endedAt?: Date;
  text?: string;
  audioMs?: number;
  latencyMs?: number;
  section?: string;
}

export type PersistedTranscriptTurn = typeof transcriptTurn.$inferSelect;
export type TranscriptPersistenceDatabase = Pick<typeof db, "transaction">;
const MAX_CANONICAL_TURNS_PER_SESSION = 1_000;
const MAX_INTERRUPTION_MARKERS_PER_SESSION = 1_000;

export type PersistedTranscriptInterruptionMarker =
  typeof transcriptInterruptionMarker.$inferSelect;
export type PersistedTranscriptRuntimeSettlement =
  typeof transcriptRuntimeSettlement.$inferSelect;

export function createDrizzleTranscriptRuntimeSettlementStore(
  database: TranscriptPersistenceDatabase = db
): TranscriptRuntimeSettlementStore<PersistedTranscriptRuntimeSettlement> {
  return {
    async persist(settlement) {
      return database.transaction(async (tx) => {
        const sessions = await tx
          .select({
            roomName: interviewSession.livekitRoomName,
            lifecycleState: interviewSession.lifecycleState,
            startedAt: interviewSession.startedAt,
            config: interviewSession.config,
          })
          .from(interviewSession)
          .where(eq(interviewSession.id, settlement.session_id))
          .limit(1)
          .for("update");
        const session = sessions[0];
        if (!session) return { ok: false, reason: "not_found" } as const;
        if (session.roomName !== settlement.room_name) {
          return { ok: false, reason: "room_mismatch" } as const;
        }

        const existingRows = await tx
          .select()
          .from(transcriptRuntimeSettlement)
          .where(
            eq(transcriptRuntimeSettlement.sessionId, settlement.session_id)
          )
          .limit(1);
        if (existingRows[0]) {
          return storedSettlementMatches(existingRows[0], settlement)
            ? {
                ok: true,
                disposition: "existing",
                settlement: existingRows[0],
              }
            : { ok: false, reason: "settlement_conflict" };
        }
        if (isInterviewTerminalState(session.lifecycleState)) {
          return { ok: false, reason: "session_closed" } as const;
        }
        const sessionWindow = transcriptSessionWindow(session);
        if (
          !sessionWindow ||
          !isTimestampWithinSessionWindow(settlement.settled_at, sessionWindow)
        ) {
          return { ok: false, reason: "event_time_out_of_bounds" } as const;
        }

        const inserted = await tx
          .insert(transcriptRuntimeSettlement)
          .values({
            sessionId: settlement.session_id,
            contractVersion: settlement.contract_version,
            roomName: settlement.room_name,
            writerId: settlement.writer_id,
            state: settlement.state,
            settledAt: new Date(settlement.settled_at),
          })
          .onConflictDoNothing()
          .returning();
        if (inserted[0]) {
          return {
            ok: true,
            disposition: "created",
            settlement: inserted[0],
          } as const;
        }
        return { ok: false, reason: "settlement_conflict" } as const;
      });
    },
  };
}

export function createDrizzleTranscriptInterruptionMarkerStore(
  database: TranscriptPersistenceDatabase = db
): TranscriptInterruptionMarkerStore<PersistedTranscriptInterruptionMarker> {
  return {
    async persist(marker) {
      return database.transaction(async (tx) => {
        const sessions = await tx
          .select({
            roomName: interviewSession.livekitRoomName,
            lifecycleState: interviewSession.lifecycleState,
            startedAt: interviewSession.startedAt,
            config: interviewSession.config,
          })
          .from(interviewSession)
          .where(eq(interviewSession.id, marker.session_id))
          .limit(1)
          .for("update");
        const session = sessions[0];
        if (!session) return { ok: false, reason: "not_found" } as const;
        if (session.roomName !== marker.room_name) {
          return { ok: false, reason: "room_mismatch" } as const;
        }

        const existingRows = await tx
          .select()
          .from(transcriptInterruptionMarker)
          .where(eq(transcriptInterruptionMarker.eventId, marker.event_id))
          .limit(1);
        if (existingRows[0]) {
          return storedMarkerMatchesEvent(existingRows[0], marker)
            ? {
                ok: true,
                disposition: "existing",
                marker: existingRows[0],
              }
            : { ok: false, reason: "event_conflict" };
        }

        const settlementRows = await tx
          .select({ sessionId: transcriptRuntimeSettlement.sessionId })
          .from(transcriptRuntimeSettlement)
          .where(eq(transcriptRuntimeSettlement.sessionId, marker.session_id))
          .limit(1);
        if (settlementRows[0]) {
          return { ok: false, reason: "runtime_settled" } as const;
        }

        const sessionWindow = transcriptSessionWindow(session);
        if (
          !sessionWindow ||
          !isTimestampWithinSessionWindow(marker.occurred_at, sessionWindow)
        ) {
          return { ok: false, reason: "event_time_out_of_bounds" } as const;
        }

        if (
          session.lifecycleState === "ending" ||
          isInterviewTerminalState(session.lifecycleState)
        ) {
          return { ok: false, reason: "session_closed" } as const;
        }

        const counts = await tx
          .select({ value: sql<number>`count(*)::int` })
          .from(transcriptInterruptionMarker)
          .where(eq(transcriptInterruptionMarker.sessionId, marker.session_id));
        if ((counts[0]?.value ?? 0) >= MAX_INTERRUPTION_MARKERS_PER_SESSION) {
          return { ok: false, reason: "session_capacity_exceeded" } as const;
        }

        const inserted = await tx
          .insert(transcriptInterruptionMarker)
          .values({
            sessionId: marker.session_id,
            contractVersion: marker.contract_version,
            eventId: marker.event_id,
            writerId: marker.writer_id,
            sequence: marker.sequence,
            roomName: marker.room_name,
            speaker: marker.speaker,
            occurredAt: new Date(marker.occurred_at),
            reason: marker.reason,
          })
          .onConflictDoNothing()
          .returning();
        if (inserted[0]) {
          return {
            ok: true,
            disposition: "created",
            marker: inserted[0],
          } as const;
        }

        const eventRows = await tx
          .select()
          .from(transcriptInterruptionMarker)
          .where(eq(transcriptInterruptionMarker.eventId, marker.event_id))
          .limit(1);
        if (eventRows[0]) {
          return storedMarkerMatchesEvent(eventRows[0], marker)
            ? {
                ok: true,
                disposition: "existing",
                marker: eventRows[0],
              }
            : { ok: false, reason: "event_conflict" };
        }

        const sequenceRows = await tx
          .select({ id: transcriptInterruptionMarker.id })
          .from(transcriptInterruptionMarker)
          .where(
            and(
              eq(transcriptInterruptionMarker.sessionId, marker.session_id),
              eq(transcriptInterruptionMarker.writerId, marker.writer_id),
              eq(transcriptInterruptionMarker.sequence, marker.sequence)
            )
          )
          .limit(1);
        if (sequenceRows[0]) {
          return { ok: false, reason: "writer_sequence_conflict" } as const;
        }

        throw new Error(
          "Transcript interruption marker conflicted without a stored identity"
        );
      });
    },
  };
}

export function createDrizzleTranscriptIngestStore(
  database: TranscriptPersistenceDatabase = db
): TranscriptIngestStore<PersistedTranscriptTurn> {
  return {
    async persist({ principal, event }) {
      return database.transaction(async (tx) => {
        const ownershipPredicate =
          principal.kind === "authenticated_user"
            ? and(
                eq(interviewSession.id, event.session_id),
                eq(interviewSession.userId, principal.userId)
              )
            : eq(interviewSession.id, event.session_id);
        const sessions = await tx
          .select({
            roomName: interviewSession.livekitRoomName,
            lifecycleState: interviewSession.lifecycleState,
            startedAt: interviewSession.startedAt,
            config: interviewSession.config,
          })
          .from(interviewSession)
          .where(ownershipPredicate)
          .limit(1)
          .for("update");
        const session = sessions[0];
        if (!session) return { ok: false, reason: "not_found" } as const;
        if (session.roomName !== event.room_name) {
          return { ok: false, reason: "room_mismatch" } as const;
        }

        const existingEventRows = await tx
          .select()
          .from(transcriptTurn)
          .where(eq(transcriptTurn.eventId, event.event_id))
          .limit(1);
        if (existingEventRows[0]) {
          if (!storedTurnMatchesEvent(existingEventRows[0], event)) {
            return { ok: false, reason: "event_conflict" } as const;
          }
          return {
            ok: true,
            disposition: "existing",
            turn: existingEventRows[0],
          } as const;
        }

        const settlementRows = await tx
          .select({ sessionId: transcriptRuntimeSettlement.sessionId })
          .from(transcriptRuntimeSettlement)
          .where(eq(transcriptRuntimeSettlement.sessionId, event.session_id))
          .limit(1);
        if (settlementRows[0]) {
          return { ok: false, reason: "runtime_settled" } as const;
        }

        if (
          !session.startedAt ||
          !isTranscriptEventWithinSessionWindow(event, {
            startedAt: session.startedAt,
            deadlineAt: deriveInterviewDeadlineAt({
              startedAt: session.startedAt,
              durationMinutes: normalizeInterviewDurationMinutes(
                isRecord(session.config) ? session.config.duration : undefined
              ),
            }),
          })
        ) {
          return { ok: false, reason: "event_time_out_of_bounds" } as const;
        }

        if (
          session.lifecycleState === "ending" ||
          isInterviewTerminalState(session.lifecycleState)
        ) {
          return { ok: false, reason: "session_closed" } as const;
        }

        const counts = await tx
          .select({ value: sql<number>`count(*)::int` })
          .from(transcriptTurn)
          .where(eq(transcriptTurn.sessionId, event.session_id));
        if ((counts[0]?.value ?? 0) >= MAX_CANONICAL_TURNS_PER_SESSION) {
          return { ok: false, reason: "session_capacity_exceeded" } as const;
        }

        const [previousRows, nextRows] = await Promise.all([
          tx
            .select({ startedAt: transcriptTurn.startedAt })
            .from(transcriptTurn)
            .where(
              and(
                eq(transcriptTurn.sessionId, event.session_id),
                eq(transcriptTurn.writerId, event.writer_id),
                lt(transcriptTurn.sequence, event.sequence)
              )
            )
            .orderBy(desc(transcriptTurn.sequence))
            .limit(1),
          tx
            .select({ startedAt: transcriptTurn.startedAt })
            .from(transcriptTurn)
            .where(
              and(
                eq(transcriptTurn.sessionId, event.session_id),
                eq(transcriptTurn.writerId, event.writer_id),
                gt(transcriptTurn.sequence, event.sequence)
              )
            )
            .orderBy(asc(transcriptTurn.sequence))
            .limit(1),
        ]);
        const eventStartedAt = Date.parse(event.started_at);
        if (
          (previousRows[0]?.startedAt &&
            previousRows[0].startedAt.getTime() > eventStartedAt) ||
          (nextRows[0]?.startedAt &&
            nextRows[0].startedAt.getTime() < eventStartedAt)
        ) {
          return { ok: false, reason: "writer_order_conflict" } as const;
        }

        const values = transcriptEventValues(event);
        const inserted = await tx
          .insert(transcriptTurn)
          .values(values)
          .onConflictDoNothing()
          .returning();
        if (inserted[0]) {
          return {
            ok: true,
            disposition: "created",
            turn: inserted[0],
          } as const;
        }

        const eventRows = await tx
          .select()
          .from(transcriptTurn)
          .where(eq(transcriptTurn.eventId, event.event_id))
          .limit(1);
        if (eventRows[0]) {
          if (!storedTurnMatchesEvent(eventRows[0], event)) {
            return { ok: false, reason: "event_conflict" } as const;
          }
          return {
            ok: true,
            disposition: "existing",
            turn: eventRows[0],
          } as const;
        }

        const writerRows = await tx
          .select({ id: transcriptTurn.id })
          .from(transcriptTurn)
          .where(
            and(
              eq(transcriptTurn.sessionId, event.session_id),
              eq(transcriptTurn.writerId, event.writer_id),
              eq(transcriptTurn.sequence, event.sequence)
            )
          )
          .limit(1);
        if (writerRows[0]) {
          return { ok: false, reason: "writer_sequence_conflict" } as const;
        }

        throw new Error(
          "Transcript insert conflicted without a stored identity"
        );
      });
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function transcriptSessionWindow(session: {
  startedAt: Date | null;
  config: unknown;
}): { startedAt: Date; deadlineAt: Date } | null {
  if (!session.startedAt) return null;
  return {
    startedAt: session.startedAt,
    deadlineAt: deriveInterviewDeadlineAt({
      startedAt: session.startedAt,
      durationMinutes: normalizeInterviewDurationMinutes(
        isRecord(session.config) ? session.config.duration : undefined
      ),
    }),
  };
}

function transcriptEventValues(event: TranscriptEvent) {
  return {
    sessionId: event.session_id,
    contractVersion: event.contract_version,
    eventId: event.event_id,
    writerId: event.writer_id,
    sequence: event.sequence,
    roomName: event.room_name,
    speaker: event.speaker,
    startedAt: new Date(event.started_at),
    endedAt: new Date(event.ended_at),
    text: event.text,
    audioMs: event.audio_duration_ms,
    section: event.section,
    deliveryState: event.delivery_state,
  };
}

function storedTurnMatchesEvent(
  turn: PersistedTranscriptTurn,
  event: TranscriptEvent
): boolean {
  return (
    turn.contractVersion === event.contract_version &&
    turn.eventId === event.event_id &&
    turn.writerId === event.writer_id &&
    turn.sequence === event.sequence &&
    turn.sessionId === event.session_id &&
    turn.roomName === event.room_name &&
    turn.speaker === event.speaker &&
    turn.text === event.text &&
    turn.startedAt?.getTime() === Date.parse(event.started_at) &&
    turn.endedAt?.getTime() === Date.parse(event.ended_at) &&
    turn.audioMs === event.audio_duration_ms &&
    turn.section === event.section &&
    turn.deliveryState === event.delivery_state
  );
}

function storedMarkerMatchesEvent(
  stored: PersistedTranscriptInterruptionMarker,
  marker: TranscriptInterruptionMarker
): boolean {
  return (
    stored.contractVersion === marker.contract_version &&
    stored.eventId === marker.event_id &&
    stored.writerId === marker.writer_id &&
    stored.sequence === marker.sequence &&
    stored.sessionId === marker.session_id &&
    stored.roomName === marker.room_name &&
    stored.speaker === marker.speaker &&
    stored.occurredAt.getTime() === Date.parse(marker.occurred_at) &&
    stored.reason === marker.reason
  );
}

function storedSettlementMatches(
  stored: PersistedTranscriptRuntimeSettlement,
  settlement: TranscriptRuntimeSettlement
): boolean {
  return (
    stored.contractVersion === settlement.contract_version &&
    stored.sessionId === settlement.session_id &&
    stored.roomName === settlement.room_name &&
    stored.writerId === settlement.writer_id &&
    stored.state === settlement.state &&
    stored.settledAt.getTime() === Date.parse(settlement.settled_at)
  );
}

/**
 * Create a new transcript turn
 */
export async function createTranscriptTurn(input: CreateTranscriptTurnInput) {
  const [turn] = await db
    .insert(transcriptTurn)
    .values({
      sessionId: input.sessionId,
      speaker: input.speaker,
      startedAt: input.startedAt || new Date(),
      endedAt: input.endedAt,
      text: input.text,
      audioMs: input.audioMs,
      latencyMs: input.latencyMs,
      section: input.section,
    })
    .returning();

  return turn;
}

/**
 * Update a transcript turn
 */
export async function updateTranscriptTurn(
  turnId: string,
  input: UpdateTranscriptTurnInput
) {
  const [turn] = await db
    .update(transcriptTurn)
    .set(input)
    .where(and(eq(transcriptTurn.id, turnId), isNull(transcriptTurn.eventId)))
    .returning();

  return turn;
}

/**
 * Get all transcript turns for a session, ordered chronologically
 */
export async function getSessionTranscript(sessionId: string) {
  const turns = await db
    .select()
    .from(transcriptTurn)
    .where(eq(transcriptTurn.sessionId, sessionId))
    .orderBy(
      asc(transcriptTurn.startedAt),
      asc(transcriptTurn.writerId),
      asc(transcriptTurn.sequence),
      asc(transcriptTurn.eventId),
      asc(transcriptTurn.id)
    );

  return turns;
}

/**
 * Get a single transcript turn by ID
 */
export async function getTranscriptTurnById(turnId: string) {
  const [turn] = await db
    .select()
    .from(transcriptTurn)
    .where(eq(transcriptTurn.id, turnId))
    .limit(1);

  return turn;
}

/**
 * Delete a transcript turn (for cleanup/corrections)
 */
export async function deleteTranscriptTurn(turnId: string) {
  await db
    .delete(transcriptTurn)
    .where(and(eq(transcriptTurn.id, turnId), isNull(transcriptTurn.eventId)));
}

/**
 * Get transcript statistics for a session
 */
export async function getSessionTranscriptStats(sessionId: string) {
  const turns = await getSessionTranscript(sessionId);

  const stats = {
    totalTurns: turns.length,
    userTurns: turns.filter((t) => t.speaker === "user").length,
    interviewerTurns: turns.filter((t) => t.speaker === "interviewer").length,
    totalWords: turns.reduce(
      (sum, t) => sum + (t.text?.split(" ").length || 0),
      0
    ),
    userWords: turns
      .filter((t) => t.speaker === "user")
      .reduce((sum, t) => sum + (t.text?.split(" ").length || 0), 0),
    averageLatency:
      turns.filter((t) => t.latencyMs).length > 0
        ? turns.reduce((sum, t) => sum + (t.latencyMs || 0), 0) /
          turns.filter((t) => t.latencyMs).length
        : 0,
    totalDuration: turns.reduce((sum, t) => sum + (t.audioMs || 0), 0),
  };

  return stats;
}

/**
 * Batch create transcript turns (for efficient bulk inserts)
 */
export async function batchCreateTranscriptTurns(
  inputs: CreateTranscriptTurnInput[]
) {
  if (inputs.length === 0) return [];

  const turns = await db
    .insert(transcriptTurn)
    .values(
      inputs.map((input) => ({
        sessionId: input.sessionId,
        speaker: input.speaker,
        startedAt: input.startedAt || new Date(),
        endedAt: input.endedAt,
        text: input.text,
        audioMs: input.audioMs,
        latencyMs: input.latencyMs,
        section: input.section,
      }))
    )
    .returning();

  return turns;
}

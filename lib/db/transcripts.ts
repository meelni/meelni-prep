import { db } from "./index";
import { interviewSession, transcriptTurn } from "./schema";
import { and, asc, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { TranscriptEvent } from "@meelni/agent";
import { isInterviewTerminalState } from "@meelni/core";
import type { TranscriptIngestStore } from "@/lib/workflows/ingest-transcript-event";

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

export function createDrizzleTranscriptIngestStore(
  database: TranscriptPersistenceDatabase = db
): TranscriptIngestStore<PersistedTranscriptTurn> {
  return {
    async persist({ userId, event }) {
      return database.transaction(async (tx) => {
        const sessions = await tx
          .select({
            roomName: interviewSession.livekitRoomName,
            lifecycleState: interviewSession.lifecycleState,
          })
          .from(interviewSession)
          .where(
            and(
              eq(interviewSession.id, event.session_id),
              eq(interviewSession.userId, userId)
            )
          )
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

        if (isInterviewTerminalState(session.lifecycleState)) {
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

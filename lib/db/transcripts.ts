import { db } from "./index";
import {
  interviewSession,
  transcriptInterruptionMarker,
  transcriptRuntimeSettlement,
  transcriptRuntimeWriter,
  transcriptTurn,
} from "./schema";
import {
  hasImpossibleWriterTurnOrder,
  transcriptChronologicalOrder,
} from "./transcript-ordering";
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import type {
  TranscriptEvent,
  TranscriptInterruptionMarker,
  TranscriptRuntimeSettlement,
  TranscriptRuntimeWriterRegistration,
} from "@meelni/agent";
import {
  deriveInterviewDeadlineAt,
  isInterviewTerminalState,
  MAX_CANONICAL_EVENT_ID_LENGTH,
  normalizeInterviewDurationMinutes,
} from "@meelni/core";
import {
  isTranscriptEventWithinSessionWindow,
  isTimestampWithinSessionWindow,
  type TranscriptIngestStore,
} from "@/lib/workflows/ingest-transcript-event";
import type { TranscriptInterruptionMarkerStore } from "@/lib/workflows/ingest-transcript-interruption-marker";
import type { TranscriptRuntimeSettlementStore } from "@/lib/workflows/ingest-transcript-runtime-settlement";
import { convergeDrizzleInterviewCreditSettlement } from "./interview-credit-settlement";
import type { TranscriptRuntimeWriterStore } from "@/lib/workflows/ingest-transcript-runtime-writer";

export type PersistedTranscriptTurn = typeof transcriptTurn.$inferSelect;
export type TranscriptPersistenceDatabase = Pick<typeof db, "transaction">;
const MAX_CANONICAL_TURNS_PER_SESSION = 1_000;
const MAX_INTERRUPTION_MARKERS_PER_SESSION = 1_000;
const MAX_FEEDBACK_EVIDENCE_TEXT_LENGTH = 20_000;
export const TRANSCRIPT_PERSISTENCE_LOCK_TIMEOUT_MS = 2_000;
export const TRANSCRIPT_PERSISTENCE_STATEMENT_TIMEOUT_MS = 5_000;

export type PersistedTranscriptInterruptionMarker =
  typeof transcriptInterruptionMarker.$inferSelect;
export type PersistedTranscriptRuntimeSettlement =
  typeof transcriptRuntimeSettlement.$inferSelect;
export type PersistedTranscriptRuntimeWriter =
  typeof transcriptRuntimeWriter.$inferSelect;

export interface TranscriptRuntimeSettlementReadiness {
  writerCount: number;
  settledCount: number;
  degradedCount: number;
  missingCount: number;
  currentWriterGeneration: number | null;
  currentWriterState: "settled" | "degraded" | null;
  ready: boolean;
}

export async function getTranscriptRuntimeSettlementReadiness(
  sessionId: string,
  database: TranscriptPersistenceDatabase = db
): Promise<TranscriptRuntimeSettlementReadiness> {
  return database.transaction(async (tx) => {
    const rows = await tx
      .select({
        generation: transcriptRuntimeWriter.generation,
        settlementState: transcriptRuntimeSettlement.state,
      })
      .from(transcriptRuntimeWriter)
      .leftJoin(
        transcriptRuntimeSettlement,
        and(
          eq(
            transcriptRuntimeSettlement.sessionId,
            transcriptRuntimeWriter.sessionId
          ),
          eq(
            transcriptRuntimeSettlement.writerGeneration,
            transcriptRuntimeWriter.generation
          ),
          eq(
            transcriptRuntimeSettlement.writerId,
            transcriptRuntimeWriter.writerId
          )
        )
      )
      .where(eq(transcriptRuntimeWriter.sessionId, sessionId))
      .orderBy(asc(transcriptRuntimeWriter.generation));

    const settledCount = rows.filter(
      (row) => row.settlementState === "settled"
    ).length;
    const degradedCount = rows.filter(
      (row) => row.settlementState === "degraded"
    ).length;
    const missingCount = rows.filter(
      (row) => row.settlementState === null
    ).length;
    return {
      writerCount: rows.length,
      settledCount,
      degradedCount,
      missingCount,
      currentWriterGeneration: rows.at(-1)?.generation ?? null,
      currentWriterState:
        (rows.at(-1)?.settlementState as "settled" | "degraded" | null) ?? null,
      ready:
        rows.length > 0 &&
        settledCount === rows.length &&
        degradedCount === 0 &&
        missingCount === 0,
    };
  });
}

export function createDrizzleTranscriptRuntimeWriterStore(
  database: TranscriptPersistenceDatabase = db
): TranscriptRuntimeWriterStore<PersistedTranscriptRuntimeWriter> {
  return {
    async register(registration) {
      return database.transaction(async (tx) => {
        await configureTranscriptPersistenceTimeouts(tx);
        const sessions = await tx
          .select({
            roomName: interviewSession.livekitRoomName,
            lifecycleState: interviewSession.lifecycleState,
            terminalReason: interviewSession.terminalReason,
            endingAt: interviewSession.endingAt,
            reconnectDeadlineAt: interviewSession.reconnectDeadlineAt,
            startedAt: interviewSession.startedAt,
            config: interviewSession.config,
          })
          .from(interviewSession)
          .where(eq(interviewSession.id, registration.session_id))
          .limit(1)
          .for("update");
        const session = sessions[0];
        if (!session) return { ok: false, reason: "not_found" } as const;
        if (session.roomName !== registration.room_name) {
          return { ok: false, reason: "room_mismatch" } as const;
        }

        const [existingRows, currentRows] = await Promise.all([
          tx
            .select()
            .from(transcriptRuntimeWriter)
            .where(
              and(
                eq(transcriptRuntimeWriter.sessionId, registration.session_id),
                eq(transcriptRuntimeWriter.writerId, registration.writer_id)
              )
            )
            .limit(1),
          tx
            .select({ generation: transcriptRuntimeWriter.generation })
            .from(transcriptRuntimeWriter)
            .where(
              eq(transcriptRuntimeWriter.sessionId, registration.session_id)
            )
            .orderBy(desc(transcriptRuntimeWriter.generation))
            .limit(1),
        ]);
        const existing = existingRows[0];
        const currentGeneration = currentRows[0]?.generation ?? 0;
        if (existing) {
          if (!storedWriterMatchesRegistration(existing, registration)) {
            return { ok: false, reason: "registration_conflict" } as const;
          }
          if (existing.generation !== currentGeneration) {
            return { ok: false, reason: "writer_fenced" } as const;
          }
          return {
            ok: true,
            disposition: "existing",
            writer: existing,
            writerGeneration: existing.generation,
          } as const;
        }

        if (
          session.lifecycleState === "ending" ||
          isInterviewTerminalState(session.lifecycleState)
        ) {
          return { ok: false, reason: "session_closed" } as const;
        }
        const sessionWindow = transcriptSessionWindow(session);
        if (
          !sessionWindow ||
          !isTimestampWithinSessionWindow(
            registration.registered_at,
            sessionWindow
          )
        ) {
          return { ok: false, reason: "event_time_out_of_bounds" } as const;
        }

        const generation = currentGeneration + 1;
        const inserted = await tx
          .insert(transcriptRuntimeWriter)
          .values({
            sessionId: registration.session_id,
            generation,
            contractVersion: registration.contract_version,
            roomName: registration.room_name,
            writerId: registration.writer_id,
            registeredAt: new Date(registration.registered_at),
          })
          .returning();
        if (!inserted[0]) {
          throw new Error("Runtime writer registration was not persisted");
        }
        return {
          ok: true,
          disposition: "created",
          writer: inserted[0],
          writerGeneration: generation,
        } as const;
      });
    },
  };
}

export function createDrizzleTranscriptRuntimeSettlementStore(
  database: TranscriptPersistenceDatabase = db
): TranscriptRuntimeSettlementStore<PersistedTranscriptRuntimeSettlement> {
  return {
    async persist(settlement) {
      return database.transaction(async (tx) => {
        await configureTranscriptPersistenceTimeouts(tx);
        const sessions = await tx
          .select({
            roomName: interviewSession.livekitRoomName,
            lifecycleState: interviewSession.lifecycleState,
            terminalReason: interviewSession.terminalReason,
            endingAt: interviewSession.endingAt,
            reconnectDeadlineAt: interviewSession.reconnectDeadlineAt,
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
            and(
              eq(transcriptRuntimeSettlement.sessionId, settlement.session_id),
              eq(
                transcriptRuntimeSettlement.writerGeneration,
                settlement.writer_generation
              )
            )
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
        const registered = await getRegisteredWriter(tx, {
          sessionId: settlement.session_id,
          writerId: settlement.writer_id,
          writerGeneration: settlement.writer_generation,
        });
        if (!registered) {
          return { ok: false, reason: "writer_not_registered" } as const;
        }
        const sessionWindow = transcriptSessionWindow(session);
        if (
          !sessionWindow ||
          !isTimestampWithinSessionWindow(settlement.settled_at, sessionWindow)
        ) {
          return { ok: false, reason: "event_time_out_of_bounds" } as const;
        }
        if (
          session.lifecycleState === "ending" &&
          !isEndingSettlementAtCutoff(session, settlement.settled_at)
        ) {
          return { ok: false, reason: "event_time_out_of_bounds" } as const;
        }

        const inserted = await tx
          .insert(transcriptRuntimeSettlement)
          .values({
            sessionId: settlement.session_id,
            writerGeneration: settlement.writer_generation,
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
        await configureTranscriptPersistenceTimeouts(tx);
        const sessions = await tx
          .select({
            roomName: interviewSession.livekitRoomName,
            lifecycleState: interviewSession.lifecycleState,
            terminalReason: interviewSession.terminalReason,
            endingAt: interviewSession.endingAt,
            reconnectDeadlineAt: interviewSession.reconnectDeadlineAt,
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

        const writerStatus = await getCurrentWriterStatus(tx, {
          sessionId: marker.session_id,
          writerId: marker.writer_id,
          writerGeneration: marker.writer_generation,
        });
        if (writerStatus === "missing") {
          return { ok: false, reason: "writer_not_registered" } as const;
        }
        if (writerStatus === "fenced") {
          return { ok: false, reason: "writer_fenced" } as const;
        }

        const settlementRows = await tx
          .select({ sessionId: transcriptRuntimeSettlement.sessionId })
          .from(transcriptRuntimeSettlement)
          .where(
            and(
              eq(transcriptRuntimeSettlement.sessionId, marker.session_id),
              eq(
                transcriptRuntimeSettlement.writerGeneration,
                marker.writer_generation
              )
            )
          )
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

        if (isInterviewTerminalState(session.lifecycleState)) {
          return { ok: false, reason: "session_closed" } as const;
        }
        if (
          session.lifecycleState === "ending" &&
          !isEndingEvidenceWithinCutoff(session, marker.occurred_at)
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
            writerGeneration: marker.writer_generation,
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
    convergeCredit: (sessionId) =>
      convergeDrizzleInterviewCreditSettlement(
        sessionId,
        db,
        configureTranscriptPersistenceTimeouts
      ),
    async persist({ principal, event }) {
      return database.transaction(async (tx) => {
        await configureTranscriptPersistenceTimeouts(tx);
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
            terminalReason: interviewSession.terminalReason,
            endingAt: interviewSession.endingAt,
            reconnectDeadlineAt: interviewSession.reconnectDeadlineAt,
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

        const writerStatus = await getCurrentWriterStatus(tx, {
          sessionId: event.session_id,
          writerId: event.writer_id,
          writerGeneration: event.writer_generation,
        });
        if (writerStatus === "missing") {
          return { ok: false, reason: "writer_not_registered" } as const;
        }
        if (writerStatus === "fenced") {
          return { ok: false, reason: "writer_fenced" } as const;
        }

        const settlementRows = await tx
          .select({ sessionId: transcriptRuntimeSettlement.sessionId })
          .from(transcriptRuntimeSettlement)
          .where(
            and(
              eq(transcriptRuntimeSettlement.sessionId, event.session_id),
              eq(
                transcriptRuntimeSettlement.writerGeneration,
                event.writer_generation
              )
            )
          )
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

        if (isInterviewTerminalState(session.lifecycleState)) {
          return { ok: false, reason: "session_closed" } as const;
        }
        if (
          session.lifecycleState === "ending" &&
          !isEndingEvidenceWithinCutoff(session, event.ended_at)
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
            .select({ endedAt: transcriptTurn.endedAt })
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
        if (
          hasImpossibleWriterTurnOrder({
            eventStartedAt: Date.parse(event.started_at),
            eventEndedAt: Date.parse(event.ended_at),
            previousStartedAt: previousRows[0]?.startedAt,
            nextEndedAt: nextRows[0]?.endedAt,
          })
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

async function configureTranscriptPersistenceTimeouts(tx: {
  execute(query: ReturnType<typeof sql.raw>): Promise<unknown>;
}): Promise<void> {
  await tx.execute(
    sql.raw(
      `set local lock_timeout = '${TRANSCRIPT_PERSISTENCE_LOCK_TIMEOUT_MS}ms'`
    )
  );
  await tx.execute(
    sql.raw(
      `set local statement_timeout = '${TRANSCRIPT_PERSISTENCE_STATEMENT_TIMEOUT_MS}ms'`
    )
  );
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

type TranscriptQueryDatabase = Pick<typeof db, "select">;

async function getRegisteredWriter(
  database: TranscriptQueryDatabase,
  input: {
    sessionId: string;
    writerId: string;
    writerGeneration: number;
  }
): Promise<PersistedTranscriptRuntimeWriter | null> {
  const rows = await database
    .select()
    .from(transcriptRuntimeWriter)
    .where(
      and(
        eq(transcriptRuntimeWriter.sessionId, input.sessionId),
        eq(transcriptRuntimeWriter.generation, input.writerGeneration),
        eq(transcriptRuntimeWriter.writerId, input.writerId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

async function getCurrentWriterStatus(
  database: TranscriptQueryDatabase,
  input: {
    sessionId: string;
    writerId: string;
    writerGeneration: number;
  }
): Promise<"current" | "fenced" | "missing"> {
  const [registered, currentRows] = await Promise.all([
    getRegisteredWriter(database, input),
    database
      .select({ generation: transcriptRuntimeWriter.generation })
      .from(transcriptRuntimeWriter)
      .where(eq(transcriptRuntimeWriter.sessionId, input.sessionId))
      .orderBy(desc(transcriptRuntimeWriter.generation))
      .limit(1),
  ]);
  if (!registered) return "missing";
  return currentRows[0]?.generation === input.writerGeneration
    ? "current"
    : "fenced";
}

function isEndingEvidenceWithinCutoff(
  session: {
    lifecycleState: string;
    terminalReason: string | null;
    endingAt: Date | null;
    reconnectDeadlineAt: Date | null;
    startedAt: Date | null;
    config: unknown;
  },
  evidenceTimestamp: string
): boolean {
  const cutoff = endingTranscriptCutoff(session);
  const measuredAt = Date.parse(evidenceTimestamp);
  return (
    cutoff !== null &&
    Number.isFinite(measuredAt) &&
    measuredAt <= cutoff.getTime()
  );
}

function isEndingSettlementAtCutoff(
  session: {
    lifecycleState: string;
    terminalReason: string | null;
    endingAt: Date | null;
    reconnectDeadlineAt: Date | null;
    startedAt: Date | null;
    config: unknown;
  },
  settlementTimestamp: string
): boolean {
  const cutoff = endingTranscriptCutoff(session);
  return (
    cutoff !== null && Date.parse(settlementTimestamp) === cutoff.getTime()
  );
}

export function endingTranscriptCutoff(session: {
  terminalReason: string | null;
  endingAt: Date | null;
  reconnectDeadlineAt: Date | null;
  startedAt: Date | null;
  config: unknown;
}): Date | null {
  if (session.terminalReason === "user_end" && session.endingAt) {
    return session.endingAt;
  }
  if (
    session.terminalReason === "disconnect_timeout" &&
    session.reconnectDeadlineAt
  ) {
    return session.reconnectDeadlineAt;
  }
  if (session.terminalReason === "time_limit" && session.startedAt) {
    return deriveInterviewDeadlineAt({
      startedAt: session.startedAt,
      durationMinutes: normalizeInterviewDurationMinutes(
        isRecord(session.config) ? session.config.duration : undefined
      ),
    });
  }
  return null;
}

function transcriptEventValues(event: TranscriptEvent) {
  return {
    sessionId: event.session_id,
    contractVersion: event.contract_version,
    eventId: event.event_id,
    writerId: event.writer_id,
    writerGeneration: event.writer_generation,
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

function storedWriterMatchesRegistration(
  stored: PersistedTranscriptRuntimeWriter,
  registration: TranscriptRuntimeWriterRegistration
): boolean {
  return (
    stored.contractVersion === registration.contract_version &&
    stored.sessionId === registration.session_id &&
    stored.roomName === registration.room_name &&
    stored.writerId === registration.writer_id &&
    stored.registeredAt.getTime() === Date.parse(registration.registered_at)
  );
}

function storedTurnMatchesEvent(
  turn: PersistedTranscriptTurn,
  event: TranscriptEvent
): boolean {
  return (
    turn.contractVersion === event.contract_version &&
    turn.eventId === event.event_id &&
    turn.writerId === event.writer_id &&
    turn.writerGeneration === event.writer_generation &&
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
    stored.writerGeneration === marker.writer_generation &&
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
    stored.writerGeneration === settlement.writer_generation &&
    stored.state === settlement.state &&
    stored.settledAt.getTime() === Date.parse(settlement.settled_at)
  );
}

/**
 * Get all transcript turns for a session, ordered chronologically
 */
export async function getSessionTranscript(sessionId: string) {
  const turns = await db
    .select()
    .from(transcriptTurn)
    .where(eq(transcriptTurn.sessionId, sessionId))
    .orderBy(...transcriptChronologicalOrder());

  return turns;
}

/**
 * Return only the canonical user-turn fields required to verify persisted
 * feedback evidence at the authenticated read boundary.
 */
export async function getFeedbackEvidenceTurns(sessionId: string) {
  return buildFeedbackEvidenceTurnsQuery(db, sessionId);
}

export function buildFeedbackEvidenceTurnsQuery(
  database: Pick<typeof db, "select">,
  sessionId: string
) {
  return (
    database
      .select({
        // Read one character beyond each contract limit so the core parser can
        // reject oversized persisted values without first materializing them.
        eventId: sql<
          string | null
        >`left(${transcriptTurn.eventId}, ${MAX_CANONICAL_EVENT_ID_LENGTH + 1})`,
        speaker: transcriptTurn.speaker,
        text: sql<
          string | null
        >`left(${transcriptTurn.text}, ${MAX_FEEDBACK_EVIDENCE_TEXT_LENGTH + 1})`,
        contractVersion: transcriptTurn.contractVersion,
      })
      .from(transcriptTurn)
      .where(
        and(
          eq(transcriptTurn.sessionId, sessionId),
          eq(transcriptTurn.speaker, "user")
        )
      )
      .orderBy(
        asc(transcriptTurn.startedAt),
        asc(transcriptTurn.writerId),
        asc(transcriptTurn.sequence),
        asc(transcriptTurn.eventId),
        asc(transcriptTurn.id)
      )
      // Likewise, fetch one row beyond the accepted session capacity so a
      // corrupt legacy session fails closed with bounded database and app work.
      .limit(MAX_CANONICAL_TURNS_PER_SESSION + 1)
  );
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

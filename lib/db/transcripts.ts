import { db } from "./index";
import {
  interviewSession,
  transcriptEvidenceWriterCutoff,
  transcriptInterruptionMarker,
  transcriptRuntimeSettlement,
  transcriptRuntimeSettlementCommand,
  transcriptRuntimeWriter,
  transcriptTurn,
} from "./schema";
import {
  hasImpossibleWriterTurnOrder,
  transcriptChronologicalOrder,
} from "./transcript-ordering";
import { and, asc, desc, eq, gt, lt, lte, sql } from "drizzle-orm";
import {
  deriveTranscriptWriterProgress,
  hasTranscriptWriterGap,
  type TranscriptWriterEvidenceFact,
} from "./transcript-writer-progress";
import type {
  TranscriptEvent,
  TranscriptInterruptionMarker,
  TranscriptRuntimeSettlement,
  TranscriptRuntimeWriterRegistration,
} from "@meelni/agent";
import {
  classifyTranscriptInterruptionIntegrity,
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
  unhealthyWriterCount?: number;
  gapWriterCount?: number;
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
        integrityState: transcriptRuntimeWriter.integrityState,
        lastObservedSequence: transcriptRuntimeWriter.lastObservedSequence,
        committedSequence: transcriptRuntimeWriter.committedSequence,
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
    const unhealthyWriterCount = rows.filter(
      (row) => row.integrityState !== "healthy"
    ).length;
    const gapWriterCount = rows.filter((row) =>
      hasTranscriptWriterGap(row)
    ).length;
    return {
      writerCount: rows.length,
      settledCount,
      degradedCount,
      missingCount,
      currentWriterGeneration: rows.at(-1)?.generation ?? null,
      currentWriterState:
        (rows.at(-1)?.settlementState as "settled" | "degraded" | null) ?? null,
      unhealthyWriterCount,
      gapWriterCount,
      ready:
        rows.length > 0 &&
        settledCount === rows.length &&
        degradedCount === 0 &&
        missingCount === 0 &&
        unhealthyWriterCount === 0 &&
        gapWriterCount === 0,
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
          if (!storedSettlementMatches(existingRows[0], settlement)) {
            return { ok: false, reason: "settlement_conflict" } as const;
          }
          await acknowledgePendingSettlementCommand(tx, settlement);
          return {
            ok: true,
            disposition: "existing",
            settlement: existingRows[0],
          } as const;
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
        if (
          settlement.state === "settled" &&
          (registered.integrityState !== "healthy" ||
            hasTranscriptWriterGap(registered))
        ) {
          return { ok: false, reason: "settlement_conflict" } as const;
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
          await acknowledgePendingSettlementCommand(tx, settlement);
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

async function acknowledgePendingSettlementCommand(
  tx: TranscriptPersistenceTransaction,
  settlement: TranscriptRuntimeSettlement
): Promise<void> {
  await tx
    .update(transcriptRuntimeSettlementCommand)
    .set({
      state: "acknowledged",
      terminalReason: settlement.state,
      acknowledgedAt: sql`date_trunc('milliseconds', clock_timestamp())`,
      terminalAt: sql`date_trunc('milliseconds', clock_timestamp())`,
    })
    .where(
      and(
        eq(transcriptRuntimeSettlementCommand.sessionId, settlement.session_id),
        eq(
          transcriptRuntimeSettlementCommand.writerGeneration,
          settlement.writer_generation
        ),
        eq(transcriptRuntimeSettlementCommand.writerId, settlement.writer_id),
        eq(transcriptRuntimeSettlementCommand.roomName, settlement.room_name),
        eq(transcriptRuntimeSettlementCommand.state, "pending"),
        sql`${transcriptRuntimeSettlementCommand.expiresAt} > clock_timestamp()`
      )
    );
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

        const conflictingTurn = await tx
          .select({ id: transcriptTurn.id })
          .from(transcriptTurn)
          .where(
            and(
              eq(transcriptTurn.sessionId, marker.session_id),
              eq(transcriptTurn.writerGeneration, marker.writer_generation),
              eq(transcriptTurn.sequence, marker.sequence)
            )
          )
          .limit(1);
        if (conflictingTurn[0]) {
          return { ok: false, reason: "writer_sequence_conflict" } as const;
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
          await advanceStoredTranscriptWriterProgress(tx, {
            sessionId: marker.session_id,
            writerGeneration: marker.writer_generation,
            evidence: {
              sequence: marker.sequence,
              eventId: marker.event_id,
              evidenceAt: new Date(marker.occurred_at),
              kind: "marker",
              integrityImpact: classifyTranscriptInterruptionIntegrity({
                speaker: marker.speaker,
                reason: marker.reason,
              }),
            },
          });
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

        const conflictingMarker = await tx
          .select({ id: transcriptInterruptionMarker.id })
          .from(transcriptInterruptionMarker)
          .where(
            and(
              eq(transcriptInterruptionMarker.sessionId, event.session_id),
              eq(
                transcriptInterruptionMarker.writerGeneration,
                event.writer_generation
              ),
              eq(transcriptInterruptionMarker.sequence, event.sequence)
            )
          )
          .limit(1);
        if (conflictingMarker[0]) {
          return { ok: false, reason: "writer_sequence_conflict" } as const;
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
          await advanceStoredTranscriptWriterProgress(tx, {
            sessionId: event.session_id,
            writerGeneration: event.writer_generation,
            evidence: {
              sequence: event.sequence,
              eventId: event.event_id,
              evidenceAt: new Date(event.ended_at),
              kind: "turn",
              integrityImpact: "preserve",
            },
          });
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

type TranscriptPersistenceTransaction = Parameters<
  Parameters<TranscriptPersistenceDatabase["transaction"]>[0]
>[0];

async function advanceStoredTranscriptWriterProgress(
  tx: TranscriptPersistenceTransaction,
  input: {
    sessionId: string;
    writerGeneration: number;
    evidence: TranscriptWriterEvidenceFact;
  }
): Promise<void> {
  const writerRows = await tx
    .select()
    .from(transcriptRuntimeWriter)
    .where(
      and(
        eq(transcriptRuntimeWriter.sessionId, input.sessionId),
        eq(transcriptRuntimeWriter.generation, input.writerGeneration)
      )
    )
    .limit(1)
    .for("update");
  const writer = writerRows[0];
  if (!writer) throw new Error("Transcript writer disappeared during ingest");

  let evidence = [input.evidence];
  if (
    input.evidence.sequence === writer.committedSequence + 1 &&
    writer.lastObservedSequence > input.evidence.sequence
  ) {
    const upperSequence = Math.max(
      writer.lastObservedSequence,
      input.evidence.sequence
    );
    const [turns, markers] = await Promise.all([
      tx
        .select({
          sequence: transcriptTurn.sequence,
          eventId: transcriptTurn.eventId,
          evidenceAt: transcriptTurn.endedAt,
        })
        .from(transcriptTurn)
        .where(
          and(
            eq(transcriptTurn.sessionId, input.sessionId),
            eq(transcriptTurn.writerGeneration, input.writerGeneration),
            gt(transcriptTurn.sequence, writer.committedSequence),
            lte(transcriptTurn.sequence, upperSequence)
          )
        ),
      tx
        .select({
          sequence: transcriptInterruptionMarker.sequence,
          eventId: transcriptInterruptionMarker.eventId,
          evidenceAt: transcriptInterruptionMarker.occurredAt,
          speaker: transcriptInterruptionMarker.speaker,
          reason: transcriptInterruptionMarker.reason,
        })
        .from(transcriptInterruptionMarker)
        .where(
          and(
            eq(transcriptInterruptionMarker.sessionId, input.sessionId),
            eq(
              transcriptInterruptionMarker.writerGeneration,
              input.writerGeneration
            ),
            gt(transcriptInterruptionMarker.sequence, writer.committedSequence),
            lte(transcriptInterruptionMarker.sequence, upperSequence)
          )
        ),
    ]);
    evidence = [
      ...turns.flatMap((turn) =>
        turn.eventId && turn.evidenceAt && turn.sequence !== null
          ? [
              {
                sequence: turn.sequence,
                eventId: turn.eventId,
                evidenceAt: turn.evidenceAt,
                kind: "turn" as const,
                integrityImpact: "preserve" as const,
              },
            ]
          : []
      ),
      ...markers.map((marker) => ({
        sequence: marker.sequence,
        eventId: marker.eventId,
        evidenceAt: marker.evidenceAt,
        kind: "marker" as const,
        integrityImpact: classifyTranscriptInterruptionIntegrity({
          speaker: marker.speaker,
          reason: marker.reason,
        }),
      })),
    ];
  }

  const progress = deriveTranscriptWriterProgress({
    current: writer,
    evidence,
  });
  await tx
    .update(transcriptRuntimeWriter)
    .set({ ...progress, progressUpdatedAt: sql`CURRENT_TIMESTAMP` })
    .where(
      and(
        eq(transcriptRuntimeWriter.sessionId, input.sessionId),
        eq(transcriptRuntimeWriter.generation, input.writerGeneration)
      )
    );
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
export async function getSessionTranscript(
  sessionId: string,
  database: Pick<typeof db, "select"> = db
) {
  const turns = await database
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
export async function getFeedbackEvidenceTurns(
  sessionId: string,
  database: Pick<typeof db, "select"> = db
) {
  return buildFeedbackEvidenceTurnsQuery(database, sessionId);
}

/**
 * Read only the immutable, terminally frozen transcript prefix authorized for
 * evaluation. Legacy sessions retain the bounded pre-watermark behavior.
 */
export async function getFrozenFeedbackTranscriptTurns(
  sessionId: string,
  database: TranscriptPersistenceDatabase = db
) {
  return database.transaction(async (tx) => {
    const sessions = await tx
      .select({
        evidenceVersion: interviewSession.transcriptEvidenceVersion,
        evidenceState: interviewSession.transcriptEvidenceState,
        cutoffAt: interviewSession.transcriptCutoffAt,
      })
      .from(interviewSession)
      .where(eq(interviewSession.id, sessionId))
      .limit(1);
    const session = sessions[0];
    if (!session) return [];
    if (session.evidenceVersion !== 1 || !session.cutoffAt) {
      return buildBoundedFeedbackTranscriptQuery(tx, sessionId);
    }
    if (
      session.evidenceState !== "complete" &&
      session.evidenceState !== "partial"
    ) {
      return [];
    }

    const cutoffs = await tx
      .select({
        writerGeneration: transcriptEvidenceWriterCutoff.writerGeneration,
        committedSequence: transcriptEvidenceWriterCutoff.committedSequence,
      })
      .from(transcriptEvidenceWriterCutoff)
      .where(eq(transcriptEvidenceWriterCutoff.sessionId, sessionId));
    const committedByGeneration = new Map(
      cutoffs.map((cutoff) => [
        cutoff.writerGeneration,
        cutoff.committedSequence,
      ])
    );
    if (committedByGeneration.size === 0) return [];

    const rows = await buildBoundedFeedbackTranscriptQuery(
      tx,
      sessionId,
      session.cutoffAt
    );
    return rows.flatMap((row) => {
      if (row.writerGeneration === null || row.sequence === null) return [];
      const committedSequence = committedByGeneration.get(row.writerGeneration);
      return committedSequence !== undefined &&
        row.sequence <= committedSequence
        ? [row]
        : [];
    });
  });
}

/**
 * Read the complete frozen ledger projection needed to reconstruct SAV-369
 * answer blocks. The snapshot remains server-only; callers must not log it or
 * expose source writer metadata to clients.
 */
export async function getFrozenFeedbackEvaluationEvidence(
  sessionId: string,
  database: TranscriptPersistenceDatabase | Pick<typeof db, "select"> = db
) {
  const readFrozenEvidence = async (tx: Pick<typeof db, "select">) => {
    const sessions = await tx
      .select({
        evidenceVersion: interviewSession.transcriptEvidenceVersion,
        evidenceState: interviewSession.transcriptEvidenceState,
        cutoffAt: interviewSession.transcriptCutoffAt,
        frozenAt: interviewSession.transcriptEvidenceFrozenAt,
        lifecycleState: interviewSession.lifecycleState,
      })
      .from(interviewSession)
      .where(eq(interviewSession.id, sessionId))
      .limit(1);
    const session = sessions[0];
    if (!session) {
      return {
        snapshotValid: false,
        snapshotState: null,
        turns: [],
        interruptions: [],
        sessionEndAt: null,
        sourceOverflow: false,
      };
    }

    if (!hasValidFrozenFeedbackEvaluationSnapshot(session)) {
      return {
        snapshotValid: false,
        snapshotState: null,
        turns: [],
        interruptions: [],
        sessionEndAt: null,
        sourceOverflow: false,
      };
    }

    const rows = await buildBoundedFeedbackTranscriptQuery(
      tx,
      sessionId,
      session.cutoffAt
    );
    const markers = await tx
      .select({
        eventId: transcriptInterruptionMarker.eventId,
        writerId: transcriptInterruptionMarker.writerId,
        writerGeneration: transcriptInterruptionMarker.writerGeneration,
        sequence: transcriptInterruptionMarker.sequence,
        speaker: transcriptInterruptionMarker.speaker,
        occurredAt: transcriptInterruptionMarker.occurredAt,
        reason: transcriptInterruptionMarker.reason,
      })
      .from(transcriptInterruptionMarker)
      .where(
        and(
          eq(transcriptInterruptionMarker.sessionId, sessionId),
          lte(transcriptInterruptionMarker.occurredAt, session.cutoffAt)
        )
      )
      .limit(MAX_INTERRUPTION_MARKERS_PER_SESSION + 1);
    const sourceOverflow =
      rows.length > MAX_CANONICAL_TURNS_PER_SESSION ||
      markers.length > MAX_INTERRUPTION_MARKERS_PER_SESSION;
    const boundedRows = rows.slice(0, MAX_CANONICAL_TURNS_PER_SESSION);
    const boundedMarkers = markers.slice(
      0,
      MAX_INTERRUPTION_MARKERS_PER_SESSION
    );

    const registeredWriters = await tx
      .select({
        generation: transcriptRuntimeWriter.generation,
        contractVersion: transcriptRuntimeWriter.contractVersion,
        writerId: transcriptRuntimeWriter.writerId,
      })
      .from(transcriptRuntimeWriter)
      .where(eq(transcriptRuntimeWriter.sessionId, sessionId));
    const cutoffs = await tx
      .select({
        writerGeneration: transcriptEvidenceWriterCutoff.writerGeneration,
        contractVersion: transcriptEvidenceWriterCutoff.contractVersion,
        writerId: transcriptEvidenceWriterCutoff.writerId,
        committedSequence: transcriptEvidenceWriterCutoff.committedSequence,
        lastObservedSequence:
          transcriptEvidenceWriterCutoff.lastObservedSequence,
        committedEventId: transcriptEvidenceWriterCutoff.committedEventId,
        committedThroughAt: transcriptEvidenceWriterCutoff.committedThroughAt,
        integrityState: transcriptEvidenceWriterCutoff.integrityState,
        settlementState: transcriptEvidenceWriterCutoff.settlementState,
        frozenAt: transcriptEvidenceWriterCutoff.frozenAt,
      })
      .from(transcriptEvidenceWriterCutoff)
      .where(eq(transcriptEvidenceWriterCutoff.sessionId, sessionId));
    const committedByGeneration = new Map(
      cutoffs.map((cutoff) => [
        cutoff.writerGeneration,
        cutoff.committedSequence,
      ])
    );
    if (
      !hasCanonicalFrozenWriterCutoffCoverage({
        registeredWriters,
        cutoffs,
        rows: boundedRows,
        markers: boundedMarkers,
        snapshotState: session.evidenceState,
        cutoffAt: session.cutoffAt,
        frozenAt: session.frozenAt,
      })
    ) {
      return {
        snapshotValid: false,
        snapshotState: null,
        turns: [],
        interruptions: [],
        sessionEndAt: session.cutoffAt,
        sourceOverflow,
      };
    }
    return {
      snapshotValid: true,
      snapshotState: session.evidenceState,
      turns: boundedRows.filter((row) => {
        if (row.writerGeneration === null || row.sequence === null)
          return false;
        const committed = committedByGeneration.get(row.writerGeneration);
        return committed !== undefined && row.sequence <= committed;
      }),
      interruptions: boundedMarkers.filter((marker) => {
        const committed = committedByGeneration.get(marker.writerGeneration);
        return committed !== undefined && marker.sequence <= committed;
      }),
      sessionEndAt: session.cutoffAt,
      sourceOverflow,
    };
  };
  return "transaction" in database
    ? database.transaction(readFrozenEvidence)
    : readFrozenEvidence(database);
}

export function hasCanonicalFrozenWriterCutoffCoverage(input: {
  registeredWriters: readonly {
    generation: number;
    contractVersion: number;
    writerId: string;
  }[];
  cutoffs: readonly {
    writerGeneration: number;
    contractVersion: number;
    writerId: string;
    committedSequence: number;
    lastObservedSequence: number;
    committedEventId: string | null;
    committedThroughAt: Date | null;
    integrityState: "healthy" | "degraded";
    settlementState: "settled" | "missing" | "degraded";
    frozenAt: Date;
  }[];
  rows: readonly {
    writerGeneration: number | null;
    sequence: number | null;
    eventId: string | null;
    endedAt: Date | null;
  }[];
  markers: readonly {
    writerGeneration: number;
    sequence: number;
    eventId: string;
    occurredAt: Date;
    speaker: "user" | "interviewer";
    reason: "no_provider_confirmed_prefix" | "canonicalization_failed";
  }[];
  snapshotState: "complete" | "partial";
  cutoffAt: Date;
  frozenAt: Date;
}): boolean {
  if (
    input.registeredWriters.length === 0 ||
    input.cutoffs.length !== input.registeredWriters.length ||
    !Number.isFinite(input.cutoffAt.getTime())
  ) {
    return false;
  }
  const registeredByGeneration = new Map<
    number,
    { contractVersion: number; writerId: string }
  >();
  for (const writer of input.registeredWriters) {
    if (
      !Number.isSafeInteger(writer.generation) ||
      writer.generation <= 0 ||
      writer.contractVersion !== 1 ||
      writer.writerId.length === 0 ||
      registeredByGeneration.has(writer.generation)
    ) {
      return false;
    }
    registeredByGeneration.set(writer.generation, {
      contractVersion: writer.contractVersion,
      writerId: writer.writerId,
    });
  }
  const committedByGeneration = new Map<number, number>();
  for (const cutoff of input.cutoffs) {
    const registered = registeredByGeneration.get(cutoff.writerGeneration);
    const validBoundary =
      (cutoff.committedSequence === 0 &&
        cutoff.committedEventId === null &&
        cutoff.committedThroughAt === null) ||
      (cutoff.committedSequence > 0 &&
        Boolean(cutoff.committedEventId) &&
        cutoff.committedThroughAt instanceof Date &&
        Number.isFinite(cutoff.committedThroughAt.getTime()) &&
        cutoff.committedThroughAt.getTime() <= input.cutoffAt.getTime());
    if (
      !Number.isSafeInteger(cutoff.writerGeneration) ||
      cutoff.writerGeneration <= 0 ||
      cutoff.contractVersion !== 1 ||
      cutoff.writerId.length === 0 ||
      registered?.contractVersion !== cutoff.contractVersion ||
      registered.writerId !== cutoff.writerId ||
      !Number.isSafeInteger(cutoff.committedSequence) ||
      cutoff.committedSequence < 0 ||
      !Number.isSafeInteger(cutoff.lastObservedSequence) ||
      cutoff.lastObservedSequence !== cutoff.committedSequence ||
      !validBoundary ||
      cutoff.integrityState !== "healthy" ||
      cutoff.settlementState === "degraded" ||
      !Number.isFinite(cutoff.frozenAt.getTime()) ||
      cutoff.frozenAt.getTime() !== input.frozenAt.getTime() ||
      committedByGeneration.has(cutoff.writerGeneration)
    ) {
      return false;
    }
    committedByGeneration.set(
      cutoff.writerGeneration,
      cutoff.committedSequence
    );
  }
  if (
    input.rows.some(
      (row) =>
        row.writerGeneration === null ||
        row.sequence === null ||
        !Number.isSafeInteger(row.writerGeneration) ||
        row.writerGeneration <= 0 ||
        !Number.isSafeInteger(row.sequence) ||
        row.sequence <= 0 ||
        !committedByGeneration.has(row.writerGeneration)
    ) ||
    input.markers.some(
      (marker) =>
        !Number.isSafeInteger(marker.writerGeneration) ||
        marker.writerGeneration <= 0 ||
        !Number.isSafeInteger(marker.sequence) ||
        marker.sequence <= 0 ||
        !committedByGeneration.has(marker.writerGeneration)
    )
  ) {
    return false;
  }
  for (const cutoff of input.cutoffs) {
    if (cutoff.committedSequence === 0) continue;
    const boundaryEvidence = [
      ...input.rows.flatMap((row) =>
        row.writerGeneration === cutoff.writerGeneration &&
        row.sequence === cutoff.committedSequence &&
        row.endedAt
          ? [{ eventId: row.eventId, evidenceAt: row.endedAt }]
          : []
      ),
      ...input.markers.flatMap((marker) =>
        marker.writerGeneration === cutoff.writerGeneration &&
        marker.sequence === cutoff.committedSequence
          ? [{ eventId: marker.eventId, evidenceAt: marker.occurredAt }]
          : []
      ),
    ];
    if (
      boundaryEvidence.length !== 1 ||
      boundaryEvidence[0]?.eventId !== cutoff.committedEventId ||
      boundaryEvidence[0]?.evidenceAt.getTime() !==
        cutoff.committedThroughAt?.getTime()
    ) {
      return false;
    }
  }
  const hasPreservingMarker = input.markers.some((marker) => {
    const committed = committedByGeneration.get(marker.writerGeneration)!;
    return (
      marker.sequence <= committed &&
      classifyTranscriptInterruptionIntegrity({
        speaker: marker.speaker,
        reason: marker.reason,
      }) === "preserve"
    );
  });
  const allSettled = input.cutoffs.every(
    (cutoff) => cutoff.settlementState === "settled"
  );
  return input.snapshotState === "complete"
    ? allSettled && !hasPreservingMarker
    : !allSettled || hasPreservingMarker;
}

export function hasValidFrozenFeedbackEvaluationSnapshot(input: {
  evidenceVersion: unknown;
  evidenceState: unknown;
  cutoffAt: unknown;
  frozenAt: unknown;
  lifecycleState: unknown;
}): input is {
  evidenceVersion: 1;
  evidenceState: "complete" | "partial";
  cutoffAt: Date;
  frozenAt: Date;
  lifecycleState: "completed" | "abandoned" | "failed";
} {
  return (
    input.evidenceVersion === 1 &&
    input.cutoffAt instanceof Date &&
    Number.isFinite(input.cutoffAt.getTime()) &&
    input.frozenAt instanceof Date &&
    Number.isFinite(input.frozenAt.getTime()) &&
    input.frozenAt.getTime() >= input.cutoffAt.getTime() &&
    (input.evidenceState === "complete" || input.evidenceState === "partial") &&
    (input.lifecycleState === "completed" ||
      input.lifecycleState === "abandoned" ||
      input.lifecycleState === "failed")
  );
}

function buildBoundedFeedbackTranscriptQuery(
  database: Pick<typeof db, "select">,
  sessionId: string,
  cutoffAt?: Date
) {
  return database
    .select({
      eventId: transcriptTurn.eventId,
      writerId: transcriptTurn.writerId,
      speaker: transcriptTurn.speaker,
      text: transcriptTurn.text,
      contractVersion: transcriptTurn.contractVersion,
      deliveryState: transcriptTurn.deliveryState,
      writerGeneration: transcriptTurn.writerGeneration,
      sequence: transcriptTurn.sequence,
      startedAt: transcriptTurn.startedAt,
      endedAt: transcriptTurn.endedAt,
      audioMs: transcriptTurn.audioMs,
      section: transcriptTurn.section,
    })
    .from(transcriptTurn)
    .where(
      cutoffAt
        ? and(
            eq(transcriptTurn.sessionId, sessionId),
            lte(transcriptTurn.endedAt, cutoffAt)
          )
        : eq(transcriptTurn.sessionId, sessionId)
    )
    .orderBy(...transcriptChronologicalOrder())
    .limit(MAX_CANONICAL_TURNS_PER_SESSION + 1);
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

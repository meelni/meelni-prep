import { and, eq, sql } from "drizzle-orm";
import {
  canTransitionInterviewLifecycle,
  deriveInterviewTerminalState,
  isInterviewTerminalState,
  projectLegacyInterviewSessionStatus,
  type InterviewLifecycleState,
  type InterviewBillingFault,
  type InterviewTerminalReason,
} from "@meelni/core";

import {
  calculateValidatedSessionFromTurns,
  type SessionValidation,
} from "@/lib/evaluation/session-validator";
import { transcriptChronologicalOrder } from "@/lib/db/transcript-ordering";
import { endingTranscriptCutoff } from "@/lib/db/transcripts";
import {
  buildTranscriptEvidenceSnapshot,
  type TranscriptEvidenceState,
} from "@/lib/workflows/transcript-evidence-snapshot";
import { feedbackGenerationEventId } from "./feedback-event-id";
import { db } from "./index";
import {
  feedback,
  interviewSession,
  transcriptEvidenceWriterCutoff,
  transcriptInterruptionMarker,
  transcriptRuntimeSettlement,
  transcriptRuntimeWriter,
  transcriptTurn,
} from "./schema";

export type EndInterviewSessionCommand = { sessionId: string } & (
  | {
      actor: { type: "user"; userId: string };
      requestedTerminalReason: "user_end";
    }
  | {
      actor: { type: "system"; source: "hard_deadline" };
      requestedTerminalReason: "time_limit";
    }
  | {
      actor: { type: "system"; source: "invalid_session_recovery" };
      requestedTerminalReason: "provider_failure";
    }
  | {
      actor: { type: "system"; source: "reconnect_timeout" };
      requestedTerminalReason: "disconnect_timeout";
    }
);

export type FinalizeInterviewSessionInput = EndInterviewSessionCommand & {
  now?: Date;
};

export type FinalizeInterviewSessionResult =
  | { ok: false; reason: "not_found" }
  | {
      ok: true;
      disposition: "applied" | "existing" | "repaired";
      userId: string;
      roomName: string | null;
      lifecycle: {
        state: InterviewLifecycleState;
        version: number;
        terminalReason: InterviewTerminalReason;
        endingAt: Date | null;
        endedAt: Date;
      };
      transcriptEvidence: "available" | "partial" | "degraded" | "missing";
      feedback: typeof feedback.$inferSelect;
      deadlineRoomCleanupStatus:
        | "pending"
        | "deleted"
        | "already_absent"
        | null;
      stats: SessionValidation["stats"];
      tier: SessionValidation["tier"];
      recommendations: string[];
    };

export type EndInterviewSessionDatabase = Pick<typeof db, "transaction">;
export type AuthorizeInterviewSessionEndDatabase = Pick<typeof db, "select">;

export async function authorizeInterviewSessionEnd(
  input: EndInterviewSessionCommand,
  database: AuthorizeInterviewSessionEndDatabase = db
): Promise<boolean> {
  const authorizationCondition =
    input.actor.type === "user"
      ? and(
          eq(interviewSession.id, input.sessionId),
          eq(interviewSession.userId, input.actor.userId)
        )
      : eq(interviewSession.id, input.sessionId);
  const rows = await database
    .select({ id: interviewSession.id })
    .from(interviewSession)
    .where(authorizationCondition)
    .limit(1);
  return Boolean(rows[0]);
}

export async function finalizeInterviewSession(
  input: FinalizeInterviewSessionInput,
  database: EndInterviewSessionDatabase = db
): Promise<FinalizeInterviewSessionResult> {
  const now = input.now ?? new Date();

  return database.transaction(async (tx) => {
    const ownershipCondition =
      input.actor.type === "user"
        ? and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.userId, input.actor.userId)
          )
        : eq(interviewSession.id, input.sessionId);
    const rows = await tx
      .select()
      .from(interviewSession)
      .where(ownershipCondition)
      .limit(1)
      .for("update");
    const stored = rows[0];
    if (!stored) return { ok: false, reason: "not_found" } as const;

    const cutoffAt =
      stored.transcriptCutoffAt ??
      endingTranscriptCutoff({
        ...stored,
        terminalReason: stored.terminalReason ?? input.requestedTerminalReason,
        endingAt:
          stored.endingAt ??
          (input.requestedTerminalReason === "user_end" ? now : null),
      }) ??
      stored.endingAt ??
      now;
    const [storedTurns, interruptionCounts, liveWriterEvidence, frozenWriters] =
      await Promise.all([
        tx
          .select({
            contractVersion: transcriptTurn.contractVersion,
            eventId: transcriptTurn.eventId,
            writerGeneration: transcriptTurn.writerGeneration,
            sequence: transcriptTurn.sequence,
            speaker: transcriptTurn.speaker,
            text: transcriptTurn.text,
            startedAt: transcriptTurn.startedAt,
            endedAt: transcriptTurn.endedAt,
          })
          .from(transcriptTurn)
          .where(eq(transcriptTurn.sessionId, input.sessionId))
          .orderBy(...transcriptChronologicalOrder()),
        tx
          .select({ value: sql<number>`count(*)::int` })
          .from(transcriptInterruptionMarker)
          .where(eq(transcriptInterruptionMarker.sessionId, input.sessionId)),
        tx
          .select({
            generation: transcriptRuntimeWriter.generation,
            contractVersion: transcriptRuntimeWriter.contractVersion,
            writerId: transcriptRuntimeWriter.writerId,
            lastObservedSequence: transcriptRuntimeWriter.lastObservedSequence,
            committedSequence: transcriptRuntimeWriter.committedSequence,
            committedEventId: transcriptRuntimeWriter.committedEventId,
            committedThroughAt: transcriptRuntimeWriter.committedThroughAt,
            integrityState: transcriptRuntimeWriter.integrityState,
            settlementState: transcriptRuntimeSettlement.state,
            settledAt: transcriptRuntimeSettlement.settledAt,
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
          .where(eq(transcriptRuntimeWriter.sessionId, input.sessionId)),
        tx
          .select()
          .from(transcriptEvidenceWriterCutoff)
          .where(eq(transcriptEvidenceWriterCutoff.sessionId, input.sessionId)),
      ]);
    const useFrozenEvidence =
      isInterviewTerminalState(stored.lifecycleState) &&
      stored.transcriptEvidenceVersion === 1;
    const writerEvidence = useFrozenEvidence
      ? frozenWriters.map((writer) => ({
          generation: writer.writerGeneration,
          contractVersion: writer.contractVersion,
          writerId: writer.writerId,
          lastObservedSequence: writer.lastObservedSequence,
          committedSequence: writer.committedSequence,
          committedEventId: writer.committedEventId,
          committedThroughAt: writer.committedThroughAt,
          integrityState: writer.integrityState,
          settlementState:
            writer.settlementState === "missing"
              ? null
              : writer.settlementState,
          settledAt: writer.settlementState === "settled" ? cutoffAt : null,
        }))
      : liveWriterEvidence.map((writer) => ({
          ...writer,
          settlementState: writer.settlementState as
            | "settled"
            | "degraded"
            | null,
        }));
    const committedByGeneration = new Map(
      writerEvidence.map((writer) => [
        writer.generation,
        writer.committedSequence,
      ])
    );
    const turns = storedTurns.filter((turn) => {
      if (
        turn.writerGeneration === null ||
        turn.sequence === null ||
        !turn.endedAt ||
        turn.endedAt.getTime() > cutoffAt.getTime()
      ) {
        return false;
      }
      const committedSequence = committedByGeneration.get(
        turn.writerGeneration
      );
      return (
        committedSequence !== undefined && turn.sequence <= committedSequence
      );
    });
    const baseValidation = calculateValidatedSessionFromTurns(turns);
    const unavailableInterruptions = interruptionCounts[0]?.value ?? 0;
    const runtimeWriterStates = writerEvidence.map((writer) => ({
      generation: writer.generation,
      state: writer.settlementState,
    }));
    const evidenceSnapshot = buildTranscriptEvidenceSnapshot({
      cutoffAt,
      interruptionCount: unavailableInterruptions,
      writers: writerEvidence,
      baseValidation,
    });
    const transcriptEvidence = presentTranscriptEvidence(
      useFrozenEvidence
        ? (stored.transcriptEvidenceState as TranscriptEvidenceState)
        : evidenceSnapshot.state
    );
    const preservePostUsableDisconnectCharge =
      shouldPreservePostUsableDisconnectCharge({
        requestedTerminalReason: input.requestedTerminalReason,
        usableAt: stored.usableAt,
        missingRuntimeSettlement:
          runtimeWriterStates.length === 0 ||
          runtimeWriterStates.some((writer) => writer.state === null),
        unavailableInterruptions,
      });
    const hasIntegrityFault =
      evidenceSnapshot.state === "degraded" &&
      !preservePostUsableDisconnectCharge;
    const validation = evidenceSnapshot.validation;

    let state = stored.lifecycleState;
    let version = stored.lifecycleVersion;
    let terminalReason = stored.terminalReason;
    let activatedAt = stored.activatedAt;
    let endingAt = stored.endingAt;
    let endedAt = stored.endedAt;
    let billingFault = stored.billingFault;
    let billingFaultCode = stored.billingFaultCode;
    const wasTerminal = isInterviewTerminalState(state);
    const hardDeadlineOwnsCleanup =
      !wasTerminal &&
      input.actor.type === "system" &&
      input.actor.source === "hard_deadline" &&
      stored.terminalReason === null;

    if (
      shouldRefineProvisionalTerminalReason({
        state,
        terminalReason,
        isValid: validation.isValid,
        source: input.actor.type === "system" ? input.actor.source : "user_end",
      })
    ) {
      const expectedTerminalReason = terminalReason!;
      const refined = await tx
        .update(interviewSession)
        .set({
          lifecycleVersion: sql`${interviewSession.lifecycleVersion} + 1`,
          terminalReason: "insufficient_signal",
          status: projectLegacyInterviewSessionStatus({
            state: "ending",
            terminalReason: "insufficient_signal",
          }),
          lastTransitionAt: now,
        })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.lifecycleState, "ending"),
            eq(interviewSession.lifecycleVersion, version),
            eq(interviewSession.terminalReason, expectedTerminalReason)
          )
        )
        .returning({
          version: interviewSession.lifecycleVersion,
          terminalReason: interviewSession.terminalReason,
        });
      if (!refined[0]) {
        throw new Error(
          "Provisional terminal reason changed while its row was locked"
        );
      }
      version = refined[0].version;
      terminalReason = refined[0].terminalReason;
    }

    const advance = async (
      nextState: InterviewLifecycleState,
      reason: InterviewTerminalReason | null,
      requestedBillingFault: InterviewBillingFault
    ) => {
      if (!canTransitionInterviewLifecycle(state, nextState)) {
        throw new Error(
          `Invalid stored interview lifecycle transition: ${state} -> ${nextState}`
        );
      }

      const nextActivatedAt =
        nextState === "active" ? (activatedAt ?? now) : activatedAt;
      const nextEndedAt = isInterviewTerminalState(nextState)
        ? (endedAt ?? now)
        : endedAt;
      const nextEndingAt =
        nextState === "ending" ? (endingAt ?? now) : endingAt;
      const updated = await tx
        .update(interviewSession)
        .set({
          lifecycleState: nextState,
          lifecycleVersion: sql`${interviewSession.lifecycleVersion} + 1`,
          terminalReason: reason,
          billingFault: sql`CASE
            WHEN ${interviewSession.startContractVersion} = 1
            THEN COALESCE(${interviewSession.billingFault}, ${requestedBillingFault})
            ELSE ${interviewSession.billingFault}
          END`,
          billingFaultCode: sql`CASE
            WHEN ${interviewSession.startContractVersion} = 1
            THEN COALESCE(${interviewSession.billingFaultCode}, ${billingFaultCode ?? reason})
            ELSE ${interviewSession.billingFaultCode}
          END`,
          status: projectLegacyInterviewSessionStatus({
            state: nextState,
            terminalReason: reason,
          }),
          lastTransitionAt: now,
          ...(nextState === "active"
            ? { reconnectDeadlineAt: null, reconnectDeadlineOwner: null }
            : {}),
          ...(nextState === "active" ? { activatedAt: nextActivatedAt } : {}),
          ...(nextState === "ending"
            ? {
                endingAt: nextEndingAt,
                roomCleanupPending: stored.livekitRoomName !== null,
              }
            : {}),
          ...(isInterviewTerminalState(nextState)
            ? {
                endedAt: nextEndedAt,
                ...(!wasTerminal
                  ? {
                      transcriptEvidenceVersion: 1,
                      transcriptEvidenceState: evidenceSnapshot.state,
                      transcriptCutoffAt: cutoffAt,
                      transcriptEvidenceFrozenAt: now,
                    }
                  : {}),
                ...(stored.reconnectDeadlineAt &&
                (reason === "disconnect_timeout" ||
                  reason === "insufficient_signal")
                  ? {}
                  : {
                      reconnectDeadlineAt: null,
                      reconnectDeadlineOwner: null,
                    }),
              }
            : {}),
        })
        .where(
          and(
            eq(interviewSession.id, input.sessionId),
            eq(interviewSession.lifecycleState, state),
            eq(interviewSession.lifecycleVersion, version)
          )
        )
        .returning({
          state: interviewSession.lifecycleState,
          version: interviewSession.lifecycleVersion,
          terminalReason: interviewSession.terminalReason,
          activatedAt: interviewSession.activatedAt,
          endedAt: interviewSession.endedAt,
          billingFault: interviewSession.billingFault,
          billingFaultCode: interviewSession.billingFaultCode,
        });

      if (!updated[0]) {
        throw new Error("Interview lifecycle changed while its row was locked");
      }
      state = updated[0].state;
      version = updated[0].version;
      terminalReason = updated[0].terminalReason;
      activatedAt = nextActivatedAt;
      endingAt = nextEndingAt;
      endedAt = nextEndedAt;
      billingFault = updated[0].billingFault;
      billingFaultCode = updated[0].billingFaultCode;
    };

    if (!wasTerminal) {
      if (state !== "ending") {
        const requestedReason = resolveInterviewTerminalReason(
          validation,
          input.requestedTerminalReason
        );
        const requestedFault = hasIntegrityFault
          ? "integrity"
          : input.requestedTerminalReason === "provider_failure"
            ? "provider"
            : "user";
        billingFaultCode ??=
          requestedFault === "integrity"
            ? "transcript_integrity_unavailable"
            : requestedReason;
        await advance("ending", requestedReason, requestedFault);
      }

      if (state === "ending") {
        if (!terminalReason) {
          throw new Error("Ending interview is missing its terminal reason");
        }
        if (!billingFault) {
          billingFault = hasIntegrityFault
            ? "integrity"
            : terminalReason === "provider_failure"
              ? "provider"
              : "user";
          billingFaultCode = hasIntegrityFault
            ? "transcript_integrity_unavailable"
            : terminalReason;
        }
        await advance(
          deriveInterviewTerminalState({
            reason: terminalReason,
            activated: activatedAt !== null,
          }),
          terminalReason,
          billingFault
        );
      }
    }

    if (!isInterviewTerminalState(state) || !terminalReason || !endedAt) {
      throw new Error("Interview completion did not reach a terminal outcome");
    }

    if (!wasTerminal && evidenceSnapshot.writers.length > 0) {
      await tx.insert(transcriptEvidenceWriterCutoff).values(
        evidenceSnapshot.writers.map((writer) => ({
          sessionId: input.sessionId,
          ...writer,
          frozenAt: now,
        }))
      );
    }

    if (hardDeadlineOwnsCleanup && stored.deadlineRoomCleanupStatus === null) {
      await tx
        .update(interviewSession)
        .set({ deadlineRoomCleanupStatus: "pending" })
        .where(eq(interviewSession.id, input.sessionId));
    }

    if (!wasTerminal) {
      await tx
        .update(interviewSession)
        .set({
          totalTurns: validation.stats.totalTurns,
          totalWords: validation.stats.totalWords,
          durationSeconds: validation.stats.durationSeconds,
        })
        .where(eq(interviewSession.id, input.sessionId));
    }

    const shouldGenerate = state === "completed" && validation.isValid;
    const skippedReason = shouldGenerate
      ? null
      : validation.reasons[0] ||
        `Interview ended as ${state} (${terminalReason})`;
    const inserted = await tx
      .insert(feedback)
      .values({
        sessionId: input.sessionId,
        status: shouldGenerate ? "pending" : "skipped",
        statusReason: skippedReason,
        rubricVersion: "1.0.0",
        completionTier: validation.tier,
        completionStats: validation.stats,
        completionRecommendations: validation.recommendations,
        dispatchStatus: shouldGenerate ? "pending" : "not_required",
        dispatchEventId: shouldGenerate
          ? feedbackGenerationEventId(input.sessionId, 0)
          : null,
      })
      .onConflictDoNothing({ target: feedback.sessionId })
      .returning();

    const feedbackRecord =
      inserted[0] ??
      (
        await tx
          .select()
          .from(feedback)
          .where(eq(feedback.sessionId, input.sessionId))
          .limit(1)
      )[0];
    if (!feedbackRecord) {
      throw new Error("Interview completion is missing its feedback result");
    }

    return {
      ok: true,
      disposition: wasTerminal
        ? inserted[0]
          ? "repaired"
          : "existing"
        : "applied",
      userId: stored.userId,
      roomName: stored.livekitRoomName,
      lifecycle: { state, version, terminalReason, endingAt, endedAt },
      transcriptEvidence,
      feedback: feedbackRecord,
      deadlineRoomCleanupStatus: hardDeadlineOwnsCleanup
        ? (stored.deadlineRoomCleanupStatus ?? "pending")
        : stored.deadlineRoomCleanupStatus,
      stats: feedbackRecord.completionStats ?? validation.stats,
      tier:
        (feedbackRecord.completionTier as SessionValidation["tier"] | null) ??
        validation.tier,
      recommendations:
        feedbackRecord.completionRecommendations ?? validation.recommendations,
    } as const;
  });
}

export function classifyTranscriptEvidence(input: {
  interruptionCount: number;
  runtimeWriterStates: Array<{
    generation: number;
    state: "settled" | "degraded" | null;
  }>;
}): "available" | "degraded" | "missing" {
  if (
    input.interruptionCount > 0 ||
    input.runtimeWriterStates.length === 0 ||
    input.runtimeWriterStates.some((writer) => writer.state === null)
  ) {
    return "missing";
  }
  return input.runtimeWriterStates.some((writer) => writer.state === "degraded")
    ? "degraded"
    : "available";
}

function presentTranscriptEvidence(
  state: TranscriptEvidenceState
): "available" | "partial" | "degraded" | "missing" {
  if (state === "complete") return "available";
  if (state === "partial") return "partial";
  if (state === "degraded") return "degraded";
  return "missing";
}

export function shouldRefineProvisionalTerminalReason(input: {
  state: InterviewLifecycleState;
  terminalReason: InterviewTerminalReason | null;
  isValid: boolean;
  source:
    | "hard_deadline"
    | "reconnect_timeout"
    | "invalid_session_recovery"
    | "user_end";
}): boolean {
  return (
    input.state === "ending" &&
    ((input.source === "hard_deadline" &&
      input.terminalReason === "time_limit") ||
      (input.source === "reconnect_timeout" &&
        input.terminalReason === "disconnect_timeout") ||
      (input.source === "user_end" && input.terminalReason === "user_end")) &&
    !input.isValid
  );
}

export function applyTranscriptIntegrityValidation(input: {
  baseValidation: SessionValidation;
  interruptionCount: number;
  runtimeWriterStates: Array<{
    generation: number;
    state: "settled" | "degraded" | null;
  }>;
}): SessionValidation {
  const writerStates = input.runtimeWriterStates;
  const degradedWriters = writerStates.filter(
    (writer) => writer.state === "degraded"
  );
  const missingWriters = writerStates.filter((writer) => writer.state === null);
  const integrityReasons = [
    ...(writerStates.length === 0
      ? ["Voice runtime writer registration was not confirmed"]
      : []),
    ...(degradedWriters.length > 0
      ? [
          `Voice runtime reported degraded transcript integrity for ${degradedWriters.length} writer generation(s)`,
        ]
      : []),
    ...(missingWriters.length > 0
      ? [
          `Voice runtime transcript settlement was not confirmed for ${missingWriters.length} writer generation(s)`,
        ]
      : []),
    ...(input.interruptionCount > 0
      ? [
          `Transcript integrity unavailable for ${input.interruptionCount} turn(s)`,
        ]
      : []),
  ];
  if (integrityReasons.length === 0) return input.baseValidation;
  return {
    ...input.baseValidation,
    isValid: false,
    reasons: [...integrityReasons, ...input.baseValidation.reasons],
    recommendations: [
      "Retry the interview so every heard turn can be verified",
      ...input.baseValidation.recommendations,
    ],
  };
}

export function resolveInterviewTerminalReason(
  validation: Pick<SessionValidation, "isValid">,
  requestedTerminalReason:
    | "user_end"
    | "time_limit"
    | "provider_failure"
    | "disconnect_timeout"
): InterviewTerminalReason {
  if (requestedTerminalReason === "provider_failure") {
    return "provider_failure";
  }
  return validation.isValid ? requestedTerminalReason : "insufficient_signal";
}

export function shouldPreservePostUsableDisconnectCharge(input: {
  requestedTerminalReason:
    | "user_end"
    | "time_limit"
    | "provider_failure"
    | "disconnect_timeout";
  usableAt: Date | null;
  missingRuntimeSettlement: boolean;
  unavailableInterruptions: number;
}): boolean {
  return (
    input.requestedTerminalReason === "disconnect_timeout" &&
    input.usableAt !== null &&
    input.missingRuntimeSettlement &&
    input.unavailableInterruptions === 0
  );
}

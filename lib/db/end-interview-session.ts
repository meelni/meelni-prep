import { and, asc, eq, sql } from "drizzle-orm";
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
import { feedbackGenerationEventId } from "./feedback-event-id";
import { db } from "./index";
import {
  feedback,
  interviewSession,
  transcriptInterruptionMarker,
  transcriptRuntimeSettlement,
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
  validationOverride?: SessionValidation;
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
        endedAt: Date;
      };
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

    let validation = input.validationOverride;
    let hasIntegrityFault = false;
    if (!validation) {
      const [turns, interruptionCounts, settlements] = await Promise.all([
        tx
          .select({
            contractVersion: transcriptTurn.contractVersion,
            eventId: transcriptTurn.eventId,
            speaker: transcriptTurn.speaker,
            text: transcriptTurn.text,
            startedAt: transcriptTurn.startedAt,
            endedAt: transcriptTurn.endedAt,
          })
          .from(transcriptTurn)
          .where(eq(transcriptTurn.sessionId, input.sessionId))
          .orderBy(
            asc(transcriptTurn.startedAt),
            asc(transcriptTurn.writerId),
            asc(transcriptTurn.sequence),
            asc(transcriptTurn.eventId),
            asc(transcriptTurn.id)
          ),
        tx
          .select({ value: sql<number>`count(*)::int` })
          .from(transcriptInterruptionMarker)
          .where(eq(transcriptInterruptionMarker.sessionId, input.sessionId)),
        tx
          .select({ state: transcriptRuntimeSettlement.state })
          .from(transcriptRuntimeSettlement)
          .where(eq(transcriptRuntimeSettlement.sessionId, input.sessionId))
          .limit(1),
      ]);
      const baseValidation = calculateValidatedSessionFromTurns(turns);
      const unavailableInterruptions = interruptionCounts[0]?.value ?? 0;
      const runtimeSettlementState =
        (settlements[0]?.state as "settled" | "degraded" | undefined) ?? null;
      const preservePostUsableDisconnectCharge =
        shouldPreservePostUsableDisconnectCharge({
          requestedTerminalReason: input.requestedTerminalReason,
          usableAt: stored.usableAt,
          missingRuntimeSettlement: runtimeSettlementState === null,
          unavailableInterruptions,
        });
      hasIntegrityFault =
        (unavailableInterruptions > 0 ||
          runtimeSettlementState !== "settled") &&
        !preservePostUsableDisconnectCharge;
      validation = applyTranscriptIntegrityValidation({
        baseValidation,
        interruptionCount: unavailableInterruptions,
        runtimeSettlementState,
      });
    }

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
          "Hard-deadline reason changed while its row was locked"
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
        const requestedFault = hasIntegrityFault ? "integrity" : "user";
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
      lifecycle: { state, version, terminalReason, endedAt },
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
        input.terminalReason === "disconnect_timeout")) &&
    !input.isValid
  );
}

export function applyTranscriptIntegrityValidation(input: {
  baseValidation: SessionValidation;
  interruptionCount: number;
  runtimeSettlementState: "settled" | "degraded" | null;
}): SessionValidation {
  const integrityReasons = [
    ...(input.runtimeSettlementState === "settled"
      ? []
      : [
          input.runtimeSettlementState === "degraded"
            ? "Voice runtime reported degraded transcript integrity"
            : "Voice runtime transcript settlement was not confirmed",
        ]),
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

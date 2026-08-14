import type { LiveKitEnvironment } from "@/lib/internal/integrations";
import { convergeDrizzleInterviewCreditSettlement } from "@/lib/db/interview-credit-settlement";
import { inngest } from "@/lib/inngest/client";
import { buildInterviewRoomCleanupEvents } from "@/lib/inngest/functions/cleanup-interview-rooms";
import {
  reportInterviewEndStage,
  type InterviewEndStage,
  type InterviewEndStageOutcome,
  type InterviewEndStageReason,
} from "@/lib/operations/interview-end-stage";
import type { InterviewLifecycleSlo } from "@/lib/operations/interview-lifecycle-slo";
import {
  finalizeInterviewSessionWorkflow,
  type InterviewSessionSettlement,
} from "./end-interview-session";
import {
  recoverFeedbackGenerationWorkflow,
  type RecoverFeedbackGenerationResult,
} from "./recover-feedback-generation";
import {
  requestUserEndRuntimeSettlementWorkflow,
  type RequestUserEndRuntimeSettlementResult,
} from "./request-user-end-runtime-settlement";
import type { UserInterviewEndResumeFrom } from "./accept-user-interview-end";
import { reportFeedbackOutcome } from "@/lib/operations/feedback-outcome";

export const BACKGROUND_USER_END_SETTLEMENT_TIMEOUT_MS = 20_000;

export type ExplicitEndRuntimeSettlementDisposition =
  | "settled"
  | "degraded"
  | "runtime_not_ready"
  | "provider_unavailable"
  | "not_found"
  | "failed";

export const DURABLE_USER_END_STEP_IDS = {
  runtimeSettlement: "runtime-settlement-v1",
  finalizeSession: "terminalize-session-v1",
  dispatchFeedback: "dispatch-feedback-v1",
  scheduleCleanup: "schedule-room-cleanup-v1",
  settleCredit: "settle-credit-v1",
} as const;

export interface DurableUserInterviewEndStepRunner {
  run<T>(id: string, work: () => Promise<T>): Promise<T>;
}

export interface DurableUserInterviewEndDeps {
  now(): number;
  requestRuntimeSettlement(input: {
    sessionId: string;
    userId: string;
    env: LiveKitEnvironment | null;
    timeoutMs: number;
  }): Promise<RequestUserEndRuntimeSettlementResult>;
  finalizeSession(input: {
    sessionId: string;
    actor: { type: "user"; userId: string };
    requestedTerminalReason: "user_end";
  }): Promise<{ ok: false; reason: "not_found" } | InterviewSessionSettlement>;
  recoverFeedback(input: {
    sessionId: string;
    userId: string;
  }): Promise<RecoverFeedbackGenerationResult>;
  scheduleCleanup(input: {
    sessionId: string;
    lifecycleVersion: number;
  }): Promise<unknown>;
  settleCredit(sessionId: string): Promise<unknown>;
}

export type DurableUserInterviewEndInput = {
  sessionId: string;
  userId: string;
  env: LiveKitEnvironment | null;
  resumeFrom?: UserInterviewEndResumeFrom;
};

export type UserInterviewEndFinalizationCheckpoint =
  | { ok: false; reason: "not_found" }
  | {
      ok: true;
      disposition: InterviewSessionSettlement["disposition"];
      lifecycleState: InterviewSessionSettlement["lifecycle"]["state"];
      lifecycleVersion: number;
      terminalReason: InterviewSessionSettlement["lifecycle"]["terminalReason"];
      terminalizationDurationMs: number;
      terminalizedAtMs: number;
      roomName: string | null;
      feedbackStatus: InterviewSessionSettlement["feedback"]["status"];
      feedbackDispatchStatus: InterviewSessionSettlement["feedback"]["dispatchStatus"];
      feedbackOutcomeReason: InterviewSessionSettlement["feedback"]["outcomeReason"];
      transcriptEvidence: "available" | "partial" | "degraded" | "missing";
    };

export interface DurableUserInterviewEndResult {
  ok: boolean;
  runtimeSettlement: ExplicitEndRuntimeSettlementDisposition | "not_required";
  finalization: UserInterviewEndFinalizationCheckpoint;
  feedbackDispatch?: DurableFeedbackDispatchCheckpoint;
  cleanup?: "scheduled" | "not_required";
  credit?: "settled";
}

type DurableFeedbackDispatchCheckpoint = {
  status: "queued" | "in_progress" | "already_terminal" | "not_required";
};

export async function durableUserInterviewEndWorkflow(
  input: DurableUserInterviewEndInput,
  steps: DurableUserInterviewEndStepRunner,
  deps: DurableUserInterviewEndDeps = createDurableUserInterviewEndDeps()
): Promise<DurableUserInterviewEndResult> {
  const resumeFrom = input.resumeFrom ?? "runtime_settlement";
  const runtimeSettlement = await steps.run(
    DURABLE_USER_END_STEP_IDS.runtimeSettlement,
    async () => settleRuntime(input, resumeFrom, deps)
  );

  const finalization = await steps.run(
    DURABLE_USER_END_STEP_IDS.finalizeSession,
    () => finalizeSession(input, deps)
  );
  if (!finalization.ok) {
    return { ok: false, runtimeSettlement, finalization };
  }

  const [feedbackDispatch, cleanup, credit] = await Promise.all([
    steps.run(DURABLE_USER_END_STEP_IDS.dispatchFeedback, () =>
      dispatchFeedback(input, finalization, deps)
    ),
    steps.run(DURABLE_USER_END_STEP_IDS.scheduleCleanup, () =>
      scheduleCleanup(input, finalization, deps)
    ),
    steps.run(DURABLE_USER_END_STEP_IDS.settleCredit, () =>
      settleCredit(input, deps)
    ),
  ]);

  return {
    ok: true,
    runtimeSettlement,
    finalization,
    feedbackDispatch,
    cleanup,
    credit,
  };
}

async function settleRuntime(
  input: DurableUserInterviewEndInput,
  resumeFrom: UserInterviewEndResumeFrom,
  deps: DurableUserInterviewEndDeps
): Promise<ExplicitEndRuntimeSettlementDisposition | "not_required"> {
  if (resumeFrom === "feedback_dispatch") {
    reportStage(
      input.sessionId,
      "runtime_settlement",
      "skipped",
      0,
      "already_complete"
    );
    return "not_required";
  }
  const startedAt = deps.now();
  try {
    const result = await deps.requestRuntimeSettlement({
      sessionId: input.sessionId,
      userId: input.userId,
      env: input.env,
      timeoutMs: BACKGROUND_USER_END_SETTLEMENT_TIMEOUT_MS,
    });
    const disposition = classifyRuntimeSettlement(result);
    const durationMs = elapsed(deps, startedAt);
    reportStage(
      input.sessionId,
      "runtime_settlement",
      disposition === "settled" ? "succeeded" : "deferred",
      durationMs,
      runtimeReason(disposition, durationMs)
    );
    return disposition;
  } catch {
    reportStage(
      input.sessionId,
      "runtime_settlement",
      "deferred",
      elapsed(deps, startedAt),
      "runtime_failed"
    );
    return "failed";
  }
}

async function finalizeSession(
  input: DurableUserInterviewEndInput,
  deps: DurableUserInterviewEndDeps
): Promise<UserInterviewEndFinalizationCheckpoint> {
  const startedAt = deps.now();
  try {
    const completion = await deps.finalizeSession({
      sessionId: input.sessionId,
      actor: { type: "user", userId: input.userId },
      requestedTerminalReason: "user_end",
    });
    if (!completion.ok) {
      reportStage(
        input.sessionId,
        "finalize",
        "failed",
        elapsed(deps, startedAt),
        "session_not_found"
      );
      return completion;
    }
    const transcriptEvidence = completion.transcriptEvidence;
    const terminalizationDurationMs =
      lifecycleLatency(
        completion.lifecycle.endingAt,
        completion.lifecycle.endedAt
      ) ?? elapsed(deps, startedAt);
    reportStage(
      input.sessionId,
      "finalize",
      "succeeded",
      terminalizationDurationMs,
      finalizationReason(completion, transcriptEvidence),
      "terminalization"
    );
    if (
      completion.feedback.outcomeReason === "no_reviewable_answer" ||
      completion.feedback.outcomeReason === "transcript_integrity_degraded"
    ) {
      reportFeedbackOutcome({
        outcomeReason: completion.feedback.outcomeReason,
        sessionId: input.sessionId,
      });
    }
    return {
      ok: true,
      disposition: completion.disposition,
      lifecycleState: completion.lifecycle.state,
      lifecycleVersion: completion.lifecycle.version,
      terminalReason: completion.lifecycle.terminalReason,
      terminalizationDurationMs,
      terminalizedAtMs: completion.lifecycle.endedAt.getTime(),
      roomName: completion.roomName,
      feedbackStatus: completion.feedback.status,
      feedbackDispatchStatus: completion.feedback.dispatchStatus,
      feedbackOutcomeReason: completion.feedback.outcomeReason,
      transcriptEvidence,
    };
  } catch (error) {
    reportStage(
      input.sessionId,
      "finalize",
      "failed",
      elapsed(deps, startedAt),
      "stage_exception"
    );
    throw error;
  }
}

async function dispatchFeedback(
  input: DurableUserInterviewEndInput,
  finalization: Extract<UserInterviewEndFinalizationCheckpoint, { ok: true }>,
  deps: DurableUserInterviewEndDeps
): Promise<DurableFeedbackDispatchCheckpoint> {
  const startedAt = deps.now();
  if (
    finalization.feedbackStatus === "skipped" ||
    finalization.feedbackDispatchStatus === "not_required"
  ) {
    reportStage(
      input.sessionId,
      "feedback_dispatch",
      "skipped",
      elapsed(deps, startedAt),
      "feedback_not_required"
    );
    return { status: "not_required" };
  }

  try {
    const recovered = await deps.recoverFeedback({
      sessionId: input.sessionId,
      userId: input.userId,
    });
    if (!recovered.ok) {
      if (recovered.reason === "deadline_settlement_pending") {
        reportStage(
          input.sessionId,
          "feedback_dispatch",
          "deferred",
          elapsed(deps, startedAt),
          "feedback_in_progress"
        );
        return { status: "in_progress" };
      }
      throw new UserInterviewEndStageError("session_not_found");
    }
    if (recovered.disposition === "dispatch_failed") {
      throw new UserInterviewEndStageError("feedback_dispatch_failed");
    }
    if (recovered.disposition === "already_terminal") {
      reportStage(
        input.sessionId,
        "feedback_dispatch",
        "skipped",
        elapsed(deps, startedAt),
        "feedback_not_required"
      );
      return { status: "already_terminal" };
    }
    if (recovered.disposition === "in_progress") {
      reportStage(
        input.sessionId,
        "feedback_dispatch",
        "deferred",
        elapsed(deps, startedAt),
        "feedback_in_progress"
      );
      return { status: "in_progress" };
    }
    reportStage(
      input.sessionId,
      "feedback_dispatch",
      "succeeded",
      lifecycleLatency(
        new Date(finalization.terminalizedAtMs),
        recovered.dispatch?.dispatchedAt ?? null
      ) ?? elapsed(deps, startedAt),
      "feedback_queued",
      "feedback_dispatch"
    );
    return { status: "queued" };
  } catch (error) {
    reportStage(
      input.sessionId,
      "feedback_dispatch",
      "failed",
      elapsed(deps, startedAt),
      error instanceof UserInterviewEndStageError
        ? error.reason
        : "stage_exception"
    );
    throw error;
  }
}

async function scheduleCleanup(
  input: DurableUserInterviewEndInput,
  finalization: Extract<UserInterviewEndFinalizationCheckpoint, { ok: true }>,
  deps: DurableUserInterviewEndDeps
): Promise<"scheduled" | "not_required"> {
  const startedAt = deps.now();
  if (!finalization.roomName) {
    reportStage(
      input.sessionId,
      "cleanup_schedule",
      "skipped",
      elapsed(deps, startedAt),
      "cleanup_not_required"
    );
    return "not_required";
  }
  try {
    await deps.scheduleCleanup({
      sessionId: input.sessionId,
      lifecycleVersion: finalization.lifecycleVersion,
    });
    reportStage(
      input.sessionId,
      "cleanup_schedule",
      "succeeded",
      elapsed(deps, startedAt),
      "cleanup_scheduled"
    );
    return "scheduled";
  } catch (error) {
    reportStage(
      input.sessionId,
      "cleanup_schedule",
      "failed",
      elapsed(deps, startedAt),
      "stage_exception"
    );
    throw error;
  }
}

async function settleCredit(
  input: DurableUserInterviewEndInput,
  deps: DurableUserInterviewEndDeps
): Promise<"settled"> {
  const startedAt = deps.now();
  try {
    await deps.settleCredit(input.sessionId);
    reportStage(
      input.sessionId,
      "credit_settlement",
      "succeeded",
      elapsed(deps, startedAt),
      "credit_settled"
    );
    return "settled";
  } catch (error) {
    reportStage(
      input.sessionId,
      "credit_settlement",
      "failed",
      elapsed(deps, startedAt),
      "stage_exception"
    );
    throw error;
  }
}

function runtimeReason(
  disposition: ExplicitEndRuntimeSettlementDisposition,
  durationMs: number
): InterviewEndStageReason {
  if (
    disposition !== "settled" &&
    durationMs >= BACKGROUND_USER_END_SETTLEMENT_TIMEOUT_MS - 100
  ) {
    return "runtime_timeout";
  }
  if (disposition === "settled") return "runtime_settled";
  if (disposition === "degraded") return "transcript_evidence_degraded";
  if (disposition === "provider_unavailable") return "runtime_unavailable";
  if (disposition === "runtime_not_ready") return "runtime_not_ready";
  if (disposition === "failed") return "runtime_failed";
  return "session_not_found";
}

export function classifyRuntimeSettlement(
  result: RequestUserEndRuntimeSettlementResult
): ExplicitEndRuntimeSettlementDisposition {
  if (!result.ok) return result.reason;
  return result.settlement.settled &&
    !result.settlement.integrityUnavailable &&
    result.settlement.failed === 0
    ? "settled"
    : "degraded";
}

function finalizationReason(
  completion: InterviewSessionSettlement,
  evidence: "available" | "partial" | "degraded" | "missing"
): InterviewEndStageReason {
  if (evidence === "degraded") return "transcript_evidence_degraded";
  if (evidence === "partial") return "transcript_evidence_partial";
  if (evidence === "missing") return "transcript_evidence_missing";
  if (completion.disposition === "existing") return "already_complete";
  if (completion.disposition === "repaired") return "terminal_repaired";
  return "finalized";
}

function elapsed(deps: DurableUserInterviewEndDeps, startedAt: number): number {
  return Math.max(0, deps.now() - startedAt);
}

function reportStage(
  sessionId: string,
  stage: InterviewEndStage,
  outcome: InterviewEndStageOutcome,
  durationMs: number,
  reason: InterviewEndStageReason,
  slo?: InterviewLifecycleSlo
): void {
  reportInterviewEndStage({
    stage,
    outcome,
    durationMs,
    reason,
    sessionId,
    slo,
  });
}

function lifecycleLatency(
  startedAt: Date | null,
  completedAt: Date | null
): number | null {
  if (!startedAt || !completedAt) return null;
  const durationMs = completedAt.getTime() - startedAt.getTime();
  return Number.isFinite(durationMs) ? Math.max(0, durationMs) : null;
}

class UserInterviewEndStageError extends Error {
  constructor(readonly reason: InterviewEndStageReason) {
    super(reason);
    this.name = "UserInterviewEndStageError";
  }
}

export function createDurableUserInterviewEndDeps(): DurableUserInterviewEndDeps {
  return {
    now: () => Date.now(),
    requestRuntimeSettlement: requestUserEndRuntimeSettlementWorkflow,
    finalizeSession: finalizeInterviewSessionWorkflow,
    recoverFeedback: recoverFeedbackGenerationWorkflow,
    scheduleCleanup: ({ sessionId, lifecycleVersion }) =>
      inngest.send(
        buildInterviewRoomCleanupEvents(
          [{ sessionId }],
          `user-end:${lifecycleVersion}`
        )[0]
      ),
    settleCredit: convergeDrizzleInterviewCreditSettlement,
  };
}

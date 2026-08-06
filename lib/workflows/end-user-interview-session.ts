import type { LiveKitEnvironment } from "@/lib/internal/integrations";
import {
  createEndInterviewSessionDeps,
  dispatchInterviewSessionSettlement,
  finalizeInterviewSessionWorkflow,
  type EndInterviewSessionDeps,
  type InterviewSessionSettlement,
} from "./end-interview-session";
import { convergeDrizzleInterviewCreditSettlement } from "@/lib/db/interview-credit-settlement";
import { inngest } from "@/lib/inngest/client";
import { buildInterviewRoomCleanupEvents } from "@/lib/inngest/functions/cleanup-interview-rooms";
import { reportInterviewEndStage } from "@/lib/operations/interview-end-stage";
import {
  requestUserEndRuntimeSettlementWorkflow,
  type RequestUserEndRuntimeSettlementResult,
} from "./request-user-end-runtime-settlement";

export const BACKGROUND_USER_END_SETTLEMENT_TIMEOUT_MS = 20_000;

export type ExplicitEndRuntimeSettlementDisposition =
  | "settled"
  | "degraded"
  | "runtime_not_ready"
  | "provider_unavailable"
  | "not_found"
  | "failed";

export interface EndUserInterviewSessionDeps {
  requestRuntimeSettlement(input: {
    sessionId: string;
    userId: string;
    env: LiveKitEnvironment;
    timeoutMs: number;
  }): Promise<RequestUserEndRuntimeSettlementResult>;
  finalizeSession(input: {
    sessionId: string;
    actor: { type: "user"; userId: string };
    requestedTerminalReason: "user_end";
  }): Promise<{ ok: false; reason: "not_found" } | InterviewSessionSettlement>;
  dispatch(completion: InterviewSessionSettlement): Promise<{
    ok: true;
    completion: InterviewSessionSettlement;
    dispatch: Awaited<ReturnType<EndInterviewSessionDeps["dispatch"]>> | null;
  }>;
  scheduleCleanup(input: {
    sessionId: string;
    lifecycleVersion: number;
  }): Promise<unknown>;
  settleCredit(sessionId: string): Promise<unknown>;
}

export type EndUserInterviewSessionResult =
  | {
      ok: false;
      reason: "not_found";
      runtimeSettlement: ExplicitEndRuntimeSettlementDisposition;
    }
  | {
      ok: true;
      completion: InterviewSessionSettlement;
      dispatch: Awaited<ReturnType<EndInterviewSessionDeps["dispatch"]>> | null;
      runtimeSettlement: ExplicitEndRuntimeSettlementDisposition;
      cleanupScheduleStatus: "scheduled" | "deferred" | "not_required";
      creditSettlementStatus: "settled" | "deferred";
    };

/**
 * Owns the complete explicit-user-end command.
 *
 * Runtime settlement improves transcript evidence, but it can never veto the
 * user's terminal intent. The database finalizer classifies missing or
 * degraded writer evidence and skips feedback when integrity is unavailable.
 */
export async function endUserInterviewSessionWorkflow(
  input: {
    sessionId: string;
    userId: string;
    env: LiveKitEnvironment | null;
  },
  deps: EndUserInterviewSessionDeps = createEndUserInterviewSessionDeps()
): Promise<EndUserInterviewSessionResult> {
  let runtimeSettlement: ExplicitEndRuntimeSettlementDisposition =
    "provider_unavailable";

  if (input.env) {
    const startedAt = Date.now();
    try {
      const settlement = await deps.requestRuntimeSettlement({
        sessionId: input.sessionId,
        userId: input.userId,
        env: input.env,
        timeoutMs: BACKGROUND_USER_END_SETTLEMENT_TIMEOUT_MS,
      });
      runtimeSettlement = classifyRuntimeSettlement(settlement);
    } catch {
      runtimeSettlement = "failed";
    }
    reportInterviewEndStage({
      stage: "runtime_settlement",
      outcome: runtimeSettlement === "settled" ? "succeeded" : "deferred",
      durationMs: Date.now() - startedAt,
      sessionId: input.sessionId,
    });
  }

  const finalizationStartedAt = Date.now();
  const completion = await deps.finalizeSession({
    sessionId: input.sessionId,
    actor: { type: "user", userId: input.userId },
    requestedTerminalReason: "user_end",
  });
  reportInterviewEndStage({
    stage: "finalize",
    outcome: completion.ok ? "succeeded" : "failed",
    durationMs: Date.now() - finalizationStartedAt,
    sessionId: input.sessionId,
  });
  if (!completion.ok) return { ...completion, runtimeSettlement };

  // Feedback is the user-facing critical path. It must not wait for billing
  // convergence or provider-room cleanup, both of which are idempotent and
  // recovered independently.
  const dispatchStartedAt = Date.now();
  const dispatched = await deps.dispatch(completion);
  reportInterviewEndStage({
    stage: "feedback_dispatch",
    outcome:
      dispatched.dispatch === null
        ? "skipped"
        : dispatched.dispatch.ok
          ? "succeeded"
          : "deferred",
    durationMs: Date.now() - dispatchStartedAt,
    sessionId: input.sessionId,
  });
  let cleanupScheduleStatus: "scheduled" | "deferred" | "not_required" =
    "not_required";
  if (completion.roomName) {
    const cleanupStartedAt = Date.now();
    try {
      await deps.scheduleCleanup({
        sessionId: input.sessionId,
        lifecycleVersion: completion.lifecycle.version,
      });
      cleanupScheduleStatus = "scheduled";
    } catch {
      cleanupScheduleStatus = "deferred";
    }
    reportInterviewEndStage({
      stage: "cleanup_schedule",
      outcome: cleanupScheduleStatus === "scheduled" ? "succeeded" : "deferred",
      durationMs: Date.now() - cleanupStartedAt,
      sessionId: input.sessionId,
    });
  }

  let creditSettlementStatus: "settled" | "deferred" = "settled";
  const creditStartedAt = Date.now();
  try {
    await deps.settleCredit(input.sessionId);
  } catch {
    creditSettlementStatus = "deferred";
  }
  reportInterviewEndStage({
    stage: "credit_settlement",
    outcome: creditSettlementStatus === "settled" ? "succeeded" : "deferred",
    durationMs: Date.now() - creditStartedAt,
    sessionId: input.sessionId,
  });

  return {
    ok: true,
    completion,
    dispatch: dispatched.dispatch,
    runtimeSettlement,
    cleanupScheduleStatus,
    creditSettlementStatus,
  };
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

function createEndUserInterviewSessionDeps(): EndUserInterviewSessionDeps {
  const sessionDeps = createEndInterviewSessionDeps();
  return {
    requestRuntimeSettlement: requestUserEndRuntimeSettlementWorkflow,
    finalizeSession: (input) =>
      finalizeInterviewSessionWorkflow(input, sessionDeps),
    dispatch: (completion) =>
      dispatchInterviewSessionSettlement(completion, sessionDeps),
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

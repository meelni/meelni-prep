import {
  authorizeInterviewSessionEnd,
  finalizeInterviewSession,
  type EndInterviewSessionCommand,
  type FinalizeInterviewSessionInput,
  type FinalizeInterviewSessionResult,
} from "@/lib/db/end-interview-session";
import {
  dispatchFeedbackGenerationWorkflow,
  type DispatchFeedbackGenerationResult,
} from "./dispatch-feedback-generation";
import { convergeDrizzleInterviewCreditSettlement } from "@/lib/db/interview-credit-settlement";

export type EndInterviewSessionInput = EndInterviewSessionCommand;

export interface EndInterviewSessionDeps {
  authorize(input: EndInterviewSessionInput): Promise<boolean>;
  finalize(
    input: FinalizeInterviewSessionInput
  ): Promise<FinalizeInterviewSessionResult>;
  settleCredit(sessionId: string): Promise<unknown>;
  dispatch(input: {
    sessionId: string;
    userId: string;
    tier: string;
  }): Promise<DispatchFeedbackGenerationResult>;
}

export type InterviewSessionSettlement = Extract<
  FinalizeInterviewSessionResult,
  { ok: true }
>;

export type InterviewCreditSettlementStatus = "settled" | "deferred";

export type SettleInterviewSessionResult =
  | { ok: false; reason: "not_found" }
  | {
      ok: true;
      completion: InterviewSessionSettlement;
      creditSettlementStatus?: InterviewCreditSettlementStatus;
    };

export type EndInterviewSessionResult =
  | { ok: false; reason: "not_found" }
  | {
      ok: true;
      completion: Extract<FinalizeInterviewSessionResult, { ok: true }>;
      dispatch: DispatchFeedbackGenerationResult | null;
      creditSettlementStatus?: InterviewCreditSettlementStatus;
    };

type DispatchInterviewSessionSettlementResult = {
  ok: true;
  completion: InterviewSessionSettlement;
  dispatch: DispatchFeedbackGenerationResult | null;
};

export async function endInterviewSessionWorkflow(
  input: EndInterviewSessionInput,
  deps: EndInterviewSessionDeps = createEndInterviewSessionDeps()
): Promise<EndInterviewSessionResult> {
  const settlement = await settleInterviewSessionWorkflow(input, deps);
  if (!settlement.ok) return settlement;
  if (settlement.creditSettlementStatus === "deferred") {
    return {
      ok: true,
      completion: settlement.completion,
      dispatch: null,
      creditSettlementStatus: "deferred",
    };
  }
  return {
    ...(await dispatchInterviewSessionSettlement(settlement.completion, deps)),
    creditSettlementStatus: "settled",
  };
}

export async function settleInterviewSessionWorkflow(
  input: EndInterviewSessionInput,
  deps: Pick<
    EndInterviewSessionDeps,
    "authorize" | "finalize" | "settleCredit"
  > = createEndInterviewSessionDeps()
): Promise<SettleInterviewSessionResult> {
  if (!(await deps.authorize(input))) {
    return { ok: false, reason: "not_found" };
  }

  return completeInterviewSession(input, deps);
}

/**
 * Commits terminal session and feedback eligibility truth without coupling it
 * to billing convergence. Background end workflows can dispatch eligible
 * feedback immediately, then reconcile credits independently.
 */
export async function finalizeInterviewSessionWorkflow(
  input: EndInterviewSessionInput,
  deps: Pick<
    EndInterviewSessionDeps,
    "authorize" | "finalize"
  > = createEndInterviewSessionDeps()
): Promise<FinalizeInterviewSessionResult> {
  if (!(await deps.authorize(input))) {
    return { ok: false, reason: "not_found" };
  }
  return deps.finalize(input);
}

async function completeInterviewSession(
  input: EndInterviewSessionInput,
  deps: Pick<EndInterviewSessionDeps, "finalize" | "settleCredit">
): Promise<SettleInterviewSessionResult> {
  const completion = await deps.finalize(input);
  if (!completion.ok) return completion;

  // Terminal truth is durable at this point. Credit convergence is idempotent
  // and recoverable, so a transient billing-store failure must not turn a
  // committed interview completion into a client-visible end failure.
  try {
    await deps.settleCredit(input.sessionId);
    return { ok: true, completion, creditSettlementStatus: "settled" };
  } catch {
    return { ok: true, completion, creditSettlementStatus: "deferred" };
  }
}

export async function dispatchInterviewSessionSettlement(
  completion: InterviewSessionSettlement,
  deps: Pick<
    EndInterviewSessionDeps,
    "dispatch"
  > = createEndInterviewSessionDeps()
): Promise<DispatchInterviewSessionSettlementResult> {
  if (completion.deadlineRoomCleanupStatus === "pending") {
    return { ok: true, completion, dispatch: null };
  }

  const shouldDispatch =
    (completion.feedback.status === "pending" ||
      completion.feedback.status === "failed") &&
    completion.feedback.dispatchStatus !== "not_required";
  let dispatch: DispatchFeedbackGenerationResult | null = null;
  if (shouldDispatch) {
    try {
      dispatch = await deps.dispatch({
        sessionId: completion.feedback.sessionId,
        userId: completion.userId,
        tier: completion.tier,
      });
    } catch {
      dispatch = {
        ok: false,
        disposition: "failed",
        dispatch: {
          sessionId: completion.feedback.sessionId,
          eventId: completion.feedback.dispatchEventId,
          status: completion.feedback.dispatchStatus,
          attempts: completion.feedback.dispatchAttempts,
          claimedAt: completion.feedback.dispatchClaimedAt,
          dispatchedAt: completion.feedback.dispatchedAt,
        },
      };
    }
  }

  return { ok: true, completion, dispatch };
}

export function createEndInterviewSessionDeps(): EndInterviewSessionDeps {
  return {
    authorize: authorizeInterviewSessionEnd,
    finalize: finalizeInterviewSession,
    settleCredit: convergeDrizzleInterviewCreditSettlement,
    dispatch: dispatchFeedbackGenerationWorkflow,
  };
}

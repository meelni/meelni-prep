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

export type EndInterviewSessionInput = EndInterviewSessionCommand;

export interface EndInterviewSessionDeps {
  authorize(input: EndInterviewSessionInput): Promise<boolean>;
  finalize(
    input: FinalizeInterviewSessionInput
  ): Promise<FinalizeInterviewSessionResult>;
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

export type SettleInterviewSessionResult =
  | { ok: false; reason: "not_found" }
  | { ok: true; completion: InterviewSessionSettlement };

export type EndInterviewSessionResult =
  | { ok: false; reason: "not_found" }
  | {
      ok: true;
      completion: Extract<FinalizeInterviewSessionResult, { ok: true }>;
      dispatch: DispatchFeedbackGenerationResult | null;
    };

export async function endInterviewSessionWorkflow(
  input: EndInterviewSessionInput,
  deps: EndInterviewSessionDeps = createEndInterviewSessionDeps()
): Promise<EndInterviewSessionResult> {
  const settlement = await settleInterviewSessionWorkflow(input, deps);
  if (!settlement.ok) return settlement;
  return dispatchInterviewSessionSettlement(settlement.completion, deps);
}

export async function settleInterviewSessionWorkflow(
  input: EndInterviewSessionInput,
  deps: Pick<
    EndInterviewSessionDeps,
    "authorize" | "finalize"
  > = createEndInterviewSessionDeps()
): Promise<SettleInterviewSessionResult> {
  if (!(await deps.authorize(input))) {
    return { ok: false, reason: "not_found" };
  }

  return completeInterviewSession(input, deps);
}

async function completeInterviewSession(
  input: EndInterviewSessionInput,
  deps: Pick<EndInterviewSessionDeps, "finalize">
): Promise<SettleInterviewSessionResult> {
  const completion = await deps.finalize(input);
  if (!completion.ok) return completion;

  return { ok: true, completion };
}

export async function dispatchInterviewSessionSettlement(
  completion: InterviewSessionSettlement,
  deps: Pick<
    EndInterviewSessionDeps,
    "dispatch"
  > = createEndInterviewSessionDeps()
): Promise<Extract<EndInterviewSessionResult, { ok: true }>> {
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
    dispatch: dispatchFeedbackGenerationWorkflow,
  };
}

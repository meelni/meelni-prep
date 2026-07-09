import {
  finalizeInterviewSession,
  type FinalizeInterviewSessionResult,
} from "@/lib/db/end-interview-session";
import {
  validateSessionCompleteness,
  type SessionValidation,
} from "@/lib/evaluation/session-validator";
import {
  dispatchFeedbackGenerationWorkflow,
  type DispatchFeedbackGenerationResult,
} from "./dispatch-feedback-generation";

export interface EndInterviewSessionInput {
  sessionId: string;
  userId: string;
}

export interface EndInterviewSessionDeps {
  validate(sessionId: string): Promise<SessionValidation>;
  finalize(input: {
    sessionId: string;
    userId: string;
    validation: SessionValidation;
  }): Promise<FinalizeInterviewSessionResult>;
  dispatch(input: {
    sessionId: string;
    userId: string;
    tier: string;
  }): Promise<DispatchFeedbackGenerationResult>;
}

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
  const validation = await deps.validate(input.sessionId);
  const completion = await deps.finalize({ ...input, validation });
  if (!completion.ok) return completion;

  const shouldDispatch =
    completion.feedback.status === "pending" &&
    completion.feedback.dispatchStatus !== "not_required";
  let dispatch: DispatchFeedbackGenerationResult | null = null;
  if (shouldDispatch) {
    try {
      dispatch = await deps.dispatch({
        ...input,
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
    validate: validateSessionCompleteness,
    finalize: finalizeInterviewSession,
    dispatch: dispatchFeedbackGenerationWorkflow,
  };
}

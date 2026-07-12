import {
  authorizeInterviewSessionEnd,
  finalizeInterviewSession,
  type EndInterviewSessionCommand,
  type FinalizeInterviewSessionInput,
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
import { checkAndAwardAchievements } from "@/lib/achievements";
import { updateStreak } from "@/lib/streaks";

export type EndInterviewSessionInput = EndInterviewSessionCommand;

export interface EndInterviewSessionDeps {
  authorize(input: EndInterviewSessionInput): Promise<boolean>;
  validate(sessionId: string): Promise<SessionValidation>;
  finalize(
    input: FinalizeInterviewSessionInput
  ): Promise<FinalizeInterviewSessionResult>;
  dispatch(input: {
    sessionId: string;
    userId: string;
    tier: string;
  }): Promise<DispatchFeedbackGenerationResult>;
  updateMotivation(userId: string): Promise<void>;
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
  if (!(await deps.authorize(input))) {
    return { ok: false, reason: "not_found" };
  }

  const validation = await deps.validate(input.sessionId);
  return completeInterviewSession(input, validation, deps);
}

export async function endInterviewSessionWithValidationWorkflow(
  input: EndInterviewSessionInput,
  validation: SessionValidation,
  deps: EndInterviewSessionDeps = createEndInterviewSessionDeps()
): Promise<EndInterviewSessionResult> {
  if (!(await deps.authorize(input))) {
    return { ok: false, reason: "not_found" };
  }

  return completeInterviewSession(input, validation, deps);
}

async function completeInterviewSession(
  input: EndInterviewSessionInput,
  validation: SessionValidation,
  deps: EndInterviewSessionDeps
): Promise<EndInterviewSessionResult> {
  const completion = await deps.finalize({ ...input, validation });
  if (!completion.ok) return completion;

  const shouldDispatch =
    (completion.feedback.status === "pending" ||
      completion.feedback.status === "failed") &&
    completion.feedback.dispatchStatus !== "not_required";
  let dispatch: DispatchFeedbackGenerationResult | null = null;
  if (shouldDispatch) {
    try {
      dispatch = await deps.dispatch({
        sessionId: input.sessionId,
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

  if (
    completion.disposition === "applied" &&
    completion.lifecycle.state === "completed"
  ) {
    try {
      await deps.updateMotivation(completion.userId);
    } catch (error) {
      console.error("Failed to update completion motivation:", error);
    }
  }

  return { ok: true, completion, dispatch };
}

export function createEndInterviewSessionDeps(): EndInterviewSessionDeps {
  return {
    authorize: authorizeInterviewSessionEnd,
    validate: validateSessionCompleteness,
    finalize: finalizeInterviewSession,
    dispatch: dispatchFeedbackGenerationWorkflow,
    updateMotivation: updateCompletionMotivation,
  };
}

async function updateCompletionMotivation(userId: string): Promise<void> {
  try {
    await updateStreak(userId);
  } catch (error) {
    console.error("Failed to update completion streak:", error);
  }
  try {
    await checkAndAwardAchievements(userId);
  } catch (error) {
    console.error("Failed to update completion achievements:", error);
  }
}

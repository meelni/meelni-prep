import {
  isInterviewTerminalState,
  type InterviewLifecycleState,
  type InterviewTerminalReason,
} from "@meelni/core";

import {
  createDrizzleFeedbackGenerationStore,
  isFeedbackGenerationLeaseExpired,
  type FeedbackGenerationRecord,
  type FeedbackGenerationStore,
} from "@/lib/db/feedback-generation-state";
import { hasAccountDeletionTombstone } from "@/lib/db/account-deletions";
import { getSessionById } from "@/lib/db/sessions";
import {
  hasInterviewDeadlineRoomCleanupClaim,
  isInterviewDeadlineRoomCleanupAcknowledged,
} from "@/lib/db/session-deadlines";
import {
  dispatchFeedbackGenerationWorkflow,
  type DispatchFeedbackGenerationResult,
} from "./dispatch-feedback-generation";
import { endInterviewSessionWorkflow } from "./end-interview-session";

export interface RecoverFeedbackGenerationInput {
  sessionId: string;
  userId: string;
}

interface RecoverySession {
  userId: string;
  lifecycleState: InterviewLifecycleState;
  terminalReason: InterviewTerminalReason | null;
  deadlineRoomCleanupStatus:
    | "pending"
    | "deleted"
    | "already_absent"
    | null;
}

export interface RecoverFeedbackGenerationDeps {
  store: FeedbackGenerationStore;
  now(): Date;
  isDeletionPending(userId: string): Promise<boolean>;
  getSession(sessionId: string): Promise<RecoverySession | null>;
  dispatch(input: {
    sessionId: string;
    userId: string;
    tier: string;
  }): Promise<DispatchFeedbackGenerationResult>;
  repairMissing(input: RecoverFeedbackGenerationInput): Promise<boolean>;
}

export type RecoverFeedbackGenerationResult =
  | {
      ok: false;
      reason:
        | "not_found"
        | "session_not_ended"
        | "deadline_settlement_pending";
    }
  | {
      ok: true;
      status: "pending" | "processing" | "completed" | "failed" | "skipped";
      disposition:
        | "queued"
        | "dispatch_failed"
        | "in_progress"
        | "already_terminal";
      retryable: boolean;
      dispatch: DispatchFeedbackGenerationResult["dispatch"] | null;
    };

export async function recoverFeedbackGenerationWorkflow(
  input: RecoverFeedbackGenerationInput,
  deps: RecoverFeedbackGenerationDeps = createRecoverFeedbackGenerationDeps()
): Promise<RecoverFeedbackGenerationResult> {
  const session = await deps.getSession(input.sessionId);
  if (!session || session.userId !== input.userId) {
    return { ok: false, reason: "not_found" };
  }
  if (await deps.isDeletionPending(input.userId)) {
    return { ok: false, reason: "not_found" };
  }
  if (
    session.lifecycleState !== "ending" &&
    !isInterviewTerminalState(session.lifecycleState)
  ) {
    return { ok: false, reason: "session_not_ended" };
  }
  if (
    hasInterviewDeadlineRoomCleanupClaim(session) &&
    !isInterviewDeadlineRoomCleanupAcknowledged(session)
  ) {
    return { ok: false, reason: "deadline_settlement_pending" };
  }

  let generation = await deps.store.get(input.sessionId);
  if (!generation) {
    if (!(await deps.repairMissing(input))) {
      return { ok: false, reason: "not_found" };
    }
    generation = await deps.store.get(input.sessionId);
    if (!generation) return { ok: false, reason: "not_found" };
  }

  if (generation.status === "completed" || generation.status === "skipped") {
    return terminalResult(generation);
  }
  if (
    generation.status === "processing" &&
    !isFeedbackGenerationLeaseExpired(generation, deps.now())
  ) {
    return {
      ok: true,
      status: "processing",
      disposition: "in_progress",
      retryable: false,
      dispatch: null,
    };
  }

  if (
    generation.status === "failed" ||
    isFeedbackGenerationLeaseExpired(generation, deps.now())
  ) {
    const prepared = await deps.store.prepareRetry({
      sessionId: input.sessionId,
      now: deps.now(),
    });
    generation = prepared.record;
    if (!generation) return { ok: false, reason: "not_found" };
    if (generation.status === "completed" || generation.status === "skipped") {
      return terminalResult(generation);
    }
    if (generation.status === "processing") {
      return {
        ok: true,
        status: "processing",
        disposition: "in_progress",
        retryable: false,
        dispatch: null,
      };
    }
  }

  if (generation.status !== "pending") {
    return {
      ok: true,
      status: "failed",
      disposition: "dispatch_failed",
      retryable: false,
      dispatch: null,
    };
  }

  if (!generation.completionTier) {
    return {
      ok: true,
      status: "failed",
      disposition: "dispatch_failed",
      retryable: false,
      dispatch: null,
    };
  }

  const dispatched = await deps.dispatch({
    sessionId: input.sessionId,
    userId: input.userId,
    tier: generation.completionTier,
  });
  if (dispatched.ok) {
    return {
      ok: true,
      status: "pending",
      disposition:
        dispatched.disposition === "in_progress" ? "in_progress" : "queued",
      retryable: false,
      dispatch: dispatched.dispatch,
    };
  }
  return {
    ok: true,
    status: "pending",
    disposition: "dispatch_failed",
    retryable: dispatched.disposition === "failed",
    dispatch: dispatched.dispatch,
  };
}

export function createRecoverFeedbackGenerationDeps(): RecoverFeedbackGenerationDeps {
  return {
    store: createDrizzleFeedbackGenerationStore(),
    now: () => new Date(),
    isDeletionPending: hasAccountDeletionTombstone,
    async getSession(sessionId) {
      const session = await getSessionById(sessionId);
      return session
        ? {
            userId: session.userId,
            lifecycleState: session.lifecycleState,
            terminalReason: session.terminalReason,
            deadlineRoomCleanupStatus: session.deadlineRoomCleanupStatus,
          }
        : null;
    },
    dispatch: dispatchFeedbackGenerationWorkflow,
    async repairMissing(input) {
      const result = await endInterviewSessionWorkflow({
        sessionId: input.sessionId,
        actor: { type: "user", userId: input.userId },
        requestedTerminalReason: "user_end",
      });
      return result.ok;
    },
  };
}

function terminalResult(
  generation: FeedbackGenerationRecord
): RecoverFeedbackGenerationResult {
  return {
    ok: true,
    status: generation.status as "completed" | "skipped",
    disposition: "already_terminal",
    retryable: false,
    dispatch: null,
  };
}

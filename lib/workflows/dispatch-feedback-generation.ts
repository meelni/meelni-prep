import {
  createDrizzleFeedbackDispatchStore,
  FEEDBACK_DISPATCH_LEASE_MS,
  type FeedbackDispatchRecord,
  type FeedbackDispatchStore,
} from "@/lib/db/feedback-dispatch";
import { inngest } from "@/lib/inngest/client";
import {
  readOwnedInterviewSessionCorrelationId,
  reportOperationalFailure,
  type InterviewSessionCorrelationId,
} from "@/lib/operations/operational-events";

export interface DispatchFeedbackGenerationInput {
  sessionId: string;
  userId: string;
  tier: string;
}

export interface DispatchFeedbackGenerationDeps {
  store: FeedbackDispatchStore;
  now(): Date;
  reportFailure(correlationId: InterviewSessionCorrelationId | null): void;
  send(event: {
    id: string;
    name: "feedback/generate.requested";
    data: DispatchFeedbackGenerationInput;
  }): Promise<unknown>;
}

export type DispatchFeedbackGenerationResult =
  | {
      ok: true;
      disposition: "sent" | "already_sent";
      dispatch: FeedbackDispatchRecord;
    }
  | { ok: true; disposition: "in_progress"; dispatch: FeedbackDispatchRecord }
  | {
      ok: false;
      disposition: "failed";
      dispatch: FeedbackDispatchRecord | null;
    }
  | {
      ok: false;
      disposition: "not_found" | "not_required";
      dispatch: FeedbackDispatchRecord | null;
    };

export async function dispatchFeedbackGenerationWorkflow(
  input: DispatchFeedbackGenerationInput,
  deps: DispatchFeedbackGenerationDeps = createDispatchFeedbackGenerationDeps()
): Promise<DispatchFeedbackGenerationResult> {
  const correlationId = readOwnedInterviewSessionCorrelationId({
    kind: "owned_interview_session",
    session: { id: input.sessionId, userId: input.userId },
    authenticatedUserId: input.userId,
  });
  const now = deps.now();
  const claimed = await deps.store.claim({
    sessionId: input.sessionId,
    now,
    staleBefore: new Date(now.getTime() - FEEDBACK_DISPATCH_LEASE_MS),
  });

  if (!claimed) {
    const current = await deps.store.get(input.sessionId);
    if (!current) {
      return { ok: false, disposition: "not_found", dispatch: null };
    }
    if (current.status === "sent") {
      return { ok: true, disposition: "already_sent", dispatch: current };
    }
    if (current.status === "sending") {
      return { ok: true, disposition: "in_progress", dispatch: current };
    }
    return { ok: false, disposition: "not_required", dispatch: current };
  }

  if (!claimed.eventId) {
    try {
      await deps.store.markFailed({
        sessionId: input.sessionId,
        eventId: null,
        attempt: claimed.attempts,
        errorCode: "missing_event_id",
      });
    } finally {
      deps.reportFailure(correlationId);
    }
    return { ok: false, disposition: "failed", dispatch: claimed };
  }

  try {
    await deps.send({
      id: claimed.eventId,
      name: "feedback/generate.requested",
      data: input,
    });
    const acknowledged = await deps.store.markSent({
      sessionId: input.sessionId,
      eventId: claimed.eventId,
      attempt: claimed.attempts,
      now: deps.now(),
    });
    const dispatch = (await deps.store.get(input.sessionId)) ?? claimed;
    if (!acknowledged) return mapUnclaimedDispatch(dispatch);
    return { ok: true, disposition: "sent", dispatch };
  } catch {
    try {
      await deps.store.markFailed({
        sessionId: input.sessionId,
        eventId: claimed.eventId,
        attempt: claimed.attempts,
        errorCode: "feedback_dispatch_failed",
      });
    } finally {
      deps.reportFailure(correlationId);
    }
    const dispatch = await deps.store.get(input.sessionId);
    return { ok: false, disposition: "failed", dispatch };
  }
}

function mapUnclaimedDispatch(
  dispatch: FeedbackDispatchRecord
): DispatchFeedbackGenerationResult {
  if (dispatch.status === "sent") {
    return { ok: true, disposition: "already_sent", dispatch };
  }
  if (dispatch.status === "sending") {
    return { ok: true, disposition: "in_progress", dispatch };
  }
  if (dispatch.status === "failed") {
    return { ok: false, disposition: "failed", dispatch };
  }
  return { ok: false, disposition: "not_required", dispatch };
}

export function createDispatchFeedbackGenerationDeps(): DispatchFeedbackGenerationDeps {
  return {
    store: createDrizzleFeedbackDispatchStore(),
    now: () => new Date(),
    reportFailure: (correlationId) =>
      reportOperationalFailure({
        operation: "feedback_dispatch",
        errorCode: "feedback_dispatch_failed",
        severity: "critical",
        retryable: true,
        correlationId,
      }),
    send: (event) => inngest.send(event),
  };
}

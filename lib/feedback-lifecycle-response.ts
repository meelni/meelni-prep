import {
  decodeFeedbackLifecycleResponse,
  presentCompletedFeedback,
  type FeedbackLifecycleResponse,
  type PersistedCompletedFeedback,
  type PersistedFeedbackEvidenceTurn,
} from "@meelni/core";

export const DISPATCH_FAILED_CUSTOMER_MESSAGE =
  "Your interview is saved, but feedback could not be queued.";

export function buildDispatchFailedFeedbackLifecycleResponse(
  retryable: boolean
): Extract<FeedbackLifecycleResponse, { status: "dispatch_failed" }> {
  return {
    status: "dispatch_failed",
    retryable,
    message: DISPATCH_FAILED_CUSTOMER_MESSAGE,
    outcomeReason: "dispatch_failed",
  };
}

export function buildCompletedFeedbackLifecycleResponse(
  record: PersistedCompletedFeedback,
  evidenceTurns: readonly PersistedFeedbackEvidenceTurn[]
): Extract<FeedbackLifecycleResponse, { status: "completed" }> {
  return {
    status: "completed",
    retryable: false,
    feedback: presentCompletedFeedback(record, { evidenceTurns }),
  };
}

export function buildSkippedFeedbackLifecycleResponse(record: {
  outcomeReason: unknown;
  completionTier: unknown;
  completionStats: unknown;
}): Extract<FeedbackLifecycleResponse, { status: "skipped" }> | null {
  const candidate = {
    status: "skipped",
    retryable: false,
    details: {
      outcomeReason:
        record.outcomeReason === "transcript_integrity_degraded"
          ? "transcript_integrity_degraded"
          : "no_reviewable_answer",
      tier:
        record.completionTier === "abandoned" ? "abandoned" : "insufficient",
      ...(record.completionStats !== null
        ? { stats: record.completionStats }
        : {}),
      reasons: [],
      recommendations: [],
    },
  };
  const decoded = decodeFeedbackLifecycleResponse(candidate);
  return decoded?.status === "skipped" ? decoded : null;
}

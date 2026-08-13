import {
  decodeFeedbackLifecycleResponse,
  presentCompletedFeedback,
  type FeedbackLifecycleResponse,
  type CandidateAnswerBlock,
  type PersistedCompletedFeedback,
  type PersistedFeedbackEvidenceTurn,
  type RoundType,
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
  evidenceTurns: readonly PersistedFeedbackEvidenceTurn[],
  answerBlocks: readonly CandidateAnswerBlock[] = [],
  expectedRoundType?: RoundType,
  frozenEvidenceState?: "complete" | "partial",
  scoreWithheldReason?: "rubric_coverage" | "verified_evidence_integrity"
): Extract<FeedbackLifecycleResponse, { status: "completed" }> {
  return {
    status: "completed",
    retryable: false,
    feedback: presentCompletedFeedback(record, {
      evidenceTurns,
      answerBlocks,
      expectedRoundType,
      frozenEvidenceState,
      scoreWithheldReason,
    }),
  };
}

export function buildSkippedFeedbackLifecycleResponse(record: {
  outcomeReason: unknown;
  completionTier: unknown;
  completionStats: unknown;
  creditSettlementAction?: unknown;
  creditSettledAt?: unknown;
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
      recovery:
        record.outcomeReason === "transcript_integrity_degraded"
          ? (record.creditSettlementAction === "refund" ||
              record.creditSettlementAction === "release") &&
            record.creditSettledAt !== null &&
            record.creditSettledAt !== undefined
            ? "credit_returned"
            : "credit_recovery_in_progress"
          : "start_another_interview",
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

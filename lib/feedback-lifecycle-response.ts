import {
  classifyFrozenFeedbackTranscriptReadiness,
  classifySkippedFeedbackLifecycle,
  decodeFeedbackLifecycleResponse,
  decodeSavedInterviewWorkspace,
  isValidRoundType,
  presentCompletedFeedback,
  SAVED_INTERVIEW_WORKSPACE_VERSION,
  type FeedbackLifecycleResponse,
  type CandidateAnswerBlock,
  type PersistedCompletedFeedback,
  type PersistedFeedbackEvidenceTurn,
  type RoundType,
  type SavedInterviewWorkspace,
  type TrustedAnswerBlockProjection,
} from "@meelni/core";

export const DISPATCH_FAILED_CUSTOMER_MESSAGE =
  "Your interview is saved, but feedback could not be queued.";

export function buildSavedInterviewWorkspace(input: {
  roundType: unknown;
  lifecycleState: unknown;
  transcriptEvidenceVersion: unknown;
  transcriptEvidenceState: unknown;
  transcriptCutoffAt: unknown;
  transcriptEvidenceFrozenAt: unknown;
  question: { text: unknown; company: unknown } | null;
}): SavedInterviewWorkspace | null {
  if (
    typeof input.roundType !== "string" ||
    !isValidRoundType(input.roundType)
  ) {
    return null;
  }

  const questionCandidate = input.question
    ? { text: input.question.text, company: input.question.company }
    : null;
  const readiness = classifyFrozenFeedbackTranscriptReadiness(input);
  const frozenTranscript =
    readiness === "not_ready"
      ? input.lifecycleState === "ending"
        ? "pending"
        : "unavailable"
      : readiness;

  const candidate = {
    version: SAVED_INTERVIEW_WORKSPACE_VERSION,
    saved: true,
    roundType: input.roundType,
    question: questionCandidate,
    frozenTranscript,
  };
  const decoded = decodeSavedInterviewWorkspace(candidate);
  if (decoded) return decoded;

  return decodeSavedInterviewWorkspace({ ...candidate, question: null });
}

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
  scoreWithheldReason?: "rubric_coverage" | "verified_evidence_integrity",
  verifiedPrefixProjection?: TrustedAnswerBlockProjection
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
      verifiedPrefixProjection,
    }),
  };
}

export function buildSkippedFeedbackLifecycleResponse(
  record: {
    status: unknown;
    outcomeReason: unknown;
    completionTier: unknown;
    creditSettlementAction?: unknown;
    creditSettledAt?: unknown;
  },
  options: {
    reviewRecoveryAvailable?: boolean;
  } = {}
): Extract<FeedbackLifecycleResponse, { status: "skipped" }> | null {
  const classification = classifySkippedFeedbackLifecycle(record);
  if (!classification) return null;

  const reviewRecoveryAvailable =
    classification.outcomeReason === "transcript_integrity_degraded" &&
    options.reviewRecoveryAvailable === true;

  const candidate = {
    status: "skipped",
    retryable: reviewRecoveryAvailable,
    details: {
      outcome: "unable_to_review",
      scoreWithheldReason:
        classification.outcomeReason === "transcript_integrity_degraded"
          ? "verified_evidence_integrity"
          : "rubric_coverage",
      recovery:
        classification.outcomeReason === "transcript_integrity_degraded"
          ? reviewRecoveryAvailable
            ? "review_recovery_available"
            : (record.creditSettlementAction === "refund" ||
                  record.creditSettlementAction === "release") &&
                record.creditSettledAt !== null &&
                record.creditSettledAt !== undefined
              ? "credit_returned"
              : record.creditSettledAt === null ||
                  record.creditSettledAt === undefined
                ? "credit_recovery_in_progress"
                : null
          : "start_another_interview",
    },
  };
  const decoded = decodeFeedbackLifecycleResponse(candidate);
  return decoded?.status === "skipped" ? decoded : null;
}

export const FEEDBACK_OUTCOME_REASONS = [
  "feedback_generated",
  "no_reviewable_answer",
  "transcript_integrity_degraded",
  "dispatch_failed",
  "generation_failed",
] as const;

export type FeedbackOutcomeReason = (typeof FEEDBACK_OUTCOME_REASONS)[number];

const FEEDBACK_OUTCOME_REASON_SET = new Set<string>(FEEDBACK_OUTCOME_REASONS);

export function isFeedbackOutcomeReason(
  value: unknown
): value is FeedbackOutcomeReason {
  return typeof value === "string" && FEEDBACK_OUTCOME_REASON_SET.has(value);
}

export type SkippedFeedbackOutcomeReason = Extract<
  FeedbackOutcomeReason,
  "no_reviewable_answer" | "transcript_integrity_degraded"
>;

export type SkippedFeedbackCompletionTier =
  | "full"
  | "partial"
  | "insufficient"
  | "abandoned"
  | null;

export interface SkippedFeedbackLifecycleClassification {
  outcomeReason: SkippedFeedbackOutcomeReason;
  completionTier: SkippedFeedbackCompletionTier;
}

/**
 * Classify only coherent persisted skipped tuples. Integrity recovery is
 * independent of candidate coverage, so it may retain any validated coverage
 * tier or have no tier when terminalization precedes answer validation. A
 * missing or scoreable tier is not valid for candidate-evidence insufficiency.
 */
export function classifySkippedFeedbackLifecycle(value: {
  status: unknown;
  outcomeReason: unknown;
  completionTier: unknown;
}): SkippedFeedbackLifecycleClassification | null {
  if (value.status !== "skipped") return null;

  if (value.outcomeReason === "no_reviewable_answer") {
    return value.completionTier === "insufficient" ||
      value.completionTier === "abandoned"
      ? {
          outcomeReason: value.outcomeReason,
          completionTier: value.completionTier,
        }
      : null;
  }

  if (value.outcomeReason === "transcript_integrity_degraded") {
    return value.completionTier === null ||
      value.completionTier === "full" ||
      value.completionTier === "partial" ||
      value.completionTier === "insufficient" ||
      value.completionTier === "abandoned"
      ? {
          outcomeReason: value.outcomeReason,
          completionTier: value.completionTier,
        }
      : null;
  }

  return null;
}

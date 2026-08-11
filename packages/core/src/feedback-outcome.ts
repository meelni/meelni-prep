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

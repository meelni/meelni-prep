import { SessionTier } from "@/lib/evaluation/session-validator";
import type { SkippedFeedbackOutcomeReason } from "@meelni/core";

export type StoredCompletionTier =
  | "full"
  | "partial"
  | "insufficient"
  | "abandoned"
  | null;

export type FeedbackGenerationEligibility =
  | { disposition: "committed_eligible"; tier: SessionTier }
  | { disposition: "committed_ineligible"; tier: StoredCompletionTier }
  | { disposition: "legacy_requires_validation"; tier: null };

export interface FeedbackLateValidationSkip {
  status: "skipped";
  statusReason: SkippedFeedbackOutcomeReason;
}

export function resolveFeedbackGenerationEligibility(
  tier: StoredCompletionTier
): FeedbackGenerationEligibility {
  if (tier === SessionTier.FULL) {
    return { disposition: "committed_eligible", tier: SessionTier.FULL };
  }
  if (tier === SessionTier.PARTIAL) {
    return { disposition: "committed_eligible", tier: SessionTier.PARTIAL };
  }
  if (tier === null) {
    return { disposition: "legacy_requires_validation", tier };
  }
  return { disposition: "committed_ineligible", tier };
}

export function resolveFeedbackLateValidationSkip(
  reason: SkippedFeedbackOutcomeReason
): FeedbackLateValidationSkip {
  return { status: "skipped", statusReason: reason };
}

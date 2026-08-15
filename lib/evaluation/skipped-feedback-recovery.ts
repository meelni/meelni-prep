import type { SkippedFeedbackOutcomeReason } from "@meelni/core";

import {
  prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot,
  type FrozenCandidateAnswerBlockEvidenceSnapshot,
} from "./session-validator";

export type SkippedFeedbackRecoveryEvaluation =
  | {
      eligible: true;
      completionTier: "partial";
      evidenceFailureReason: null;
      trustedBlockCount: number;
    }
  | {
      eligible: false;
      completionTier: null;
      evidenceFailureReason: SkippedFeedbackOutcomeReason;
      trustedBlockCount: number;
    };

/**
 * Revalidate a previously skipped review from its immutable frozen ledger.
 * Recovery never upgrades the original completion claim and fails closed when
 * the current trusted authority cannot project at least one closed answer.
 */
export function evaluateSkippedFeedbackRecovery(
  evidence: FrozenCandidateAnswerBlockEvidenceSnapshot
): SkippedFeedbackRecoveryEvaluation {
  if (!evidence.snapshotValid || evidence.snapshotState === null) {
    return {
      eligible: false,
      completionTier: null,
      evidenceFailureReason: "transcript_integrity_degraded",
      trustedBlockCount: 0,
    };
  }

  const prepared =
    prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot(evidence);
  if (!prepared.eligible || prepared.blocks.length === 0) {
    return {
      eligible: false,
      completionTier: null,
      evidenceFailureReason:
        prepared.evidenceFailureReason ?? "transcript_integrity_degraded",
      trustedBlockCount: prepared.blocks.length,
    };
  }

  return {
    eligible: true,
    completionTier: "partial",
    evidenceFailureReason: null,
    trustedBlockCount: prepared.blocks.length,
  };
}

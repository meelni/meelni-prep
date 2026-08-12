import {
  hasEvidenceLimitedCandidateResponseSignal,
  hasSubstantiveCandidateResponseSignal,
} from "./feedback-language-policy";

export {
  analyzeEvidenceLimitedCandidateResponseSignal,
  type EvidenceLimitedCandidateResponseAnalysis,
} from "./feedback-language-policy";

export const FEEDBACK_ELIGIBILITY_POLICY = {
  partial: {
    minSubstantiveResponses: 1,
  },
  full: {
    minScoreableResponses: 5,
  },
} as const;

export const FEEDBACK_NUMERICAL_PRECISION_POLICY = {
  minScoreableResponses: 4,
} as const;

export type CandidateResponseEvidenceLevel =
  | "insufficient"
  | "evidence_limited"
  | "scoreable";

/**
 * Keep qualitative eligibility distinct from numerical-score precision.
 * Quantitative gates are owned by the caller so this contract can classify
 * only canonical, replay-normalized candidate evidence.
 */
export function classifyCandidateResponseEvidence(input: {
  text: string;
  passesQuantitativeGates: boolean;
}): CandidateResponseEvidenceLevel {
  if (!input.passesQuantitativeGates) return "insufficient";
  if (hasSubstantiveCandidateResponseSignal(input.text)) return "scoreable";
  return hasEvidenceLimitedCandidateResponseSignal(input.text)
    ? "evidence_limited"
    : "insufficient";
}

export const VERIFIED_PREFIX_SCORECARD_CALIBRATION_VERSION =
  "verified-prefix-scorecard-calibration.v2" as const;

export type VerifiedPrefixScorecardCalibrationFamily =
  | "historical_full"
  | "verified_prefix_sparse"
  | "verified_prefix_coaching"
  | "authority_unavailable";

export interface VerifiedPrefixScorecardCalibrationCase {
  id: string;
  provenance: "fully_synthetic";
  version: typeof VERIFIED_PREFIX_SCORECARD_CALIBRATION_VERSION;
  family: VerifiedPrefixScorecardCalibrationFamily;
  authorityCaseId: string;
  coverageCaseId: string | null;
  expectedOutcome:
    | "full_scorecard"
    | "coaching_review"
    | "unable_to_review_integrity";
}

export const VERIFIED_PREFIX_SCORECARD_CALIBRATION_CASES = [
  calibrationCase(
    "historical-complete-scorecard",
    "historical_full",
    "segmentation-1",
    "complete-product_sense",
    "full_scorecard"
  ),
  calibrationCase(
    "verified-prefix-sparse-coaching",
    "verified_prefix_sparse",
    "terminal-preserving-marker",
    "spoken-product-choice",
    "coaching_review"
  ),
  calibrationCase(
    "verified-prefix-coaching-only",
    "verified_prefix_coaching",
    "terminal-preserving-marker",
    "concise-strategy-bet",
    "coaching_review"
  ),
  calibrationCase(
    "candidate-marker-unavailable",
    "authority_unavailable",
    "candidate-marker",
    null,
    "unable_to_review_integrity"
  ),
] as const satisfies readonly VerifiedPrefixScorecardCalibrationCase[];

function calibrationCase(
  id: string,
  family: VerifiedPrefixScorecardCalibrationFamily,
  authorityCaseId: string,
  coverageCaseId: string | null,
  expectedOutcome: VerifiedPrefixScorecardCalibrationCase["expectedOutcome"]
): VerifiedPrefixScorecardCalibrationCase {
  return {
    id,
    provenance: "fully_synthetic",
    version: VERIFIED_PREFIX_SCORECARD_CALIBRATION_VERSION,
    family,
    authorityCaseId,
    coverageCaseId,
    expectedOutcome,
  };
}

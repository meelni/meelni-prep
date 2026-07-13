import assert from "node:assert/strict";
import test from "node:test";

import { getCalibrationCliExitCode } from "./calibration-cli";
import type { EvaluationCalibrationReport } from "./calibration";

test("live CLI fails when provider passes but adjudication keeps evidence pending", () => {
  const report = reportWithGate({
    liveProviderAcceptance: "passed",
    calibrationEvidenceAcceptance: "pending_adjudication_signoff",
  });
  assert.equal(getCalibrationCliExitCode("live_provider", report), 1);
});

test("live CLI succeeds only for combined calibration evidence acceptance", () => {
  const report = reportWithGate({
    liveProviderAcceptance: "passed",
    calibrationEvidenceAcceptance: "passed",
  });
  assert.equal(getCalibrationCliExitCode("live_provider", report), 0);
});

function reportWithGate(
  gate: Pick<
    EvaluationCalibrationReport["gate"],
    "liveProviderAcceptance" | "calibrationEvidenceAcceptance"
  >
): EvaluationCalibrationReport {
  return {
    gate: {
      deterministicHarness: "not_run",
      adjudicationAcceptance: "pending_product_owner_pm_signoff",
      ...gate,
    },
    corpus: { expectedStateMismatches: 0, invalidEvidenceAnchors: 0 },
    metrics: { insufficientHandlingRate: 1 },
  } as EvaluationCalibrationReport;
}

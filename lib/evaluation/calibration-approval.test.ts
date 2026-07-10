import assert from "node:assert/strict";
import test from "node:test";
import {
  EVALUATION_ADJUDICATION_VERSION,
  EVALUATION_GOLD_SET_VERSION,
  evaluationCalibrationCases,
} from "@meelni/test-fixtures";

import {
  getEvaluationAdjudicationHashes,
  parseEvaluationAdjudicationApproval,
} from "./calibration-approval";

test("approval contract covers exactly the 32 scored candidates, not validator negatives", () => {
  const approval = parseEvaluationAdjudicationApproval(testApproval());
  assert.equal(approval.decisions.length, 32);
  const insufficientIds = new Set(
    evaluationCalibrationCases
      .filter(
        ({ expectedCompletionState }) =>
          expectedCompletionState === "insufficient"
      )
      .map(({ id }) => id)
  );
  assert.ok(
    approval.decisions.every(({ caseId }) => !insufficientIds.has(caseId))
  );
});

test("approval contract rejects stale candidate or corpus hashes", () => {
  assert.throws(
    () =>
      parseEvaluationAdjudicationApproval({
        ...testApproval(),
        candidateArtifactHash: "0".repeat(64),
      }),
    /candidateArtifactHash mismatch/
  );
  assert.throws(
    () =>
      parseEvaluationAdjudicationApproval({
        ...testApproval(),
        corpusHash: "0".repeat(64),
      }),
    /corpusHash mismatch/
  );
});

export function testApproval(changesRequiredCaseId?: string) {
  return {
    contractVersion: "evaluation-adjudication-approval.v1",
    ...getEvaluationAdjudicationHashes(),
    goldSetVersion: EVALUATION_GOLD_SET_VERSION,
    adjudicationVersion: EVALUATION_ADJUDICATION_VERSION,
    reviewer: { identity: "test-reviewer", role: "product_owner" },
    reviewedAt: "2026-07-10T16:00:00.000Z",
    decisions: evaluationCalibrationCases
      .filter(({ expectedQuality }) => expectedQuality !== null)
      .map(({ id }) => ({
        caseId: id,
        decision:
          id === changesRequiredCaseId ? "changes_required" : "approved",
      })),
  };
}

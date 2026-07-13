import assert from "node:assert/strict";
import test from "node:test";
import {
  EVALUATION_ADJUDICATION_VERSION,
  EVALUATION_GOLD_SET_VERSION,
  evaluationCalibrationCases,
} from "@meelni/test-fixtures";

import {
  buildDelegatedEvaluationAdjudicationApproval,
  getEvaluationAdjudicationHashes,
  parseEvaluationAdjudicationApproval,
} from "./calibration-approval";

test("delegated product-owner approval records two exact-hash panels without a fabricated human identity", () => {
  const approval = buildDelegatedEvaluationAdjudicationApproval();
  assert.equal(approval.reviewer.identityType, "delegated_task_thread");
  assert.equal(approval.delegatedAuthority?.humanReviewerIdentity, null);
  assert.equal(approval.delegatedAuthority?.panels.length, 2);
  assert.equal(approval.decisions.length, 32);
  assert.ok(
    approval.decisions.every(({ decision }) => decision === "approved")
  );
});

test("delegated approval rejects fabricated identity, duplicate panels, and stale panel hashes", () => {
  const approval = buildDelegatedEvaluationAdjudicationApproval();
  assert.throws(
    () =>
      parseEvaluationAdjudicationApproval({
        ...approval,
        reviewer: { ...approval.reviewer, identity: "invented-human-name" },
      }),
    /Invalid delegated approval reviewer identity/
  );
  assert.throws(
    () =>
      parseEvaluationAdjudicationApproval({
        ...approval,
        delegatedAuthority: {
          ...approval.delegatedAuthority,
          panels: [
            approval.delegatedAuthority!.panels[0],
            approval.delegatedAuthority!.panels[0],
          ],
        },
      }),
    /must be independent/
  );
  assert.throws(
    () =>
      parseEvaluationAdjudicationApproval({
        ...approval,
        delegatedAuthority: {
          ...approval.delegatedAuthority,
          panels: approval.delegatedAuthority!.panels.map((panel, index) =>
            index === 0
              ? { ...panel, candidateArtifactHash: "0".repeat(64) }
              : panel
          ),
        },
      }),
    /Invalid delegated approval agent-panel signoff/
  );
});

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
    contractVersion: "evaluation-adjudication-approval.v2",
    ...getEvaluationAdjudicationHashes(),
    goldSetVersion: EVALUATION_GOLD_SET_VERSION,
    adjudicationVersion: EVALUATION_ADJUDICATION_VERSION,
    reviewer: { identity: "test-reviewer", role: "product_owner" },
    reviewBasis: {
      candidateManifestVersion: "evaluation-adjudication-review.v2",
      independentExactHashReview: true,
    },
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

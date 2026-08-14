import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { projectTrustedClosedAnswerBlocks } from "@meelni/core";
import {
  TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES,
  TRUSTED_ANSWER_BLOCK_CALIBRATION_VERSION,
} from "@meelni/test-fixtures";

test("trusted-answer-block calibration is versioned, synthetic, and family-complete", () => {
  assert.equal(
    TRUSTED_ANSWER_BLOCK_CALIBRATION_VERSION,
    "trusted-answer-block-calibration.v1"
  );
  assert.equal(
    new Set(TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES.map(({ id }) => id)).size,
    TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES.length
  );
  assert.ok(
    TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES.every(
      ({ provenance }) => provenance === "fully_synthetic"
    )
  );
  for (const family of [
    "segmentation",
    "terminal_preserving_marker",
    "candidate_marker",
    "canonicalization_failure",
    "sequence_gap",
    "writer_drift",
    "degraded_writer",
    "cutoff_conflict",
    "exact_replay",
    "conflicting_replay",
    "historical_authority",
  ] as const) {
    assert.ok(
      TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES.some(
        (entry) => entry.family === family
      ),
      family
    );
  }
});

test("trusted-answer-block calibration corpus is hash-bound", () => {
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES))
      .digest("hex"),
    "fc234949fc7058b15f436f1a2cf5dda2a31a2ed112c4889bb3e883b15cfce4ae"
  );
});

test("trusted-answer-block calibration produces only its closed outcomes", () => {
  for (const entry of TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES) {
    const projection = projectTrustedClosedAnswerBlocks(
      entry.events,
      entry.authority
    );
    assert.equal(projection.status, entry.expectedStatus, entry.id);
    assert.equal(
      projection.failureReason,
      entry.expectedFailureReason,
      entry.id
    );
    assert.deepEqual(
      projection.trustedBlocks.map(({ responseText }) => responseText),
      entry.expectedTrustedResponseTexts,
      entry.id
    );
    assert.deepEqual(
      projection.excludedBlocks.map(({ answerBlockId }) => answerBlockId),
      entry.expectedExcludedAnswerBlockIds,
      entry.id
    );
  }
});

test("segmentation calibration preserves the same trusted identities", () => {
  const identities = TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES.filter(
    ({ family }) => family === "segmentation"
  ).map(
    (entry) =>
      projectTrustedClosedAnswerBlocks(entry.events, entry.authority)
        .trustedBlockIdentities
  );

  assert.equal(identities.length, 4);
  for (const identity of identities) assert.deepEqual(identity, identities[0]);
});

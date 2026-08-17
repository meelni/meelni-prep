import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  parseDimensionCoverageProviderSelection,
  projectTrustedClosedAnswerBlocks,
  type DimensionCoverageProviderSelection,
} from "@meelni/core";
import {
  DIMENSION_COVERAGE_CALIBRATION_CASES,
  TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES,
  VERIFIED_PREFIX_SCORECARD_CALIBRATION_CASES,
  VERIFIED_PREFIX_SCORECARD_CALIBRATION_VERSION,
} from "@meelni/test-fixtures";

test("verified-prefix scorecard calibration is synthetic and outcome-complete", () => {
  assert.equal(
    VERIFIED_PREFIX_SCORECARD_CALIBRATION_VERSION,
    "verified-prefix-scorecard-calibration.v2"
  );
  assert.equal(
    new Set(VERIFIED_PREFIX_SCORECARD_CALIBRATION_CASES.map(({ id }) => id))
      .size,
    VERIFIED_PREFIX_SCORECARD_CALIBRATION_CASES.length
  );
  assert.deepEqual(
    new Set(
      VERIFIED_PREFIX_SCORECARD_CALIBRATION_CASES.map(({ family }) => family)
    ),
    new Set([
      "historical_full",
      "verified_prefix_sparse",
      "verified_prefix_coaching",
      "authority_unavailable",
    ])
  );
  assert.ok(
    VERIFIED_PREFIX_SCORECARD_CALIBRATION_CASES.every(
      ({ provenance }) => provenance === "fully_synthetic"
    )
  );
});

test("verified-prefix scorecard calibration corpus is hash-bound", () => {
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(VERIFIED_PREFIX_SCORECARD_CALIBRATION_CASES))
      .digest("hex"),
    "8b92c53988a3ead4903db7d284c6ff78d991b61b90ce4d79fa00c89c4013bfe4"
  );
});

test("verified-prefix calibration produces only the adjudicated outcome", () => {
  for (const entry of VERIFIED_PREFIX_SCORECARD_CALIBRATION_CASES) {
    const authorityCase = TRUSTED_ANSWER_BLOCK_CALIBRATION_CASES.find(
      ({ id }) => id === entry.authorityCaseId
    );
    assert.ok(authorityCase, entry.id);
    const projection = projectTrustedClosedAnswerBlocks(
      authorityCase.events,
      authorityCase.authority
    );

    if (entry.expectedOutcome === "unable_to_review_integrity") {
      assert.equal(projection.status, "integrity_failure", entry.id);
      assert.equal(projection.trustedBlocks.length, 0, entry.id);
      continue;
    }

    const coverageCase = DIMENSION_COVERAGE_CALIBRATION_CASES.find(
      ({ id }) => id === entry.coverageCaseId
    );
    assert.ok(coverageCase?.facetCounts, entry.id);
    assert.ok(projection.trustedBlocks[0], entry.id);
    const verifiedPrefix = entry.family !== "historical_full";
    if (verifiedPrefix) assert.equal(projection.status, "verified_prefix");

    const result = parseDimensionCoverageProviderSelection(
      selection(
        coverageCase,
        projection.trustedBlocks[0].answerBlockId,
        !verifiedPrefix || projection.numericalScoreAuthority === "allowed"
      ),
      {
        roundType: coverageCase.roundType,
        answerBlocks: projection.trustedBlocks,
        modelVersion: "synthetic-verified-prefix-calibration-v1",
        allowNumericalScores: true,
        ...(verifiedPrefix ? { verifiedPrefixProjection: projection } : {}),
      }
    );

    assert.equal(result.mode, entry.expectedOutcome, entry.id);
    assert.equal(
      result.overallScore,
      entry.family === "historical_full" ? 8 : null
    );
    assert.equal(
      result.schemaVersion,
      verifiedPrefix
        ? "feedback.dimension-coverage.v2"
        : "feedback.dimension-coverage.v1",
      entry.id
    );
  }
});

function selection(
  entry: (typeof DIMENSION_COVERAGE_CALIBRATION_CASES)[number],
  answerBlockRef: string,
  allowNumericalScores: boolean
): DimensionCoverageProviderSelection {
  assert.ok(entry.facetCounts);
  const dimensions = {} as DimensionCoverageProviderSelection["dimensions"];
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const facetCount = entry.facetCounts[dimension];
    dimensions[dimension] = {
      score: allowNumericalScores && facetCount === 2 ? 8 : null,
      evidence: ROUND_DIMENSION_COVERAGE_CONFIG[entry.roundType][
        dimension
      ].facets
        .slice(0, facetCount)
        .map((facet) => ({ facetCode: facet.code, answerBlockRef })),
    };
  }
  return {
    schemaVersion: FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
    promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
    rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
    roundType: entry.roundType,
    dimensions,
  };
}

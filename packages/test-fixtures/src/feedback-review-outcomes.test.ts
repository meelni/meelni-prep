import assert from "node:assert/strict";
import test from "node:test";

import {
  SYNTHETIC_FEEDBACK_REVIEW_DIMENSIONS,
  SYNTHETIC_FEEDBACK_REVIEW_OUTCOMES,
  createSyntheticFeedbackReviewOutcomeFixtures,
} from "./feedback-review-outcomes";

test("synthetic fixtures cover all three customer outcomes and both withheld-reason families", () => {
  const fixtures = createSyntheticFeedbackReviewOutcomeFixtures();
  assert.deepEqual(
    [...new Set(fixtures.map((fixture) => fixture.expected.outcome))].sort(),
    [...SYNTHETIC_FEEDBACK_REVIEW_OUTCOMES].sort()
  );
  assert.deepEqual(
    new Set(
      fixtures.flatMap((fixture) =>
        fixture.expected.withheldReason ? [fixture.expected.withheldReason] : []
      )
    ),
    new Set(["rubric_coverage", "verified_evidence_integrity"])
  );
  assert.ok(
    fixtures.every((fixture) => fixture.provenance === "fully_synthetic")
  );
});

test("SAV-369 equivalent transcript segmentation preserves SAV-421 coverage and scores", () => {
  for (const fixture of createSyntheticFeedbackReviewOutcomeFixtures()) {
    const results = fixture.sourceVariants.flatMap((variant) =>
      variant.coverageResult ? [variant.coverageResult] : []
    );
    if (results.length === 0) continue;
    const canonical = results[0]!;
    for (const result of results.slice(1)) {
      assert.deepEqual(result, canonical, `${fixture.id}:coverage-result`);
    }
    for (const variant of fixture.sourceVariants) {
      assert.equal(variant.answerBlocks.length, 2, fixture.id);
      assert.deepEqual(
        variant.answerBlocks.map((block) => block.responseText),
        fixture.sourceVariants[0]!.answerBlocks.map(
          (block) => block.responseText
        ),
        `${fixture.id}:${variant.segmentCount}:answer-blocks`
      );
    }
  }
});

test("scorecards are complete while incomplete coverage stays scoreless", () => {
  const fixtures = createSyntheticFeedbackReviewOutcomeFixtures();
  const scorecard = fixtures.find(
    (fixture) => fixture.expected.outcome === "scorecard"
  )!;
  const incomplete = fixtures.find(
    (fixture) => fixture.id === "incomplete-coverage-coaching"
  )!;

  assert.deepEqual(
    scorecard.expected.dimensions.map((entry) => entry.dimension),
    SYNTHETIC_FEEDBACK_REVIEW_DIMENSIONS
  );
  assert.ok(
    scorecard.expected.dimensions.every(
      (entry) => entry.state === "scored" && entry.score !== null
    )
  );
  assert.equal(
    scorecard.sourceVariants[0]!.coverageResult?.mode,
    "full_scorecard"
  );
  assert.equal(scorecard.expected.displayOverallScore, 8);
  assert.equal(scorecard.expected.numericMetricContribution.overall, true);

  assert.equal(
    incomplete.sourceVariants[0]!.coverageResult?.mode,
    "coaching_review"
  );
  assert.equal(incomplete.expected.displayOverallScore, null);
  assert.equal(incomplete.expected.numericMetricContribution.overall, false);
  assert.deepEqual(
    incomplete.expected.numericMetricContribution.dimensions,
    []
  );
  assert.ok(
    incomplete.expected.dimensions.every(
      (entry) => entry.state === "unscored" && entry.score === null
    )
  );
});

test("coaching fixtures are grounded, scoreless, and reason-specific", () => {
  const coaching = createSyntheticFeedbackReviewOutcomeFixtures().filter(
    (fixture) => fixture.expected.outcome === "coaching_review"
  );
  assert.equal(coaching.length, 3);
  for (const fixture of coaching) {
    assert.equal(
      fixture.sourceVariants[0]!.coverageResult?.mode,
      "coaching_review"
    );
    assert.equal(fixture.expected.displayOverallScore, null);
    assert.deepEqual(fixture.expected.numericMetricContribution, {
      overall: false,
      dimensions: [],
    });
    assert.equal(fixture.expected.prioritizedPracticeFocus, true);
    assert.ok(fixture.expected.exactCandidateCitation);
    assert.ok(
      fixture.sourceVariants[0]!.answerBlocks.some(
        (block) =>
          block.responseText === fixture.expected.exactCandidateCitation
      )
    );
  }
});

test("unable outcomes never fabricate scores or coaching and enumerate recovery truth", () => {
  const unable = createSyntheticFeedbackReviewOutcomeFixtures().filter(
    (fixture) => fixture.expected.outcome === "unable_to_review"
  );
  for (const fixture of unable) {
    assert.equal(fixture.expected.displayOverallScore, null);
    assert.equal(fixture.expected.exactCandidateCitation, null);
    assert.equal(fixture.expected.prioritizedPracticeFocus, false);
    assert.deepEqual(fixture.expected.numericMetricContribution, {
      overall: false,
      dimensions: [],
    });
  }
  const coverage = unable.find(
    (fixture) => fixture.expected.withheldReason === "rubric_coverage"
  )!;
  assert.equal(coverage.sourceIntegrity, "verified");
  assert.equal(coverage.expected.recovery, "start_another_interview");
  assert.ok(
    coverage.sourceVariants.every(
      (variant) => variant.answerBlocks.length === 0
    )
  );

  const integrity = unable.filter(
    (fixture) =>
      fixture.expected.withheldReason === "verified_evidence_integrity"
  );
  assert.deepEqual(
    new Set(integrity.map((fixture) => fixture.expected.recovery)),
    new Set([
      "credit_returned",
      "credit_recovery_in_progress",
      "review_recovery_available",
      null,
    ])
  );
  const reviewRecovery = integrity.find(
    (fixture) => fixture.expected.recovery === "review_recovery_available"
  )!;
  assert.equal(reviewRecovery.sourceIntegrity, "verified");
  assert.ok(
    reviewRecovery.sourceVariants.every(
      (variant) => variant.answerBlocks.length > 0
    )
  );
  assert.ok(
    integrity
      .filter(
        (fixture) => fixture.expected.recovery !== "review_recovery_available"
      )
      .every((fixture) => fixture.sourceIntegrity === "failed")
  );
});

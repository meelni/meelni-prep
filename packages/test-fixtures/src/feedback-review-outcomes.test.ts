import assert from "node:assert/strict";
import test from "node:test";

import {
  SYNTHETIC_FEEDBACK_REVIEW_DIMENSIONS,
  SYNTHETIC_FEEDBACK_REVIEW_OUTCOMES,
  createSyntheticFeedbackReviewOutcomeFixtures,
} from "./feedback-review-outcomes";

test("synthetic review fixtures cover the four customer outcomes", () => {
  const fixtures = createSyntheticFeedbackReviewOutcomeFixtures();
  assert.deepEqual(
    [...new Set(fixtures.map((fixture) => fixture.expected.outcome))].sort(),
    [...SYNTHETIC_FEEDBACK_REVIEW_OUTCOMES].sort()
  );
  assert.ok(
    fixtures.every((fixture) => fixture.provenance === "fully_synthetic")
  );
});

test("equivalent transcript segmentation preserves derived answer blocks and exact citations", () => {
  for (const fixture of createSyntheticFeedbackReviewOutcomeFixtures()) {
    assert.deepEqual(
      fixture.sourceVariants.map((variant) => variant.id),
      ["segmented", "merged"]
    );
    const answerBlockSets = fixture.sourceVariants.map((variant) =>
      [
        ...new Set(
          variant.events.flatMap((event) =>
            event.answerBlockId ? [event.answerBlockId] : []
          )
        ),
      ].sort()
    );
    assert.deepEqual(answerBlockSets[0], answerBlockSets[1], fixture.id);

    for (const signal of fixture.expected.signals) {
      for (const variant of fixture.sourceVariants) {
        assert.ok(
          variant.events.some(
            (event) =>
              event.speaker === "candidate" &&
              event.text.includes(signal.citation)
          ),
          `${fixture.id}:${variant.id}:${signal.citation}`
        );
      }
    }
  }
});

test("full and partial scorecards expose only supported numerical evidence", () => {
  const fixtures = createSyntheticFeedbackReviewOutcomeFixtures();
  const full = fixtures.find(
    (fixture) => fixture.expected.outcome === "full_scorecard"
  );
  const partial = fixtures.find(
    (fixture) => fixture.expected.outcome === "partial_scorecard"
  );
  assert.ok(full);
  assert.ok(partial);

  assert.deepEqual(
    full.expected.dimensions.map((entry) => entry.dimension),
    SYNTHETIC_FEEDBACK_REVIEW_DIMENSIONS
  );
  assert.ok(
    full.expected.dimensions.every(
      (entry) => entry.state === "scored" && entry.score !== null
    )
  );
  assert.equal(full.expected.numericMetricContribution.overall, true);
  assert.notEqual(full.expected.displayOverallScore, null);

  assert.equal(partial.expected.displayOverallScore, null);
  assert.equal(partial.expected.numericMetricContribution.overall, false);
  assert.ok(
    partial.expected.dimensions.some(
      (entry) => entry.state === "not_enough_evidence" && entry.score === null
    )
  );
  assert.deepEqual(
    partial.expected.numericMetricContribution.dimensions.sort(),
    partial.expected.dimensions
      .filter((entry) => entry.state === "scored")
      .map((entry) => entry.dimension)
      .sort()
  );
});

test("scoreless outcomes never contribute numbers and coaching has one focus", () => {
  for (const fixture of createSyntheticFeedbackReviewOutcomeFixtures()) {
    if (
      fixture.expected.outcome !== "coaching_review" &&
      fixture.expected.outcome !== "unable_to_review"
    ) {
      continue;
    }
    assert.equal(fixture.expected.displayOverallScore, null, fixture.id);
    assert.deepEqual(
      fixture.expected.numericMetricContribution,
      { overall: false, dimensions: [] },
      fixture.id
    );
    assert.ok(
      fixture.expected.dimensions.every((entry) => entry.score === null),
      fixture.id
    );
    if (fixture.expected.outcome === "coaching_review") {
      assert.ok(fixture.expected.signals.length > 0);
      assert.ok(fixture.expected.prioritizedPracticeFocus);
    } else {
      assert.deepEqual(fixture.expected.signals, []);
      assert.equal(fixture.expected.prioritizedPracticeFocus, null);
    }
  }
});

test("unable fixtures distinguish rubric coverage from system integrity recovery", () => {
  const unable = createSyntheticFeedbackReviewOutcomeFixtures().filter(
    (fixture) => fixture.expected.outcome === "unable_to_review"
  );
  const coverage = unable.filter(
    (fixture) => fixture.expected.withheldReason === "rubric_coverage"
  );
  const integrity = unable.filter(
    (fixture) =>
      fixture.expected.withheldReason === "verified_evidence_integrity"
  );

  assert.ok(
    coverage.every(
      (fixture) =>
        fixture.sourceIntegrity === "verified" &&
        fixture.expected.recovery === "start_another_interview"
    )
  );
  assert.deepEqual(
    new Set(integrity.map((fixture) => fixture.expected.recovery)),
    new Set(["retry_review", "credit_returned", "credit_recovery_in_progress"])
  );
  assert.ok(integrity.every((fixture) => fixture.sourceIntegrity === "failed"));
});

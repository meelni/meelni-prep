import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
  aggregateFeedbackQualitySignals,
  deriveFeedbackQualityOutcome,
  isFeedbackQualitySelectionValid,
  parseFeedbackQualitySignalCommand,
  parseFeedbackQualitySignalView,
  type FeedbackQualityAggregateInput,
} from "./feedback-quality";

test("quality commands accept only the exact closed v1 shape", () => {
  assert.deepEqual(
    parseFeedbackQualitySignalCommand({
      contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
      response: "helpful",
      reason: null,
      expectedRevision: null,
    }),
    {
      contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
      response: "helpful",
      reason: null,
      expectedRevision: null,
    }
  );
  for (const value of [
    {
      contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
      response: "helpful",
      reason: null,
      expectedRevision: null,
      comment: "free text",
    },
    {
      contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
      response: "other",
      reason: null,
      expectedRevision: null,
    },
    {
      contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
      response: "helpful",
      reason: ["next_step_unclear"],
      expectedRevision: null,
    },
    {
      contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
      response: "helpful",
      reason: null,
      expectedRevision: 0,
    },
  ]) {
    assert.equal(parseFeedbackQualitySignalCommand(value), null);
  }
});

test("quality reason compatibility is outcome and response aware", () => {
  assert.equal(
    isFeedbackQualitySelectionValid("full_scorecard", "helpful", null),
    true
  );
  assert.equal(
    isFeedbackQualitySelectionValid(
      "full_scorecard",
      "not_helpful",
      "score_explanation_unclear"
    ),
    true
  );
  assert.equal(
    isFeedbackQualitySelectionValid(
      "coaching_review",
      "not_helpful",
      "score_explanation_unclear"
    ),
    false
  );
  assert.equal(
    isFeedbackQualitySelectionValid(
      "partial_scorecard",
      "not_helpful",
      "score_withholding_unclear"
    ),
    false
  );
  assert.equal(
    isFeedbackQualitySelectionValid(
      "coaching_review",
      "helpful",
      "next_step_unclear"
    ),
    false
  );
});

test("quality eligibility consumes canonical presentation kinds only", () => {
  assert.equal(
    deriveFeedbackQualityOutcome({
      kind: "dimension-coverage",
      mode: "partial_scorecard",
    } as never),
    "partial_scorecard"
  );
  assert.equal(
    deriveFeedbackQualityOutcome({ kind: "evidence-limited" } as never),
    "coaching_review"
  );
  assert.equal(deriveFeedbackQualityOutcome({ kind: "v2" } as never), null);
  assert.equal(deriveFeedbackQualityOutcome({ kind: "legacy" } as never), null);
});

test("signal views reject incompatible or noncanonical state", () => {
  const base = {
    contractVersion: FEEDBACK_QUALITY_SIGNAL_CONTRACT_VERSION,
    outcome: "coaching_review",
    response: "not_helpful",
    reason: "score_withholding_unclear",
    revision: 1,
    createdAt: "2026-08-13T12:00:00.000Z",
    updatedAt: "2026-08-13T12:00:00.000Z",
  } as const;
  assert.deepEqual(parseFeedbackQualitySignalView(base), base);
  assert.equal(
    parseFeedbackQualitySignalView({
      ...base,
      reason: "score_explanation_unclear",
    }),
    null
  );
  assert.equal(
    parseFeedbackQualitySignalView({
      ...base,
      updatedAt: "2026-08-13T11:59:59.000Z",
    }),
    null
  );
});

test("aggregates suppress a whole outcome when one complement has nine users", () => {
  const rows: FeedbackQualityAggregateInput[] = [];
  for (let index = 0; index < 10; index += 1) {
    rows.push({
      userKey: `helpful-${index}`,
      outcome: "full_scorecard",
      response: "helpful",
      reason: null,
    });
  }
  for (let index = 0; index < 9; index += 1) {
    rows.push({
      userKey: `unclear-${index}`,
      outcome: "full_scorecard",
      response: "not_helpful",
      reason: "next_step_unclear",
    });
  }
  assert.deepEqual(aggregateFeedbackQualitySignals(rows).outcomes, []);

  rows.push({
    userKey: "unclear-9",
    outcome: "full_scorecard",
    response: "not_helpful",
    reason: "next_step_unclear",
  });
  const aggregate = aggregateFeedbackQualitySignals(rows);
  assert.equal(aggregate.outcomes.length, 1);
  assert.equal(aggregate.outcomes[0]?.distinctUsers, 20);
  assert.equal(aggregate.outcomes[0]?.responseCount, 20);
});

test("repeated reviews count once for the privacy threshold", () => {
  const rows = Array.from({ length: 20 }, () => ({
    userKey: "one-user",
    outcome: "coaching_review" as const,
    response: "helpful" as const,
    reason: null,
  }));
  assert.deepEqual(aggregateFeedbackQualitySignals(rows).outcomes, []);
});

test("aggregate input fails closed on invalid reason combinations", () => {
  assert.throws(
    () =>
      aggregateFeedbackQualitySignals([
        {
          userKey: "owner-1",
          outcome: "coaching_review",
          response: "not_helpful",
          reason: "score_explanation_unclear",
        },
      ]),
    /aggregate input is invalid/
  );
});

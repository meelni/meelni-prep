import assert from "node:assert/strict";
import test from "node:test";

import { FeedbackV2ParseError, parseFeedbackV2 } from "@meelni/core";
import { createFeedbackV2GoldenFixtures } from "./feedback-v2";

test("feedback v2 golden fixtures deterministically cover four representative PM rounds", () => {
  const fixtures = createFeedbackV2GoldenFixtures();
  assert.deepEqual(
    fixtures.map((fixture) => fixture.roundType),
    ["product_sense", "execution", "behavioral", "strategy"]
  );

  for (const fixture of fixtures) {
    const parsed = parseFeedbackV2(fixture.response, {
      transcript: fixture.transcript,
      evaluationState: fixture.evaluationState,
      modelVersion: fixture.modelVersion,
    });
    assert.equal(parsed.evaluationState, fixture.evaluationState);
    assert.equal(parsed.modelVersion, "fixture-model-v1");
    assert.equal(parsed.overallScore, 7.5);
  }
});

test("feedback fixtures reject exact but meaningless evidence fragments", () => {
  const fixture = createFeedbackV2GoldenFixtures()[0]!;
  const response = structuredClone(fixture.response) as {
    strengths: Array<{ evidence: Array<{ quote: string }> }>;
  };
  response.strengths[0]!.evidence[0]!.quote = "I";

  assert.throws(
    () =>
      parseFeedbackV2(response, {
        transcript: fixture.transcript,
        evaluationState: fixture.evaluationState,
        modelVersion: fixture.modelVersion,
      }),
    FeedbackV2ParseError
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  DRILL_TEMPLATE_VERSION,
  parseFeedbackV2,
  recommendDrill,
} from "@meelni/core";
import {
  createDrillRecommendationGoldenFixtures,
  DRILL_RECOMMENDATION_STATE_FIXTURES,
} from "./drill-recommendation";

test("validated Feedback v2 fixtures map four PM rounds to stable drill IDs", () => {
  const fixtures = createDrillRecommendationGoldenFixtures();
  assert.deepEqual(
    fixtures.map(({ roundType }) => roundType),
    ["product_sense", "execution", "behavioral", "strategy"]
  );

  for (const fixture of fixtures) {
    const validated = parseFeedbackV2(fixture.response, {
      transcript: fixture.transcript,
      evaluationState: fixture.evaluationState,
      modelVersion: fixture.modelVersion,
    });
    const recommendation = recommendDrill({
      roundType: fixture.roundType,
      sourceState: "completed",
      templateVersion: DRILL_TEMPLATE_VERSION,
      feedback: validated,
    });

    assert.equal(recommendation.state, "recommended", fixture.name);
    if (recommendation.state !== "recommended") continue;
    assert.equal(recommendation.drillId, fixture.expected.drillId);
    assert.equal(
      recommendation.weakestDimension,
      fixture.expected.weakestDimension
    );
    assert.equal(recommendation.evidenceGap, fixture.expected.evidenceGap);
  }
});

test("non-recommendable feedback states have deterministic fixture outcomes", () => {
  for (const fixture of DRILL_RECOMMENDATION_STATE_FIXTURES) {
    const recommendation = recommendDrill({
      roundType: "product_sense",
      sourceState: fixture.sourceState,
      templateVersion: DRILL_TEMPLATE_VERSION,
      feedback: null,
    });
    assert.equal(recommendation.state, "unavailable");
    if (recommendation.state === "unavailable") {
      assert.equal(recommendation.reason, fixture.expectedReason);
    }
  }
});

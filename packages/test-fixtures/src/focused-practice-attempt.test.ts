import assert from "node:assert/strict";
import test from "node:test";

import {
  DRILL_TEMPLATE_VERSION,
  parsePersistedFeedbackV2,
  resolveDrillRecommendation,
} from "@meelni/core";
import { createFocusedPracticeAttemptSourceFixtures } from "./focused-practice-attempt";

test("four PM-round attempt fixtures retain validated source and selected finding identity", () => {
  const fixtures = createFocusedPracticeAttemptSourceFixtures();
  assert.equal(fixtures.length, 4);

  for (const fixture of fixtures) {
    const feedback = parsePersistedFeedbackV2(fixture.persistedFeedback, {
      evidenceTurns: fixture.evidenceTurns,
    });
    const resolution = resolveDrillRecommendation({
      roundType: fixture.roundType,
      sourceState: "completed",
      templateVersion: DRILL_TEMPLATE_VERSION,
      feedback,
    });

    assert.equal(resolution.recommendation.state, "recommended");
    assert.deepEqual(resolution.sourceFinding, fixture.expected.sourceFinding);
    assert.equal(fixture.persistedFeedback.id, fixture.feedbackId);
    assert.equal(fixture.persistedFeedback.sessionId, fixture.sessionId);
  }
});

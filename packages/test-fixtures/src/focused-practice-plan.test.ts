import assert from "node:assert/strict";
import test from "node:test";

import {
  DRILL_TEMPLATE_VERSION,
  FOCUSED_PRACTICE_DURATION_MINUTES,
  buildFocusedPracticePlan,
  parseFeedbackV2,
  recommendDrill,
} from "@meelni/core";
import { createFocusedPracticePlanGoldenFixtures } from "./focused-practice-plan";

test("four PM-round fixtures resolve validated feedback through SAV-201 into focused practice", () => {
  const fixtures = createFocusedPracticePlanGoldenFixtures();
  assert.deepEqual(
    fixtures.map(
      ({ recommendationFixture }) => recommendationFixture.roundType
    ),
    ["product_sense", "execution", "behavioral", "strategy"]
  );

  for (const fixture of fixtures) {
    const source = fixture.recommendationFixture;
    const feedback = parseFeedbackV2(source.response, {
      transcript: source.transcript,
      evaluationState: source.evaluationState,
      modelVersion: source.modelVersion,
    });
    const recommendation = recommendDrill({
      roundType: source.roundType,
      sourceState: "completed",
      templateVersion: DRILL_TEMPLATE_VERSION,
      feedback,
    });
    const plan = buildFocusedPracticePlan({
      recommendation,
      sourceQuestion: fixture.sourceQuestion,
    });

    assert.equal(plan.state, "available", fixture.name);
    if (plan.state !== "available") continue;
    assert.equal(plan.templateId, fixture.expected.templateId);
    assert.equal(plan.title, fixture.expected.title);
    assert.equal(plan.durationMinutes, FOCUSED_PRACTICE_DURATION_MINUTES);
    assert.equal(plan.source.questionId, fixture.sourceQuestion.questionId);
    assert.deepEqual(
      plan.source.transcriptRefs,
      recommendation.state === "recommended"
        ? recommendation.sourceFinding.transcriptRefs
        : []
    );
  }
});

test("fixture source questions are fresh copies", () => {
  const first = createFocusedPracticePlanGoldenFixtures();
  const second = createFocusedPracticePlanGoldenFixtures();
  first[0].sourceQuestion.questionText = "Changed by a test.";
  assert.notEqual(
    first[0].sourceQuestion.questionText,
    second[0].sourceQuestion.questionText
  );
});

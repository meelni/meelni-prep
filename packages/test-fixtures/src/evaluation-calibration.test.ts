import assert from "node:assert/strict";
import test from "node:test";

import {
  CALIBRATION_ROUND_TYPES,
  EVALUATION_ADJUDICATION_VERSION,
  EVALUATION_GOLD_SET_VERSION,
  buildEvaluationAdjudicationReviewManifest,
  evaluationCalibrationCases,
} from "./evaluation-calibration";

test("PM calibration gold set has ten fully synthetic cases per core round", () => {
  assert.equal(evaluationCalibrationCases.length, 40);
  assert.equal(
    new Set(evaluationCalibrationCases.map(({ id }) => id)).size,
    40
  );

  for (const roundType of CALIBRATION_ROUND_TYPES) {
    const cases = evaluationCalibrationCases.filter(
      (entry) => entry.roundType === roundType
    );
    assert.equal(cases.length, 10, roundType);
    assert.equal(
      cases.filter(({ expectedCompletionState }) =>
        ["full", "partial"].includes(expectedCompletionState)
      ).length,
      8
    );
    assert.equal(
      cases.filter(
        ({ expectedCompletionState }) =>
          expectedCompletionState === "insufficient"
      ).length,
      2
    );
    assert.ok(
      cases.some(
        ({ expectedCompletionState }) => expectedCompletionState === "full"
      )
    );
    assert.ok(
      cases.some(
        ({ expectedCompletionState }) => expectedCompletionState === "partial"
      )
    );
    assert.deepEqual(
      Object.fromEntries(
        (["weak", "average", "strong"] as const).map((quality) => [
          quality,
          cases.filter(({ expectedQuality }) => expectedQuality === quality)
            .length,
        ])
      ),
      { weak: 2, average: 2, strong: 4 }
    );

    for (const dimension of [
      "structure",
      "clarity",
      "insight",
      "communication",
      "leadership",
    ] as const) {
      assert.ok(
        cases.some(
          ({ expectedQuality, scoreBands }) =>
            expectedQuality === "weak" &&
            scoreBands !== null &&
            scoreBands[dimension].maximum <= 5
        ),
        `${roundType}:${dimension}:weak`
      );
      assert.ok(
        cases.some(
          ({ expectedQuality, scoreBands }) =>
            expectedQuality === "average" &&
            scoreBands !== null &&
            scoreBands[dimension].minimum >= 4 &&
            scoreBands[dimension].maximum <= 7
        ),
        `${roundType}:${dimension}:average`
      );
    }
  }
});

test("every gold case carries versioned adjudication and exact local evidence", () => {
  for (const fixture of evaluationCalibrationCases) {
    assert.equal(fixture.provenance, "fully_synthetic");
    assert.equal(
      fixture.adjudicationProvenance,
      "agent_authored_synthetic_candidate"
    );
    assert.equal(
      fixture.adjudicationSignoff,
      "pending_product_owner_pm_review"
    );
    assert.equal(fixture.goldSetVersion, EVALUATION_GOLD_SET_VERSION);
    assert.equal(fixture.adjudicationVersion, EVALUATION_ADJUDICATION_VERSION);
    assert.equal(fixture.schemaVersion, "feedback.v2");
    assert.equal(fixture.promptVersion, "feedback.prompt.v2");
    assert.equal(fixture.rubricVersion, "pm-feedback-rubric.v2");

    const transcript = new Map(
      fixture.transcript.map((turn) => [turn.eventId, turn] as const)
    );
    for (const anchor of fixture.evidenceAnchors) {
      const turn = transcript.get(anchor.turnRef);
      assert.ok(turn, `${fixture.id}:${anchor.turnRef}`);
      assert.equal(turn.speaker, "user");
      assert.ok(turn.text.includes(anchor.quote));
    }

    if (fixture.expectedCompletionState === "insufficient") {
      assert.equal(fixture.expectedQuality, null);
      assert.equal(fixture.scoreBands, null);
      assert.deepEqual(fixture.evidenceAnchors, []);
    } else {
      assert.ok(fixture.expectedQuality);
      assert.ok(fixture.scoreBands);
      assert.ok(fixture.evidenceAnchors.length >= 2);
    }
  }
});

test("all 32 scored candidates contain semantically supported strength and gap evidence", () => {
  const scored = evaluationCalibrationCases.filter(
    ({ expectedQuality }) => expectedQuality !== null
  );
  assert.equal(scored.length, 32);

  for (const fixture of scored) {
    const strength = fixture.evidenceAnchors.find(
      ({ kind }) => kind === "strength"
    );
    const improvement = fixture.evidenceAnchors.find(
      ({ kind }) => kind === "improvement"
    );
    assert.ok(strength, `${fixture.id}:strength`);
    assert.ok(improvement, `${fixture.id}:improvement`);

    if (strength.behavior === "owned_specific_action") {
      assert.match(
        strength.quote,
        /\bI (scheduled|gathered|restated|shared|modeled|documented)\b/i,
        `${fixture.id}:owned action`
      );
    } else {
      assert.equal(strength.behavior, "made_explicit_opening_decision");
      assert.match(
        strength.quote,
        /\bI would (first|choose|define|target|start|focus|prioritize|separate|assign|distinguish|map|anchor|compare)\b/i,
        `${fixture.id}:opening decision`
      );
    }
    assert.doesNotMatch(strength.observation, /gap|missing/i);
    assert.ok(strength.nextStep.length >= 20);

    assert.equal(improvement.behavior, "identified_specific_gap");
    assert.match(improvement.quote, /^A gap in my answer is .*not /i);
    assert.match(improvement.observation, /gap unresolved\.$/);
    assert.ok(improvement.nextStep.length >= 20);
    assert.notEqual(strength.turnRef, improvement.turnRef);
  }
});

test("review manifest keeps human PM signoff visibly pending", () => {
  const manifest = buildEvaluationAdjudicationReviewManifest();
  assert.equal(manifest.contractVersion, "evaluation-adjudication-review.v1");
  assert.equal(manifest.provenance, "agent_authored_synthetic_candidate");
  assert.equal(manifest.signoff, "pending_product_owner_pm_review");
  assert.equal(manifest.scoredCaseCount, 32);
  assert.equal(manifest.cases.length, 32);
  assert.ok(
    manifest.cases.every(
      ({ signoff, strength, improvement }) =>
        signoff === "pending_product_owner_pm_review" &&
        strength?.kind === "strength" &&
        improvement?.kind === "improvement"
    )
  );
});

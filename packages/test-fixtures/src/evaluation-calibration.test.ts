import assert from "node:assert/strict";
import test from "node:test";

import {
  CALIBRATION_ROUND_TYPES,
  EVALUATION_ADJUDICATION_VERSION,
  EVALUATION_GOLD_SET_VERSION,
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
  }
});

test("every gold case carries versioned adjudication and exact local evidence", () => {
  for (const fixture of evaluationCalibrationCases) {
    assert.equal(fixture.provenance, "fully_synthetic");
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
      assert.equal(fixture.scoreBands, null);
      assert.deepEqual(fixture.evidenceAnchors, []);
    } else {
      assert.ok(fixture.scoreBands);
      assert.ok(fixture.evidenceAnchors.length >= 2);
    }
  }
});

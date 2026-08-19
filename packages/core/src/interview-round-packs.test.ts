import assert from "node:assert/strict";
import test from "node:test";

import { ALL_INTERVIEW_TYPES } from "./interview";
import {
  PM_INTERVIEW_ROUND_PACKS,
  getPmInterviewRoundPack,
} from "./interview-round-packs";

test("PM round packs cover exactly the four supported interview rounds", () => {
  assert.deepEqual(
    Object.keys(PM_INTERVIEW_ROUND_PACKS).sort(),
    [...ALL_INTERVIEW_TYPES].sort()
  );

  for (const roundType of ALL_INTERVIEW_TYPES) {
    const pack = getPmInterviewRoundPack(roundType);
    assert.ok(pack.objectives.length >= 1 && pack.objectives.length <= 8);
    assert.ok(
      pack.probeFamilies.length >= 1 && pack.probeFamilies.length <= 12
    );
    assert.ok(
      pack.transitionGuidance.length >= 1 && pack.transitionGuidance.length <= 8
    );
    assert.ok(pack.closeGuidance.length >= 1 && pack.closeGuidance.length <= 8);
    assert.equal(new Set(pack.objectives).size, pack.objectives.length);
    assert.equal(new Set(pack.probeFamilies).size, pack.probeFamilies.length);
  }
});

test("PM round packs remain interviewer constraints rather than scripts or evaluators", () => {
  for (const pack of Object.values(PM_INTERVIEW_ROUND_PACKS)) {
    const serialized = JSON.stringify(pack).toLowerCase();
    assert.doesNotMatch(serialized, /score|rubric|ideal answer|model answer/);
    assert.doesNotMatch(serialized, /you should answer|tell the candidate/);
  }
});

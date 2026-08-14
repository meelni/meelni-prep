import assert from "node:assert/strict";
import test from "node:test";

import {
  getDisplayedOverallDelta,
  getDisplayedOverallScore,
} from "./score-presentation";

test("comparison presents accepted whole-number overall scores", () => {
  assert.equal(getDisplayedOverallScore(7.9), 8);
  assert.equal(getDisplayedOverallScore(7.49), 7);
});

test("comparison derives overall delta from the displayed whole-number scores", () => {
  assert.equal(getDisplayedOverallDelta(7.9, 8.1), 0);
  assert.equal(getDisplayedOverallDelta(6.4, 7.6), 2);
  assert.equal(getDisplayedOverallDelta(null, 7.6), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { normalizePracticeRecommendations } from "./product-language";

test("model-generated recommendations cannot expose fitness vocabulary", () => {
  assert.deepEqual(
    normalizePracticeRecommendations([
      "Do three reps of this drill before the interview.",
      "Build a weekly PM interview workout.",
      "Use the gym to master prioritization.",
    ]),
    [
      "Do three practice attempts of this exercise before the interview.",
      "Build a weekly PM interview practice plan.",
      "Use the practice to master prioritization.",
    ]
  );
});

test("recommendation normalization rejects malformed model output", () => {
  assert.deepEqual(
    normalizePracticeRecommendations(["  Focus on trade-offs.  ", null, 42, ""]),
    ["Focus on trade-offs."]
  );
  assert.deepEqual(normalizePracticeRecommendations(null), []);
});

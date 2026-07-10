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

test("recommendation normalization preserves legitimate PM-domain words", () => {
  assert.deepEqual(
    normalizePracticeRecommendations([
      "Ask the sales rep which objections appear most often.",
      "Interview support reps before prioritizing the workflow.",
      "Drill into why field reps abandon the form.",
    ]),
    [
      "Ask the sales rep which objections appear most often.",
      "Interview support reps before prioritizing the workflow.",
      "Drill into why field reps abandon the form.",
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

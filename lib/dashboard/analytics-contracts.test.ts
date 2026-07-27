import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnalyticsCompetencies,
  buildAnalyticsEvidence,
} from "./analytics-contracts";

test("analytics competencies do not fabricate scores when insights omit data", () => {
  const competencies = buildAnalyticsCompetencies(null);

  assert.deepEqual(
    competencies.map((competency) => competency.value),
    [null, null, null]
  );
  assert.deepEqual(
    competencies.map((competency) => competency.state),
    ["placeholder", "placeholder", "placeholder"]
  );
  assert.deepEqual(
    competencies.map((competency) => competency.sampleSize),
    [0, 0, 0]
  );
});

test("analytics competencies normalize real API scores without fallback precision", () => {
  const competencies = buildAnalyticsCompetencies({
    competencies: {
      structure: 82,
      clarity: 7.4,
      insight: 5.9,
    },
    competencySampleSizes: {
      structure: 4,
      clarity: 3,
      insight: 2,
    },
  });

  assert.deepEqual(
    competencies.map((competency) => competency.value),
    [8.2, 7.4, 5.9]
  );
  assert.deepEqual(
    competencies.map((competency) => competency.state),
    ["actual", "actual", "actual"]
  );
  assert.deepEqual(
    competencies.map((competency) => competency.sampleSize),
    [4, 3, 2]
  );
});

test("analytics evidence is derived from current dashboard summary", () => {
  const evidence = buildAnalyticsEvidence({
    focusAreaLabel: "Metrics depth",
    focusAreaScore: 5.9,
  });

  assert.equal(evidence.length, 1);
  assert.match(evidence[0]?.description ?? "", /Metrics depth/);
  assert.match(evidence[0]?.description ?? "", /5\.9\/10/);
  assert.doesNotMatch(
    evidence.map((item) => item.description).join(" "),
    /consistently state users|Only one strategy interview/
  );
});

test("analytics evidence stays empty without scored dimension data", () => {
  assert.deepEqual(
    buildAnalyticsEvidence({
      focusAreaLabel: "Metrics depth",
      focusAreaScore: null,
    }),
    []
  );
});

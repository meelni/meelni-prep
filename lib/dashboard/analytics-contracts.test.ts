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
});

test("analytics competencies normalize real API scores without fallback precision", () => {
  const competencies = buildAnalyticsCompetencies({
    competencies: {
      structure: 82,
      clarity: 7.4,
      insight: 5.9,
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
});

test("analytics evidence is derived from current dashboard summary", () => {
  const evidence = buildAnalyticsEvidence({
    focusAreaLabel: "Metrics depth",
    focusAreaScore: 5.9,
    focusAreaDescription:
      "Add success metrics and guardrails before solutions.",
    progressDeltaLabel: "+6 points across 4 interviews",
  });

  assert.equal(evidence.length, 2);
  assert.match(evidence[0]?.description ?? "", /Metrics depth/);
  assert.match(evidence[0]?.description ?? "", /latest completed feedback/);
  assert.equal(
    evidence[1]?.description,
    "Recent scored interviews: +6 points across 4 interviews."
  );
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
      focusAreaDescription:
        "Add success metrics and guardrails before solutions.",
      progressDeltaLabel: "No scored interviews",
    }),
    []
  );
});

test("analytics evidence renders a flat trend as a complete sentence", () => {
  const evidence = buildAnalyticsEvidence({
    focusAreaLabel: "Clarity",
    focusAreaScore: 7,
    focusAreaDescription: "Make the recommendation explicit.",
    progressDeltaLabel: "No score change across 3 interviews",
  });

  assert.equal(
    evidence[1]?.description,
    "Recent scored interviews: No score change across 3 interviews."
  );
});

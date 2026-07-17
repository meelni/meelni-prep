import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FeedbackFindingCard } from "./feedback-finding-card";

const baseFinding = {
  dimension: "insight" as const,
  observation: "The answer named a specific user segment.",
  transcriptRefs: ["writer:1", "writer:2"],
  evidence: [
    { turnRef: "writer:1", quote: "working parents" },
    { turnRef: "writer:2", quote: "weekday evenings" },
  ],
  nextStep: "Carry that segment through the prioritization decision.",
  rubricVersion: "pm-feedback-rubric.v2" as const,
  confidence: 0.9,
};

test("renders observation, every transcript quote, and a specific next action", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackFindingCard, { finding: baseFinding })
  );

  assert.match(html, /Observation/);
  assert.match(html, /working parents/);
  assert.match(html, /weekday evenings/);
  assert.match(html, /Next action/);
  assert.match(html, /Carry that segment/);
  assert.match(html, /Strong evidence/);
});

test("describes low confidence as limited transcript evidence, not readiness", () => {
  const html = renderToStaticMarkup(
    React.createElement(FeedbackFindingCard, {
      finding: { ...baseFinding, confidence: 0.4 },
    })
  );

  assert.match(html, /Limited evidence/);
  assert.match(html, /another practice answer/);
  assert.doesNotMatch(html, /readiness/i);
});

test("long unbroken findings retain overflow-safe wrapping", () => {
  const longText = "segment".repeat(80);
  const html = renderToStaticMarkup(
    React.createElement(FeedbackFindingCard, {
      finding: { ...baseFinding, observation: longText, nextStep: longText },
    })
  );
  assert.match(html, /wrap-anywhere/);
  assert.match(html, new RegExp(longText));
});

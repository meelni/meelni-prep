import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CompletedLegacyReview,
  CompletedV2Review,
} from "./feedback-completed-review";
import type { FeedbackLegacyView, FeedbackV2View } from "@meelni/core";

const scores = {
  structure: 8,
  clarity: 7,
  insight: 9,
  communication: 8,
  leadership: 7,
  overall: 7.9,
};
const finding = {
  dimension: "insight" as const,
  observation: "The answer named a specific user segment.",
  transcriptRefs: ["writer:1"],
  evidence: [{ turnRef: "writer:1", quote: "working parents" }],
  nextStep: "Carry the segment through prioritization.",
  rubricVersion: "pm-feedback-rubric.v2" as const,
  confidence: 0.9,
};

test("completed v2 review hides technical version and unranked model exercises", () => {
  const feedback: FeedbackV2View = {
    kind: "v2",
    id: "feedback-1",
    sessionId: "session-1",
    scores,
    summary: "Grounded summary",
    suggestedExercises: ["Start this workout drill"],
    strengths: [finding],
    improvements: [{ ...finding, dimension: "structure" }],
    schemaVersion: "feedback.v2",
    promptVersion: "feedback.prompt.v2",
    modelVersion: "fixture-model",
    rubricVersion: "pm-feedback-rubric.v2",
    evaluationState: "full",
    createdAt: "2026-07-10T12:00:00.000Z",
    nextPracticeRecommendation: null,
  };

  const html = renderToStaticMarkup(
    React.createElement(CompletedV2Review, { feedback, partial: false })
  );
  assert.match(html, /Transcript evidence/);
  assert.match(html, /Next action/);
  assert.doesNotMatch(html, /Feedback v2/);
  assert.doesNotMatch(html, /workout drill/);
});

test("legacy review stays historical and hides stored model exercises", () => {
  const feedback: FeedbackLegacyView = {
    kind: "legacy",
    id: "feedback-legacy",
    sessionId: "session-legacy",
    scores: { ...scores, overall: 8 },
    summary: "Historical summary",
    suggestedExercises: ["Complete this drill"],
    strengths: ["Clear answer"],
    improvements: ["State the approach first"],
    rubricVersion: "1.0.0",
    createdAt: "2026-07-10T12:00:00.000Z",
    nextPracticeRecommendation: null,
  };
  const html = renderToStaticMarkup(
    React.createElement(CompletedLegacyReview, { feedback })
  );
  assert.match(html, /Historical feedback/);
  assert.match(html, /do not include verifiable transcript evidence/);
  assert.doesNotMatch(html, /Complete this drill/);
});

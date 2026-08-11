import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CompletedEvidenceLimitedReview,
  CompletedLegacyReview,
  CompletedV2Review,
} from "./feedback-completed-review";
import {
  EVIDENCE_LIMITED_ACTIONS,
  EVIDENCE_LIMITED_CONFIDENCE,
  EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS,
  EVIDENCE_LIMITED_STRENGTH_SIGNALS,
  EVIDENCE_LIMITED_SUMMARY,
  FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
  type FeedbackEvidenceLimitedView,
  type FeedbackLegacyView,
  type FeedbackV2View,
} from "@meelni/core";

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

test("completed v2 review hides technical version metadata", () => {
  const feedback: FeedbackV2View = {
    kind: "v2",
    id: "feedback-1",
    sessionId: "session-1",
    scores,
    summary: "Grounded summary",
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
  assert.match(html, /Focused practice/);
  assert.match(html, /does not start another interview/);
  assert.doesNotMatch(html, /Feedback v2/);
  assert.doesNotMatch(html, /\bgym\b/i);
  assert.doesNotMatch(html, /\breps\b/i);
});

test("evidence-limited review renders server templates and exact quantitative citations without a score", () => {
  const quantitativeCitation =
    "We saw 40% activation after 8 customer interviews and an 8/10 task-success ratio.";
  const feedback: FeedbackEvidenceLimitedView = {
    kind: "evidence-limited",
    id: "feedback-limited",
    sessionId: "session-limited",
    summary: EVIDENCE_LIMITED_SUMMARY,
    strengths: [
      {
        signalCode: "customer_problem_connection",
        actionCode: "connect_customer_to_decision",
        dimension: "insight",
        observation:
          EVIDENCE_LIMITED_STRENGTH_SIGNALS.customer_problem_connection
            .observation,
        transcriptRefs: ["writer:1"],
        evidence: [{ turnRef: "writer:1", quote: quantitativeCitation }],
        nextStep:
          EVIDENCE_LIMITED_ACTIONS.connect_customer_to_decision.nextStep,
        rubricVersion: "pm-feedback-rubric.v2",
        confidence: EVIDENCE_LIMITED_CONFIDENCE,
      },
    ],
    improvements: [
      {
        signalCode: "tradeoff_decision",
        actionCode: "compare_tradeoffs_and_choose",
        dimension: "leadership",
        observation:
          EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS.tradeoff_decision.observation,
        transcriptRefs: ["writer:1"],
        evidence: [{ turnRef: "writer:1", quote: quantitativeCitation }],
        nextStep:
          EVIDENCE_LIMITED_ACTIONS.compare_tradeoffs_and_choose.nextStep,
        rubricVersion: "pm-feedback-rubric.v2",
        confidence: EVIDENCE_LIMITED_CONFIDENCE,
      },
    ],
    schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
    promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
    modelVersion: "fixture-model-v2",
    rubricVersion: "pm-feedback-rubric.v2",
    evaluationState: "partial",
    createdAt: "2026-08-10T12:00:00.000Z",
    nextPracticeRecommendation: null,
  };

  const html = renderToStaticMarkup(
    React.createElement(CompletedEvidenceLimitedReview, { feedback })
  );
  assert.match(html, new RegExp(escapeRegExp(EVIDENCE_LIMITED_SUMMARY)));
  assert.match(
    html,
    new RegExp(
      escapeRegExp(
        EVIDENCE_LIMITED_STRENGTH_SIGNALS.customer_problem_connection
          .observation
      )
    )
  );
  assert.match(html, /40% activation after 8 customer interviews/);
  assert.match(html, /8\/10 task-success ratio/);
  assert.match(html, /No score has been inferred/);
  assert.doesNotMatch(html, /customer_problem_connection/);
});

test("legacy review stays explicitly historical", () => {
  const feedback: FeedbackLegacyView = {
    kind: "legacy",
    id: "feedback-legacy",
    sessionId: "session-legacy",
    scores: { ...scores, overall: 8 },
    summary: "Historical summary",
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
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

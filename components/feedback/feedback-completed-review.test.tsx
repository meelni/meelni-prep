import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CompletedDimensionCoverageReview,
  CompletedEvidenceLimitedReview,
  CompletedLegacyReview,
  CompletedV2Review,
} from "./feedback-completed-review";
import { FeedbackLifecycleStatus } from "./feedback-lifecycle-status";
import {
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  deriveCandidateAnswerBlocks,
  parseDimensionCoverageProviderSelection,
  type DimensionCoverageProviderSelection,
  type FeedbackDimension,
  type FeedbackDimensionCoverageView,
  decodeFeedbackLifecycleResponse,
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
import { createAnswerBlockSegmentationFixture } from "@meelni/test-fixtures";

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

  const duplicateIdentity = structuredClone(feedback);
  duplicateIdentity.strengths.push({
    ...structuredClone(duplicateIdentity.strengths[0]!),
    transcriptRefs: ["writer:2"],
    evidence: [
      {
        turnRef: "writer:2",
        quote: "A second individually valid frozen candidate turn.",
      },
    ],
  });
  const decoded = decodeFeedbackLifecycleResponse({
    status: "completed",
    retryable: false,
    feedback: duplicateIdentity,
  });
  assert.equal(decoded, null);
  const rejectedHtml = renderToStaticMarkup(
    React.createElement(FeedbackLifecycleStatus, {
      state: {
        kind: "unavailable" as const,
        message: "Feedback returned an unsupported response.",
      },
      recovering: false,
      recoveryError: null,
      onRecover() {},
    })
  );
  assert.match(rejectedHtml, /Feedback unavailable/);
  assert.doesNotMatch(
    rejectedHtml,
    new RegExp(
      escapeRegExp(
        EVIDENCE_LIMITED_STRENGTH_SIGNALS.customer_problem_connection
          .observation
      )
    )
  );
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

test("dimension coverage review renders a full scorecard only with complete support", () => {
  const feedback = dimensionCoverageView("full");
  const html = renderToStaticMarkup(
    React.createElement(CompletedDimensionCoverageReview, { feedback })
  );

  assert.match(html, /Full scorecard/);
  assert.match(html, /Overall score/);
  assert.match(html, /8\.0/);
  assert.match(html, /Sufficient evidence/);
  assert.match(html, /working parents because schedule changes/);
});

test("dimension coverage review withholds unsupported and overall scores in a partial scorecard", () => {
  const feedback = dimensionCoverageView("partial");
  const html = renderToStaticMarkup(
    React.createElement(CompletedDimensionCoverageReview, { feedback })
  );

  assert.match(html, /Partial scorecard/);
  assert.match(html, /8\/10/);
  assert.match(html, /Partial evidence/);
  assert.match(html, /No evidence/);
  assert.doesNotMatch(html, /Overall score/);
  assert.doesNotMatch(html, /Clarity score/);
  assert.doesNotMatch(html, /answer-block:0001/);
});

test("dimension coverage coaching review never renders numerical scores", () => {
  const feedback = dimensionCoverageView("coaching");
  const html = renderToStaticMarkup(
    React.createElement(CompletedDimensionCoverageReview, { feedback })
  );

  assert.match(html, /Coaching review/);
  assert.match(html, /Grounded coaching without scores/);
  assert.match(html, /working parents because schedule changes/);
  assert.doesNotMatch(html, /Overall score/);
  assert.doesNotMatch(html, />\d+\/10</);
});

function dimensionCoverageView(
  kind: "full" | "partial" | "coaching"
): FeedbackDimensionCoverageView {
  const blocks = deriveCandidateAnswerBlocks(
    createAnswerBlockSegmentationFixture(2).events
  ).blocks;
  const selection = createCoverageSelection(blocks[0]!.answerBlockId, kind);
  const result = parseDimensionCoverageProviderSelection(selection, {
    roundType: "product_sense",
    answerBlocks: blocks,
    modelVersion: "synthetic-ui-fixture-v1",
    allowNumericalScores: kind !== "coaching",
  });
  return {
    kind: "dimension-coverage",
    id: `feedback-${kind}`,
    sessionId: `session-${kind}`,
    ...result,
    createdAt: "2026-08-12T12:00:00.000Z",
    nextPracticeRecommendation: null,
  };
}

function createCoverageSelection(
  answerBlockRef: string,
  kind: "full" | "partial" | "coaching"
): DimensionCoverageProviderSelection {
  const dimensions = {} as DimensionCoverageProviderSelection["dimensions"];
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const facetCount =
      kind === "full" || kind === "coaching"
        ? 2
        : dimension === "structure"
          ? 2
          : dimension === "insight"
            ? 1
            : 0;
    dimensions[dimension] = {
      score: facetCount === 2 && kind !== "coaching" ? 8 : null,
      evidence: ROUND_DIMENSION_COVERAGE_CONFIG.product_sense[
        dimension as FeedbackDimension
      ].facets
        .slice(0, facetCount)
        .map((facet) => ({ facetCode: facet.code, answerBlockRef })),
    };
  }
  return {
    schemaVersion: FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
    promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
    rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
    roundType: "product_sense",
    dimensions,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

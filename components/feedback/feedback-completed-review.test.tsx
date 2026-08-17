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
import { parseFocusedPracticeAttemptResponse } from "./focused-practice-workspace";
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
  presentCompletedFeedback,
  EVIDENCE_LIMITED_ACTIONS,
  EVIDENCE_LIMITED_CONFIDENCE,
  EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS,
  EVIDENCE_LIMITED_STRENGTH_SIGNALS,
  EVIDENCE_LIMITED_SUMMARY,
  FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
  type FeedbackLegacyView,
  type PersistedCompletedFeedback,
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

test("focused-practice responses require the strict privacy-safe attempt view", () => {
  const attempt = {
    attemptId: "synthetic-focused-practice-attempt",
    sourceSessionId: "synthetic-focused-practice-session",
    contractVersion: "focused-practice-attempt.v2",
    state: "in_progress",
    lifecycleVersion: 0,
    plan: {
      state: "available",
      contractVersion: "focused-practice-plan.v2",
      durationMinutes: 5,
      title: "Make the product decision clearer",
      objective:
        "State one target user, one core problem, and the product choice that addresses it.",
      instructions: [
        "Use only the grounded focus and exact interview evidence selected by Meelni; do not fill in missing context.",
        "Revise the part that connects the chosen user and problem to a clear product decision.",
      ],
      successCriterion:
        "The revision names the target user, defines the core problem precisely, and commits to one product choice.",
      selfReviewPrompt:
        "Are the target user, core problem, and product choice each explicit and consistent?",
      source: {
        questionId: "synthetic-question",
        questionText: "How would you improve a planning product?",
        roundType: "product_sense",
        focusDimension: "clarity",
      },
    },
    startedAt: "2026-08-13T12:00:00.000Z",
    completedAt: null,
    completion: null,
  };
  const parsed = parseFocusedPracticeAttemptResponse(
    { disposition: "created", attempt },
    ["created", "resumed", "already_completed"]
  );
  assert.equal(parsed?.attempt.contractVersion, "focused-practice-attempt.v2");
  assert.equal(
    parseFocusedPracticeAttemptResponse(
      { disposition: "created", attempt, extra: true },
      ["created"]
    ),
    null
  );
  assert.equal(
    parseFocusedPracticeAttemptResponse(
      {
        disposition: "created",
        attempt: {
          ...attempt,
          sourceFinding: { evidence: { quote: "private synthetic quote" } },
        },
      },
      ["created"]
    ),
    null
  );
});

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
  const persisted = persistedFeedback({
    strengths: [
      {
        signalCode: "customer_problem_connection",
        actionCode: "connect_customer_to_decision",
        dimension: "insight",
        observation:
          EVIDENCE_LIMITED_STRENGTH_SIGNALS.customer_problem_connection
            .observation,
        transcriptRefs: ["synthetic:1"],
        evidence: [{ turnRef: "synthetic:1", quote: quantitativeCitation }],
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
        transcriptRefs: ["synthetic:1"],
        evidence: [{ turnRef: "synthetic:1", quote: quantitativeCitation }],
        nextStep:
          EVIDENCE_LIMITED_ACTIONS.compare_tradeoffs_and_choose.nextStep,
        rubricVersion: "pm-feedback-rubric.v2",
        confidence: EVIDENCE_LIMITED_CONFIDENCE,
      },
    ],
  });
  const feedback = presentCompletedFeedback(persisted, {
    evidenceTurns: [
      {
        eventId: "synthetic:1",
        speaker: "user",
        text: quantitativeCitation,
        contractVersion: 2,
      },
    ],
    scoreWithheldReason: "rubric_coverage",
  });
  assert.equal(feedback.kind, "evidence-limited");
  if (feedback.kind !== "evidence-limited") return;

  const html = renderToStaticMarkup(
    React.createElement(CompletedEvidenceLimitedReview, { feedback })
  );
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
  assert.match(html, /Why there are no scores/);
  assert.match(html, /Evidence support/);
  assert.match(html, /Prioritized practice focus/);
  assert.match(html, /Focused practice/);
  assert.match(html, /Meelni selects one supported feedback point/);
  assert.match(html, /View Leadership practice-focus citation in transcript/);
  assert.doesNotMatch(html, /customer_problem_connection/);
  assert.doesNotMatch(html, /fixture-model|feedback\.evidence-limited/);

  const duplicateIdentity = structuredClone(feedback);
  duplicateIdentity.strengths.push({
    ...structuredClone(duplicateIdentity.strengths[0]!),
    transcriptRef: "synthetic:2",
    citation: "A second individually valid frozen candidate turn.",
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

test("dimension coverage review renders a scorecard only with complete support", () => {
  const feedback = dimensionCoverageView("full");
  const html = renderToStaticMarkup(
    React.createElement(CompletedDimensionCoverageReview, { feedback })
  );

  assert.match(html, /Scorecard/);
  assert.match(html, /Overall score/);
  assert.match(html, />8</);
  assert.match(html, /Supported/);
  assert.match(html, /working parents because schedule changes/);
  assert.doesNotMatch(html, /Start focused practice/);
  for (const evidence of feedback.dimensions.structure.evidence) {
    assert.match(
      html,
      new RegExp(
        escapeRegExp(`View Structure ${evidence.label} citation in transcript`)
      )
    );
  }
  assert.doesNotMatch(html, /answer-block:|facet|schema|model/i);
});

test("dimension coverage review withholds every numerical score when support is incomplete", () => {
  const base = dimensionCoverageView("partial");
  assert.equal(base.outcome, "coaching_review");
  if (base.outcome !== "coaching_review") throw new Error("coaching required");
  const feedback: FeedbackDimensionCoverageView = {
    ...base,
    verifiedScope: {
      kind: "verified_prefix" as const,
      excludedTail: true,
    },
  };
  const html = renderToStaticMarkup(
    React.createElement(CompletedDimensionCoverageReview, { feedback })
  );

  assert.match(html, /Coaching review/);
  assert.match(html, /Why there are no scores/);
  assert.match(html, /not enough PM-rubric coverage/);
  assert.match(html, /Verified interview scope/);
  assert.match(html, /only the completed answers it could verify/);
  assert.match(html, /unfinished or unverified end of the interview/);
  assert.match(html, /was not treated as negative evidence/);
  assert.match(
    html,
    /only verified completed answers could support the coaching shown/
  );
  assert.match(html, /Start focused practice/);
  assert.match(html, /Meelni selects one supported feedback point/);
  assert.doesNotMatch(html, /Overall score/);
  assert.doesNotMatch(html, />\d+\/10</);
  assert.doesNotMatch(html, /answer-block:0001/);
});

test("verified-prefix coaching never exposes numerical fields even with broad support", () => {
  const base = dimensionCoverageView("coaching-integrity");
  assert.equal(base.outcome, "coaching_review");
  if (base.outcome !== "coaching_review") throw new Error("coaching required");
  const feedback: FeedbackDimensionCoverageView = {
    ...base,
    id: "feedback-verified-prefix-all-dimensions",
    sessionId: "session-verified-prefix-all-dimensions",
    scoreWithheldReason: "rubric_coverage",
    verifiedScope: {
      kind: "verified_prefix",
      excludedTail: true,
    },
  };
  assert.ok(
    FEEDBACK_DIMENSIONS.every(
      (dimension) => !("score" in feedback.dimensions[dimension])
    )
  );

  const html = renderToStaticMarkup(
    React.createElement(CompletedDimensionCoverageReview, { feedback })
  );

  assert.match(html, /not enough PM-rubric coverage/i);
  assert.doesNotMatch(html, /Overall score/);
  assert.doesNotMatch(html, />\d+\/10</);
});

test("dimension coverage coaching review never renders numerical scores", () => {
  const base = dimensionCoverageView("coaching-coverage");
  assert.equal(base.outcome, "coaching_review");
  if (base.outcome !== "coaching_review") throw new Error("coaching required");
  const feedback: FeedbackDimensionCoverageView = {
    ...base,
    verifiedScope: {
      kind: "verified_prefix" as const,
      excludedTail: true,
    },
  };
  const html = renderToStaticMarkup(
    React.createElement(CompletedDimensionCoverageReview, { feedback })
  );

  assert.match(html, /Coaching review/);
  assert.match(html, /Evidence support/);
  assert.match(html, /Prioritized practice focus/);
  assert.match(html, /not enough PM-rubric coverage/);
  assert.match(html, /only the completed answers it could verify/);
  assert.match(html, /was not treated as negative evidence/);
  assert.match(
    html,
    /only verified completed answers could support the coaching shown/
  );
  assert.match(html, /working parents because schedule changes/);
  assert.match(html, /Start focused practice/);
  assert.match(html, /Meelni selects one supported feedback point/);
  assert.doesNotMatch(html, /Overall score/);
  assert.doesNotMatch(html, />\d+\/10</);
});

test("integrity-limited coaching explains system confidence without judging performance", () => {
  const feedback = dimensionCoverageView("coaching-integrity");
  const html = renderToStaticMarkup(
    React.createElement(CompletedDimensionCoverageReview, { feedback })
  );

  assert.match(html, /complete saved interview evidence could not be verified/);
  assert.match(html, /does not reflect poor performance/i);
  assert.match(html, /Evidence support/);
  assert.match(html, /Start focused practice/);
  assert.doesNotMatch(html, />\d+\/10</);
  assert.doesNotMatch(html, /answer-block:|facet|schema|model/i);
});

test("incomplete dimension-coverage reviews render as scoreless coaching without verified-prefix claims", () => {
  const feedback = dimensionCoverageView("partial");
  assert.equal(feedback.verifiedScope, null);

  const html = renderToStaticMarkup(
    React.createElement(CompletedDimensionCoverageReview, { feedback })
  );

  assert.match(html, /Coaching review/);
  assert.match(html, /Why there are no scores/);
  assert.match(
    html,
    /not enough PM-rubric coverage for reliable numerical scores/
  );
  assert.doesNotMatch(html, />\d+\/10</);
  assert.doesNotMatch(html, /Verified interview scope/);
  assert.doesNotMatch(html, /unfinished or unverified end/);
});

function dimensionCoverageView(
  kind: "full" | "partial" | "coaching-coverage" | "coaching-integrity"
): FeedbackDimensionCoverageView {
  const blocks = deriveCandidateAnswerBlocks(
    createAnswerBlockSegmentationFixture(2).events
  ).blocks;
  const selection = createCoverageSelection(blocks[0]!.answerBlockId, kind);
  const result = parseDimensionCoverageProviderSelection(selection, {
    roundType: "product_sense",
    answerBlocks: blocks,
    modelVersion: "synthetic-ui-fixture-v1",
    allowNumericalScores: kind !== "coaching-integrity",
  });
  const feedback = presentCompletedFeedback(
    persistedFeedback({
      id: `feedback-${kind}`,
      sessionId: `session-${kind}`,
      structureScore: result.dimensions.structure.score,
      clarityScore: result.dimensions.clarity.score,
      insightScore: result.dimensions.insight.score,
      communicationScore: result.dimensions.communication.score,
      leadershipScore: result.dimensions.leadership.score,
      overallScore: result.overallScore,
      strengths: null,
      improvements: null,
      summary: result.summary,
      rubricVersion: result.rubricVersion,
      schemaVersion: result.schemaVersion,
      promptVersion: result.promptVersion,
      modelVersion: result.modelVersion,
      evaluationState: result.evaluationState,
      feedbackMode: result.mode,
      feedbackRoundType: result.roundType,
      dimensionCoverage: result.dimensions,
    }),
    {
      evidenceTurns: [],
      answerBlocks: blocks,
      expectedRoundType: "product_sense",
      frozenEvidenceState:
        kind === "coaching-integrity" ? "partial" : "complete",
    }
  );
  assert.equal(feedback.kind, "dimension-coverage");
  if (feedback.kind !== "dimension-coverage") {
    throw new Error("synthetic dimension-coverage fixture was rejected");
  }
  return feedback;
}

function createCoverageSelection(
  answerBlockRef: string,
  kind: "full" | "partial" | "coaching-coverage" | "coaching-integrity"
): DimensionCoverageProviderSelection {
  const dimensions = {} as DimensionCoverageProviderSelection["dimensions"];
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const facetCount =
      kind === "full" || kind === "coaching-integrity"
        ? 2
        : dimension === "structure"
          ? kind === "partial"
            ? 2
            : 1
          : dimension === "insight"
            ? 1
            : 0;
    dimensions[dimension] = {
      score:
        facetCount === 2 &&
        kind !== "coaching-coverage" &&
        kind !== "coaching-integrity"
          ? 8
          : null,
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

function persistedFeedback(
  overrides: Partial<PersistedCompletedFeedback> = {}
): PersistedCompletedFeedback {
  return {
    id: "feedback-limited",
    sessionId: "session-limited",
    structureScore: null,
    clarityScore: null,
    insightScore: null,
    communicationScore: null,
    leadershipScore: null,
    overallScore: null,
    strengths: [],
    improvements: [],
    drills: [],
    summary: EVIDENCE_LIMITED_SUMMARY,
    rubricVersion: "pm-feedback-rubric.v2",
    schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
    promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
    modelVersion: "synthetic-ui-fixture-v1",
    evaluationState: "partial",
    createdAt: new Date("2026-08-12T12:00:00.000Z"),
    ...overrides,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

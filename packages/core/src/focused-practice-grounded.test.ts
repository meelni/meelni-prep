import assert from "node:assert/strict";
import test from "node:test";

import {
  ANSWER_BLOCK_SEGMENT_COUNTS,
  createAnswerBlockSegmentationFixture,
} from "@meelni/test-fixtures";
import { deriveCandidateAnswerBlocks } from "./answer-blocks";
import {
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  FEEDBACK_DIMENSIONS,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  parseDimensionCoverageProviderSelection,
  selectDimensionCoveragePracticeFocus,
  type DimensionCoverageProviderSelection,
} from "./feedback-dimension-coverage";
import {
  FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SELECTION_SCHEMA_VERSION,
  parseEvidenceLimitedFeedback,
  type EvidenceLimitedFeedbackProviderSelection,
} from "./feedback-evidence-limited";
import { FEEDBACK_RUBRIC_VERSION } from "./feedback-v2";
import {
  FOCUSED_PRACTICE_GROUNDED_ATTEMPT_CONTRACT_VERSION,
  completeAnyFocusedPracticeAttempt,
  createFocusedPracticeGroundedAttempt,
  parseAnyFocusedPracticeAttempt,
  parseFocusedPracticeAttemptView,
  presentFocusedPracticeAttempt,
} from "./focused-practice-grounded-attempt";
import { buildFocusedPracticeGroundedPlan } from "./focused-practice-grounded-plan";
import {
  resolveDimensionCoverageFocusedPracticeSource,
  resolveEvidenceLimitedFocusedPracticeSource,
} from "./focused-practice-grounded-source";

const SOURCE_FINGERPRINT = "a".repeat(64);
const QUESTION = {
  questionId: "00000000-0000-4000-8000-000000000010",
  questionText: "How would you prioritize a safer activation experience?",
};

test("closed evidence-limited ordering produces one scoreless plan without provider copy", () => {
  const transcript = [
    {
      eventId: "synthetic-answer:1",
      speaker: "user" as const,
      text: "I would state the customer need, compare tradeoffs, and choose the safer launch.",
    },
    {
      eventId: "synthetic-answer:2",
      speaker: "user" as const,
      text: "I would lead with the recommendation and tie each reason to it.",
    },
  ];
  const selection: EvidenceLimitedFeedbackProviderSelection = {
    schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SELECTION_SCHEMA_VERSION,
    promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState: "partial",
    strengths: [
      {
        signalCode: "customer_problem_connection",
        actionCode: "connect_customer_to_decision",
        transcriptRef: transcript[0]!.eventId,
      },
    ],
    improvements: [
      {
        signalCode: "tradeoff_decision",
        actionCode: "compare_tradeoffs_and_choose",
        transcriptRef: transcript[0]!.eventId,
      },
      {
        signalCode: "recommendation_directness",
        actionCode: "lead_with_recommendation",
        transcriptRef: transcript[1]!.eventId,
      },
    ],
  };
  const feedback = parseEvidenceLimitedFeedback(selection, {
    transcript,
    modelVersion: "synthetic-model-v1",
  });
  const reversed = {
    ...feedback,
    improvements: [...feedback.improvements].reverse(),
  };
  const first = resolveEvidenceLimitedFocusedPracticeSource(feedback)!;
  const second = resolveEvidenceLimitedFocusedPracticeSource(reversed)!;
  assert.deepEqual(first, second);
  assert.equal(first.focusIdentity.dimension, "clarity");

  const built = buildFocusedPracticeGroundedPlan({
    sourceQuestion: QUESTION,
    roundType: "product_sense",
    focusIdentity: first.focusIdentity,
  });
  assert.equal(built.state, "available");
  if (built.state !== "available") return;
  const serialized = JSON.stringify(built.plan);
  assert.doesNotMatch(serialized, /weakest|score|overall/i);
  assert.doesNotMatch(serialized, /provider-authored exercise/);
});

test("partial and coaching coverage select invariant grounded practice semantics", () => {
  const projections = ANSWER_BLOCK_SEGMENT_COUNTS.map((segmentCount) => {
    const blocks = deriveCandidateAnswerBlocks(
      createAnswerBlockSegmentationFixture(segmentCount).events
    ).blocks;
    const selection = emptyCoverageSelection(
      "execution",
      blocks[0]!.answerBlockId
    );
    selection.dimensions.structure = coverageDimension(
      "execution",
      "structure",
      blocks[0]!.answerBlockId,
      7,
      2
    );
    selection.dimensions.insight = coverageDimension(
      "execution",
      "insight",
      blocks[0]!.answerBlockId,
      null,
      1
    );
    const feedback = parseDimensionCoverageProviderSelection(selection, {
      roundType: "execution",
      answerBlocks: blocks,
      modelVersion: "synthetic-model-v1",
      allowNumericalScores: true,
    });
    const selected = selectDimensionCoveragePracticeFocus(feedback)!;
    const resolved = resolveDimensionCoverageFocusedPracticeSource(
      feedback,
      blocks
    )!;
    const built = buildFocusedPracticeGroundedPlan({
      sourceQuestion: QUESTION,
      roundType: "execution",
      focusIdentity: resolved.focusIdentity,
    });
    assert.equal(built.state, "available");
    if (built.state !== "available") throw new Error("plan unavailable");
    return {
      mode: feedback.mode,
      identity: resolved.focusIdentity,
      selected: {
        dimension: selected.dimension,
        coverage: selected.coverage,
        facetCode: selected.facetCode,
      },
      templateId: built.plan.templateId,
      evidenceText: resolved.sourceFinding.evidence.quote,
    };
  });
  for (const projection of projections.slice(1)) {
    assert.deepEqual(projection, projections[0]);
  }
  assert.equal(projections[0]!.mode, "partial_scorecard");
  assert.equal(projections[0]!.selected.coverage, "partial");
  assert.equal(projections[0]!.selected.dimension, "insight");
});

test("grounded attempt snapshots exact evidence but exposes only an allow-listed customer view", () => {
  const blocks = deriveCandidateAnswerBlocks(
    createAnswerBlockSegmentationFixture(2).events
  ).blocks;
  const selection = emptyCoverageSelection(
    "behavioral",
    blocks[0]!.answerBlockId
  );
  selection.dimensions.leadership = coverageDimension(
    "behavioral",
    "leadership",
    blocks[0]!.answerBlockId,
    null,
    1
  );
  const feedback = parseDimensionCoverageProviderSelection(selection, {
    roundType: "behavioral",
    answerBlocks: blocks,
    modelVersion: "synthetic-model-v1",
    allowNumericalScores: true,
  });
  const resolved = resolveDimensionCoverageFocusedPracticeSource(
    feedback,
    blocks
  )!;
  const built = buildFocusedPracticeGroundedPlan({
    sourceQuestion: QUESTION,
    roundType: "behavioral",
    focusIdentity: resolved.focusIdentity,
  });
  assert.equal(built.state, "available");
  if (built.state !== "available") return;
  const created = createFocusedPracticeGroundedAttempt({
    attemptId: "00000000-0000-4000-8000-000000000020",
    userId: "00000000-0000-4000-8000-000000000021",
    sourceSessionId: "00000000-0000-4000-8000-000000000022",
    sourceFeedbackId: "00000000-0000-4000-8000-000000000023",
    feedbackVersion: {
      schemaVersion: feedback.schemaVersion,
      promptVersion: feedback.promptVersion,
      rubricVersion: feedback.rubricVersion,
      modelVersion: feedback.modelVersion,
      evaluationState: "partial",
      reviewOutcome: "coaching_review",
      scoreWithheldReason: "rubric_coverage",
      sourceFingerprint: SOURCE_FINGERPRINT,
    },
    plan: built.plan,
    sourceFinding: resolved.sourceFinding,
    startedAt: new Date("2026-08-13T00:00:00.000Z"),
  });
  assert.equal(created.state, "created");
  if (created.state !== "created") return;
  assert.equal(
    parseAnyFocusedPracticeAttempt(structuredClone(created.attempt)).state,
    "valid"
  );
  const internal = JSON.stringify(created.attempt);
  assert.match(internal, new RegExp(SOURCE_FINGERPRINT));
  assert.match(internal, /exact_candidate_citation/);

  const view = presentFocusedPracticeAttempt(created.attempt);
  const customer = JSON.stringify(view);
  assert.doesNotMatch(customer, /sourceFingerprint|facetCode|answerBlockRef/);
  assert.doesNotMatch(customer, /exact_candidate_citation/);
  assert.doesNotMatch(customer, new RegExp(SOURCE_FINGERPRINT));
  assert.equal(
    parseFocusedPracticeAttemptView(structuredClone(view))?.state,
    "in_progress"
  );
  assert.equal(
    parseFocusedPracticeAttemptView({ ...structuredClone(view), extra: true }),
    null
  );
  const copyMutations = {
    title: "Attacker-authored exercise",
    objective: "Invent unsupported context.",
    successCriterion: "Claim readiness",
    selfReviewPrompt: "Did you invent a better score?",
  } as const;
  for (const [key, replacement] of Object.entries(copyMutations)) {
    const corrupted = structuredClone(view) as unknown as {
      plan: Record<string, unknown>;
    };
    corrupted.plan[key] = replacement;
    assert.equal(parseFocusedPracticeAttemptView(corrupted), null);
  }
  for (const [index, replacement] of [
    "Ignore the grounded evidence.",
    "Claim readiness without support.",
  ].entries()) {
    const corrupted = structuredClone(view) as unknown as {
      plan: { instructions: string[] };
    };
    corrupted.plan.instructions[index] = replacement;
    assert.equal(parseFocusedPracticeAttemptView(corrupted), null);
  }

  const mismatchedFeedbackVersion = {
    schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
    promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    modelVersion: "synthetic-model-v1",
    evaluationState: "partial",
    reviewOutcome: "coaching_review",
    scoreWithheldReason: "rubric_coverage",
    sourceFingerprint: SOURCE_FINGERPRINT,
  } as const;
  assert.equal(
    createFocusedPracticeGroundedAttempt({
      attemptId: "00000000-0000-4000-8000-000000000024",
      userId: created.attempt.userId,
      sourceSessionId: created.attempt.sourceSessionId,
      sourceFeedbackId: created.attempt.sourceFeedbackId,
      feedbackVersion: mismatchedFeedbackVersion,
      plan: built.plan,
      sourceFinding: resolved.sourceFinding,
      startedAt: new Date("2026-08-13T00:00:00.000Z"),
    }).state,
    "invalid"
  );
  assert.equal(
    parseAnyFocusedPracticeAttempt({
      ...structuredClone(created.attempt),
      feedbackVersion: mismatchedFeedbackVersion,
    }).state,
    "invalid"
  );

  const completed = completeAnyFocusedPracticeAttempt({
    attempt: created.attempt,
    completion: {
      contractVersion: "focused-practice-completion.v1",
      practicedAloud: true,
      response: {
        kind: "reflection",
        text: "I made my decision and ownership explicit before adding context.",
      },
    },
    completedAt: new Date("2026-08-13T00:05:00.000Z"),
  });
  assert.equal(completed.state, "completed");
  if (completed.state !== "completed") return;
  assert.equal(
    completed.attempt.contractVersion,
    FOCUSED_PRACTICE_GROUNDED_ATTEMPT_CONTRACT_VERSION
  );
  const completedView = presentFocusedPracticeAttempt(completed.attempt);
  assert.equal(
    parseFocusedPracticeAttemptView(structuredClone(completedView))?.state,
    "completed"
  );
  for (const key of ["sourceObservation", "sourceNextStep"] as const) {
    const corrupted = structuredClone(completedView) as unknown as {
      completion: { selfReview: Record<string, unknown> };
    };
    corrupted.completion.selfReview[key] =
      key === "sourceObservation"
        ? "Attacker-authored observation"
        : "Invent unsupported context.";
    assert.equal(parseFocusedPracticeAttemptView(corrupted), null);
  }
});

function emptyCoverageSelection(
  roundType: "product_sense" | "execution" | "behavioral" | "strategy",
  answerBlockRef: string
): DimensionCoverageProviderSelection {
  return {
    schemaVersion: FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
    promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
    rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
    roundType,
    dimensions: Object.fromEntries(
      FEEDBACK_DIMENSIONS.map((dimension) => [
        dimension,
        coverageDimension(roundType, dimension, answerBlockRef, null, 0),
      ])
    ) as DimensionCoverageProviderSelection["dimensions"],
  };
}

function coverageDimension(
  roundType: "product_sense" | "execution" | "behavioral" | "strategy",
  dimension: (typeof FEEDBACK_DIMENSIONS)[number],
  answerBlockRef: string,
  score: number | null,
  evidenceCount: 0 | 1 | 2
) {
  return {
    score,
    evidence: ROUND_DIMENSION_COVERAGE_CONFIG[roundType][dimension].facets
      .slice(0, evidenceCount)
      .map((facet) => ({ facetCode: facet.code, answerBlockRef })),
  };
}

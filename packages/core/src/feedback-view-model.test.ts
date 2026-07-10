import assert from "node:assert/strict";
import test from "node:test";

import {
  getFeedbackConfidenceLabel,
  presentCompletedFeedback,
  toFeedbackViewState,
  type FeedbackLifecycleResponse,
  type PersistedCompletedFeedback,
} from "./feedback-view-model";

const finding = {
  dimension: "insight",
  observation: "The answer selected a concrete segment.",
  transcriptRefs: ["writer:1"],
  evidence: [{ turnRef: "writer:1", quote: "working parents" }],
  nextStep: "Carry the segment through prioritization.",
  rubricVersion: "pm-feedback-rubric.v2",
  confidence: 0.9,
};

function completed(
  overrides: Partial<PersistedCompletedFeedback> = {}
): PersistedCompletedFeedback {
  return {
    id: "feedback-1",
    sessionId: "session-1",
    structureScore: 8,
    clarityScore: 7,
    insightScore: 9,
    communicationScore: 8,
    leadershipScore: 7,
    overallScore: "7.9",
    strengths: [finding],
    improvements: [
      {
        ...finding,
        dimension: "structure",
        evidence: [{ turnRef: "writer:2", quote: "first, I would" }],
        transcriptRefs: ["writer:2"],
      },
    ],
    drills: ["Practice a two-minute prioritization explanation."],
    summary: "The answer was specific and can become more structured.",
    rubricVersion: "pm-feedback-rubric.v2",
    schemaVersion: "feedback.v2",
    promptVersion: "feedback.prompt.v2",
    modelVersion: "fixture-model",
    evaluationState: "full",
    createdAt: new Date("2026-07-10T12:00:00.000Z"),
    ...overrides,
  };
}

test("presents strict full and partial v2 feedback without score coercion", () => {
  const full = presentCompletedFeedback(completed());
  assert.equal(full.kind, "v2");
  if (full.kind !== "v2") return;
  assert.equal(full.scores.overall, 7.9);
  assert.equal(full.nextPracticeRecommendation, null);
  assert.equal("suggestedExercises" in full, false);
  assert.equal(
    toFeedbackViewState({
      status: "completed",
      retryable: false,
      feedback: full,
    }).kind,
    "completed-full"
  );

  const partial = presentCompletedFeedback(
    completed({ evaluationState: "partial" })
  );
  assert.equal(partial.kind, "v2");
  if (partial.kind !== "v2") return;
  assert.equal(
    toFeedbackViewState({
      status: "completed",
      retryable: false,
      feedback: partial,
    }).kind,
    "completed-partial"
  );
});

test("rejects malformed evidence, unsupported versions, absent scores, and overall mismatches", () => {
  const cases: PersistedCompletedFeedback[] = [
    completed({ overallScore: "8.0" }),
    completed({ clarityScore: null }),
    completed({ schemaVersion: "feedback.v3" }),
    completed({ strengths: [{ ...finding, evidence: null }] }),
    completed({ strengths: [{ ...finding, confidence: 1.2 }] }),
    completed({ strengths: [{ ...finding, unexpected: true }] }),
  ];

  for (const candidate of cases) {
    assert.deepEqual(presentCompletedFeedback(candidate), {
      kind: "invalid",
      reason: "incompatible_or_corrupt",
    });
  }
});

test("presents validated legacy feedback only as an explicit historical variant", () => {
  const legacy = presentCompletedFeedback(
    completed({
      strengths: ["Clear explanation"],
      improvements: [
        { dimension: "structure", text: "State the approach first" },
      ],
      // Legacy feedback stored a separate model-authored overall score.
      overallScore: "8.0",
      rubricVersion: "1.0.0",
      schemaVersion: null,
      promptVersion: null,
      modelVersion: null,
      evaluationState: null,
    })
  );

  assert.equal(legacy.kind, "legacy");
  if (legacy.kind !== "legacy") return;
  assert.equal(legacy.scores.overall, 8);
  assert.deepEqual(legacy.improvements, ["State the approach first"]);
  assert.equal("suggestedExercises" in legacy, false);
  assert.equal(
    toFeedbackViewState({
      status: "completed",
      retryable: false,
      feedback: legacy,
    }).kind,
    "completed-legacy"
  );
});

test("fails closed for malformed legacy notes", () => {
  const malformed = presentCompletedFeedback(
    completed({
      strengths: [{ dimension: "unknown", text: "Historical note" }],
      improvements: ["State the approach first"],
      rubricVersion: "1.0.0",
      schemaVersion: null,
      promptVersion: null,
      modelVersion: null,
      evaluationState: null,
    })
  );
  assert.equal(malformed.kind, "invalid");
});

test("fails closed when any persisted v2 string or collection exceeds its field limit", () => {
  const long = (length: number) => "x".repeat(length);
  const cases: PersistedCompletedFeedback[] = [
    completed({ id: long(257) }),
    completed({ sessionId: long(257) }),
    completed({ modelVersion: long(257) }),
    completed({ summary: long(4_001) }),
    completed({ drills: [long(2_001)] }),
    completed({ strengths: [{ ...finding, observation: long(2_001) }] }),
    completed({ strengths: [{ ...finding, nextStep: long(2_001) }] }),
    completed({
      strengths: [
        {
          ...finding,
          transcriptRefs: [long(257)],
          evidence: [{ turnRef: long(257), quote: "evidence" }],
        },
      ],
    }),
    completed({
      strengths: [
        {
          ...finding,
          evidence: [{ turnRef: "writer:1", quote: long(4_001) }],
        },
      ],
    }),
    completed({ strengths: Array.from({ length: 6 }, () => finding) }),
  ];

  for (const candidate of cases) {
    assert.equal(presentCompletedFeedback(candidate).kind, "invalid");
  }
});

test("fails closed when any persisted historical string or collection exceeds its field limit", () => {
  const long = (length: number) => "x".repeat(length);
  const legacy = (overrides: Partial<PersistedCompletedFeedback>) =>
    completed({
      strengths: ["Clear explanation"],
      improvements: ["State the approach first"],
      overallScore: "8.0",
      rubricVersion: "1.0.0",
      schemaVersion: null,
      promptVersion: null,
      modelVersion: null,
      evaluationState: null,
      ...overrides,
    });
  const cases = [
    legacy({ rubricVersion: long(257) }),
    legacy({ summary: long(4_001) }),
    legacy({ drills: [long(2_001)] }),
    legacy({ strengths: [long(4_001)] }),
    legacy({ strengths: [{ text: long(4_001) }] }),
    legacy({ strengths: [{ text: "note", evidence_quote: long(4_001) }] }),
    legacy({ strengths: [{ text: "note", example: long(4_001) }] }),
    legacy({ strengths: Array.from({ length: 11 }, () => "note") }),
  ];

  for (const candidate of cases) {
    assert.equal(presentCompletedFeedback(candidate).kind, "invalid");
  }
});

test("rejects non-canonical createdAt strings instead of normalizing them", () => {
  assert.equal(
    presentCompletedFeedback(completed({ createdAt: "2026-07-10T12:00:00Z" }))
      .kind,
    "invalid"
  );
});

test("keeps recovery attached to the authoritative lifecycle status", () => {
  assert.deepEqual(
    toFeedbackViewState({ status: "processing", retryable: true }),
    { kind: "processing", retryable: true }
  );
  assert.deepEqual(
    toFeedbackViewState({
      status: "failed",
      retryable: true,
      message: "Feedback could not be completed.",
    }),
    { kind: "failed-retryable", message: "Feedback could not be completed." }
  );
  assert.equal(
    toFeedbackViewState({
      status: "skipped",
      retryable: false,
      details: { tier: "abandoned", reasons: [], recommendations: [] },
    }).kind,
    "skipped-abandoned"
  );
});

test("maps every non-completed lifecycle response to an explicit view state", () => {
  const cases: Array<[FeedbackLifecycleResponse, string]> = [
    [{ status: "missing", retryable: true }, "missing"],
    [{ status: "session_not_ended", retryable: false }, "session-active"],
    [{ status: "pending", retryable: false }, "pending"],
    [{ status: "processing", retryable: false }, "processing"],
    [
      { status: "failed", retryable: true, message: "Could not complete." },
      "failed-retryable",
    ],
    [
      { status: "failed", retryable: false, message: "Could not complete." },
      "failed-terminal",
    ],
    [
      {
        status: "skipped",
        retryable: false,
        details: { tier: "insufficient", reasons: [], recommendations: [] },
      },
      "skipped-insufficient",
    ],
    [
      {
        status: "skipped",
        retryable: false,
        details: { tier: "abandoned", reasons: [], recommendations: [] },
      },
      "skipped-abandoned",
    ],
  ];

  for (const [response, expectedKind] of cases) {
    assert.equal(toFeedbackViewState(response).kind, expectedKind);
  }
  assert.equal(
    toFeedbackViewState({
      status: "completed",
      retryable: false,
      feedback: { kind: "invalid", reason: "incompatible_or_corrupt" },
    }).kind,
    "completed-invalid"
  );
});

test("confidence language describes evidence strength rather than readiness", () => {
  assert.equal(getFeedbackConfidenceLabel(0.8), "Strong evidence");
  assert.equal(getFeedbackConfidenceLabel(0.6), "Moderate evidence");
  assert.equal(getFeedbackConfidenceLabel(0.59), "Limited evidence");
});

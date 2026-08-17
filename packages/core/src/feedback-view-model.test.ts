import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeFeedbackLifecycleResponse,
  getFeedbackConfidenceLabel,
  parsePersistedFeedbackV2,
  presentCompletedFeedback,
  toFeedbackCustomerProjection,
  toFeedbackViewState,
  type FeedbackLifecycleResponse,
  type PersistedCompletedFeedback,
} from "./feedback-view-model";
import {
  EVIDENCE_LIMITED_ACTIONS,
  EVIDENCE_LIMITED_CONFIDENCE,
  EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS,
  EVIDENCE_LIMITED_STRENGTH_SIGNALS,
  EVIDENCE_LIMITED_SUMMARY,
  FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
} from "./feedback-evidence-limited";
import {
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  parseDimensionCoverageProviderSelection,
  type DimensionCoverageProviderSelection,
} from "./feedback-dimension-coverage";
import { deriveCandidateAnswerBlocks } from "./answer-blocks";
import {
  createAnswerBlockSegmentationFixture,
  createAnswerBlockTurn,
  createTotalScorecardSafeMarkerFixture,
} from "@meelni/test-fixtures";
import { projectTrustedClosedAnswerBlocks } from "./trusted-answer-block-authority";

const finding = {
  dimension: "insight",
  observation: "The answer selected a concrete segment.",
  transcriptRefs: ["writer:1"],
  evidence: [{ turnRef: "writer:1", quote: "working parents" }],
  nextStep: "Carry the segment through prioritization.",
  rubricVersion: "pm-feedback-rubric.v2",
  confidence: 0.9,
};
const evidenceTurns = [
  {
    eventId: "writer:1",
    speaker: "user",
    text: "I would focus on working parents first.",
    contractVersion: 2,
  },
  {
    eventId: "writer:2",
    speaker: "user",
    text: "First, I would define the goal; first, I would then prioritize.",
    contractVersion: 2,
  },
];

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

function present(
  input: PersistedCompletedFeedback,
  turns: readonly (typeof evidenceTurns)[number][] = evidenceTurns
) {
  return presentCompletedFeedback(input, { evidenceTurns: turns });
}

function evidenceLimitedCompleted(
  overrides: Partial<PersistedCompletedFeedback> = {}
): PersistedCompletedFeedback {
  return completed({
    structureScore: null,
    clarityScore: null,
    insightScore: null,
    communicationScore: null,
    leadershipScore: null,
    overallScore: null,
    strengths: [
      {
        signalCode: "customer_problem_connection",
        actionCode: "connect_customer_to_decision",
        dimension: "insight",
        observation:
          EVIDENCE_LIMITED_STRENGTH_SIGNALS.customer_problem_connection
            .observation,
        transcriptRefs: ["writer:1"],
        evidence: [
          {
            turnRef: "writer:1",
            quote: evidenceTurns[0]!.text,
          },
        ],
        nextStep:
          EVIDENCE_LIMITED_ACTIONS.connect_customer_to_decision.nextStep,
        rubricVersion: "pm-feedback-rubric.v2",
        confidence: EVIDENCE_LIMITED_CONFIDENCE,
      },
    ],
    improvements: [
      {
        signalCode: "structure_progression",
        actionCode: "outline_reasoning",
        dimension: "structure",
        observation:
          EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS.structure_progression
            .observation,
        transcriptRefs: ["writer:2"],
        evidence: [
          {
            turnRef: "writer:2",
            quote: evidenceTurns[1]!.text,
          },
        ],
        nextStep: EVIDENCE_LIMITED_ACTIONS.outline_reasoning.nextStep,
        rubricVersion: "pm-feedback-rubric.v2",
        confidence: EVIDENCE_LIMITED_CONFIDENCE,
      },
    ],
    drills: [],
    summary: EVIDENCE_LIMITED_SUMMARY,
    schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
    promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
    modelVersion: "fixture-model-v2",
    evaluationState: "partial",
    ...overrides,
  });
}

test("presents total-bearing historical v2 feedback without score coercion", () => {
  const full = present(completed());
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
    "completed-scorecard"
  );

  assert.equal(present(completed({ overallScore: "7.900" })).kind, "v2");

  const partial = present(completed({ evaluationState: "partial" }));
  assert.equal(partial.kind, "v2");
  if (partial.kind !== "v2") return;
  assert.equal(
    toFeedbackViewState({
      status: "completed",
      retryable: false,
      feedback: partial,
    }).kind,
    "completed-scorecard"
  );
  assert.equal(
    toFeedbackCustomerProjection({
      status: "completed",
      retryable: false,
      feedback: partial,
    })?.outcome,
    "scorecard"
  );
});

test("customer projection exposes only closed terminal outcomes", () => {
  assert.deepEqual(
    toFeedbackCustomerProjection({
      status: "skipped",
      retryable: false,
      details: {
        outcome: "unable_to_review",
        scoreWithheldReason: "verified_evidence_integrity",
        recovery: "credit_returned",
      },
    }),
    {
      outcome: "unable_to_review",
      scoreWithheldReason: "verified_evidence_integrity",
      recovery: "credit_returned",
    }
  );
  assert.equal(
    toFeedbackCustomerProjection({
      status: "pending",
      retryable: true,
    }),
    null
  );
  assert.equal(
    toFeedbackCustomerProjection({
      status: "completed",
      retryable: false,
      feedback: { kind: "invalid", reason: "incompatible_or_corrupt" },
    }),
    null
  );
});

test("presents and decodes only server-owned evidence-limited templates", () => {
  const presented = present(evidenceLimitedCompleted());
  assert.equal(presented.kind, "evidence-limited");
  if (presented.kind !== "evidence-limited") return;
  assert.equal(
    presented.strengths[0]?.observation,
    EVIDENCE_LIMITED_STRENGTH_SIGNALS.customer_problem_connection.observation
  );
  assert.equal(presented.strengths[0]?.citation, evidenceTurns[0]!.text);
  assert.equal(presented.scoreWithheldReason, "rubric_coverage");
  assert.equal(presented.prioritizedPracticeFocus.dimension, "structure");
  assert.equal("signalCode" in presented.strengths[0]!, false);
  assert.equal("actionCode" in presented.strengths[0]!, false);
  assert.equal("modelVersion" in presented, false);

  const decoded = decodeFeedbackLifecycleResponse({
    status: "completed",
    retryable: false,
    feedback: presented,
  });
  assert.equal(decoded?.status, "completed");
  assert.equal(
    toFeedbackViewState(decoded!).kind,
    "completed-coaching-review"
  );
  assert.equal(
    decodeFeedbackLifecycleResponse({
      status: "completed",
      retryable: false,
      feedback: {
        ...presented,
        scores: {
          structure: 8,
          clarity: 8,
          insight: 8,
          communication: 8,
          leadership: 8,
          overall: 8,
        },
      },
    }),
    null
  );

  const providerCopy = structuredClone(presented);
  providerCopy.strengths[0]!.observation = "VIII, grade A";
  assert.equal(
    decodeFeedbackLifecycleResponse({
      status: "completed",
      retryable: false,
      feedback: providerCopy,
    }),
    null
  );
  assert.equal(
    present(evidenceLimitedCompleted({ strengths: providerCopy.strengths }))
      .kind,
    "invalid"
  );

  const duplicateIdentity = structuredClone(presented);
  duplicateIdentity.strengths.push({
    ...structuredClone(duplicateIdentity.strengths[0]!),
    transcriptRef: "writer:2",
    citation: evidenceTurns[1]!.text,
  });
  assert.equal(
    decodeFeedbackLifecycleResponse({
      status: "completed",
      retryable: false,
      feedback: duplicateIdentity,
    }),
    null
  );
  assert.equal(
    present(
      evidenceLimitedCompleted({ strengths: duplicateIdentity.strengths })
    ).kind,
    "invalid"
  );
});

test("rebuilds the complete trusted Feedback v2 shape for internal workflows", () => {
  const parsed = parsePersistedFeedbackV2(completed(), { evidenceTurns });

  assert.equal(parsed.schemaVersion, "feedback.v2");
  assert.equal(parsed.overallScore, 7.9);
  assert.deepEqual(parsed.drills, [
    "Practice a two-minute prioritization explanation.",
  ]);
  assert.deepEqual(parsed.improvements[0]?.transcriptRefs, ["writer:2"]);

  assert.throws(() =>
    parsePersistedFeedbackV2(
      completed({
        strengths: [
          {
            ...finding,
            evidence: [{ turnRef: "writer:1", quote: "invented quote" }],
          },
        ],
      }),
      { evidenceTurns }
    )
  );
  assert.throws(() =>
    parsePersistedFeedbackV2(
      completed({
        schemaVersion: null,
        promptVersion: null,
        modelVersion: null,
        evaluationState: null,
        rubricVersion: "1.0.0",
      }),
      { evidenceTurns }
    )
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
    completed({ overallScore: " 7.9" }),
    completed({ overallScore: "+7.9" }),
    completed({ overallScore: "7.9e0" }),
    completed({ overallScore: "07.9" }),
  ];

  for (const candidate of cases) {
    assert.deepEqual(present(candidate), {
      kind: "invalid",
      reason: "incompatible_or_corrupt",
    });
  }
});

test("rejects persisted v2 evidence that is not grounded in canonical user turns", () => {
  const inventedReference = completed({
    strengths: [
      {
        ...finding,
        transcriptRefs: ["does-not-exist"],
        evidence: [
          {
            turnRef: "does-not-exist",
            quote: "invented quote",
          },
        ],
        confidence: 0.99,
      },
    ],
  });
  const inventedQuote = completed({
    strengths: [
      {
        ...finding,
        evidence: [{ turnRef: "writer:1", quote: "invented quote" }],
      },
    ],
  });

  assert.equal(present(inventedReference).kind, "invalid");
  assert.equal(present(inventedQuote).kind, "invalid");
  assert.equal(present(completed(), []).kind, "invalid");
  assert.equal(
    present(completed(), [
      { ...evidenceTurns[0], speaker: "interviewer" },
      evidenceTurns[1],
    ]).kind,
    "invalid"
  );
  assert.equal(
    present(completed(), [
      { ...evidenceTurns[0], contractVersion: 1 },
      evidenceTurns[1],
    ]).kind,
    "invalid"
  );
  assert.equal(
    present(
      completed(),
      Array.from({ length: 1_001 }, (_, index) => ({
        eventId: `writer:${index}`,
        speaker: "user",
        text: `Canonical answer ${index}`,
        contractVersion: 2,
      }))
    ).kind,
    "invalid"
  );
});

test("preserves canonical evidence event IDs through the 512-character contract", () => {
  const eventId = `writer:${"e".repeat(505)}`;
  assert.equal(eventId.length, 512);
  const longIdFinding = {
    ...finding,
    transcriptRefs: [eventId],
    evidence: [{ turnRef: eventId, quote: "working parents" }],
  };
  const presented = present(
    completed({
      strengths: [longIdFinding],
      improvements: [
        {
          ...longIdFinding,
          dimension: "structure",
          observation: "The answer can state the approach more explicitly.",
          evidence: [{ turnRef: eventId, quote: "focus on" }],
        },
      ],
    }),
    [
      {
        eventId,
        speaker: "user",
        text: "I would focus on working parents first.",
        contractVersion: 2,
      },
    ]
  );

  assert.equal(presented.kind, "v2");
  assert.ok(
    decodeFeedbackLifecycleResponse({
      status: "completed",
      retryable: false,
      feedback: presented,
    })
  );
});

test("keeps valid evidence readable when an unrelated semantic replay is excluded", () => {
  const result = present(completed(), [
    ...evidenceTurns,
    {
      eventId: "writer:3",
      speaker: "user",
      text: "I would focus on working parents first!",
      contractVersion: 2,
    },
  ]);

  assert.equal(result.kind, "v2");
});

test("presents validated legacy feedback only as an explicit historical variant", () => {
  const legacy = present(
    completed({
      strengths: ["Clear explanation"],
      improvements: [
        { dimension: "structure", text: "State the approach first" },
      ],
      overallScore: "7.9",
      rubricVersion: "1.0.0",
      schemaVersion: null,
      promptVersion: null,
      modelVersion: null,
      evaluationState: null,
    })
  );

  assert.equal(legacy.kind, "legacy");
  if (legacy.kind !== "legacy") return;
  assert.equal(legacy.scores.overall, 7.9);
  assert.deepEqual(legacy.improvements, ["State the approach first"]);
  assert.equal("suggestedExercises" in legacy, false);
  assert.equal(
    toFeedbackViewState({
      status: "completed",
      retryable: false,
      feedback: legacy,
    }).kind,
    "completed-scorecard"
  );
});

test("fails closed instead of projecting a noncanonical historical total", () => {
  const legacy = present(
    completed({
      strengths: ["Clear explanation"],
      improvements: ["State the approach first"],
      overallScore: "8.0",
      rubricVersion: "1.0.0",
      schemaVersion: null,
      promptVersion: null,
      modelVersion: null,
      evaluationState: null,
    })
  );
  assert.deepEqual(legacy, {
    kind: "invalid",
    reason: "incompatible_or_corrupt",
  });
  assert.equal(
    toFeedbackCustomerProjection({
      status: "completed",
      retryable: false,
      feedback: legacy,
    }),
    null
  );
});

test("fails closed for malformed legacy notes", () => {
  const malformed = present(
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

test("rejects historical feedback with an unsupported rubric version", () => {
  const unsupported = completed({
    strengths: ["Clear explanation"],
    improvements: ["State the approach first"],
    overallScore: "8.0",
    rubricVersion: "not-a-supported-rubric",
    schemaVersion: null,
    promptVersion: null,
    modelVersion: null,
    evaluationState: null,
  });

  assert.equal(present(unsupported).kind, "invalid");
});

test("fails closed when any persisted v2 string or collection exceeds its field limit", () => {
  const long = (length: number) => "x".repeat(length);
  const cases: PersistedCompletedFeedback[] = [
    completed({ id: long(257) }),
    completed({ sessionId: long(257) }),
    completed({ modelVersion: long(257) }),
    completed({ summary: long(4_001) }),
    completed({ overallScore: `${"0".repeat(31)}.0` }),
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
    assert.equal(present(candidate).kind, "invalid");
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
    legacy({ overallScore: `${"0".repeat(31)}.0` }),
    legacy({ drills: [long(2_001)] }),
    legacy({ strengths: [long(4_001)] }),
    legacy({ strengths: [{ text: long(4_001) }] }),
    legacy({ strengths: [{ text: "note", evidence_quote: long(4_001) }] }),
    legacy({ strengths: [{ text: "note", example: long(4_001) }] }),
    legacy({ strengths: Array.from({ length: 11 }, () => "note") }),
  ];

  for (const candidate of cases) {
    assert.equal(present(candidate).kind, "invalid");
  }
});

test("rejects non-canonical createdAt strings instead of normalizing them", () => {
  assert.equal(
    present(completed({ createdAt: "2026-07-10T12:00:00Z" })).kind,
    "invalid"
  );
});

test("keeps recovery attached to the authoritative lifecycle status", () => {
  assert.deepEqual(
    toFeedbackViewState({ status: "processing", retryable: true }),
    { kind: "processing", retryable: true, delayed: false }
  );
  assert.deepEqual(
    toFeedbackViewState({
      status: "failed",
      retryable: true,
      message: "Feedback could not be completed.",
      outcomeReason: "generation_failed",
    }),
    {
      kind: "failed-retryable",
      message: "Feedback could not be completed.",
      outcomeReason: "generation_failed",
    }
  );
  assert.equal(
    toFeedbackViewState({
      status: "skipped",
      retryable: false,
      details: {
        outcome: "unable_to_review",
        scoreWithheldReason: "rubric_coverage",
        recovery: "start_another_interview",
      },
    }).kind,
    "no-reviewable-answer"
  );
  assert.deepEqual(
    toFeedbackViewState({
      status: "skipped",
      retryable: true,
      details: {
        outcome: "unable_to_review",
        scoreWithheldReason: "verified_evidence_integrity",
        recovery: "review_recovery_available",
      },
    }),
    {
      kind: "transcript-integrity-degraded",
      retryable: true,
      details: {
        outcome: "unable_to_review",
        scoreWithheldReason: "verified_evidence_integrity",
        recovery: "review_recovery_available",
      },
    }
  );
});

test("maps every non-completed lifecycle response to an explicit view state", () => {
  const cases: Array<[FeedbackLifecycleResponse, string]> = [
    [{ status: "missing", retryable: true }, "missing"],
    [{ status: "session_not_ended", retryable: false }, "session-active"],
    [{ status: "settling", retryable: false }, "settling"],
    [{ status: "pending", retryable: false }, "pending"],
    [{ status: "processing", retryable: false }, "processing"],
    [
      {
        status: "dispatch_failed",
        retryable: true,
        message: "Your interview is saved, but feedback could not be queued.",
        outcomeReason: "dispatch_failed",
      },
      "dispatch-failed",
    ],
    [
      {
        status: "failed",
        retryable: true,
        message: "Could not complete.",
        outcomeReason: "generation_failed",
      },
      "failed-retryable",
    ],
    [
      {
        status: "failed",
        retryable: false,
        message: "Could not complete.",
        outcomeReason: "generation_failed",
      },
      "failed-terminal",
    ],
    [
      {
        status: "skipped",
        retryable: false,
        details: {
          outcome: "unable_to_review",
          scoreWithheldReason: "rubric_coverage",
          recovery: "start_another_interview",
        },
      },
      "no-reviewable-answer",
    ],
    [
      {
        status: "skipped",
        retryable: false,
        details: {
          outcome: "unable_to_review",
          scoreWithheldReason: "verified_evidence_integrity",
          recovery: "credit_recovery_in_progress",
        },
      },
      "transcript-integrity-degraded",
    ],
    [
      {
        status: "skipped",
        retryable: true,
        details: {
          outcome: "unable_to_review",
          scoreWithheldReason: "verified_evidence_integrity",
          recovery: "review_recovery_available",
        },
      },
      "transcript-integrity-degraded",
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

test("runtime-decodes every lifecycle status and rejects malformed or unknown payloads", () => {
  const validCompleted = present(completed());
  const valid: unknown[] = [
    { status: "missing", retryable: true },
    { status: "session_not_ended", retryable: false },
    { status: "settling", retryable: false },
    { status: "settling", retryable: true, delayed: true },
    { status: "pending", retryable: true, estimatedTimeRemaining: 10 },
    { status: "processing", retryable: false },
    {
      status: "dispatch_failed",
      retryable: true,
      message: "Your interview is saved, but feedback could not be queued.",
      outcomeReason: "dispatch_failed",
    },
    {
      status: "failed",
      retryable: true,
      message: "Try again.",
      outcomeReason: "generation_failed",
    },
    {
      status: "skipped",
      retryable: false,
      details: {
        outcome: "unable_to_review",
        scoreWithheldReason: "rubric_coverage",
        recovery: "start_another_interview",
      },
    },
    {
      status: "skipped",
      retryable: false,
      details: {
        outcome: "unable_to_review",
        scoreWithheldReason: "verified_evidence_integrity",
        recovery: "credit_returned",
      },
    },
    {
      status: "skipped",
      retryable: false,
      details: {
        outcome: "unable_to_review",
        scoreWithheldReason: "verified_evidence_integrity",
        recovery: "credit_recovery_in_progress",
      },
    },
    {
      status: "skipped",
      retryable: true,
      details: {
        outcome: "unable_to_review",
        scoreWithheldReason: "verified_evidence_integrity",
        recovery: "review_recovery_available",
      },
    },
    {
      status: "skipped",
      retryable: false,
      details: {
        outcome: "unable_to_review",
        scoreWithheldReason: "verified_evidence_integrity",
        recovery: null,
      },
    },
    { status: "completed", retryable: false, feedback: validCompleted },
  ];
  for (const payload of valid) {
    assert.ok(decodeFeedbackLifecycleResponse(payload));
  }

  const invalid: unknown[] = [
    null,
    {},
    { status: "unknown", retryable: false },
    { status: "missing", retryable: false },
    { status: "session_not_ended", retryable: true },
    { status: "settling", retryable: true, delayed: "yes" },
    { status: "pending", retryable: "yes" },
    { status: "processing", retryable: false, estimatedTimeRemaining: -1 },
    {
      status: "dispatch_failed",
      retryable: true,
      message: "Missing the required outcome.",
    },
    { status: "failed", retryable: true },
    {
      status: "skipped",
      retryable: false,
      details: {
        outcome: "unable_to_review",
        scoreWithheldReason: "invented",
        recovery: "start_another_interview",
      },
    },
    {
      status: "skipped",
      retryable: false,
      details: {
        outcome: "unable_to_review",
        scoreWithheldReason: "verified_evidence_integrity",
        recovery: "review_recovery_available",
      },
    },
    {
      status: "skipped",
      retryable: true,
      details: {
        outcome: "unable_to_review",
        scoreWithheldReason: "verified_evidence_integrity",
        recovery: "credit_returned",
      },
    },
    {
      status: "skipped",
      retryable: true,
      details: {
        outcome: "unable_to_review",
        scoreWithheldReason: "verified_evidence_integrity",
        recovery: null,
      },
    },
    {
      status: "skipped",
      retryable: false,
      details: {
        outcome: "unable_to_review",
        scoreWithheldReason: "verified_evidence_integrity",
        recovery: "start_another_interview",
      },
    },
    {
      status: "skipped",
      retryable: false,
      details: {
        outcome: "unable_to_review",
        scoreWithheldReason: "rubric_coverage",
        recovery: "credit_returned",
      },
    },
    {
      status: "skipped",
      retryable: false,
      details: {
        outcome: "unable_to_review",
        scoreWithheldReason: "rubric_coverage",
        recovery: "start_another_interview",
        outcomeReason: "no_reviewable_answer",
      },
    },
    { status: "completed", retryable: false, feedback: { kind: "v2" } },
  ];
  for (const payload of invalid) {
    assert.equal(decodeFeedbackLifecycleResponse(payload), null);
  }

  assert.deepEqual(toFeedbackViewState({ status: "unknown" } as never), {
    kind: "unavailable",
    message: "Feedback returned an unsupported response.",
  });
});

test("presents and runtime-decodes exact-grounded dimension coverage", () => {
  const blocks = deriveCandidateAnswerBlocks(
    createAnswerBlockSegmentationFixture(5).events
  ).blocks;
  const dimensions = {} as DimensionCoverageProviderSelection["dimensions"];
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const facetCount =
      dimension === "structure" ? 2 : dimension === "insight" ? 1 : 0;
    dimensions[dimension] = {
      score: dimension === "structure" ? 7 : null,
      evidence: ROUND_DIMENSION_COVERAGE_CONFIG.product_sense[dimension].facets
        .slice(0, facetCount)
        .map((facet) => ({
          facetCode: facet.code,
          answerBlockRef: blocks[0]!.answerBlockId,
        })),
    };
  }
  const result = parseDimensionCoverageProviderSelection(
    {
      schemaVersion: FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
      promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
      rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
      roundType: "product_sense",
      dimensions,
    },
    {
      roundType: "product_sense",
      answerBlocks: blocks,
      modelVersion: "synthetic-presenter-v1",
      allowNumericalScores: true,
    }
  );
  const persisted = completed({
    structureScore: null,
    clarityScore: null,
    insightScore: null,
    communicationScore: null,
    leadershipScore: null,
    overallScore: null,
    strengths: null,
    improvements: null,
    drills: [],
    summary: result.summary,
    rubricVersion: result.rubricVersion,
    schemaVersion: result.schemaVersion,
    promptVersion: result.promptVersion,
    modelVersion: result.modelVersion,
    evaluationState: result.evaluationState,
    feedbackMode: result.mode,
    feedbackRoundType: result.roundType,
    dimensionCoverage: result.dimensions,
  });
  const view = presentCompletedFeedback(persisted, {
    evidenceTurns: [],
    answerBlocks: blocks,
    expectedRoundType: "product_sense",
    frozenEvidenceState: "complete",
  });

  assert.equal(view.kind, "dimension-coverage");
  if (view.kind !== "dimension-coverage") return;
  assert.equal(view.outcome, "coaching_review");
  assert.equal("scores" in view, false);
  assert.equal("score" in view.dimensions.structure, false);
  assert.equal("score" in view.dimensions.insight, false);
  assert.equal(view.scoreWithheldReason, "rubric_coverage");
  assert.equal(view.coachingSignals.length, 3);
  assert.equal(view.prioritizedPracticeFocus?.dimension, "insight");
  assert.equal("facetCode" in view.dimensions.structure.evidence[0]!, false);
  assert.equal(
    "answerBlockRef" in view.dimensions.structure.evidence[0]!,
    false
  );
  assert.match(
    view.dimensions.structure.evidence[0]!.citation,
    /working parents/
  );
  assert.equal(
    presentCompletedFeedback(persisted, {
      evidenceTurns: [],
      answerBlocks: blocks,
    }).kind,
    "invalid"
  );
  assert.equal(
    presentCompletedFeedback(persisted, {
      evidenceTurns: [],
      answerBlocks: blocks,
      expectedRoundType: "strategy",
      frozenEvidenceState: "complete",
    }).kind,
    "invalid"
  );
  const partialEvidenceView = presentCompletedFeedback(persisted, {
    evidenceTurns: [],
    answerBlocks: blocks,
    expectedRoundType: "product_sense",
    frozenEvidenceState: "partial",
  });
  assert.equal(partialEvidenceView.kind, "dimension-coverage");
  if (partialEvidenceView.kind !== "dimension-coverage") return;
  assert.equal(partialEvidenceView.outcome, "coaching_review");
  assert.equal(
    partialEvidenceView.scoreWithheldReason,
    "verified_evidence_integrity"
  );
  assert.equal("scores" in partialEvidenceView, false);
  assert.equal("score" in partialEvidenceView.dimensions.structure, false);

  const historicalPartialWithoutAuthority = completed({
    ...persisted,
    structureScore: 7,
    summary:
      "Only PM dimensions with sufficient grounded evidence are scored; unsupported dimensions and the overall score are withheld.",
    feedbackMode: "partial_scorecard",
    dimensionCoverage: {
      ...result.dimensions,
      structure: { ...result.dimensions.structure, score: 7 },
    },
  });
  assert.equal(
    presentCompletedFeedback(historicalPartialWithoutAuthority, {
      evidenceTurns: [],
      answerBlocks: blocks,
      expectedRoundType: "product_sense",
      frozenEvidenceState: "partial",
    }).kind,
    "invalid"
  );
  const storedHistoricalPartial = structuredClone(
    historicalPartialWithoutAuthority
  );
  const historicalCoachingView = presentCompletedFeedback(
    historicalPartialWithoutAuthority,
    {
      evidenceTurns: [],
      answerBlocks: blocks,
      expectedRoundType: "product_sense",
      frozenEvidenceState: "complete",
    }
  );
  assert.equal(historicalCoachingView.kind, "dimension-coverage");
  if (historicalCoachingView.kind !== "dimension-coverage") return;
  assert.equal(historicalCoachingView.outcome, "coaching_review");
  assert.equal("scores" in historicalCoachingView, false);
  assert.equal("score" in historicalCoachingView.dimensions.structure, false);
  assert.equal(
    toFeedbackCustomerProjection({
      status: "completed",
      retryable: false,
      feedback: historicalCoachingView,
    })?.outcome,
    "coaching_review"
  );
  assert.deepEqual(historicalPartialWithoutAuthority, storedHistoricalPartial);
  assert.equal(
    decodeFeedbackLifecycleResponse({
      status: "completed",
      retryable: false,
      feedback: view,
    })?.status,
    "completed"
  );
  assert.equal(
    decodeFeedbackLifecycleResponse({
      status: "completed",
      retryable: false,
      feedback: { ...view, overallScore: 7 },
    }),
    null
  );
  assert.equal(
    decodeFeedbackLifecycleResponse({
      status: "completed",
      retryable: false,
      feedback: {
        ...view,
        dimensions: {
          ...view.dimensions,
          structure: { ...view.dimensions.structure, score: 7 },
        },
      },
    }),
    null
  );
  assert.equal(
    toFeedbackViewState({
      status: "completed",
      retryable: false,
      feedback: view,
    }).kind,
    "completed-coaching-review"
  );
});

test("repeated safe markers present the same closed customer scorecard as no markers", () => {
  const views = [false, true].map((repeatedSafeMarkers) => {
    const fixture = createTotalScorecardSafeMarkerFixture(repeatedSafeMarkers);
    const trusted = projectTrustedClosedAnswerBlocks(
      fixture.events,
      fixture.authority
    );
    assert.equal(trusted.status, "verified_prefix");
    assert.deepEqual(trusted.excludedBlocks, []);

    const scoreByDimension = {
      structure: 8,
      clarity: 7,
      insight: 9,
      communication: 8,
      leadership: 7,
    } as const;
    const dimensions = {} as DimensionCoverageProviderSelection["dimensions"];
    for (const [index, dimension] of FEEDBACK_DIMENSIONS.entries()) {
      dimensions[dimension] = {
        score: scoreByDimension[dimension],
        evidence: ROUND_DIMENSION_COVERAGE_CONFIG.product_sense[
          dimension
        ].facets.map((facet) => ({
          facetCode: facet.code,
          answerBlockRef: trusted.trustedBlocks[index]!.answerBlockId,
        })),
      };
    }
    const result = parseDimensionCoverageProviderSelection(
      {
        schemaVersion: FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
        promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
        rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
        roundType: "product_sense",
        dimensions,
      },
      {
        roundType: "product_sense",
        answerBlocks: trusted.trustedBlocks,
        modelVersion: "synthetic-safe-marker-presenter-v1",
        allowNumericalScores: true,
        verifiedPrefixProjection: trusted,
      }
    );
    assert.equal(result.mode, "full_scorecard");
    const view = presentCompletedFeedback(
      completed({
        structureScore: result.dimensions.structure.score,
        clarityScore: result.dimensions.clarity.score,
        insightScore: result.dimensions.insight.score,
        communicationScore: result.dimensions.communication.score,
        leadershipScore: result.dimensions.leadership.score,
        overallScore: result.overallScore,
        strengths: null,
        improvements: null,
        drills: [],
        summary: result.summary,
        rubricVersion: result.rubricVersion,
        schemaVersion: result.schemaVersion,
        promptVersion: result.promptVersion,
        modelVersion: result.modelVersion,
        evaluationState: result.evaluationState,
        feedbackMode: result.mode,
        feedbackRoundType: result.roundType,
        dimensionCoverage: result.dimensions,
        verifiedPrefixScope:
          result.schemaVersion === FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION
            ? result.verifiedPrefixScope
            : null,
      }),
      {
        evidenceTurns: [],
        answerBlocks: trusted.trustedBlocks,
        expectedRoundType: "product_sense",
        frozenEvidenceState: "partial",
        verifiedPrefixProjection: trusted,
      }
    );
    assert.equal(view.kind, "dimension-coverage");
    if (view.kind !== "dimension-coverage") throw new Error("invalid view");
    assert.equal(view.outcome, "scorecard");
    if (view.outcome !== "scorecard") throw new Error("scorecard required");
    assert.equal(view.scores.overall, 7.9);
    assert.equal(view.verifiedScope, null);
    assert.equal("mode" in view, false);
    assert.equal("overallScore" in view, false);
    assert.equal(
      toFeedbackCustomerProjection({
        status: "completed",
        retryable: false,
        feedback: view,
      })?.outcome,
      "scorecard"
    );
    assert.equal(
      decodeFeedbackLifecycleResponse({
        status: "completed",
        retryable: false,
        feedback: {
          ...view,
          scores: { ...view.scores, normalizedTotal: 7.9 },
        },
      }),
      null
    );
    return view;
  });

  assert.deepEqual(views[1], views[0]);
});

test("zero-excluded verified-prefix coaching exposes no misleading tail claim", () => {
  const events = [
    createAnswerBlockTurn({
      eventId: "synthetic-writer:1",
      sequence: 1,
      speaker: "interviewer",
      text: "Which customer problem would you prioritize?",
      startedAtMs: 1_000,
      endedAtMs: 1_500,
      audioDurationMs: 500,
    }),
    createAnswerBlockTurn({
      eventId: "synthetic-writer:2",
      sequence: 2,
      speaker: "user",
      text: "I would prioritize working parents because repeated handoff failures create measurable weekly coordination pain.",
      startedAtMs: 2_000,
      endedAtMs: 2_500,
      audioDurationMs: 500,
    }),
    createAnswerBlockTurn({
      eventId: "synthetic-writer:3",
      sequence: 3,
      speaker: "interviewer",
      text: "Which assumption would you test first?",
      startedAtMs: 3_000,
      endedAtMs: 3_500,
      audioDurationMs: 500,
    }),
    { kind: "session_end" as const, occurredAtMs: 4_000 },
  ];
  const projection = projectTrustedClosedAnswerBlocks(events, {
    contractVersion: "frozen-answer-block-authority.v1",
    snapshotState: "partial",
    cutoffAtMs: 4_000,
    writers: [
      {
        contractVersion: 1,
        writerId: "synthetic-writer",
        writerGeneration: 1,
        committedSequence: 3,
        integrityState: "healthy",
        settlementState: "missing",
      },
    ],
  });
  assert.equal(projection.status, "verified_prefix");
  assert.equal(projection.numericalScoreAuthority, "withheld");
  assert.equal(projection.excludedBlocks.length, 0);
  const dimensions = {} as DimensionCoverageProviderSelection["dimensions"];
  for (const dimension of FEEDBACK_DIMENSIONS) {
    dimensions[dimension] = {
      score: null,
      evidence:
        dimension === "structure"
          ? ROUND_DIMENSION_COVERAGE_CONFIG.product_sense.structure.facets.map(
              (facet) => ({
                facetCode: facet.code,
                answerBlockRef: projection.trustedBlocks[0]!.answerBlockId,
              })
            )
          : [],
    };
  }
  const result = parseDimensionCoverageProviderSelection(
    {
      schemaVersion: FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
      promptVersion: FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
      rubricVersion: FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
      roundType: "product_sense",
      dimensions,
    },
    {
      roundType: "product_sense",
      answerBlocks: projection.trustedBlocks,
      modelVersion: "synthetic-presenter-v2",
      allowNumericalScores: true,
      verifiedPrefixProjection: projection,
    }
  );
  assert.equal(result.schemaVersion, FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION);
  if (result.schemaVersion !== FEEDBACK_VERIFIED_PREFIX_SCHEMA_VERSION) {
    throw new Error("expected verified-prefix feedback");
  }
  const view = presentCompletedFeedback(
    completed({
      structureScore: null,
      clarityScore: null,
      insightScore: null,
      communicationScore: null,
      leadershipScore: null,
      overallScore: null,
      strengths: null,
      improvements: null,
      drills: [],
      summary: result.summary,
      rubricVersion: result.rubricVersion,
      schemaVersion: result.schemaVersion,
      promptVersion: result.promptVersion,
      modelVersion: result.modelVersion,
      evaluationState: result.evaluationState,
      feedbackMode: result.mode,
      feedbackRoundType: result.roundType,
      dimensionCoverage: result.dimensions,
      verifiedPrefixScope: result.verifiedPrefixScope,
    }),
    {
      evidenceTurns: [],
      answerBlocks: projection.trustedBlocks,
      expectedRoundType: "product_sense",
      frozenEvidenceState: "partial",
      verifiedPrefixProjection: projection,
    }
  );

  assert.equal(view.kind, "dimension-coverage");
  if (view.kind !== "dimension-coverage") return;
  assert.equal(view.outcome, "coaching_review");
  assert.equal(view.verifiedScope, null);
  assert.equal("score" in view.dimensions.structure, false);
  assert.ok(
    decodeFeedbackLifecycleResponse({
      status: "completed",
      retryable: false,
      feedback: view,
    })
  );
});

test("confidence language describes evidence strength rather than readiness", () => {
  assert.equal(getFeedbackConfidenceLabel(0.8), "Strong evidence");
  assert.equal(getFeedbackConfidenceLabel(0.6), "Moderate evidence");
  assert.equal(getFeedbackConfidenceLabel(0.59), "Limited evidence");
});

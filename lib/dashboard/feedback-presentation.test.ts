import assert from "node:assert/strict";
import test from "node:test";
import {
  FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  LEGACY_FEEDBACK_RUBRIC_VERSION,
  parseEvidenceLimitedFeedback,
} from "@meelni/core";

import {
  classifyDashboardFeedbackPresentation,
  DASHBOARD_FEEDBACK_PRESENTATION_LIMITS,
  type DashboardFeedbackPresentationCandidate,
} from "./feedback-presentation";

const transcript = [
  {
    eventId: "fixture:answer:1",
    speaker: "user" as const,
    text: "I would connect the customer need to the product decision, compare the tradeoffs, and choose a measurable outcome.",
    contractVersion: 2,
  },
];

const scoredStrength = {
  dimension: "insight",
  observation: "The answer connects customer evidence to the decision.",
  transcriptRefs: [transcript[0]!.eventId],
  evidence: [
    {
      turnRef: transcript[0]!.eventId,
      quote: "connect the customer need to the product decision",
    },
  ],
  nextStep: "Carry the evidence through the recommendation.",
  rubricVersion: FEEDBACK_RUBRIC_VERSION,
  confidence: 0.9,
};

const scoredImprovement = {
  ...scoredStrength,
  dimension: "structure",
  observation: "The answer can make its sequence more explicit.",
  evidence: [
    {
      turnRef: transcript[0]!.eventId,
      quote: "compare the tradeoffs",
    },
  ],
  nextStep: "State the sequence before explaining the tradeoffs.",
};

const evidenceLimited = parseEvidenceLimitedFeedback(
  {
    schemaVersion: "feedback.evidence-limited.selection.v1",
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
    ],
  },
  { transcript, modelVersion: "fixture-model" }
);

function candidate(
  overrides: Partial<DashboardFeedbackPresentationCandidate> = {}
): DashboardFeedbackPresentationCandidate {
  return {
    id: "feedback-1",
    sessionId: "session-1",
    status: "completed",
    outcomeReason: "feedback_generated",
    completionTier: "partial",
    overallScore: null,
    structureScore: null,
    clarityScore: null,
    insightScore: null,
    communicationScore: null,
    leadershipScore: null,
    schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
    promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
    modelVersion: "fixture-model",
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState: "partial",
    strengthsJson: JSON.stringify(evidenceLimited.strengths),
    improvementsJson: JSON.stringify(evidenceLimited.improvements),
    drillsJson: "[]",
    summary: evidenceLimited.summary,
    createdAt: new Date("2026-08-12T12:00:00.000Z"),
    ...overrides,
  };
}

function scoredCandidate(
  overrides: Partial<DashboardFeedbackPresentationCandidate> = {}
) {
  return candidate({
    overallScore: "7.4",
    structureScore: 7,
    clarityScore: 7,
    insightScore: 8,
    communicationScore: 7,
    leadershipScore: 8,
    schemaVersion: FEEDBACK_SCHEMA_VERSION,
    promptVersion: FEEDBACK_PROMPT_VERSION,
    evaluationState: "full",
    completionTier: "full",
    strengthsJson: JSON.stringify([scoredStrength]),
    improvementsJson: JSON.stringify([scoredImprovement]),
    drillsJson: JSON.stringify([
      "Practice a two-minute recommendation with explicit tradeoffs.",
    ]),
    summary: "The answer was grounded and can make its sequence clearer.",
    ...overrides,
  });
}

test("classifies valid completed scored and evidence-limited reviews", () => {
  assert.equal(
    classifyDashboardFeedbackPresentation(scoredCandidate(), transcript),
    "scored"
  );
  assert.equal(
    classifyDashboardFeedbackPresentation(candidate(), transcript),
    "evidence_limited"
  );
});

test("keeps supported legacy scores reachable without accepting unknown scored tuples", () => {
  const legacy = candidate({
    overallScore: "8.0",
    structureScore: 8,
    clarityScore: 8,
    insightScore: 8,
    communicationScore: 8,
    leadershipScore: 8,
    schemaVersion: null,
    promptVersion: null,
    modelVersion: null,
    rubricVersion: LEGACY_FEEDBACK_RUBRIC_VERSION,
    evaluationState: null,
    completionTier: null,
    outcomeReason: null,
    strengthsJson: JSON.stringify(["Connected the decision to evidence."]),
    improvementsJson: JSON.stringify(["State the recommendation first."]),
    drillsJson: JSON.stringify(["Practice a concise opening."]),
    summary: "A valid historical review.",
  });
  assert.equal(classifyDashboardFeedbackPresentation(legacy, []), "scored");

  for (const overrides of [
    { rubricVersion: "unknown-legacy-rubric" },
    { schemaVersion: "feedback.future" },
    { promptVersion: "feedback.prompt.future" },
    { modelVersion: "unexpected-partial-tuple" },
    { evaluationState: "full" },
  ]) {
    assert.equal(
      classifyDashboardFeedbackPresentation({ ...legacy, ...overrides }, []),
      "unavailable"
    );
  }
});

test("rejects incomplete or incoherent scored metadata", () => {
  const scored = scoredCandidate();

  for (const overrides of [
    { structureScore: null },
    { overallScore: "7.5" },
    { schemaVersion: "feedback.future" },
    { promptVersion: "feedback.prompt.future" },
    { completionTier: "partial" },
    { outcomeReason: "generation_failed" },
  ]) {
    assert.equal(
      classifyDashboardFeedbackPresentation(
        { ...scored, ...overrides },
        transcript
      ),
      "unavailable"
    );
  }
});

test("never infers evidence-limited reviewability from completed plus null score", () => {
  for (const overrides of [
    { schemaVersion: null },
    { promptVersion: "feedback.prompt.v2" },
    { modelVersion: "" },
    { rubricVersion: "1.0.0" },
    { evaluationState: "full" },
    { outcomeReason: "generation_failed" },
    { completionTier: "full" },
    { structureScore: 8 },
    { drillsJson: JSON.stringify(["provider drill"]) },
  ]) {
    assert.equal(
      classifyDashboardFeedbackPresentation(candidate(overrides), transcript),
      "unavailable"
    );
  }
});

test("pending, processing, failed, skipped, and missing rows remain unavailable", () => {
  for (const status of ["pending", "processing", "failed", "skipped", null]) {
    assert.equal(
      classifyDashboardFeedbackPresentation(candidate({ status }), transcript),
      "unavailable"
    );
  }
});

test("malformed, oversized, unknown, and tampered content fails closed", () => {
  const unknownSignal = structuredClone(evidenceLimited.strengths);
  unknownSignal[0]!.signalCode = "unknown_signal" as never;
  const tamperedTemplate = structuredClone(evidenceLimited.improvements);
  tamperedTemplate[0]!.nextStep = "Provider-authored coaching";

  for (const overrides of [
    { strengthsJson: "not-json" },
    {
      strengthsJson: "x".repeat(
        DASHBOARD_FEEDBACK_PRESENTATION_LIMITS.findingsJson + 1
      ),
    },
    { strengthsJson: JSON.stringify(unknownSignal) },
    { improvementsJson: JSON.stringify(tamperedTemplate) },
    { summary: "Provider-authored summary" },
  ]) {
    assert.equal(
      classifyDashboardFeedbackPresentation(candidate(overrides), transcript),
      "unavailable"
    );
  }
});

test("requires exact frozen citations and references for every versioned review", () => {
  const forgedEvidenceLimited = structuredClone(evidenceLimited.strengths);
  forgedEvidenceLimited[0]!.evidence[0]!.quote = "A forged quote";
  const missingEvidenceLimited = structuredClone(evidenceLimited.strengths);
  missingEvidenceLimited[0]!.transcriptRefs = ["fixture:missing"];
  missingEvidenceLimited[0]!.evidence = [
    { turnRef: "fixture:missing", quote: "A missing quote" },
  ];

  for (const review of [
    candidate({ strengthsJson: JSON.stringify(forgedEvidenceLimited) }),
    candidate({ strengthsJson: JSON.stringify(missingEvidenceLimited) }),
    scoredCandidate({
      strengthsJson: JSON.stringify([
        {
          ...scoredStrength,
          evidence: [
            { turnRef: transcript[0]!.eventId, quote: "A forged quote" },
          ],
        },
      ]),
    }),
    scoredCandidate({
      strengthsJson: JSON.stringify([
        {
          ...scoredStrength,
          transcriptRefs: ["fixture:missing"],
          evidence: [{ turnRef: "fixture:missing", quote: "A missing quote" }],
        },
      ]),
    }),
  ]) {
    assert.equal(
      classifyDashboardFeedbackPresentation(review, transcript),
      "unavailable"
    );
  }
});

test("rejects malformed scored v2 and legacy findings and practice suggestions", () => {
  const legacy = candidate({
    overallScore: "8.0",
    structureScore: 8,
    clarityScore: 8,
    insightScore: 8,
    communicationScore: 8,
    leadershipScore: 8,
    schemaVersion: null,
    promptVersion: null,
    modelVersion: null,
    rubricVersion: LEGACY_FEEDBACK_RUBRIC_VERSION,
    evaluationState: null,
    completionTier: null,
    outcomeReason: null,
    strengthsJson: JSON.stringify(["Valid historical strength."]),
    improvementsJson: JSON.stringify(["Valid historical improvement."]),
    drillsJson: JSON.stringify(["Valid historical practice suggestion."]),
    summary: "A valid historical review.",
  });

  for (const [review, turns] of [
    [
      scoredCandidate({ strengthsJson: JSON.stringify([{ text: "invalid" }]) }),
      transcript,
    ],
    [
      scoredCandidate({ drillsJson: JSON.stringify([{ text: "invalid" }]) }),
      transcript,
    ],
    [{ ...legacy, strengthsJson: JSON.stringify([{ note: "invalid" }]) }, []],
    [{ ...legacy, drillsJson: JSON.stringify([{ text: "invalid" }]) }, []],
  ] as const) {
    assert.equal(
      classifyDashboardFeedbackPresentation(review, turns),
      "unavailable"
    );
  }
});

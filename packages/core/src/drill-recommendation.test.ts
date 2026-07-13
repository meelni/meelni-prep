import assert from "node:assert/strict";
import test from "node:test";

import {
  DRILL_RECOMMENDATION_CONTRACT_VERSION,
  DRILL_TEMPLATE_VERSION,
  recommendDrill,
} from "./drill-recommendation";
import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  type FeedbackEvaluationState,
  type FeedbackV2Item,
  type FeedbackV2Result,
} from "./feedback-v2";
import { calculateOverallScore, type FeedbackDimension } from "./evaluation";
import type { RoundType } from "./interview";

const baseFinding = {
  dimension: "structure" as const,
  observation: "The answer does not define a decision threshold.",
  transcriptRefs: ["writer:2"],
  evidence: [
    {
      turnRef: "writer:2",
      quote: "I did not define a decision threshold",
    },
  ],
  nextStep: "State the threshold before comparing options.",
  rubricVersion: FEEDBACK_RUBRIC_VERSION,
  confidence: 0.8,
};

function feedback(overrides?: {
  evaluationState?: FeedbackEvaluationState;
  improvements?: FeedbackV2Result["improvements"];
  scores?: Partial<FeedbackV2Result["scores"]>;
}): FeedbackV2Result {
  const scores = {
    structure: 4,
    clarity: 7,
    insight: 8,
    communication: 7,
    leadership: 7,
    ...overrides?.scores,
  };
  return {
    schemaVersion: FEEDBACK_SCHEMA_VERSION,
    promptVersion: FEEDBACK_PROMPT_VERSION,
    modelVersion: "validated-fixture-model",
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    evaluationState: overrides?.evaluationState ?? "full",
    scores,
    overallScore: calculateOverallScore(scores),
    strengths: [
      {
        ...baseFinding,
        dimension: "insight",
        observation: "The answer identifies a specific user need.",
        transcriptRefs: ["writer:1"],
        evidence: [{ turnRef: "writer:1", quote: "specific user need" }],
        nextStep: "Carry the need through prioritization.",
      },
    ],
    improvements: overrides?.improvements ?? [baseFinding],
    drills: ["Legacy generated drill text is not used by this contract."],
    summary: "Evidence-grounded fixture feedback.",
  };
}

function recommend(input?: {
  roundType?: RoundType | string;
  sourceState?: string;
  templateVersion?: string;
  feedback?: FeedbackV2Result | null;
}) {
  return recommendDrill({
    roundType: input?.roundType ?? "product_sense",
    sourceState: input?.sourceState ?? "completed",
    templateVersion: input?.templateVersion ?? DRILL_TEMPLATE_VERSION,
    feedback: input?.feedback === undefined ? feedback() : input.feedback,
  });
}

test("equal validated inputs produce one stable PM drill ID", () => {
  const first = recommend();
  const second = recommend();

  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    state: "recommended",
    contractVersion: DRILL_RECOMMENDATION_CONTRACT_VERSION,
    templateVersion: DRILL_TEMPLATE_VERSION,
    drillId:
      "pm-drill:pm-drill-templates.v1:product_sense:structure:grounded_full",
    roundType: "product_sense",
    weakestDimension: "structure",
    weakestScore: 4,
    tiedDimensions: ["structure"],
    evidenceGap: "grounded_full",
    sourceFinding: {
      transcriptRefs: ["writer:2"],
      confidence: 0.8,
    },
  });
});

test("partial validated evidence receives a distinct evidence-gap mapping", () => {
  const full = recommend();
  const partial = recommend({
    feedback: feedback({ evaluationState: "partial" }),
  });

  assert.equal(full.state, "recommended");
  assert.equal(partial.state, "recommended");
  if (full.state !== "recommended" || partial.state !== "recommended") return;
  assert.equal(partial.evidenceGap, "grounded_partial");
  assert.notEqual(partial.drillId, full.drillId);
});

test("ties use round-specific precedence only among grounded minimum dimensions", () => {
  const tieScores = {
    structure: 4,
    insight: 4,
    leadership: 4,
  };
  const improvements = [
    baseFinding,
    {
      ...baseFinding,
      dimension: "insight" as const,
      transcriptRefs: ["writer:3"],
      evidence: [{ turnRef: "writer:3", quote: "surface-level user need" }],
      confidence: 0.7,
    },
    {
      ...baseFinding,
      dimension: "leadership" as const,
      transcriptRefs: ["writer:4"],
      evidence: [{ turnRef: "writer:4", quote: "the team decided" }],
      confidence: 0.9,
    },
  ];

  const expectedByRound: Record<RoundType, FeedbackDimension> = {
    product_sense: "insight",
    execution: "structure",
    behavioral: "leadership",
    strategy: "insight",
  };
  for (const [roundType, expectedDimension] of Object.entries(
    expectedByRound
  ) as [RoundType, FeedbackDimension][]) {
    const result = recommend({
      roundType,
      feedback: feedback({ scores: tieScores, improvements }),
    });
    assert.equal(result.state, "recommended");
    if (result.state === "recommended") {
      assert.equal(result.weakestDimension, expectedDimension);
      assert.deepEqual(result.tiedDimensions, [
        "structure",
        "insight",
        "leadership",
      ]);
    }
  }
});

test("a tie ignores an ungrounded dimension but never falls through to a stronger score", () => {
  const groundedTied = recommend({
    feedback: feedback({
      scores: { structure: 4, insight: 4 },
      improvements: [baseFinding],
    }),
  });
  assert.equal(groundedTied.state, "recommended");
  if (groundedTied.state === "recommended") {
    assert.equal(groundedTied.weakestDimension, "structure");
  }

  const onlyStrongerGrounded = recommend({
    feedback: feedback({
      scores: { structure: 3, insight: 5 },
      improvements: [
        {
          ...baseFinding,
          dimension: "insight",
        },
      ],
    }),
  });
  assert.deepEqual(onlyStrongerGrounded, {
    state: "unavailable",
    contractVersion: DRILL_RECOMMENDATION_CONTRACT_VERSION,
    templateVersion: DRILL_TEMPLATE_VERSION,
    reason: "missing_grounded_improvement",
  });
});

test("missing, fractional, non-finite, and out-of-range scores fail closed", () => {
  const invalidScores: Array<Record<string, unknown>> = [
    { structure: undefined },
    { structure: 4.5 },
    { structure: Number.NaN },
    { structure: -1 },
    { structure: 11 },
  ];

  for (const scoreOverride of invalidScores) {
    const invalid = feedback() as unknown as {
      scores: Record<string, unknown>;
    } & FeedbackV2Result;
    Object.assign(invalid.scores, scoreOverride);
    assert.equal(recommend({ feedback: invalid }).state, "unavailable");
    assert.equal(
      (recommend({ feedback: invalid }) as { reason: string }).reason,
      "invalid_scores"
    );
  }
});

test("malformed findings cannot authorize personalization", () => {
  const malformedImprovements: Array<{
    improvement: unknown;
    reason: "missing_grounded_improvement" | "missing_validated_feedback";
  }> = [
    {
      improvement: { ...baseFinding, confidence: 0 },
      reason: "missing_validated_feedback",
    },
    {
      improvement: { ...baseFinding, confidence: Number.NaN },
      reason: "missing_validated_feedback",
    },
    {
      improvement: { ...baseFinding, confidence: 1.1 },
      reason: "missing_validated_feedback",
    },
    {
      improvement: { ...baseFinding, observation: " " },
      reason: "missing_validated_feedback",
    },
    {
      improvement: { ...baseFinding, nextStep: "" },
      reason: "missing_validated_feedback",
    },
    {
      improvement: { ...baseFinding, evidence: [] },
      reason: "missing_validated_feedback",
    },
    {
      improvement: { ...baseFinding, transcriptRefs: [] },
      reason: "missing_validated_feedback",
    },
    {
      improvement: { ...baseFinding, transcriptRefs: [""] },
      reason: "missing_validated_feedback",
    },
    {
      improvement: {
        ...baseFinding,
        transcriptRefs: ["writer:2"],
        evidence: [{ turnRef: "writer:2", quote: "" }],
      },
      reason: "missing_validated_feedback",
    },
    {
      improvement: {
        ...baseFinding,
        transcriptRefs: ["writer:2"],
        evidence: [{ turnRef: "writer:other", quote: "unrelated" }],
      },
      reason: "missing_validated_feedback",
    },
    {
      improvement: {
        ...baseFinding,
        transcriptRefs: ["writer:2", "writer:2"],
      },
      reason: "missing_validated_feedback",
    },
    {
      improvement: {
        ...baseFinding,
        transcriptRefs: ["writer:2"],
        evidence: [
          { turnRef: "writer:2", quote: "same" },
          { turnRef: "writer:2", quote: "same" },
        ],
      },
      reason: "missing_validated_feedback",
    },
    {
      improvement: { ...baseFinding, evidence: [null] },
      reason: "missing_validated_feedback",
    },
    {
      improvement: {
        ...baseFinding,
        evidence: [{ turnRef: 2, quote: "wrong type" }],
      },
      reason: "missing_validated_feedback",
    },
    {
      improvement: {
        ...baseFinding,
        evidence: [{ turnRef: "writer:2" }],
      },
      reason: "missing_validated_feedback",
    },
  ];
  for (const { improvement, reason } of malformedImprovements) {
    const result = recommend({
      feedback: feedback({
        improvements: [improvement as FeedbackV2Item],
      }),
    });
    assert.equal(result.state, "unavailable");
    if (result.state === "unavailable") {
      assert.equal(result.reason, reason);
    }
  }
});

test("zero-confidence findings invalidate the complete feedback root", () => {
  const mixedImprovements = recommend({
    feedback: feedback({
      improvements: [
        { ...baseFinding, confidence: 0 },
        {
          ...baseFinding,
          transcriptRefs: ["writer:3"],
          evidence: [{ turnRef: "writer:3", quote: "another gap" }],
        },
      ],
    }),
  });
  assert.deepEqual(mixedImprovements, {
    state: "unavailable",
    contractVersion: DRILL_RECOMMENDATION_CONTRACT_VERSION,
    templateVersion: DRILL_TEMPLATE_VERSION,
    reason: "missing_validated_feedback",
  });

  const zeroConfidenceStrength = feedback();
  zeroConfidenceStrength.strengths = [
    { ...zeroConfidenceStrength.strengths[0], confidence: 0 },
  ];
  const strengthResult = recommend({ feedback: zeroConfidenceStrength });
  assert.deepEqual(strengthResult, {
    state: "unavailable",
    contractVersion: DRILL_RECOMMENDATION_CONTRACT_VERSION,
    templateVersion: DRILL_TEMPLATE_VERSION,
    reason: "missing_validated_feedback",
  });
});

test("mixed, incomplete, extra-key, and duplicate-evidence payloads fail closed", () => {
  const valid = feedback();
  const malformedFinding = {
    ...baseFinding,
    transcriptRefs: ["writer:99"],
    evidence: [null],
  } as unknown as FeedbackV2Item;
  const mixed = {
    ...valid,
    improvements: [baseFinding, malformedFinding],
  };
  const incomplete = {
    schemaVersion: valid.schemaVersion,
    promptVersion: valid.promptVersion,
    modelVersion: valid.modelVersion,
    rubricVersion: valid.rubricVersion,
    evaluationState: valid.evaluationState,
    scores: valid.scores,
    improvements: valid.improvements,
  } as unknown as FeedbackV2Result;
  const extraRoot = {
    ...valid,
    providerPayload: "must not be accepted",
  } as unknown as FeedbackV2Result;
  const extraScore = {
    ...valid,
    scores: { ...valid.scores, readiness: 10 },
  } as unknown as FeedbackV2Result;
  const extraFindingField = {
    ...valid,
    improvements: [{ ...baseFinding, readiness: "invented" }],
  } as unknown as FeedbackV2Result;
  const extraEvidenceField = {
    ...valid,
    improvements: [
      {
        ...baseFinding,
        evidence: [
          {
            ...baseFinding.evidence[0],
            source: "invented",
          },
        ],
      },
    ],
  } as unknown as FeedbackV2Result;
  const malformedStrength = {
    ...valid,
    strengths: [{ ...valid.strengths[0], evidence: [null] }],
  } as unknown as FeedbackV2Result;
  const duplicateAcrossFindings = {
    ...valid,
    improvements: [
      {
        ...baseFinding,
        dimension: "clarity" as const,
        transcriptRefs: ["writer:1"],
        evidence: [{ turnRef: "writer:1", quote: "specific user need" }],
      },
    ],
  };

  for (const candidate of [
    mixed,
    incomplete,
    extraRoot,
    extraScore,
    extraFindingField,
    extraEvidenceField,
    malformedStrength,
    duplicateAcrossFindings,
  ]) {
    const result = recommend({ feedback: candidate });
    assert.equal(result.state, "unavailable");
    if (result.state === "unavailable") {
      assert.equal(result.reason, "missing_validated_feedback");
    }
  }
});

test("stored overall score must match the canonical validated dimensions", () => {
  const result = recommend({
    feedback: { ...feedback(), overallScore: 6.4 },
  });
  assert.equal(result.state, "unavailable");
  if (result.state === "unavailable") {
    assert.equal(result.reason, "invalid_scores");
  }
});

test("insufficient, skipped, abandoned, failed, and in-flight states stay explicit", () => {
  const expected = {
    pending: "feedback_pending",
    processing: "feedback_processing",
    failed: "feedback_failed",
    skipped: "feedback_skipped",
    insufficient: "feedback_insufficient",
    abandoned: "feedback_abandoned",
  } as const;

  for (const [sourceState, reason] of Object.entries(expected)) {
    const result = recommend({ sourceState, feedback: null });
    assert.equal(result.state, "unavailable");
    if (result.state === "unavailable") assert.equal(result.reason, reason);
  }
});

test("raw, legacy, invalid-state, and unregistered mapping versions fail closed", () => {
  assert.equal(recommend({ feedback: null }).state, "unavailable");

  const legacy = feedback() as FeedbackV2Result;
  Object.assign(legacy, { schemaVersion: "feedback.v1" });
  const legacyResult = recommend({ feedback: legacy });
  assert.equal(legacyResult.state, "unavailable");
  if (legacyResult.state === "unavailable") {
    assert.equal(legacyResult.reason, "missing_validated_feedback");
  }

  const futureVersion = recommend({
    templateVersion: "pm-drill-templates.v2",
  });
  assert.equal(futureVersion.state, "unavailable");
  if (futureVersion.state === "unavailable") {
    assert.equal(futureVersion.reason, "unsupported_template_version");
  }

  const invalidRound = recommend({ roundType: "analytical_thinking" });
  assert.equal(invalidRound.state, "unavailable");
  if (invalidRound.state === "unavailable") {
    assert.equal(invalidRound.reason, "invalid_round");
  }

  const invalidState = recommend({ sourceState: "ready" });
  assert.equal(invalidState.state, "unavailable");
  if (invalidState.state === "unavailable") {
    assert.equal(invalidState.reason, "invalid_source_state");
  }
});

test("source finding selection is stable across finding order", () => {
  const highConfidence = {
    ...baseFinding,
    transcriptRefs: ["writer:9", "writer:8"],
    evidence: [
      { turnRef: "writer:9", quote: "missing threshold" },
      { turnRef: "writer:8", quote: "unranked options" },
    ],
    confidence: 0.9,
  };
  const lowConfidence = {
    ...baseFinding,
    transcriptRefs: ["writer:3"],
    evidence: [{ turnRef: "writer:3", quote: "unclear sequence" }],
    confidence: 0.6,
  };

  const first = recommend({
    feedback: feedback({ improvements: [lowConfidence, highConfidence] }),
  });
  const second = recommend({
    feedback: feedback({ improvements: [highConfidence, lowConfidence] }),
  });
  assert.deepEqual(first, second);
  assert.equal(first.state, "recommended");
  if (first.state === "recommended") {
    assert.deepEqual(first.sourceFinding.transcriptRefs, [
      "writer:8",
      "writer:9",
    ]);
  }
});

test("canonically equivalent Unicode evidence IDs have one ordinal result", () => {
  const composedId = "\u00e9";
  const decomposedId = "e\u0301";
  const composed = {
    ...baseFinding,
    transcriptRefs: [composedId],
    evidence: [{ turnRef: composedId, quote: "same exact evidence" }],
    confidence: 0.9,
  };
  const decomposed = {
    ...baseFinding,
    transcriptRefs: [decomposedId],
    evidence: [{ turnRef: decomposedId, quote: "same exact evidence" }],
    confidence: 0.9,
  };

  const first = recommend({
    feedback: feedback({ improvements: [composed, decomposed] }),
  });
  const reversed = recommend({
    feedback: feedback({ improvements: [decomposed, composed] }),
  });

  assert.deepEqual(first, reversed);
  assert.equal(first.state, "recommended");
  if (first.state === "recommended") {
    assert.deepEqual(first.sourceFinding.transcriptRefs, [decomposedId]);
  }
});

test("stable IDs do not depend on provider model prose or array order", () => {
  const originalFeedback = feedback({
    improvements: [
      baseFinding,
      {
        ...baseFinding,
        transcriptRefs: ["writer:5"],
        evidence: [{ turnRef: "writer:5", quote: "another gap" }],
        confidence: 0.7,
      },
    ],
  });
  const rewrittenFeedback = {
    ...originalFeedback,
    modelVersion: "different-provider-model",
    summary: "Completely different provider prose.",
    drills: ["Different provider-authored drill text."],
    improvements: [...originalFeedback.improvements].reverse().map((item) => ({
      ...item,
      observation: `Rewritten: ${item.observation}`,
      nextStep: `Rewritten: ${item.nextStep}`,
      transcriptRefs: [...item.transcriptRefs].reverse(),
      evidence: [...item.evidence].reverse(),
    })),
  };

  const original = recommend({ feedback: originalFeedback });
  const rewritten = recommend({ feedback: rewrittenFeedback });
  assert.equal(original.state, "recommended");
  assert.equal(rewritten.state, "recommended");
  if (original.state === "recommended" && rewritten.state === "recommended") {
    assert.equal(rewritten.drillId, original.drillId);
    assert.equal(rewritten.weakestDimension, original.weakestDimension);
  }
});

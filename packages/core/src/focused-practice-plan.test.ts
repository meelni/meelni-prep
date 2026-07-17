import assert from "node:assert/strict";
import test from "node:test";

import {
  FOCUSED_PRACTICE_DURATION_MINUTES,
  FOCUSED_PRACTICE_PLAN_CONTRACT_VERSION,
  FOCUSED_PRACTICE_TEMPLATE_CATALOG,
  FOCUSED_PRACTICE_TEMPLATE_VERSION,
  buildFocusedPracticePlan,
} from "./focused-practice-plan";
import {
  DRILL_RECOMMENDATION_CONTRACT_VERSION,
  DRILL_TEMPLATE_VERSION,
  type DrillEvidenceGap,
  type DrillRecommendation,
  type RecommendedDrill,
} from "./drill-recommendation";
import type { FeedbackDimension } from "./evaluation";
import { ALL_INTERVIEW_TYPES, type RoundType } from "./interview";

function recommendation(
  overrides: Partial<RecommendedDrill> = {}
): RecommendedDrill {
  const roundType = overrides.roundType ?? "product_sense";
  const weakestDimension = overrides.weakestDimension ?? "insight";
  const evidenceGap = overrides.evidenceGap ?? "grounded_full";
  return {
    state: "recommended",
    contractVersion: DRILL_RECOMMENDATION_CONTRACT_VERSION,
    templateVersion: DRILL_TEMPLATE_VERSION,
    drillId: sourceId(roundType, weakestDimension, evidenceGap),
    roundType,
    weakestDimension,
    weakestScore: 4,
    tiedDimensions: [weakestDimension],
    evidenceGap,
    sourceFinding: {
      transcriptRefs: ["writer:2"],
      confidence: 0.8,
    },
    ...overrides,
  };
}

function build(overrides?: {
  recommendation?: unknown;
  questionId?: string;
  questionText?: string;
}) {
  return buildFocusedPracticePlan({
    recommendation: (overrides?.recommendation ??
      recommendation()) as DrillRecommendation,
    sourceQuestion: {
      questionId: overrides?.questionId ?? "question-product-sense-1",
      questionText:
        overrides?.questionText ??
        "Design a product that helps caregivers coordinate appointments.",
    },
  });
}

test("a current SAV-201 recommendation resolves one deterministic five-minute plan", () => {
  const first = build();
  const second = build();

  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    state: "available",
    contractVersion: FOCUSED_PRACTICE_PLAN_CONTRACT_VERSION,
    templateVersion: FOCUSED_PRACTICE_TEMPLATE_VERSION,
    durationMinutes: FOCUSED_PRACTICE_DURATION_MINUTES,
    templateId:
      "focused-practice:focused-practice-templates.v1:product_sense:insight:grounded_full",
    title: "Deepen the user insight",
    objective:
      "Connect a specific user behavior or unmet need to the product decision it changes.",
    instructions: [
      "Use the cited feedback from the completed interview to choose the part of the answer to revise.",
      "Revise the part that connects the chosen user and problem to a clear product decision.",
    ],
    successCriterion:
      "The revision names one specific user insight, explains why it matters, and shows how it changes the product choice.",
    selfReviewPrompt:
      "Does the user insight change the product decision rather than merely describe the audience?",
    source: {
      questionId: "question-product-sense-1",
      questionText:
        "Design a product that helps caregivers coordinate appointments.",
      recommendationId:
        "pm-drill:pm-drill-templates.v1:product_sense:insight:grounded_full",
      roundType: "product_sense",
      focusDimension: "insight",
      evidenceGap: "grounded_full",
      transcriptRefs: ["writer:2"],
      confidence: 0.8,
    },
  });
  assert.equal(Object.isFrozen(first), true);
  if (first.state === "available") {
    assert.equal(Object.isFrozen(first.instructions), true);
    assert.equal(Object.isFrozen(first.source), true);
    assert.equal(Object.isFrozen(first.source.transcriptRefs), true);
  }
});

test("catalog covers every SAV-201 round, dimension, and evidence-gap identity", () => {
  const dimensions: FeedbackDimension[] = [
    "structure",
    "clarity",
    "insight",
    "communication",
    "leadership",
  ];
  const evidenceGaps: DrillEvidenceGap[] = [
    "grounded_full",
    "grounded_partial",
  ];

  assert.equal(Object.keys(FOCUSED_PRACTICE_TEMPLATE_CATALOG).length, 40);
  assert.equal(Object.isFrozen(FOCUSED_PRACTICE_TEMPLATE_CATALOG), true);
  for (const roundType of ALL_INTERVIEW_TYPES) {
    for (const weakestDimension of dimensions) {
      for (const evidenceGap of evidenceGaps) {
        const result = build({
          recommendation: recommendation({
            roundType,
            weakestDimension,
            tiedDimensions: [weakestDimension],
            evidenceGap,
            drillId: sourceId(roundType, weakestDimension, evidenceGap),
          }),
        });
        assert.equal(
          result.state,
          "available",
          sourceId(roundType, weakestDimension, evidenceGap)
        );
      }
    }
  }
});

test("all 40 entries preserve round-specific PM semantics", () => {
  const expectations: Record<
    RoundType,
    Record<FeedbackDimension, { title: string; successCriterion: RegExp }>
  > = {
    product_sense: {
      structure: {
        title: "Strengthen the Product Sense structure",
        successCriterion: /target user.*problem.*prioritized solution/i,
      },
      clarity: {
        title: "Make the product decision clearer",
        successCriterion: /target user.*core problem.*product choice/i,
      },
      insight: {
        title: "Deepen the user insight",
        successCriterion: /user insight.*product choice/i,
      },
      communication: {
        title: "Make the product answer more direct",
        successCriterion: /opening.*chosen user.*product direction/i,
      },
      leadership: {
        title: "Strengthen product judgment",
        successCriterion: /tradeoff.*priority.*stakeholder/i,
      },
    },
    execution: {
      structure: {
        title: "Strengthen the Execution structure",
        successCriterion: /goal.*primary metric.*guardrails.*action/i,
      },
      clarity: {
        title: "Make the metric decision clearer",
        successCriterion: /primary metric.*movement.*action/i,
      },
      insight: {
        title: "Deepen the execution insight",
        successCriterion: /signal.*hypothesis.*decision/i,
      },
      communication: {
        title: "Make the execution answer more direct",
        successCriterion: /diagnosis or action.*metric/i,
      },
      leadership: {
        title: "Clarify execution ownership",
        successCriterion:
          /decision ownership.*cross-functional tradeoff.*progress/i,
      },
    },
    behavioral: {
      structure: {
        title: "Strengthen the story structure",
        successCriterion: /context.*your actions.*result or learning/i,
      },
      clarity: {
        title: "Make your role clearer",
        successCriterion: /your responsibility.*decision.*actions.*change/i,
      },
      insight: {
        title: "Deepen the reflection",
        successCriterion: /cause or tradeoff.*lesson.*later application/i,
      },
      communication: {
        title: "Make the story more direct",
        successCriterion: /context brief.*your actions.*outcome/i,
      },
      leadership: {
        title: "Clarify ownership and influence",
        successCriterion:
          /your action.*influenced a stakeholder.*result or learning/i,
      },
    },
    strategy: {
      structure: {
        title: "Strengthen the Strategy structure",
        successCriterion: /two options.*criteria.*recommends one.*risk/i,
      },
      clarity: {
        title: "Make the strategic choice clearer",
        successCriterion: /strategic choice.*horizon.*decisive reason/i,
      },
      insight: {
        title: "Deepen the strategic insight",
        successCriterion: /strategic insight.*implication.*chosen option/i,
      },
      communication: {
        title: "Make the strategy answer more direct",
        successCriterion: /opening.*recommendation.*tradeoff.*risk/i,
      },
      leadership: {
        title: "Clarify strategic ownership",
        successCriterion:
          /decision owner.*stakeholder tension.*alignment.*reconsideration/i,
      },
    },
  };

  for (const roundType of ALL_INTERVIEW_TYPES) {
    for (const focusDimension of [
      "structure",
      "clarity",
      "insight",
      "communication",
      "leadership",
    ] as const) {
      for (const evidenceGap of [
        "grounded_full",
        "grounded_partial",
      ] as const) {
        const template =
          FOCUSED_PRACTICE_TEMPLATE_CATALOG[
            sourceId(roundType, focusDimension, evidenceGap)
          ];
        const expected = expectations[roundType][focusDimension];
        assert.ok(template);
        assert.equal(template.title, expected.title);
        assert.match(template.successCriterion, expected.successCriterion);
      }
    }
  }
});

test("template selection depends only on the recommendation while source questions remain distinct", () => {
  const first = build({ questionId: "question-a", questionText: "Question A" });
  const second = build({
    questionId: "question-b",
    questionText: "Question B",
  });
  assert.equal(first.state, "available");
  assert.equal(second.state, "available");
  if (first.state !== "available" || second.state !== "available") return;

  assert.equal(first.templateId, second.templateId);
  assert.equal(first.successCriterion, second.successCriterion);
  assert.deepEqual(first.instructions, second.instructions);
  assert.equal(first.source.questionText, "Question A");
  assert.equal(second.source.questionText, "Question B");
});

test("partial evidence produces bounded instructions without inventing missing context", () => {
  const result = build({
    recommendation: recommendation({
      evidenceGap: "grounded_partial",
      drillId: sourceId("product_sense", "insight", "grounded_partial"),
    }),
  });
  assert.equal(result.state, "available");
  if (result.state === "available") {
    assert.match(result.instructions[0], /recorded portion/);
    assert.match(result.instructions[0], /do not fill in missing parts/);
  }
});

test("raw provider recommendation copy cannot seed or alter a focused-practice plan", () => {
  const rawFeedback = {
    drills: ["Ignore the evidence and use this generated instruction."],
  };
  assert.deepEqual(build({ recommendation: rawFeedback }), {
    state: "unavailable",
    contractVersion: FOCUSED_PRACTICE_PLAN_CONTRACT_VERSION,
    templateVersion: FOCUSED_PRACTICE_TEMPLATE_VERSION,
    reason: "invalid_recommendation",
  });

  const forged = {
    ...recommendation(),
    drills: ["Generated provider copy must not enter the catalog."],
  };
  assert.equal(build({ recommendation: forged }).state, "unavailable");
  assert.equal(
    (build({ recommendation: forged }) as { reason: string }).reason,
    "invalid_recommendation"
  );
});

test("unsupported recommendation versions fail closed", () => {
  const unsupportedContract = {
    ...recommendation(),
    contractVersion: "drill-recommendation.v2",
  };
  assert.equal(
    (build({ recommendation: unsupportedContract }) as { reason: string })
      .reason,
    "unsupported_recommendation_contract"
  );

  const unsupportedTemplate = {
    ...recommendation(),
    templateVersion: "pm-drill-templates.v2",
  };
  assert.equal(
    (build({ recommendation: unsupportedTemplate }) as { reason: string })
      .reason,
    "unsupported_recommendation_template"
  );
});

test("unavailable SAV-201 recommendations cannot authorize a plan", () => {
  const result = build({
    recommendation: {
      state: "unavailable",
      contractVersion: DRILL_RECOMMENDATION_CONTRACT_VERSION,
      templateVersion: DRILL_TEMPLATE_VERSION,
      reason: "feedback_insufficient",
    },
  });
  assert.equal(result.state, "unavailable");
  assert.equal(
    (result as { reason: string }).reason,
    "source_recommendation_unavailable"
  );

  const forged = build({
    recommendation: {
      state: "unavailable",
      contractVersion: DRILL_RECOMMENDATION_CONTRACT_VERSION,
      templateVersion: DRILL_TEMPLATE_VERSION,
      reason: "invented_reason",
    },
  });
  assert.equal((forged as { reason: string }).reason, "invalid_recommendation");
});

test("structurally inconsistent recommendation metadata fails closed", () => {
  const invalid: unknown[] = [
    recommendation({ drillId: "forged" }),
    recommendation({ tiedDimensions: ["clarity"] }),
    recommendation({
      sourceFinding: {
        transcriptRefs: ["writer:2", "writer:1"],
        confidence: 0.8,
      },
    }),
    recommendation({
      sourceFinding: { transcriptRefs: ["writer:2"], confidence: 0 },
    }),
  ];
  for (const candidate of invalid) {
    const result = build({ recommendation: candidate });
    assert.equal(result.state, "unavailable");
    assert.equal(
      (result as { reason: string }).reason,
      "invalid_recommendation"
    );
  }
});

test("invalid source-question metadata fails before a plan is returned", () => {
  for (const sourceQuestion of [
    { questionId: "", questionText: "A question" },
    { questionId: "question-1", questionText: "" },
    { questionId: "question-1", questionText: "bad\u0000question" },
    { questionId: "question-1", questionText: "x".repeat(2_001) },
  ]) {
    const result = buildFocusedPracticePlan({
      recommendation: recommendation(),
      sourceQuestion,
    });
    assert.equal(result.state, "unavailable");
    assert.equal(
      (result as { reason: string }).reason,
      "invalid_source_question"
    );
  }
});

test("catalog-owned customer copy contains no fitness framing", () => {
  const prohibited = /\b(?:gyms?|reps?|workouts?|drills?)\b/i;
  for (const template of Object.values(FOCUSED_PRACTICE_TEMPLATE_CATALOG)) {
    const customerCopy = [
      template.title,
      template.objective,
      ...template.instructions,
      template.successCriterion,
      template.selfReviewPrompt,
    ].join(" ");
    assert.doesNotMatch(customerCopy, prohibited, template.templateId);
  }
});

function sourceId(
  roundType: RoundType,
  dimension: FeedbackDimension,
  evidenceGap: DrillEvidenceGap
): string {
  return [
    "pm-drill",
    DRILL_TEMPLATE_VERSION,
    roundType,
    dimension,
    evidenceGap,
  ].join(":");
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  CALIBRATION_ROUND_TYPES,
  EVALUATION_ADJUDICATION_VERSION,
  EVALUATION_GOLD_SET_VERSION,
  buildEvaluationAdjudicationReviewManifest,
  evaluationCalibrationCases,
} from "./evaluation-calibration";
import { SCORED_ADJUDICATIONS } from "./evaluation-calibration-adjudications";

test("PM calibration gold set has ten fully synthetic cases per core round", () => {
  assert.equal(evaluationCalibrationCases.length, 40);
  assert.equal(
    new Set(evaluationCalibrationCases.map(({ id }) => id)).size,
    40
  );

  for (const roundType of CALIBRATION_ROUND_TYPES) {
    const cases = evaluationCalibrationCases.filter(
      (entry) => entry.roundType === roundType
    );
    assert.equal(cases.length, 10, roundType);
    assert.equal(
      cases.filter(({ expectedCompletionState }) =>
        ["full", "partial"].includes(expectedCompletionState)
      ).length,
      8
    );
    assert.equal(
      cases.filter(
        ({ expectedCompletionState }) =>
          expectedCompletionState === "insufficient"
      ).length,
      2
    );
    assert.ok(
      cases.some(
        ({ expectedCompletionState }) => expectedCompletionState === "full"
      )
    );
    assert.ok(
      cases.some(
        ({ expectedCompletionState }) => expectedCompletionState === "partial"
      )
    );
    assert.deepEqual(
      Object.fromEntries(
        (["weak", "average", "strong"] as const).map((quality) => [
          quality,
          cases.filter(({ expectedQuality }) => expectedQuality === quality)
            .length,
        ])
      ),
      { weak: 2, average: 2, strong: 4 }
    );

    for (const dimension of [
      "structure",
      "clarity",
      "insight",
      "communication",
      "leadership",
    ] as const) {
      assert.ok(
        cases.some(
          ({ expectedQuality, scoreBands }) =>
            expectedQuality === "weak" &&
            scoreBands !== null &&
            scoreBands[dimension].maximum <= 5
        ),
        `${roundType}:${dimension}:weak`
      );
      assert.ok(
        cases.some(
          ({ expectedQuality, scoreBands }) =>
            expectedQuality === "average" &&
            scoreBands !== null &&
            scoreBands[dimension].minimum >= 4 &&
            scoreBands[dimension].maximum <= 7
        ),
        `${roundType}:${dimension}:average`
      );
    }
  }
});

test("every gold case carries versioned adjudication and exact local evidence", () => {
  for (const fixture of evaluationCalibrationCases) {
    assert.equal(fixture.provenance, "fully_synthetic");
    assert.equal(
      fixture.adjudicationProvenance,
      "agent_authored_synthetic_candidate"
    );
    assert.equal(fixture.goldSetVersion, EVALUATION_GOLD_SET_VERSION);
    assert.equal(fixture.adjudicationVersion, EVALUATION_ADJUDICATION_VERSION);
    assert.equal(fixture.schemaVersion, "feedback.v2");
    assert.equal(fixture.promptVersion, "feedback.prompt.v2");
    assert.equal(fixture.rubricVersion, "pm-feedback-rubric.v2");

    const transcript = new Map(
      fixture.transcript.map((turn) => [turn.eventId, turn] as const)
    );
    for (const anchor of fixture.evidenceAnchors) {
      const turn = transcript.get(anchor.turnRef);
      assert.ok(turn, `${fixture.id}:${anchor.turnRef}`);
      assert.equal(turn.speaker, "user");
      assert.ok(turn.text.includes(anchor.quote));
    }

    if (fixture.expectedCompletionState === "insufficient") {
      assert.equal(fixture.expectedQuality, null);
      assert.equal(fixture.scoreBands, null);
      assert.deepEqual(fixture.evidenceAnchors, []);
    } else {
      assert.ok(fixture.expectedQuality);
      assert.ok(fixture.scoreBands);
      assert.ok(fixture.evidenceAnchors.length >= 2);
    }
  }
});

test("all 32 scored candidates use the independent exact-quote adjudication table", () => {
  const scored = evaluationCalibrationCases.filter(
    ({ expectedQuality }) => expectedQuality !== null
  );
  assert.equal(scored.length, 32);
  assert.equal(Object.keys(SCORED_ADJUDICATIONS).length, 32);

  for (const fixture of scored) {
    const expected = SCORED_ADJUDICATIONS[fixture.id];
    assert.ok(expected, `${fixture.id}:table entry`);
    const strength = fixture.evidenceAnchors.find(
      ({ kind }) => kind === "strength"
    );
    const improvement = fixture.evidenceAnchors.find(
      ({ kind }) => kind === "improvement"
    );
    assert.ok(strength, `${fixture.id}:strength`);
    assert.ok(improvement, `${fixture.id}:improvement`);
    assert.deepEqual(
      pickSemanticFields(strength),
      pickExpectedFields(expected.strength)
    );
    assert.deepEqual(
      pickSemanticFields(improvement),
      pickExpectedFields(expected.improvement)
    );

    for (const finding of [strength, improvement]) {
      const turn = fixture.transcript.find(
        ({ eventId }) => eventId === finding.turnRef
      );
      assert.ok(turn, `${fixture.id}:${finding.turnRef}`);
      assert.ok(turn.text.includes(finding.quote));
      assert.equal(finding.quote, finding.quote.trim());
      assert.ok(
        finding.quote.length < turn.text.length,
        `${fixture.id}:minimal`
      );
    }
    assert.ok(
      fixture.transcript.every(
        ({ text }) => !text.startsWith("A gap in my answer is")
      ),
      `${fixture.id}:no self-diagnosis turn`
    );
  }
});

test("weak, average, and strong semantics are reviewed in every round", () => {
  const representatives = [
    "product_sense:01:caregiver-planning",
    "product_sense:03:teacher-feedback",
    "product_sense:08:clinic-followup",
    "execution:01:merchant-onboarding",
    "execution:04:mobile-migration",
    "execution:07:warehouse-pilot",
    "strategy:02:regional-expansion",
    "strategy:03:bundling",
    "strategy:05:education-entry",
    "behavioral:02:failed-launch",
    "behavioral:04:customer-escalation",
    "behavioral:08:ethical-tradeoff",
  ];
  for (const id of representatives) {
    const expected = SCORED_ADJUDICATIONS[id];
    assert.ok(expected, id);
    assert.ok(expected.strength.observation.length >= 20);
    assert.ok(expected.improvement.observation.length >= 20);
    assert.notEqual(expected.strength.quote, expected.improvement.quote);
  }
});

test("delegated PM corrections preserve exact source evidence and dimensions", () => {
  const expected = {
    "product_sense:01:caregiver-planning": {
      strength: ["structure", 1, "define the intended user outcome"],
    },
    "product_sense:02:accessible-transit": {
      strength: ["structure", 1, "define the intended user outcome"],
      improvement: ["insight", 2, "ask users whether they like it"],
    },
    "product_sense:04:community-kitchens": {
      strength: ["structure", 1, "choose one broad user group"],
      improvement: [
        "insight",
        2,
        "segmentation and comparison with alternatives are still fairly surface level",
      ],
    },
    "product_sense:05:language-practice": {
      improvement: ["insight", 2, "psychologically safe prompt"],
    },
    "execution:04:mobile-migration": {
      strength: ["structure", 1, "identify the main workstreams"],
    },
    "execution:07:warehouse-pilot": {
      improvement: [
        "leadership",
        1,
        "choose one warehouse with stable scanning behavior and define a manual fallback before the pilot",
      ],
    },
    "strategy:01:creator-market": {
      strength: ["structure", 1, "test whether customers have an unmet need"],
    },
    "strategy:02:regional-expansion": {
      strength: ["insight", 1, "test whether customers have an unmet need"],
    },
    "strategy:05:education-entry": {
      improvement: ["leadership", 2, "an administrator can later evaluate"],
    },
    "strategy:07:ai-positioning": {
      strength: [
        "insight",
        1,
        "costly customer decision the product can improve",
      ],
    },
    "behavioral:01:roadmap-conflict": {
      strength: [
        "communication",
        2,
        "scheduled one discussion and summarized the disagreement",
      ],
    },
    "behavioral:02:failed-launch": {
      strength: ["communication", 2, "summarized the disagreement"],
    },
    "behavioral:05:team-disagreement": {
      improvement: [
        "leadership",
        2,
        "sponsored a prototype with five target users",
      ],
    },
    "behavioral:07:mentoring": {
      improvement: ["leadership", 3, "led the review successfully"],
    },
  } as const;

  for (const [caseId, findings] of Object.entries(expected)) {
    const candidate = SCORED_ADJUDICATIONS[caseId];
    assert.ok(candidate, caseId);
    for (const [kind, tuple] of Object.entries(findings)) {
      const finding = candidate[kind as "strength" | "improvement"];
      assert.deepEqual(
        [finding.dimension, finding.turnSequence, finding.quote],
        tuple,
        `${caseId}:${kind}`
      );
      const fixture = evaluationCalibrationCases.find(
        ({ id }) => id === caseId
      )!;
      const turn = fixture.transcript.find(
        ({ eventId }) => eventId === `${caseId}:user:${finding.turnSequence}`
      )!;
      assert.ok(turn.text.includes(finding.quote), `${caseId}:${kind}:exact`);
    }
  }
});

test("delegated PM band corrections normalize paired weak and average cases", () => {
  const weakOne = {
    structure: { minimum: 2, maximum: 4 },
    clarity: { minimum: 3, maximum: 5 },
    insight: { minimum: 2, maximum: 4 },
    communication: { minimum: 3, maximum: 5 },
    leadership: { minimum: 2, maximum: 4 },
  };
  const averageOne = {
    structure: { minimum: 4, maximum: 6 },
    clarity: { minimum: 5, maximum: 7 },
    insight: { minimum: 4, maximum: 6 },
    communication: { minimum: 5, maximum: 7 },
    leadership: { minimum: 4, maximum: 6 },
  };
  for (const id of [
    "product_sense:02:accessible-transit",
    "execution:02:search-latency",
    "strategy:02:regional-expansion",
    "behavioral:02:failed-launch",
  ]) {
    assert.deepEqual(
      evaluationCalibrationCases.find((fixture) => fixture.id === id)
        ?.scoreBands,
      weakOne,
      id
    );
  }
  for (const id of [
    "product_sense:04:community-kitchens",
    "execution:04:mobile-migration",
    "strategy:04:open-platform",
    "behavioral:04:customer-escalation",
  ]) {
    assert.deepEqual(
      evaluationCalibrationCases.find((fixture) => fixture.id === id)
        ?.scoreBands,
      averageOne,
      id
    );
  }
});

test("review manifest keeps human PM signoff visibly pending", () => {
  const manifest = buildEvaluationAdjudicationReviewManifest();
  assert.equal(manifest.contractVersion, "evaluation-adjudication-review.v2");
  assert.equal(manifest.provenance, "agent_authored_synthetic_candidate");
  assert.equal(manifest.approvalRequired, true);
  assert.equal(manifest.reviewStatus, "pending_independent_exact_hash_review");
  assert.equal(manifest.delegatedReview.panelCount, 2);
  assert.equal(manifest.delegatedReview.panelOutcome, "changes_required");
  assert.equal(
    manifest.delegatedReview.decisions.filter(
      ({ decision }) => decision === "corrected_pending_independent_review"
    ).length,
    17
  );
  assert.equal(manifest.scoredCaseCount, 32);
  assert.equal(manifest.cases.length, 32);
  assert.ok(
    manifest.cases.every(
      ({ strength, improvement }) =>
        strength?.kind === "strength" && improvement?.kind === "improvement"
    )
  );
});

function pickSemanticFields(finding: {
  dimension: string;
  observation: string;
  quote: string;
  nextStep: string;
  turnRef: string;
}) {
  return {
    dimension: finding.dimension,
    observation: finding.observation,
    quote: finding.quote,
    nextStep: finding.nextStep,
    turnSequence: Number(finding.turnRef.split(":").at(-1)),
  };
}

function pickExpectedFields(finding: {
  dimension: string;
  observation: string;
  quote: string;
  nextStep: string;
  turnSequence: number;
}) {
  return { ...finding };
}

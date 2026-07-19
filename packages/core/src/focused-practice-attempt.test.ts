import assert from "node:assert/strict";
import test from "node:test";

import {
  FOCUSED_PRACTICE_ATTEMPT_CONTRACT_VERSION,
  FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION,
  FOCUSED_PRACTICE_RESPONSE_LIMITS,
  FOCUSED_PRACTICE_SELF_REVIEW_VERSION,
  completeFocusedPracticeAttempt,
  createFocusedPracticeAttempt,
  parseFocusedPracticeAttempt,
  parseFocusedPracticeCompletionInput,
  type CreateFocusedPracticeAttemptInput,
  type FocusedPracticeAttempt,
} from "./focused-practice-attempt";
import {
  FOCUSED_PRACTICE_PLAN_CONTRACT_VERSION,
  FOCUSED_PRACTICE_TEMPLATE_VERSION,
  buildFocusedPracticePlan,
  type AvailableFocusedPracticePlan,
} from "./focused-practice-plan";
import {
  DRILL_RECOMMENDATION_CONTRACT_VERSION,
  DRILL_TEMPLATE_VERSION,
  type RecommendedDrill,
} from "./drill-recommendation";
import {
  FEEDBACK_PROMPT_VERSION,
  FEEDBACK_RUBRIC_VERSION,
  FEEDBACK_SCHEMA_VERSION,
  type FeedbackV2Item,
} from "./feedback-v2";

const STARTED_AT = new Date("2026-07-19T12:00:00.000Z");
const COMPLETED_AT = new Date("2026-07-19T12:05:00.000Z");

function recommendation(): RecommendedDrill {
  return {
    state: "recommended",
    contractVersion: DRILL_RECOMMENDATION_CONTRACT_VERSION,
    templateVersion: DRILL_TEMPLATE_VERSION,
    drillId:
      "pm-drill:pm-drill-templates.v1:product_sense:insight:grounded_full",
    roundType: "product_sense",
    weakestDimension: "insight",
    weakestScore: 4,
    tiedDimensions: ["insight"],
    evidenceGap: "grounded_full",
    sourceFinding: {
      transcriptRefs: ["writer:1", "writer:2"],
      confidence: 0.85,
    },
  };
}

function plan(): AvailableFocusedPracticePlan {
  const result = buildFocusedPracticePlan({
    recommendation: recommendation(),
    sourceQuestion: {
      questionId: "question-1",
      questionText: "Design a product for caregivers.",
    },
  });
  assert.equal(result.state, "available");
  return result as AvailableFocusedPracticePlan;
}

function sourceFinding(): FeedbackV2Item {
  return {
    dimension: "insight",
    observation:
      "The answer did not connect a specific caregiver need to the product choice.",
    transcriptRefs: ["writer:2", "writer:1"],
    evidence: [
      { turnRef: "writer:2", quote: "I would build a shared calendar" },
      { turnRef: "writer:1", quote: "caregivers have many tasks" },
    ],
    nextStep:
      "Name one caregiver need and explain how it changes the product choice.",
    rubricVersion: FEEDBACK_RUBRIC_VERSION,
    confidence: 0.85,
  };
}

function createInput(
  overrides: Partial<CreateFocusedPracticeAttemptInput> = {}
): CreateFocusedPracticeAttemptInput {
  return {
    attemptId: "attempt-1",
    userId: "user-1",
    sourceSessionId: "session-1",
    sourceFeedbackId: "feedback-1",
    feedbackVersion: {
      schemaVersion: FEEDBACK_SCHEMA_VERSION,
      promptVersion: FEEDBACK_PROMPT_VERSION,
      rubricVersion: FEEDBACK_RUBRIC_VERSION,
      modelVersion: "fixture-model-v2",
      evaluationState: "full",
    },
    plan: plan(),
    sourceFinding: sourceFinding(),
    startedAt: STARTED_AT,
    ...overrides,
  };
}

function attempt(): FocusedPracticeAttempt {
  const result = createFocusedPracticeAttempt(createInput());
  assert.equal(result.state, "created");
  if (result.state !== "created") throw new Error("fixture did not resolve");
  return result.attempt;
}

function completion(
  response: { kind: "revised_answer" | "reflection"; text: string } = {
    kind: "reflection",
    text: "I connected the caregiver's missed handoff to the shared-plan choice.",
  }
) {
  return {
    contractVersion: FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION,
    practicedAloud: true as const,
    response,
  };
}

test("creates one immutable in-progress attempt with exact source provenance", () => {
  const first = createFocusedPracticeAttempt(createInput());
  const second = createFocusedPracticeAttempt(createInput());

  assert.deepEqual(first, second);
  assert.equal(first.state, "created");
  if (first.state !== "created") return;
  assert.equal(
    first.attempt.contractVersion,
    FOCUSED_PRACTICE_ATTEMPT_CONTRACT_VERSION
  );
  assert.equal(first.attempt.lifecycleVersion, 0);
  assert.equal(first.attempt.state, "in_progress");
  assert.deepEqual(first.attempt.sourceFinding.transcriptRefs, [
    "writer:1",
    "writer:2",
  ]);
  assert.equal(
    first.attempt.plan.contractVersion,
    FOCUSED_PRACTICE_PLAN_CONTRACT_VERSION
  );
  assert.equal(
    first.attempt.plan.templateVersion,
    FOCUSED_PRACTICE_TEMPLATE_VERSION
  );
  assert.equal(Object.isFrozen(first.attempt), true);
  assert.equal(Object.isFrozen(first.attempt.feedbackVersion), true);
  assert.equal(Object.isFrozen(first.attempt.sourceFinding), true);
  assert.equal(Object.isFrozen(first.attempt.plan), true);
});

test("attempt creation snapshots a structurally valid mutable plan", () => {
  const mutablePlan = structuredClone(plan()) as unknown as {
    title: string;
    source: { questionText: string; transcriptRefs: string[] };
  };
  const created = createFocusedPracticeAttempt(
    createInput({
      plan: mutablePlan as unknown as AvailableFocusedPracticePlan,
    })
  );
  assert.equal(created.state, "created");
  if (created.state !== "created") return;

  mutablePlan.title = "Changed outside the attempt";
  mutablePlan.source.questionText = "Changed question";
  mutablePlan.source.transcriptRefs.push("writer:99");

  assert.equal(created.attempt.plan.title, plan().title);
  assert.equal(
    created.attempt.plan.source.questionText,
    "Design a product for caregivers."
  );
  assert.deepEqual(created.attempt.plan.source.transcriptRefs, [
    "writer:1",
    "writer:2",
  ]);
  assert.notStrictEqual(created.attempt.plan, mutablePlan);
  assert.notStrictEqual(created.attempt.plan.source, mutablePlan.source);
});

test("strictly decodes repository-hydrated in-progress and completed attempts", () => {
  const inProgress = attempt();
  const parsedInProgress = parseFocusedPracticeAttempt(
    structuredClone(inProgress)
  );
  assert.equal(parsedInProgress.state, "valid");
  if (parsedInProgress.state === "valid") {
    assert.deepEqual(parsedInProgress.attempt, inProgress);
    assert.notStrictEqual(parsedInProgress.attempt, inProgress);
    assert.equal(Object.isFrozen(parsedInProgress.attempt.plan.source), true);
  }

  const completed = completeFocusedPracticeAttempt({
    attempt: inProgress,
    completion: completion(),
    completedAt: COMPLETED_AT,
  });
  assert.equal(completed.state, "completed");
  if (completed.state !== "completed") return;
  const parsedCompleted = parseFocusedPracticeAttempt(
    structuredClone(completed.attempt)
  );
  assert.equal(parsedCompleted.state, "valid");
  if (parsedCompleted.state === "valid") {
    assert.deepEqual(parsedCompleted.attempt, completed.attempt);
    assert.equal(parsedCompleted.attempt.state, "completed");
  }
});

test("persisted attempt decoding fails closed on shape, version, state, and provenance drift", () => {
  const inProgress = structuredClone(attempt());
  const completed = completeFocusedPracticeAttempt({
    attempt: attempt(),
    completion: completion(),
    completedAt: COMPLETED_AT,
  });
  assert.equal(completed.state, "completed");
  if (completed.state !== "completed") return;

  const cases: unknown[] = [
    { ...inProgress, unexpected: true },
    { ...inProgress, contractVersion: "focused-practice-attempt.v2" },
    { ...inProgress, lifecycleVersion: 1 },
    { ...inProgress, startedAt: "2026-07-19T12:00:00Z" },
    {
      ...inProgress,
      plan: {
        ...inProgress.plan,
        source: {
          ...inProgress.plan.source,
          transcriptRefs: [...inProgress.plan.source.transcriptRefs].reverse(),
        },
      },
    },
    {
      ...completed.attempt,
      completion: {
        ...completed.attempt.completion,
        selfReview: {
          ...completed.attempt.completion.selfReview,
          sourceObservation: "Different observation",
        },
      },
    },
  ];

  for (const candidate of cases) {
    assert.deepEqual(parseFocusedPracticeAttempt(candidate), {
      state: "invalid",
      reason: "invalid_attempt",
    });
  }
});

test("attempt creation fails closed for identity, version, plan, finding, and time drift", () => {
  const invalid = [
    createInput({ userId: " user-1" }),
    createInput({
      feedbackVersion: {
        ...createInput().feedbackVersion,
        schemaVersion: "feedback.v3" as typeof FEEDBACK_SCHEMA_VERSION,
      },
    }),
    createInput({
      plan: {
        ...plan(),
        contractVersion:
          "focused-practice-plan.v2" as typeof FOCUSED_PRACTICE_PLAN_CONTRACT_VERSION,
      },
    }),
    createInput({
      plan: {
        ...plan(),
        title: "Provider-forged practice title",
      },
    }),
    createInput({
      feedbackVersion: {
        ...createInput().feedbackVersion,
        evaluationState: "partial",
      },
    }),
    createInput({
      sourceFinding: { ...sourceFinding(), dimension: "clarity" },
    }),
    createInput({ startedAt: new Date("invalid") }),
  ];

  const reasons = invalid.map((candidate) =>
    createFocusedPracticeAttempt(candidate)
  );
  assert.deepEqual(
    reasons.map((result) =>
      result.state === "invalid" ? result.reason : "unexpected_created"
    ),
    [
      "invalid_identity",
      "invalid_feedback_version",
      "invalid_plan",
      "invalid_plan",
      "invalid_plan",
      "invalid_source_finding",
      "invalid_started_at",
    ]
  );
});

test("completion produces a deterministic grounded self-review without a score or readiness claim", () => {
  const result = completeFocusedPracticeAttempt({
    attempt: attempt(),
    completion: completion({
      kind: "revised_answer",
      text: "  I would focus on missed caregiver handoffs, then prioritize a shared plan.\r\nThat need changes the product choice.  ",
    }),
    completedAt: COMPLETED_AT,
  });

  assert.equal(result.state, "completed");
  if (result.state !== "completed") return;
  assert.equal(result.attempt.lifecycleVersion, 1);
  assert.equal(result.attempt.completedAt, COMPLETED_AT.toISOString());
  assert.equal(
    result.attempt.completion.selfReview.version,
    FOCUSED_PRACTICE_SELF_REVIEW_VERSION
  );
  assert.equal(
    result.attempt.completion.selfReview.response.text,
    "I would focus on missed caregiver handoffs, then prioritize a shared plan.\nThat need changes the product choice."
  );
  assert.equal(
    result.attempt.completion.selfReview.sourceObservation,
    sourceFinding().observation
  );
  assert.equal(
    result.attempt.completion.selfReview.sourceNextStep,
    sourceFinding().nextStep
  );
  const serialized = JSON.stringify(result.attempt.completion.selfReview);
  assert.doesNotMatch(serialized, /score|pass|fail|ready|readiness|hiring/i);
  assert.equal(Object.isFrozen(result.attempt), true);
  assert.equal(Object.isFrozen(result.attempt.completion), true);
  assert.equal(Object.isFrozen(result.attempt.completion.selfReview), true);
});

test("reflection is a first-class completion response", () => {
  const result = completeFocusedPracticeAttempt({
    attempt: attempt(),
    completion: completion(),
    completedAt: COMPLETED_AT,
  });
  assert.equal(result.state, "completed");
  if (result.state === "completed") {
    assert.equal(
      result.attempt.completion.selfReview.response.kind,
      "reflection"
    );
  }
});

test("completion rejects malformed, unconfirmed, unbounded, and control-character input", () => {
  const cases: Array<[unknown, string]> = [
    [null, "invalid_completion"],
    [{ ...completion(), unexpected: true }, "invalid_completion"],
    [
      { ...completion(), contractVersion: "focused-practice-completion.v2" },
      "unsupported_completion_version",
    ],
    [{ ...completion(), practicedAloud: false }, "practice_not_confirmed"],
    [completion({ kind: "reflection", text: "  " }), "invalid_response"],
    [
      completion({
        kind: "reflection",
        text: "x".repeat(FOCUSED_PRACTICE_RESPONSE_LIMITS.reflection + 1),
      }),
      "invalid_response",
    ],
    [
      completion({ kind: "revised_answer", text: "contains\u0000control" }),
      "invalid_response",
    ],
    [
      {
        ...completion(),
        response: { kind: "reflection", text: "valid", extra: true },
      },
      "invalid_response",
    ],
  ];

  for (const [candidate, reason] of cases) {
    assert.deepEqual(parseFocusedPracticeCompletionInput(candidate), {
      state: "invalid",
      reason,
    });
  }
});

test("exact terminal replay is idempotent and divergent replay cannot overwrite it", () => {
  const completed = completeFocusedPracticeAttempt({
    attempt: attempt(),
    completion: completion(),
    completedAt: COMPLETED_AT,
  });
  assert.equal(completed.state, "completed");
  if (completed.state !== "completed") return;

  const replay = completeFocusedPracticeAttempt({
    attempt: completed.attempt,
    completion: completion(),
    completedAt: new Date("2026-07-19T12:06:00.000Z"),
  });
  const conflict = completeFocusedPracticeAttempt({
    attempt: completed.attempt,
    completion: completion({ kind: "reflection", text: "Different response" }),
    completedAt: new Date("2026-07-19T12:06:00.000Z"),
  });

  assert.equal(replay.state, "already_completed");
  assert.equal(conflict.state, "conflict");
  if (replay.state === "already_completed") {
    assert.strictEqual(replay.attempt, completed.attempt);
  }
  if (conflict.state === "conflict") {
    assert.strictEqual(conflict.attempt, completed.attempt);
  }
});

test("completion time cannot precede attempt creation", () => {
  assert.deepEqual(
    completeFocusedPracticeAttempt({
      attempt: attempt(),
      completion: completion(),
      completedAt: new Date("2026-07-19T11:59:59.999Z"),
    }),
    { state: "invalid", reason: "invalid_completed_at" }
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  FOCUSED_PRACTICE_ATTEMPT_CONTRACT_VERSION,
  FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION,
  type CompletedFocusedPracticeAttempt,
  type FocusedPracticeAttempt,
  type FocusedPracticeCompletionInput,
  type InProgressFocusedPracticeAttempt,
} from "@meelni/core";
import { createFocusedPracticeAttemptSourceFixtures } from "@meelni/test-fixtures";
import {
  completeFocusedPracticeAttemptWorkflow,
  startFocusedPracticeAttemptWorkflow,
  transitionFocusedPracticeAttemptCompletion,
  type BoundedFocusedPracticeSource,
  type FocusedPracticeAttemptRepository,
  type FocusedPracticeAttemptWorkflowDependencies,
} from "./focused-practice-attempt";

const STARTED_AT = new Date("2026-07-19T12:00:00.000Z");
const COMPLETED_AT = new Date("2026-07-19T12:05:00.000Z");

class InMemoryAttemptRepository implements FocusedPracticeAttemptRepository {
  readonly sources = new Map<string, BoundedFocusedPracticeSource>();
  readonly attempts = new Map<string, FocusedPracticeAttempt>();
  sourceReads = 0;
  attemptWrites = 0;
  completionWrites = 0;
  forcedCreateDisposition: "not_found" | "source_conflict" | null = null;
  atomicDeletionPending = false;
  afterFindOwnedBySource: (() => void) | null = null;
  beforeCreateOrLoad: (() => void) | null = null;
  beforeComplete: (() => void) | null = null;
  forcedCreateAttempt: InProgressFocusedPracticeAttempt | null = null;
  forcedGetAttempt: FocusedPracticeAttempt | null = null;
  forcedCompletionAttempt: CompletedFocusedPracticeAttempt | null = null;

  constructor(source: BoundedFocusedPracticeSource) {
    this.sources.set(source.sessionId, source);
  }

  async findOwnedBySource(input: {
    userId: string;
    sourceSessionId: string;
    contractVersion: typeof FOCUSED_PRACTICE_ATTEMPT_CONTRACT_VERSION;
  }) {
    const result =
      [...this.attempts.values()].find(
        (attempt) =>
          attempt.userId === input.userId &&
          attempt.sourceSessionId === input.sourceSessionId &&
          attempt.contractVersion === input.contractVersion
      ) ?? null;
    this.afterFindOwnedBySource?.();
    return result;
  }

  async loadOwnedSource(input: { userId: string; sourceSessionId: string }) {
    this.sourceReads += 1;
    const source = this.sources.get(input.sourceSessionId);
    return source?.userId === input.userId ? structuredClone(source) : null;
  }

  async createOrLoadOwned(input: {
    userId: string;
    sourceSessionId: string;
    attempt: InProgressFocusedPracticeAttempt;
  }) {
    this.beforeCreateOrLoad?.();
    if (this.atomicDeletionPending) {
      return { disposition: "account_deletion_pending" } as const;
    }
    if (this.forcedCreateDisposition) {
      return { disposition: this.forcedCreateDisposition } as const;
    }
    if (this.forcedCreateAttempt) {
      return {
        disposition: "created",
        attempt: this.forcedCreateAttempt,
      } as const;
    }
    const source = this.sources.get(input.sourceSessionId);
    if (!source || source.userId !== input.userId) {
      return { disposition: "not_found" } as const;
    }
    const existing = [...this.attempts.values()].find(
      (attempt) =>
        attempt.userId === input.userId &&
        attempt.sourceSessionId === input.sourceSessionId &&
        attempt.sourceFeedbackId === input.attempt.sourceFeedbackId &&
        attempt.plan.source.recommendationId ===
          input.attempt.plan.source.recommendationId &&
        attempt.plan.templateId === input.attempt.plan.templateId
    );
    if (existing) {
      if (!sameImmutableSource(existing, input.attempt)) {
        return { disposition: "source_conflict" } as const;
      }
      if (existing.state === "completed") {
        return {
          disposition: "already_completed",
          attempt: existing,
        } as const;
      }
      return {
        disposition: "resumed",
        attempt: existing,
      } as const;
    }
    this.attempts.set(input.attempt.attemptId, input.attempt);
    this.attemptWrites += 1;
    return { disposition: "created", attempt: input.attempt } as const;
  }

  async getOwned(input: { userId: string; attemptId: string }) {
    if (this.forcedGetAttempt) return this.forcedGetAttempt;
    const attempt = this.attempts.get(input.attemptId);
    return attempt?.userId === input.userId ? attempt : null;
  }

  async completeOwned(
    input: Parameters<FocusedPracticeAttemptRepository["completeOwned"]>[0]
  ) {
    this.beforeComplete?.();
    if (this.atomicDeletionPending) {
      return { disposition: "account_deletion_pending" } as const;
    }
    if (this.forcedCompletionAttempt) {
      return {
        disposition: "completed",
        attempt: this.forcedCompletionAttempt,
      } as const;
    }
    const current = this.attempts.get(input.attemptId);
    if (!current || current.userId !== input.userId) {
      return { disposition: "not_found" } as const;
    }
    const transition = transitionFocusedPracticeAttemptCompletion({
      attempt: current,
      completion: input.completion,
      completedAt: input.completedAt,
    });
    if (transition.state === "already_completed") {
      return {
        disposition: "already_completed",
        attempt: transition.attempt,
      } as const;
    }
    if (
      transition.state === "conflict" ||
      transition.state === "invalid" ||
      current.lifecycleVersion !== input.expectedVersion
    ) {
      return { disposition: "conflict" } as const;
    }
    this.attempts.set(input.attemptId, transition.attempt);
    this.completionWrites += 1;
    return {
      disposition: "completed",
      attempt: transition.attempt,
    } as const;
  }
}

function source(index = 0): BoundedFocusedPracticeSource {
  const fixture = createFocusedPracticeAttemptSourceFixtures()[index];
  if (!fixture) throw new Error("fixture missing");
  return {
    userId: fixture.userId,
    sessionId: fixture.sessionId,
    feedbackId: fixture.feedbackId,
    roundType: fixture.roundType,
    feedbackStatus: "completed",
    question: { ...fixture.question },
    feedback: structuredClone(fixture.persistedFeedback),
    evidenceTurns: structuredClone(fixture.evidenceTurns),
  };
}

function createHarness(sourceFixture = source()) {
  const repository = new InMemoryAttemptRepository(sourceFixture);
  let now = STARTED_AT;
  let nextId = 0;
  let deletionPending = false;
  const deps: FocusedPracticeAttemptWorkflowDependencies = {
    repository,
    isDeletionPending: async () => deletionPending,
    now: () => new Date(now),
    createAttemptId: () => `focused-practice-attempt-${++nextId}`,
  };
  return {
    deps,
    repository,
    setNow(value: Date) {
      now = value;
    },
    setDeletionPending(value: boolean) {
      deletionPending = value;
      repository.atomicDeletionPending = value;
    },
  };
}

function startInput(sourceFixture = source()) {
  return {
    userId: sourceFixture.userId,
    sourceSessionId: sourceFixture.sessionId,
  };
}

function completion(
  text = "I made the user need change the product choice."
): FocusedPracticeCompletionInput {
  return {
    contractVersion: FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION,
    practicedAloud: true,
    response: { kind: "reflection", text },
  };
}

test("starts full and partial attempts from revalidated owned Feedback v2", async () => {
  for (const index of [0, 3]) {
    const sourceFixture = source(index);
    const harness = createHarness(sourceFixture);
    const result = await startFocusedPracticeAttemptWorkflow(
      startInput(sourceFixture),
      harness.deps
    );

    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.equal(result.disposition, "created");
    assert.equal(
      result.attempt.feedbackVersion.evaluationState,
      sourceFixture.feedback.evaluationState
    );
    assert.equal(
      result.attempt.plan.source.evidenceGap,
      index === 3 ? "grounded_partial" : "grounded_full"
    );
    assert.equal(
      result.attempt.sourceFinding.dimension,
      result.attempt.plan.source.focusDimension
    );
    assert.equal(harness.repository.attemptWrites, 1);
  }
});

test("server reconstruction ignores stored provider suggestion copy", async () => {
  const firstSource = source();
  const secondSource = source();
  secondSource.feedback.drills = [
    "Provider text attempting to choose a different plan and score.",
  ];
  const first = createHarness(firstSource);
  const second = createHarness(secondSource);

  const [firstResult, secondResult] = await Promise.all([
    startFocusedPracticeAttemptWorkflow(startInput(firstSource), first.deps),
    startFocusedPracticeAttemptWorkflow(startInput(secondSource), second.deps),
  ]);
  assert.equal(firstResult.ok, true);
  assert.equal(secondResult.ok, true);
  if (firstResult.ok && secondResult.ok) {
    assert.equal(
      firstResult.attempt.plan.templateId,
      secondResult.attempt.plan.templateId
    );
    assert.deepEqual(
      firstResult.attempt.sourceFinding,
      secondResult.attempt.sourceFinding
    );
  }
});

test("missing and cross-user source access are non-enumerating and mutation-free", async () => {
  const sourceFixture = source();
  const harness = createHarness(sourceFixture);
  const missing = await startFocusedPracticeAttemptWorkflow(
    { userId: sourceFixture.userId, sourceSessionId: "missing-session" },
    harness.deps
  );
  const crossUser = await startFocusedPracticeAttemptWorkflow(
    { userId: "different-user", sourceSessionId: sourceFixture.sessionId },
    harness.deps
  );

  assert.deepEqual(missing, { ok: false, reason: "not_found" });
  assert.deepEqual(crossUser, { ok: false, reason: "not_found" });
  assert.equal(harness.repository.attemptWrites, 0);
});

test("account deletion fences start before source reads and again before writes", async () => {
  const sourceFixture = source();
  const harness = createHarness(sourceFixture);
  harness.setDeletionPending(true);

  const result = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    harness.deps
  );
  assert.deepEqual(result, {
    ok: false,
    reason: "account_deletion_pending",
  });
  assert.equal(harness.repository.sourceReads, 0);
  assert.equal(harness.repository.attemptWrites, 0);

  let deletionChecks = 0;
  const second = createHarness(sourceFixture);
  second.deps.isDeletionPending = async () => ++deletionChecks >= 3;
  const raced = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    second.deps
  );
  assert.deepEqual(raced, {
    ok: false,
    reason: "account_deletion_pending",
  });
  assert.equal(second.repository.sourceReads, 1);
  assert.equal(second.repository.attemptWrites, 0);
});

test("account deletion beginning during resume lookup withholds the snapshot", async () => {
  const sourceFixture = source();
  const harness = createHarness(sourceFixture);
  const started = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    harness.deps
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;

  harness.repository.afterFindOwnedBySource = () =>
    harness.setDeletionPending(true);
  const raced = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    harness.deps
  );

  assert.deepEqual(raced, {
    ok: false,
    reason: "account_deletion_pending",
  });
  assert.equal(harness.repository.sourceReads, 1);
});

test("repository mutations atomically fence deletion accepted after workflow checks", async () => {
  const sourceFixture = source();
  const startHarness = createHarness(sourceFixture);
  startHarness.repository.beforeCreateOrLoad = () => {
    startHarness.repository.atomicDeletionPending = true;
  };
  const startRace = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    startHarness.deps
  );
  assert.deepEqual(startRace, {
    ok: false,
    reason: "account_deletion_pending",
  });
  assert.equal(startHarness.repository.attemptWrites, 0);

  const completionHarness = createHarness(sourceFixture);
  const started = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    completionHarness.deps
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  completionHarness.setNow(COMPLETED_AT);
  completionHarness.repository.beforeComplete = () => {
    completionHarness.repository.atomicDeletionPending = true;
  };
  const completionRace = await completeFocusedPracticeAttemptWorkflow(
    {
      userId: sourceFixture.userId,
      attemptId: started.attempt.attemptId,
      completion: completion(),
    },
    completionHarness.deps
  );
  assert.deepEqual(completionRace, {
    ok: false,
    reason: "account_deletion_pending",
  });
  assert.equal(completionHarness.repository.completionWrites, 0);
});

test("unavailable, legacy, corrupt, and questionless sources fail closed", async () => {
  const cases: Array<[BoundedFocusedPracticeSource, string]> = [
    [{ ...source(), feedbackStatus: "processing" }, "source_unavailable"],
    [
      {
        ...source(),
        feedback: {
          ...source().feedback,
          schemaVersion: null,
          promptVersion: null,
          modelVersion: null,
          evaluationState: null,
          rubricVersion: "1.0.0",
        },
      },
      "source_integrity_invalid",
    ],
    [
      {
        ...source(),
        feedback: { ...source().feedback, overallScore: "10" },
      },
      "source_integrity_invalid",
    ],
    [{ ...source(), question: null }, "source_integrity_invalid"],
  ];

  for (const [sourceFixture, reason] of cases) {
    const harness = createHarness(sourceFixture);
    const result = await startFocusedPracticeAttemptWorkflow(
      startInput(sourceFixture),
      harness.deps
    );
    assert.deepEqual(result, { ok: false, reason });
    assert.equal(harness.repository.attemptWrites, 0);
  }
});

test("twenty concurrent starts converge on one immutable attempt", async () => {
  const sourceFixture = source();
  const harness = createHarness(sourceFixture);
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      startFocusedPracticeAttemptWorkflow(
        startInput(sourceFixture),
        harness.deps
      )
    )
  );

  assert.equal(
    results.every((result) => result.ok),
    true
  );
  assert.equal(harness.repository.attemptWrites, 1);
  assert.equal(harness.repository.attempts.size, 1);
  assert.equal(
    new Set(
      results.flatMap((result) => (result.ok ? [result.attempt.attemptId] : []))
    ).size,
    1
  );
  assert.equal(
    results.filter((result) => result.ok && result.disposition === "created")
      .length,
    1
  );
});

test("atomic source loss and immutable-source drift fail closed", async () => {
  const sourceFixture = source();
  const disappeared = createHarness(sourceFixture);
  disappeared.repository.forcedCreateDisposition = "not_found";
  assert.deepEqual(
    await startFocusedPracticeAttemptWorkflow(
      startInput(sourceFixture),
      disappeared.deps
    ),
    { ok: false, reason: "not_found" }
  );
  assert.equal(disappeared.repository.attemptWrites, 0);

  const drifted = createHarness(sourceFixture);
  drifted.repository.forcedCreateDisposition = "source_conflict";
  assert.deepEqual(
    await startFocusedPracticeAttemptWorkflow(
      startInput(sourceFixture),
      drifted.deps
    ),
    { ok: false, reason: "source_conflict" }
  );
  assert.equal(drifted.repository.attemptWrites, 0);
});

test("resume returns the frozen attempt after the source question changes", async () => {
  const sourceFixture = source();
  const originalQuestionText = sourceFixture.question!.questionText;
  const harness = createHarness(sourceFixture);
  const first = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    harness.deps
  );
  assert.equal(first.ok, true);
  const storedSource = harness.repository.sources.get(sourceFixture.sessionId)!;
  storedSource.question = {
    ...storedSource.question!,
    questionText: "Mutated question-bank text.",
  };

  const resumed = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    harness.deps
  );
  assert.equal(resumed.ok, true);
  if (first.ok && resumed.ok) {
    assert.equal(resumed.disposition, "resumed");
    assert.deepEqual(resumed.attempt, first.attempt);
    assert.notStrictEqual(resumed.attempt, first.attempt);
    assert.equal(
      resumed.attempt.plan.source.questionText,
      originalQuestionText
    );
  }
  assert.equal(harness.repository.sourceReads, 1);
});

test("corrupt repository attempts fail closed before resume or completion", async () => {
  const sourceFixture = source();
  const resumeHarness = createHarness(sourceFixture);
  const started = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    resumeHarness.deps
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  resumeHarness.repository.attempts.set(started.attempt.attemptId, {
    ...structuredClone(started.attempt),
    contractVersion: "focused-practice-attempt.v2",
  } as unknown as FocusedPracticeAttempt);
  assert.deepEqual(
    await startFocusedPracticeAttemptWorkflow(
      startInput(sourceFixture),
      resumeHarness.deps
    ),
    { ok: false, reason: "attempt_invalid" }
  );

  const completionHarness = createHarness(sourceFixture);
  const completionStarted = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    completionHarness.deps
  );
  assert.equal(completionStarted.ok, true);
  if (!completionStarted.ok) return;
  completionHarness.repository.attempts.set(
    completionStarted.attempt.attemptId,
    {
      ...structuredClone(completionStarted.attempt),
      plan: {
        ...completionStarted.attempt.plan,
        source: {
          ...completionStarted.attempt.plan.source,
          questionText: "",
        },
      },
    } as unknown as FocusedPracticeAttempt
  );
  assert.deepEqual(
    await completeFocusedPracticeAttemptWorkflow(
      {
        userId: sourceFixture.userId,
        attemptId: completionStarted.attempt.attemptId,
        completion: completion(),
      },
      completionHarness.deps
    ),
    { ok: false, reason: "attempt_invalid" }
  );
  assert.equal(completionHarness.repository.completionWrites, 0);
});

test("valid repository rows are bound to the requested owner, source, and attempt", async () => {
  const ownSource = source(0);
  const otherSource = source(1);
  const otherHarness = createHarness(otherSource);
  const otherStarted = await startFocusedPracticeAttemptWorkflow(
    startInput(otherSource),
    otherHarness.deps
  );
  assert.equal(otherStarted.ok, true);
  if (!otherStarted.ok || otherStarted.attempt.state !== "in_progress") return;
  const wrongInProgress = {
    ...structuredClone(otherStarted.attempt),
    attemptId: "wrong-focused-practice-attempt",
  } as InProgressFocusedPracticeAttempt;

  const createHarnessWithWrongRow = createHarness(ownSource);
  createHarnessWithWrongRow.repository.forcedCreateAttempt = wrongInProgress;
  assert.deepEqual(
    await startFocusedPracticeAttemptWorkflow(
      startInput(ownSource),
      createHarnessWithWrongRow.deps
    ),
    { ok: false, reason: "source_conflict" }
  );

  const referenceHarness = createHarness(ownSource);
  const referenceStarted = await startFocusedPracticeAttemptWorkflow(
    startInput(ownSource),
    referenceHarness.deps
  );
  assert.equal(referenceStarted.ok, true);
  if (
    !referenceStarted.ok ||
    referenceStarted.attempt.state !== "in_progress"
  ) {
    return;
  }
  const mismatchedCreateHarness = createHarness(ownSource);
  mismatchedCreateHarness.repository.forcedCreateAttempt = {
    ...structuredClone(referenceStarted.attempt),
    attemptId: "adapter-substituted-attempt-id",
  };
  assert.deepEqual(
    await startFocusedPracticeAttemptWorkflow(
      startInput(ownSource),
      mismatchedCreateHarness.deps
    ),
    { ok: false, reason: "source_conflict" }
  );
  const reorderedHarness = createHarness(ownSource);
  reorderedHarness.repository.forcedCreateAttempt = {
    ...structuredClone(referenceStarted.attempt),
    feedbackVersion: {
      evaluationState: referenceStarted.attempt.feedbackVersion.evaluationState,
      modelVersion: referenceStarted.attempt.feedbackVersion.modelVersion,
      rubricVersion: referenceStarted.attempt.feedbackVersion.rubricVersion,
      promptVersion: referenceStarted.attempt.feedbackVersion.promptVersion,
      schemaVersion: referenceStarted.attempt.feedbackVersion.schemaVersion,
    },
  };
  const reordered = await startFocusedPracticeAttemptWorkflow(
    startInput(ownSource),
    reorderedHarness.deps
  );
  assert.equal(reordered.ok, true);
  if (reordered.ok) assert.equal(reordered.disposition, "created");

  const completionHarness = createHarness(ownSource);
  const ownStarted = await startFocusedPracticeAttemptWorkflow(
    startInput(ownSource),
    completionHarness.deps
  );
  assert.equal(ownStarted.ok, true);
  if (!ownStarted.ok) return;
  completionHarness.repository.forcedGetAttempt = {
    ...structuredClone(wrongInProgress),
    userId: ownSource.userId,
  };
  assert.deepEqual(
    await completeFocusedPracticeAttemptWorkflow(
      {
        userId: ownSource.userId,
        attemptId: ownStarted.attempt.attemptId,
        completion: completion(),
      },
      completionHarness.deps
    ),
    { ok: false, reason: "not_found" }
  );

  completionHarness.repository.forcedGetAttempt = null;
  const wrongCompleted = transitionFocusedPracticeAttemptCompletion({
    attempt: {
      ...structuredClone(wrongInProgress),
      userId: ownSource.userId,
    },
    completion: completion(),
    completedAt: COMPLETED_AT,
  });
  assert.equal(wrongCompleted.state, "completed");
  if (wrongCompleted.state !== "completed") return;
  completionHarness.repository.forcedCompletionAttempt = wrongCompleted.attempt;
  assert.deepEqual(
    await completeFocusedPracticeAttemptWorkflow(
      {
        userId: ownSource.userId,
        attemptId: ownStarted.attempt.attemptId,
        completion: completion(),
      },
      completionHarness.deps
    ),
    { ok: false, reason: "not_found" }
  );

  const alteredCompleted = transitionFocusedPracticeAttemptCompletion({
    attempt: {
      ...structuredClone(wrongInProgress),
      attemptId: ownStarted.attempt.attemptId,
      userId: ownSource.userId,
    },
    completion: completion(),
    completedAt: COMPLETED_AT,
  });
  assert.equal(alteredCompleted.state, "completed");
  if (alteredCompleted.state !== "completed") return;
  completionHarness.repository.forcedCompletionAttempt =
    alteredCompleted.attempt;
  assert.deepEqual(
    await completeFocusedPracticeAttemptWorkflow(
      {
        userId: ownSource.userId,
        attemptId: ownStarted.attempt.attemptId,
        completion: completion(),
      },
      completionHarness.deps
    ),
    { ok: false, reason: "conflict" }
  );

  const mismatchedResponse = transitionFocusedPracticeAttemptCompletion({
    attempt: ownStarted.attempt,
    completion: completion("A different terminal response."),
    completedAt: COMPLETED_AT,
  });
  assert.equal(mismatchedResponse.state, "completed");
  if (mismatchedResponse.state !== "completed") return;
  completionHarness.repository.forcedCompletionAttempt =
    mismatchedResponse.attempt;
  assert.deepEqual(
    await completeFocusedPracticeAttemptWorkflow(
      {
        userId: ownSource.userId,
        attemptId: ownStarted.attempt.attemptId,
        completion: completion(),
      },
      completionHarness.deps
    ),
    { ok: false, reason: "conflict" }
  );
});

test("completion is owner-scoped, exact-replay idempotent, and first-write immutable", async () => {
  const sourceFixture = source();
  const harness = createHarness(sourceFixture);
  const started = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    harness.deps
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  harness.setNow(COMPLETED_AT);

  const completeInput = {
    userId: sourceFixture.userId,
    attemptId: started.attempt.attemptId,
    completion: completion(),
  };
  const first = await completeFocusedPracticeAttemptWorkflow(
    completeInput,
    harness.deps
  );
  const replay = await completeFocusedPracticeAttemptWorkflow(
    completeInput,
    harness.deps
  );
  const conflict = await completeFocusedPracticeAttemptWorkflow(
    { ...completeInput, completion: completion("Different terminal response") },
    harness.deps
  );
  const crossUser = await completeFocusedPracticeAttemptWorkflow(
    { ...completeInput, userId: "different-user" },
    harness.deps
  );

  assert.equal(first.ok && first.disposition, "completed");
  assert.equal(replay.ok && replay.disposition, "already_completed");
  assert.deepEqual(conflict, { ok: false, reason: "conflict" });
  assert.deepEqual(crossUser, { ok: false, reason: "not_found" });
  assert.equal(harness.repository.completionWrites, 1);
  if (first.ok && replay.ok) {
    assert.deepEqual(replay.attempt, first.attempt);
    assert.notStrictEqual(replay.attempt, first.attempt);
  }
});

test("concurrent identical completions converge on one terminal write", async () => {
  const sourceFixture = source();
  const harness = createHarness(sourceFixture);
  const started = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    harness.deps
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  harness.setNow(COMPLETED_AT);

  const input = {
    userId: sourceFixture.userId,
    attemptId: started.attempt.attemptId,
    completion: completion(),
  };
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      completeFocusedPracticeAttemptWorkflow(input, harness.deps)
    )
  );

  assert.equal(
    results.every((result) => result.ok),
    true
  );
  assert.equal(harness.repository.completionWrites, 1);
  assert.equal(
    results.filter((result) => result.ok && result.disposition === "completed")
      .length,
    1
  );
  assert.equal(
    new Set(
      results.flatMap((result) =>
        result.ok ? [result.attempt.completedAt] : []
      )
    ).size,
    1
  );
});

test("invalid and client-forged commands are rejected before mutation", async () => {
  const sourceFixture = source();
  const harness = createHarness(sourceFixture);
  const forgedStart = await startFocusedPracticeAttemptWorkflow(
    {
      ...startInput(sourceFixture),
      plan: { templateId: "client-selected" },
    },
    harness.deps
  );
  assert.deepEqual(forgedStart, { ok: false, reason: "invalid_request" });
  assert.equal(harness.repository.sourceReads, 0);

  const started = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    harness.deps
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const invalidCompletion = await completeFocusedPracticeAttemptWorkflow(
    {
      userId: sourceFixture.userId,
      attemptId: started.attempt.attemptId,
      completion: { ...completion(), practicedAloud: false },
    },
    harness.deps
  );
  assert.deepEqual(invalidCompletion, {
    ok: false,
    reason: "invalid_completion",
  });
  assert.equal(harness.repository.completionWrites, 0);
});

test("workflow stays provider-free with no network or cost-bearing dependency boundary", async () => {
  const sourceFixture = source();
  const harness = createHarness(sourceFixture);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("provider access is forbidden");
  }) as typeof fetch;
  const permitted = new Set([
    "repository",
    "isDeletionPending",
    "now",
    "createAttemptId",
  ]);
  const deps = new Proxy(harness.deps, {
    get(target, property, receiver) {
      if (typeof property === "string" && !permitted.has(property)) {
        throw new Error(`unexpected dependency ${property}`);
      }
      return Reflect.get(target, property, receiver);
    },
  });

  try {
    const result = await startFocusedPracticeAttemptWorkflow(
      startInput(sourceFixture),
      deps
    );
    assert.equal(result.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const workflowSource = await readFile(
    new URL("./focused-practice-attempt.ts", import.meta.url),
    "utf8"
  );
  for (const forbidden of [
    "livekit",
    "stripe",
    "credit-ledger",
    "inngest",
    "openai",
    "posthog",
    "statsig",
    "feature-flags",
    "start-session",
    "generate-feedback",
  ]) {
    assert.doesNotMatch(
      workflowSource,
      new RegExp(`(?:from|import\\()\\s*[\"'][^\"']*${forbidden}`, "i")
    );
  }
});

function sameImmutableSource(
  left: FocusedPracticeAttempt,
  right: FocusedPracticeAttempt
): boolean {
  return (
    JSON.stringify({
      feedbackVersion: left.feedbackVersion,
      plan: left.plan,
      sourceFinding: left.sourceFinding,
    }) ===
    JSON.stringify({
      feedbackVersion: right.feedbackVersion,
      plan: right.plan,
      sourceFinding: right.sourceFinding,
    })
  );
}

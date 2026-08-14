import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  EVIDENCE_LIMITED_ACTIONS,
  EVIDENCE_LIMITED_CONFIDENCE,
  EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS,
  EVIDENCE_LIMITED_STRENGTH_SIGNALS,
  EVIDENCE_LIMITED_SUMMARY,
  FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
  FOCUSED_PRACTICE_COMPLETION_CONTRACT_VERSION,
  FEEDBACK_DIMENSIONS,
  FEEDBACK_DIMENSION_COVERAGE_PROMPT_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_RUBRIC_VERSION,
  FEEDBACK_DIMENSION_COVERAGE_SELECTION_SCHEMA_VERSION,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  parseDimensionCoverageProviderSelection,
  projectTrustedClosedAnswerBlocks,
  type DimensionCoverageProviderSelection,
  type AnyCompletedFocusedPracticeAttempt,
  type AnyFocusedPracticeAttempt,
  type AnyInProgressFocusedPracticeAttempt,
  type FocusedPracticeCompletionInput,
} from "@meelni/core";
import {
  createFocusedPracticeAttemptSourceFixtures,
  createSyntheticFeedbackReviewOutcomeFixtures,
  createAnswerBlockTurn,
} from "@meelni/test-fixtures";
import {
  createFocusedPracticeSourceFingerprint,
  projectLegacyFocusedPracticeSourceFingerprintInput,
} from "@/lib/focused-practice/source-fingerprint";
import {
  completeFocusedPracticeAttemptWorkflow,
  readFocusedPracticeAttemptWorkflow,
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
  readonly attempts = new Map<string, AnyFocusedPracticeAttempt>();
  sourceReads = 0;
  attemptWrites = 0;
  completionWrites = 0;
  forcedCreateDisposition: "not_found" | "source_conflict" | null = null;
  atomicDeletionPending = false;
  afterFindOwnedBySource: (() => void) | null = null;
  beforeCreateOrLoad: (() => void | Promise<void>) | null = null;
  beforeComplete: (() => void) | null = null;
  forcedCreateAttempt: AnyInProgressFocusedPracticeAttempt | null = null;
  forcedGetAttempt: AnyFocusedPracticeAttempt | null = null;
  forcedCompletionAttempt: AnyCompletedFocusedPracticeAttempt | null = null;

  constructor(source: BoundedFocusedPracticeSource) {
    this.sources.set(source.sessionId, source);
  }

  async findOwnedBySource(input: { userId: string; sourceSessionId: string }) {
    const result =
      [...this.attempts.values()].find(
        (attempt) =>
          attempt.userId === input.userId &&
          attempt.sourceSessionId === input.sourceSessionId
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
    attempt: AnyInProgressFocusedPracticeAttempt;
  }) {
    await this.beforeCreateOrLoad?.();
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
    const existing = [...this.attempts.values()].find(
      (attempt) =>
        attempt.userId === input.userId &&
        attempt.sourceSessionId === input.sourceSessionId
    );
    if (existing) {
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
    const source = this.sources.get(input.sourceSessionId);
    if (!source || source.userId !== input.userId) {
      return { disposition: "not_found" } as const;
    }
    if (
      input.attempt.contractVersion === "focused-practice-attempt.v2" &&
      input.attempt.feedbackVersion.sourceFingerprint !==
        source.sourceFingerprint
    ) {
      return { disposition: "source_conflict" } as const;
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
    answerBlocks: [],
    frozenEvidenceState: null,
    sourceFingerprint: "f".repeat(64),
    completionStats: null,
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
    assert.equal(result.attempt.contractVersion, "focused-practice-attempt.v1");
    if (result.attempt.contractVersion !== "focused-practice-attempt.v1") {
      continue;
    }
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
  assert.equal(firstResult.ok, true, JSON.stringify(firstResult));
  assert.equal(secondResult.ok, true, JSON.stringify(secondResult));
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

test("partial scorecards and coaching reviews create one scoreless grounded path", async () => {
  for (const outcome of ["partial_scorecard", "coaching_review"] as const) {
    const sourceFixture = dimensionCoverageSource(outcome);
    const harness = createHarness(sourceFixture);
    const result = await startFocusedPracticeAttemptWorkflow(
      startInput(sourceFixture),
      harness.deps
    );

    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.equal(result.disposition, "created");
    assert.equal(result.attempt.contractVersion, "focused-practice-attempt.v2");
    assert.equal(
      result.attempt.plan.contractVersion,
      "focused-practice-plan.v2"
    );
    assert.equal(result.attempt.feedbackVersion.reviewOutcome, outcome);
    assert.equal(harness.repository.attemptWrites, 1);
    assert.doesNotMatch(
      JSON.stringify(result.attempt.plan),
      /weakestScore|overallScore|provider-authored/i
    );
  }
});

test("verified-prefix v2 scorecards fully revalidate before focused practice", async () => {
  for (const outcome of ["partial_scorecard", "coaching_review"] as const) {
    const sourceFixture = verifiedPrefixSource(outcome);
    const harness = createHarness(sourceFixture);
    const result = await startFocusedPracticeAttemptWorkflow(
      startInput(sourceFixture),
      harness.deps
    );

    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) continue;
    assert.equal(
      result.attempt.feedbackVersion.schemaVersion,
      "feedback.dimension-coverage.v2"
    );
    assert.equal(result.attempt.feedbackVersion.reviewOutcome, outcome);
    assert.equal(harness.repository.attemptWrites, 1);
  }

  const forged = verifiedPrefixSource("partial_scorecard");
  forged.feedback.verifiedPrefixScope = {
    ...(forged.feedback.verifiedPrefixScope as Record<string, unknown>),
    excludedTailBlockCount: 999,
  };
  const forgedHarness = createHarness(forged);
  assert.deepEqual(
    await startFocusedPracticeAttemptWorkflow(
      startInput(forged),
      forgedHarness.deps
    ),
    { ok: false, reason: "source_integrity_invalid" }
  );
  assert.equal(forgedHarness.repository.attemptWrites, 0);

  const missingProjection = verifiedPrefixSource("partial_scorecard");
  delete missingProjection.verifiedPrefixProjection;
  const missingHarness = createHarness(missingProjection);
  assert.deepEqual(
    await startFocusedPracticeAttemptWorkflow(
      startInput(missingProjection),
      missingHarness.deps
    ),
    { ok: false, reason: "source_integrity_invalid" }
  );
  assert.equal(missingHarness.repository.attemptWrites, 0);
});

test("evidence-limited coaching creates a closed scoreless path independent of provider order", async () => {
  const firstSource = evidenceLimitedSource();
  const secondSource = evidenceLimitedSource();
  secondSource.feedback.improvements = [
    ...(secondSource.feedback.improvements as unknown[]),
  ].reverse();
  const first = createHarness(firstSource);
  const second = createHarness(secondSource);
  const [firstResult, secondResult] = await Promise.all([
    startFocusedPracticeAttemptWorkflow(startInput(firstSource), first.deps),
    startFocusedPracticeAttemptWorkflow(startInput(secondSource), second.deps),
  ]);

  assert.equal(firstResult.ok, true, JSON.stringify(firstResult));
  assert.equal(secondResult.ok, true, JSON.stringify(secondResult));
  if (!firstResult.ok || !secondResult.ok) return;
  assert.equal(
    firstResult.attempt.contractVersion,
    "focused-practice-attempt.v2"
  );
  assert.equal(
    firstResult.attempt.feedbackVersion.reviewOutcome,
    "coaching_review"
  );
  assert.deepEqual(firstResult.attempt.plan, secondResult.attempt.plan);
  assert.deepEqual(
    firstResult.attempt.sourceFinding,
    secondResult.attempt.sourceFinding
  );
});

test("full coverage and corrupt scoreless sources remain unavailable without writes", async () => {
  const full = dimensionCoverageSource("full_scorecard");
  const fullHarness = createHarness(full);
  assert.deepEqual(
    await startFocusedPracticeAttemptWorkflow(
      startInput(full),
      fullHarness.deps
    ),
    { ok: false, reason: "recommendation_unavailable" }
  );
  assert.equal(fullHarness.repository.attemptWrites, 0);

  const corrupt = dimensionCoverageSource("partial_scorecard");
  corrupt.answerBlocks = [];
  const corruptHarness = createHarness(corrupt);
  assert.deepEqual(
    await startFocusedPracticeAttemptWorkflow(
      startInput(corrupt),
      corruptHarness.deps
    ),
    { ok: false, reason: "source_integrity_invalid" }
  );
  assert.equal(corruptHarness.repository.attemptWrites, 0);
});

test("scoreless creation fails closed when the frozen source changes before insert", async () => {
  const sourceFixture = dimensionCoverageSource("partial_scorecard");
  const harness = createHarness(sourceFixture);
  harness.repository.beforeCreateOrLoad = () => {
    harness.repository.sources.get(sourceFixture.sessionId)!.sourceFingerprint =
      "0".repeat(64);
  };

  assert.deepEqual(
    await startFocusedPracticeAttemptWorkflow(
      startInput(sourceFixture),
      harness.deps
    ),
    { ok: false, reason: "source_conflict" }
  );
  assert.equal(harness.repository.attemptWrites, 0);
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

test("reads only an owned attempt and withholds it when deletion wins the read race", async () => {
  const sourceFixture = source();
  const harness = createHarness(sourceFixture);
  const started = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    harness.deps
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;

  const owned = await readFocusedPracticeAttemptWorkflow(
    {
      userId: sourceFixture.userId,
      attemptId: started.attempt.attemptId,
    },
    harness.deps
  );
  assert.equal(owned.ok, true);

  const crossOwner = await readFocusedPracticeAttemptWorkflow(
    {
      userId: "different-user",
      attemptId: started.attempt.attemptId,
    },
    harness.deps
  );
  const missing = await readFocusedPracticeAttemptWorkflow(
    { userId: sourceFixture.userId, attemptId: "missing-attempt" },
    harness.deps
  );
  assert.deepEqual(crossOwner, { ok: false, reason: "not_found" });
  assert.deepEqual(missing, { ok: false, reason: "not_found" });

  let checks = 0;
  harness.deps.isDeletionPending = async () => ++checks === 2;
  const raced = await readFocusedPracticeAttemptWorkflow(
    {
      userId: sourceFixture.userId,
      attemptId: started.attempt.attemptId,
    },
    harness.deps
  );
  assert.deepEqual(raced, {
    ok: false,
    reason: "account_deletion_pending",
  });
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

test("an in-flight source-drift loser resumes the immutable concurrent winner", async () => {
  const sourceFixture = dimensionCoverageSource("partial_scorecard");
  const harness = createHarness(sourceFixture);
  let createCalls = 0;
  let releaseLoser!: () => void;
  const loserRelease = new Promise<void>((resolve) => {
    releaseLoser = resolve;
  });
  let markLoserBlocked!: () => void;
  const loserBlocked = new Promise<void>((resolve) => {
    markLoserBlocked = resolve;
  });
  harness.repository.beforeCreateOrLoad = async () => {
    createCalls += 1;
    if (createCalls === 1) {
      markLoserBlocked();
      await loserRelease;
    }
  };

  const losingRequest = startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    harness.deps
  );
  await loserBlocked;
  const winningRequest = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    harness.deps
  );
  assert.equal(winningRequest.ok, true);
  if (!winningRequest.ok) return;
  assert.equal(winningRequest.disposition, "created");
  const currentSource = harness.repository.sources.get(
    sourceFixture.sessionId
  )!;
  currentSource.sourceFingerprint = "0".repeat(64);
  currentSource.question = {
    ...currentSource.question!,
    questionText: "Synthetic source text changed after the winner committed.",
  };
  releaseLoser();

  const losingResult = await losingRequest;
  assert.equal(losingResult.ok, true);
  if (!losingResult.ok) return;
  assert.equal(losingResult.disposition, "resumed");
  assert.equal(
    losingResult.attempt.attemptId,
    winningRequest.attempt.attemptId
  );
  assert.deepEqual(losingResult.attempt, winningRequest.attempt);
  assert.equal(harness.repository.attemptWrites, 1);
});

test("an in-flight v2 request resumes a v1 rollout winner before source revalidation", async () => {
  const legacySource = source();
  const legacyHarness = createHarness(legacySource);
  const legacyResult = await startFocusedPracticeAttemptWorkflow(
    startInput(legacySource),
    legacyHarness.deps
  );
  assert.equal(legacyResult.ok, true);
  if (
    !legacyResult.ok ||
    legacyResult.attempt.state !== "in_progress" ||
    legacyResult.attempt.contractVersion !== "focused-practice-attempt.v1"
  ) {
    return;
  }

  const sourceFixture = evidenceLimitedSource();
  const harness = createHarness(sourceFixture);
  let releaseRequest!: () => void;
  const requestRelease = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  let markRequestBlocked!: () => void;
  const requestBlocked = new Promise<void>((resolve) => {
    markRequestBlocked = resolve;
  });
  harness.repository.beforeCreateOrLoad = async () => {
    markRequestBlocked();
    await requestRelease;
  };

  const inFlight = startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    harness.deps
  );
  await requestBlocked;
  const legacyWinner: AnyInProgressFocusedPracticeAttempt = {
    ...structuredClone(legacyResult.attempt),
    attemptId: "focused-practice-rollout-winner",
    userId: sourceFixture.userId,
    sourceSessionId: sourceFixture.sessionId,
  };
  harness.repository.attempts.set(legacyWinner.attemptId, legacyWinner);
  harness.repository.sources.get(sourceFixture.sessionId)!.sourceFingerprint =
    "0".repeat(64);
  releaseRequest();

  const result = await inFlight;
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.disposition, "resumed");
  assert.equal(result.attempt.contractVersion, "focused-practice-attempt.v1");
  assert.equal(result.attempt.attemptId, legacyWinner.attemptId);
  assert.equal(harness.repository.attemptWrites, 0);
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

test("an existing dimension-coverage v1 attempt resumes across authority enrichment", async () => {
  const sourceFixture = dimensionCoverageSource("partial_scorecard");
  sourceFixture.feedback.verifiedPrefixScope = null;
  const enrichedFingerprint = createFocusedPracticeSourceFingerprint(
    projectLegacyFocusedPracticeSourceFingerprintInput({
      userId: sourceFixture.userId,
      sessionId: sourceFixture.sessionId,
      feedbackId: sourceFixture.feedbackId,
      roundType: sourceFixture.roundType,
      feedbackStatus: sourceFixture.feedbackStatus,
      question: sourceFixture.question,
      feedback: sourceFixture.feedback as unknown as Record<string, unknown>,
      evidenceTurns: sourceFixture.evidenceTurns,
      frozenEvidence: {
        snapshotValid: true,
        snapshotState: "partial",
        turns: [],
        interruptions: [],
        sessionEndAt: new Date("2026-08-13T12:00:00.000Z"),
        sourceOverflow: false,
        authority: {
          contractVersion: "frozen-answer-block-authority.v1",
        },
      },
    })
  );
  sourceFixture.sourceFingerprint = enrichedFingerprint;
  const winnerHarness = createHarness(sourceFixture);
  const created = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    winnerHarness.deps
  );
  assert.equal(created.ok, true);
  if (!created.ok || created.attempt.state !== "in_progress") return;

  const harness = createHarness(sourceFixture);
  harness.repository.beforeCreateOrLoad = () => {
    harness.repository.attempts.set(
      created.attempt.attemptId,
      structuredClone(created.attempt)
    );
  };
  const resumed = await startFocusedPracticeAttemptWorkflow(
    startInput(sourceFixture),
    harness.deps
  );
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;
  assert.equal(resumed.disposition, "resumed");
  assert.deepEqual(resumed.attempt, created.attempt);
  assert.equal(harness.repository.sourceReads, 1);
  assert.equal(harness.repository.attemptWrites, 0);
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
  } as unknown as AnyFocusedPracticeAttempt);
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
    } as unknown as AnyFocusedPracticeAttempt
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
  } as AnyInProgressFocusedPracticeAttempt;

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
    referenceStarted.attempt.state !== "in_progress" ||
    referenceStarted.attempt.contractVersion !== "focused-practice-attempt.v1"
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

function dimensionCoverageSource(
  outcome: "full_scorecard" | "partial_scorecard" | "coaching_review"
): BoundedFocusedPracticeSource {
  const fixture = createSyntheticFeedbackReviewOutcomeFixtures().find(
    (candidate) => candidate.expected.outcome === outcome
  );
  const variant = fixture?.sourceVariants[1];
  const result = variant?.coverageResult;
  if (!fixture || !variant || !result) {
    throw new Error(`missing synthetic ${outcome} fixture`);
  }
  const sessionId = `synthetic-focused-practice-${outcome}`;
  const feedbackId = `synthetic-feedback-${outcome}`;
  return {
    userId: "synthetic-focused-practice-owner",
    sessionId,
    feedbackId,
    roundType: result.roundType,
    feedbackStatus: "completed",
    question: {
      questionId: "synthetic-focused-practice-question",
      questionText: "How would you improve a shared planning product?",
    },
    feedback: {
      id: feedbackId,
      sessionId,
      structureScore: result.dimensions.structure.score,
      clarityScore: result.dimensions.clarity.score,
      insightScore: result.dimensions.insight.score,
      communicationScore: result.dimensions.communication.score,
      leadershipScore: result.dimensions.leadership.score,
      overallScore: result.overallScore,
      strengths: null,
      improvements: null,
      drills: null,
      summary: result.summary,
      rubricVersion: result.rubricVersion,
      schemaVersion: result.schemaVersion,
      promptVersion: result.promptVersion,
      modelVersion: result.modelVersion,
      evaluationState: result.evaluationState,
      feedbackMode: result.mode,
      feedbackRoundType: result.roundType,
      dimensionCoverage: structuredClone(result.dimensions),
      createdAt: new Date("2026-08-13T12:00:00.000Z"),
    },
    evidenceTurns: [],
    answerBlocks: structuredClone(variant.answerBlocks),
    frozenEvidenceState: "complete",
    sourceFingerprint: "a".repeat(64),
    completionStats: null,
  };
}

function verifiedPrefixSource(
  outcome: "partial_scorecard" | "coaching_review"
): BoundedFocusedPracticeSource {
  const events = [
    createAnswerBlockTurn({
      eventId: "synthetic-writer:1",
      sequence: 1,
      speaker: "interviewer",
      text: "Which customer problem would you prioritize?",
      startedAtMs: 1_000,
      audioDurationMs: 500,
    }),
    createAnswerBlockTurn({
      eventId: "synthetic-writer:2",
      sequence: 2,
      speaker: "user",
      text: "I would prioritize working parents because repeated handoff failures create measurable weekly coordination pain.",
      startedAtMs: 2_000,
      audioDurationMs: 500,
    }),
    createAnswerBlockTurn({
      eventId: "synthetic-writer:3",
      sequence: 3,
      speaker: "interviewer",
      text: "Which assumption would you test first?",
      startedAtMs: 3_000,
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
  const dimensions = {} as DimensionCoverageProviderSelection["dimensions"];
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const facetCount =
      dimension === "insight"
        ? 1
        : outcome === "partial_scorecard" && dimension === "structure"
          ? 2
          : 0;
    dimensions[dimension] = {
      score: facetCount === 2 ? 8 : null,
      evidence: ROUND_DIMENSION_COVERAGE_CONFIG.product_sense[dimension].facets
        .slice(0, facetCount)
        .map((facet) => ({
          facetCode: facet.code,
          answerBlockRef: projection.trustedBlocks[0]!.answerBlockId,
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
      answerBlocks: projection.trustedBlocks,
      modelVersion: "synthetic-focused-practice-v2",
      allowNumericalScores: outcome === "partial_scorecard",
      verifiedPrefixProjection: projection,
    }
  );
  assert.equal(result.schemaVersion, "feedback.dimension-coverage.v2");
  const sessionId = `synthetic-focused-practice-v2-${outcome}`;
  const feedbackId = `synthetic-feedback-v2-${outcome}`;
  return {
    userId: "synthetic-focused-practice-owner",
    sessionId,
    feedbackId,
    roundType: "product_sense",
    feedbackStatus: "completed",
    question: {
      questionId: "synthetic-focused-practice-question-v2",
      questionText: "How would you improve a shared planning product?",
    },
    feedback: {
      id: feedbackId,
      sessionId,
      structureScore: result.dimensions.structure.score,
      clarityScore: result.dimensions.clarity.score,
      insightScore: result.dimensions.insight.score,
      communicationScore: result.dimensions.communication.score,
      leadershipScore: result.dimensions.leadership.score,
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
      dimensionCoverage: structuredClone(result.dimensions),
      verifiedPrefixScope: structuredClone(result.verifiedPrefixScope),
      createdAt: new Date("2026-08-14T12:00:00.000Z"),
    },
    evidenceTurns: [],
    answerBlocks: structuredClone(projection.trustedBlocks),
    frozenEvidenceState: "partial",
    verifiedPrefixProjection: structuredClone(projection),
    sourceFingerprint: "b".repeat(64),
    completionStats: null,
  };
}

function evidenceLimitedSource(): BoundedFocusedPracticeSource {
  const sessionId = "synthetic-evidence-limited-session";
  const feedbackId = "synthetic-evidence-limited-feedback";
  const quote =
    "I would connect the chosen user need to a decision, compare tradeoffs, and lead with the recommendation.";
  const secondQuote =
    "I would state the recommendation first, then explain the evidence behind it.";
  const finding = {
    dimension: "insight",
    observation:
      EVIDENCE_LIMITED_STRENGTH_SIGNALS.customer_problem_connection.observation,
    transcriptRefs: ["synthetic-evidence:1"],
    evidence: [{ turnRef: "synthetic-evidence:1", quote }],
    nextStep: EVIDENCE_LIMITED_ACTIONS.connect_customer_to_decision.nextStep,
    rubricVersion: "pm-feedback-rubric.v2",
    confidence: EVIDENCE_LIMITED_CONFIDENCE,
    signalCode: "customer_problem_connection",
    actionCode: "connect_customer_to_decision",
  };
  return {
    userId: "synthetic-focused-practice-owner",
    sessionId,
    feedbackId,
    roundType: "product_sense",
    feedbackStatus: "completed",
    question: {
      questionId: "synthetic-focused-practice-question",
      questionText: "How would you improve a shared planning product?",
    },
    feedback: {
      id: feedbackId,
      sessionId,
      structureScore: null,
      clarityScore: null,
      insightScore: null,
      communicationScore: null,
      leadershipScore: null,
      overallScore: null,
      strengths: [finding],
      improvements: [
        {
          ...finding,
          dimension: "leadership",
          observation:
            EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS.tradeoff_decision.observation,
          nextStep:
            EVIDENCE_LIMITED_ACTIONS.compare_tradeoffs_and_choose.nextStep,
          signalCode: "tradeoff_decision",
          actionCode: "compare_tradeoffs_and_choose",
        },
        {
          ...finding,
          dimension: "clarity",
          observation:
            EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS.recommendation_directness
              .observation,
          nextStep: EVIDENCE_LIMITED_ACTIONS.lead_with_recommendation.nextStep,
          signalCode: "recommendation_directness",
          actionCode: "lead_with_recommendation",
          transcriptRefs: ["synthetic-evidence:2"],
          evidence: [{ turnRef: "synthetic-evidence:2", quote: secondQuote }],
        },
      ],
      drills: ["Synthetic provider copy must not enter a plan."],
      summary: EVIDENCE_LIMITED_SUMMARY,
      rubricVersion: "pm-feedback-rubric.v2",
      schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
      promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
      modelVersion: "synthetic-scoreless-model",
      evaluationState: "partial",
      createdAt: new Date("2026-08-13T12:00:00.000Z"),
    },
    evidenceTurns: [
      {
        eventId: "synthetic-evidence:1",
        speaker: "user",
        text: quote,
        contractVersion: 2,
      },
      {
        eventId: "synthetic-evidence:2",
        speaker: "user",
        text: secondQuote,
        contractVersion: 2,
      },
    ],
    answerBlocks: [],
    frozenEvidenceState: null,
    sourceFingerprint: "b".repeat(64),
    completionStats: { feedbackModeConstraint: "evidence_limited_only" },
  };
}

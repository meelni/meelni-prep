import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_DIMENSIONS,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  SHADOW_FEEDBACK_ARTIFACT_VERSION,
  aggregateShadowFeedbackArtifacts,
  createShadowFeedbackBatchAuthority,
  createShadowFeedbackSchedulingIntents,
  parseShadowFeedbackArtifact,
  type DimensionCoverageFeedbackResult,
  type FrozenAnswerBlockAuthorityV1,
  type ShadowFeedbackArtifactSetV1,
  type ShadowFeedbackArtifactV1,
} from "@meelni/core";
import {
  ANSWER_BLOCK_SEGMENT_COUNTS,
  createAnswerBlockSegmentationFixture,
} from "@meelni/test-fixtures";

import type {
  ShadowFeedbackArtifactStore,
  ShadowFeedbackArtifactWriteResult,
} from "@/lib/db/shadow-feedback-artifacts";
import { getShadowFeedbackArtifactStorageGate } from "@/lib/evaluation/shadow-feedback-artifact-config";
import { getShadowFeedbackExecutionGate } from "@/lib/evaluation/shadow-feedback-execution-config";
import {
  FeedbackProviderInvocationError,
  type FeedbackProviderUsage,
} from "@/lib/evaluation/scorer";
import { prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot } from "@/lib/evaluation/session-validator";

import {
  DEFAULT_SHADOW_FEEDBACK_RUNTIME_VERSIONS,
  SHADOW_FEEDBACK_COMPARISON_MAX_READS,
  SHADOW_FEEDBACK_COMPARISON_MAX_WAIT_MS,
  SHADOW_FEEDBACK_COMPARISON_WAIT_MS,
  SHADOW_FEEDBACK_EVALUATION_EVENT_VERSION,
  parseShadowFeedbackEvaluationEventData,
  runShadowFeedbackComparisonRequested,
  runShadowFeedbackEvaluationRequested,
  runShadowFeedbackSchedulingRequested,
  type ShadowFeedbackEvaluationEventDataV1,
  type ShadowFeedbackEvaluationRuntime,
  type ShadowFeedbackFrozenEvidence,
} from "./shadow-feedback";

const USER_ID = "44700000-0000-4000-8000-000000000001";
const SESSION_ID = "44700000-0000-4000-8000-000000000447";
const FREEZE_ANCHOR_MS = Date.parse("2026-08-14T10:00:00.000Z");
const MODEL_VERSION = "synthetic-shadow-model.v1";

test("disabled, forged, or runtime-unavailable paths have zero side effects", async () => {
  const counters = zeroCounters();
  const disabled = disabledGates();
  const runtime = evaluationRuntime(counters);
  const store = new MemoryShadowStore(counters);
  const base = {
    runtime,
    store,
    now: () => new Date(FREEZE_ANCHOR_MS + 1_000),
    isDeletionPending: async () => {
      counters.deletionReads += 1;
      return false;
    },
    getSession: async () => {
      counters.sessionReads += 1;
      return sessionAuthority();
    },
    getFrozenEvidence: async () => {
      counters.evidenceReads += 1;
      return frozenEvidence(1);
    },
  };
  const schedule = await runShadowFeedbackSchedulingRequested({
    eventId: "feedback-event",
    data: { sessionId: SESSION_ID, userId: USER_ID },
    deps: {
      ...base,
      ...disabled,
      steps: {
        async sendEvaluationIntents() {
          counters.sends += 1;
        },
      },
    },
  });
  assert.equal(schedule.status, "disabled");

  const evaluation = await runShadowFeedbackEvaluationRequested({
    eventId: "shadow-event",
    data: { transcript: "must not be parsed while disabled" },
    deps: {
      ...base,
      ...disabled,
      steps: new MemoizedSteps(counters),
    },
  });
  assert.equal(evaluation.status, "disabled");

  const comparison = await runShadowFeedbackComparisonRequested({
    data: { sessionId: SESSION_ID, userId: USER_ID },
    deps: {
      ...base,
      ...disabled,
      steps: new MemoizedSteps(counters),
      readBatchAuthority: async () => {
        counters.batchReads += 1;
        return null;
      },
    },
  });
  assert.equal(comparison.status, "disabled");
  assert.deepEqual(counters, zeroCounters());

  const active = activeGates();
  const unavailableCounters = zeroCounters();
  const unavailable = await runShadowFeedbackSchedulingRequested({
    eventId: "feedback-event",
    data: { sessionId: SESSION_ID, userId: USER_ID },
    deps: {
      ...base,
      ...active,
      runtime: null,
      steps: {
        async sendEvaluationIntents() {
          unavailableCounters.sends += 1;
        },
      },
    },
  });
  assert.equal(unavailable.status, "runtime_unavailable");
  assert.equal(unavailableCounters.sends, 0);

  for (const malformedRuntime of [
    { ...descriptor(), costRates: { providerPayload: "forbidden" } },
    { ...descriptor(), evaluator: {} },
  ]) {
    const malformedCounters = zeroCounters();
    const malformedStore = new MemoryShadowStore(malformedCounters);
    const malformedResult = await runShadowFeedbackEvaluationRequested({
      eventId: "shadow-event",
      data: { transcript: "must not be parsed for malformed runtime" },
      deps: {
        ...active,
        store: malformedStore,
        now: () => new Date(FREEZE_ANCHOR_MS + 1_000),
        isDeletionPending: async () => {
          malformedCounters.deletionReads += 1;
          return false;
        },
        getSession: async () => {
          malformedCounters.sessionReads += 1;
          return sessionAuthority();
        },
        getFrozenEvidence: async () => {
          malformedCounters.evidenceReads += 1;
          return frozenEvidence(1);
        },
        runtime: malformedRuntime as unknown as ShadowFeedbackEvaluationRuntime,
        steps: new MemoizedSteps(malformedCounters),
      },
    });
    assert.equal(malformedResult.status, "runtime_unavailable");
    assert.deepEqual(malformedCounters, zeroCounters());
  }
});

test("trusted scheduling rechecks deletion before durable content-free send", async () => {
  let expectedIntentIds: string[] | null = null;
  for (const segmentCount of ANSWER_BLOCK_SEGMENT_COUNTS) {
    const counters = zeroCounters();
    let deletionChecks = 0;
    const sent: ShadowFeedbackEvaluationEventDataV1[] = [];
    const result = await runShadowFeedbackSchedulingRequested({
      eventId: "feedback-event",
      data: { sessionId: SESSION_ID, userId: USER_ID },
      deps: {
        ...activeGates(),
        runtime: descriptor(),
        isDeletionPending: async () => {
          deletionChecks += 1;
          return false;
        },
        getSession: async () => sessionAuthority(),
        getFrozenEvidence: async () => frozenEvidence(segmentCount),
        steps: {
          async sendEvaluationIntents(events) {
            counters.sends += 1;
            sent.push(...events.map(({ data }) => data));
          },
        },
      },
    });
    assert.equal(result.status, "scheduled");
    assert.equal(deletionChecks, 2);
    assert.equal(counters.sends, 1);
    assert.ok(sent.length > 0);
    const intentIds = sent.map(({ intent }) => intent.intentId);
    expectedIntentIds ??= intentIds;
    assert.deepEqual(intentIds, expectedIntentIds);
    for (const event of sent) {
      assert.deepEqual(parseShadowFeedbackEvaluationEventData(event), event);
    }
    const serialized = JSON.stringify(sent);
    for (const forbidden of [
      "transcript",
      "answerText",
      "promptText",
      "providerPayload",
      "rawError",
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  }

  let deletionChecks = 0;
  let sends = 0;
  const fenced = await runShadowFeedbackSchedulingRequested({
    eventId: "feedback-event",
    data: { sessionId: SESSION_ID, userId: USER_ID },
    deps: {
      ...activeGates(),
      runtime: descriptor(),
      isDeletionPending: async () => {
        deletionChecks += 1;
        return deletionChecks >= 2;
      },
      getSession: async () => sessionAuthority(),
      getFrozenEvidence: async () => frozenEvidence(1),
      steps: {
        async sendEvaluationIntents() {
          sends += 1;
        },
      },
    },
  });
  assert.equal(fenced.status, "fenced");
  assert.equal(sends, 0);
});

test("durable evaluation event identity depends only on the immutable intent", async () => {
  const ids: string[][] = [];
  for (const eventId of [
    "first-delivery-with-arbitrary-text",
    "reconnect-delivery-with-different-arbitrary-text",
  ]) {
    const currentIds: string[] = [];
    const result = await runShadowFeedbackSchedulingRequested({
      eventId,
      data: { sessionId: SESSION_ID, userId: USER_ID },
      deps: {
        ...activeGates(),
        runtime: descriptor(),
        isDeletionPending: async () => false,
        getSession: async () => sessionAuthority(),
        getFrozenEvidence: async () => frozenEvidence(1),
        steps: {
          async sendEvaluationIntents(events) {
            currentIds.push(...events.map(({ id }) => id));
          },
        },
      },
    });
    assert.equal(result.status, "scheduled");
    ids.push(currentIds);
  }
  assert.deepEqual(ids[0], ids[1]);
  assert.equal(JSON.stringify(ids).includes("arbitrary-text"), false);
});

test("exact-key replay and crash after evaluator-step completion perform one physical evaluation", async () => {
  const counters = zeroCounters();
  const store = new MemoryShadowStore(counters);
  const runtime = evaluationRuntime(counters);
  const event = evaluationEvent(frozenEvidence(1));
  const steps = new MemoizedSteps(counters, { failFirstPersistence: true });
  const deps = evaluationDeps({ counters, store, runtime, steps });

  await assert.rejects(
    runShadowFeedbackEvaluationRequested({
      eventId: "shadow-event",
      requestedAtMs: FREEZE_ANCHOR_MS,
      data: event,
      deps,
    }),
    /synthetic_persistence_crash/
  );
  assert.equal(counters.evaluatorCalls, 1);
  assert.equal(counters.storeWrites, 0);

  const replay = await runShadowFeedbackEvaluationRequested({
    eventId: "shadow-event",
    requestedAtMs: FREEZE_ANCHOR_MS,
    data: event,
    deps,
  });
  assert.deepEqual(replay, { status: "recorded", outcome: "completed" });
  assert.equal(counters.evaluatorCalls, 1);
  assert.equal(counters.storeWrites, 1);

  for (const replayKind of ["event_replay", "reconnect"] as const) {
    const terminal = await runShadowFeedbackEvaluationRequested({
      eventId: `shadow-event-${replayKind}`,
      requestedAtMs: FREEZE_ANCHOR_MS,
      data: event,
      deps: evaluationDeps({
        counters,
        store,
        runtime,
        steps: new MemoizedSteps(counters),
      }),
    });
    assert.deepEqual(terminal, {
      status: "already_terminal",
      outcome: "completed",
    });
  }
  assert.equal(counters.evaluatorCalls, 1);
  assert.equal(store.rows.size, 1);
});

test("deletion during retry delay fences before another evaluator call or write", async () => {
  const counters = zeroCounters();
  const store = new MemoryShadowStore(counters);
  let deletionPending = false;
  const runtime = evaluationRuntime(counters, async () => {
    throw new FeedbackProviderInvocationError(
      "evaluation_provider_invocation_failed",
      undefined,
      undefined,
      null,
      { diagnostic: { kind: "provider_network" } }
    );
  });
  const steps = new MemoizedSteps(counters, {
    onSleep: () => {
      deletionPending = true;
    },
  });
  const result = await runShadowFeedbackEvaluationRequested({
    eventId: "shadow-event",
    requestedAtMs: FREEZE_ANCHOR_MS,
    data: evaluationEvent(frozenEvidence(1)),
    deps: evaluationDeps({
      counters,
      store,
      runtime,
      steps,
      isDeletionPending: async () => deletionPending,
    }),
  });
  assert.equal(result.status, "fenced");
  assert.equal(counters.evaluatorCalls, 1);
  assert.equal(counters.storeWrites, 0);
  assert.equal(steps.sleeps.length, 1);
});

test("provider retry metadata is bounded before entering durable step history", async () => {
  const counters = zeroCounters();
  const store = new MemoryShadowStore(counters);
  const retryAfterValues = [Number.POSITIVE_INFINITY, -1, 1_000_000_000];
  const runtime = evaluationRuntime(counters, async ({ attempt }) => {
    throw new FeedbackProviderInvocationError(
      "evaluation_provider_invocation_failed",
      {
        inputTokens: Number.POSITIVE_INFINITY,
        cachedInputTokens: -1,
        outputTokens: 1_000_000_000,
        totalTokens: 0,
      } as FeedbackProviderUsage,
      undefined,
      null,
      {
        diagnostic: {
          kind: "provider_rate_limited",
          retryAfterMs: retryAfterValues[attempt - 1],
        },
      }
    );
  });
  const steps = new MemoizedSteps(counters);
  let nowCalls = 0;
  const result = await runShadowFeedbackEvaluationRequested({
    eventId: "shadow-event",
    requestedAtMs: FREEZE_ANCHOR_MS,
    data: evaluationEvent(frozenEvidence(1)),
    deps: evaluationDeps({
      counters,
      store,
      runtime,
      steps,
      now: () => {
        nowCalls += 1;
        return nowCalls === 6
          ? new Date(Number.NaN)
          : new Date(FREEZE_ANCHOR_MS + 1_000 + nowCalls);
      },
    }),
  });
  assert.deepEqual(result, { status: "recorded", outcome: "failed" });
  const durableFailures = [...steps.results.entries()]
    .filter(([name]) => name.startsWith("evaluate-shadow-feedback-"))
    .map(
      ([, value]) =>
        value as {
          disposition: "failed";
          failure: { retryAfterMs: number | null; usage: unknown };
          durationMs: number;
        }
    );
  assert.equal(durableFailures.length, 3);
  assert.deepEqual(
    durableFailures.map(({ failure }) => failure.retryAfterMs),
    [null, null, 60_000]
  );
  assert.deepEqual(
    durableFailures.map(({ failure }) => failure.usage),
    [null, null, null]
  );
  assert.equal(durableFailures[0]?.durationMs, 0);
  assert.ok(
    durableFailures.every(
      ({ durationMs }) =>
        Number.isInteger(durationMs) && durationMs >= 0 && durationMs <= 90_000
    )
  );
  assert.ok(steps.sleeps.every(({ durationMs }) => durationMs > 0));
  assert.ok(steps.sleeps.every(({ durationMs }) => durationMs <= 60_000));
});

test("deletion after evaluator output discards it before persistence", async () => {
  const counters = zeroCounters();
  const store = new MemoryShadowStore(counters);
  let deletionPending = false;
  const runtime = evaluationRuntime(counters, async () => {
    deletionPending = true;
    return {
      outcome: completedOutcome(5),
      usage: {
        inputTokens: 100,
        cachedInputTokens: 20,
        outputTokens: 50,
        totalTokens: 150,
      },
    };
  });
  const result = await runShadowFeedbackEvaluationRequested({
    eventId: "shadow-event",
    requestedAtMs: FREEZE_ANCHOR_MS,
    data: evaluationEvent(frozenEvidence(1)),
    deps: evaluationDeps({
      counters,
      store,
      runtime,
      steps: new MemoizedSteps(counters),
      isDeletionPending: async () => deletionPending,
    }),
  });
  assert.equal(result.status, "fenced");
  assert.equal(counters.evaluatorCalls, 1);
  assert.equal(counters.storeWrites, 0);
});

test("comparison waits with stable bounded sleeps until an artifact arrives", async () => {
  const counters = zeroCounters();
  const store = new MemoryShadowStore(counters);
  const evidence = frozenEvidence(1);
  const events = evaluationEvents(evidence);
  let nowMs = FREEZE_ANCHOR_MS + 10_000;
  let completedSleeps = 0;
  const steps = new MemoizedSteps(counters, {
    onSleep: () => {
      completedSleeps += 1;
      nowMs += SHADOW_FEEDBACK_COMPARISON_WAIT_MS;
      if (completedSleeps === 3) {
        for (const event of events) {
          store.seed(completedArtifact(event.intent.key));
        }
      }
    },
  });
  const result = await runShadowFeedbackComparisonRequested({
    requestedAtMs: FREEZE_ANCHOR_MS + 10_000,
    data: { sessionId: SESSION_ID, userId: USER_ID },
    deps: comparisonDeps({
      counters,
      store,
      steps,
      now: () => new Date(nowMs),
    }),
  });
  assert.equal(result.status, "reported");
  assert.equal(result.report?.status, "complete");
  assert.equal(counters.storeReads, 4);
  assert.deepEqual(
    steps.sleeps.map(({ name }) => name),
    [
      "wait-shadow-feedback-artifacts-1",
      "wait-shadow-feedback-artifacts-2",
      "wait-shadow-feedback-artifacts-3",
    ]
  );
});

test("comparison timeout is bounded and reports remaining artifacts as missing", async () => {
  const counters = zeroCounters();
  const store = new MemoryShadowStore(counters);
  let nowMs = FREEZE_ANCHOR_MS + 10_000;
  const steps = new MemoizedSteps(counters, {
    onSleep: (_name, durationMs) => {
      nowMs += durationMs;
    },
  });
  const result = await runShadowFeedbackComparisonRequested({
    requestedAtMs: nowMs,
    data: { sessionId: SESSION_ID, userId: USER_ID },
    deps: comparisonDeps({
      counters,
      store,
      steps,
      now: () => new Date(nowMs),
    }),
  });
  assert.equal(result.status, "reported");
  assert.equal(result.report?.status, "incomplete");
  assert.equal(
    result.report?.artifacts.missing,
    evaluationEvents(frozenEvidence(1)).length
  );
  assert.equal(counters.storeReads, SHADOW_FEEDBACK_COMPARISON_MAX_READS);
  assert.equal(steps.sleeps.length, SHADOW_FEEDBACK_COMPARISON_MAX_READS - 1);
  assert.deepEqual(
    steps.sleeps.map(({ name }) => name),
    Array.from(
      { length: SHADOW_FEEDBACK_COMPARISON_MAX_READS - 1 },
      (_, index) => `wait-shadow-feedback-artifacts-${index + 1}`
    )
  );
});

test("failed artifacts are terminal and comparison does not poll", async () => {
  const counters = zeroCounters();
  const store = new MemoryShadowStore(counters);
  const events = evaluationEvents(frozenEvidence(1));
  for (const event of events) {
    store.seed(failedArtifact(event.intent.key, "provider_capacity"));
  }
  const steps = new MemoizedSteps(counters);
  const result = await runShadowFeedbackComparisonRequested({
    requestedAtMs: FREEZE_ANCHOR_MS + 10_000,
    data: { sessionId: SESSION_ID, userId: USER_ID },
    deps: comparisonDeps({ counters, store, steps }),
  });
  assert.equal(result.status, "reported");
  assert.equal(result.report?.status, "incomplete");
  assert.equal(result.report?.failures.provider_capacity, events.length);
  assert.deepEqual(result.report?.latency, {
    kind: "unavailable",
    potentialLeadMs: null,
  });
  assert.equal(counters.storeReads, 1);
  assert.deepEqual(steps.sleeps, []);
});

test("comparison fence can consume the remaining budget without scheduling a zero sleep", async () => {
  const counters = zeroCounters();
  const store = new MemoryShadowStore(counters);
  let nowMs = FREEZE_ANCHOR_MS + 10_000;
  let deletionChecks = 0;
  const steps = new MemoizedSteps(counters);
  const result = await runShadowFeedbackComparisonRequested({
    requestedAtMs: nowMs,
    data: { sessionId: SESSION_ID, userId: USER_ID },
    deps: comparisonDeps({
      counters,
      store,
      steps,
      now: () => new Date(nowMs),
      isDeletionPending: async () => {
        deletionChecks += 1;
        if (deletionChecks === 4) {
          nowMs += SHADOW_FEEDBACK_COMPARISON_MAX_WAIT_MS + 1;
        }
        return false;
      },
    }),
  });
  assert.equal(result.status, "reported");
  assert.equal(counters.storeReads, 1);
  assert.deepEqual(steps.sleeps, []);
});

test("evaluation fence can consume the provider budget without a physical call", async () => {
  const counters = zeroCounters();
  const store = new MemoryShadowStore(counters);
  let nowMs = FREEZE_ANCHOR_MS + 1_000;
  let deletionChecks = 0;
  const result = await runShadowFeedbackEvaluationRequested({
    eventId: "shadow-event",
    requestedAtMs: FREEZE_ANCHOR_MS,
    data: evaluationEvent(frozenEvidence(1)),
    deps: evaluationDeps({
      counters,
      store,
      runtime: evaluationRuntime(counters),
      steps: new MemoizedSteps(counters),
      now: () => new Date(nowMs),
      isDeletionPending: async () => {
        deletionChecks += 1;
        if (deletionChecks === 4) nowMs = FREEZE_ANCHOR_MS + 90_000;
        return false;
      },
    }),
  });
  assert.deepEqual(result, { status: "recorded", outcome: "failed" });
  assert.equal(counters.evaluatorCalls, 0);
  assert.equal(counters.storeWrites, 1);
  const persisted = [...store.rows.values()][0];
  assert.equal(persisted?.outcome.state, "failed");
  if (persisted?.outcome.state === "failed") {
    assert.equal(persisted.outcome.failureClass, "deadline_exceeded");
  }
});

test("deletion during comparison wait or before return exposes no report", async () => {
  const counters = zeroCounters();
  const store = new MemoryShadowStore(counters);
  let deleted = false;
  let nowMs = FREEZE_ANCHOR_MS + 10_000;
  const steps = new MemoizedSteps(counters, {
    onSleep: (_name, durationMs) => {
      nowMs += durationMs;
      deleted = true;
    },
  });
  const duringWait = await runShadowFeedbackComparisonRequested({
    requestedAtMs: nowMs,
    data: { sessionId: SESSION_ID, userId: USER_ID },
    deps: comparisonDeps({
      counters,
      store,
      steps,
      now: () => new Date(nowMs),
      isDeletionPending: async () => deleted,
    }),
  });
  assert.deepEqual(duringWait, { status: "fenced", report: null });
  assert.equal(counters.storeReads, 1);
  assert.equal(counters.batchReads, 0);

  const beforeReadCounters = zeroCounters();
  const beforeReadStore = new MemoryShadowStore(beforeReadCounters);
  let beforeReadDeleted = false;
  const beforeRead = await runShadowFeedbackComparisonRequested({
    requestedAtMs: FREEZE_ANCHOR_MS + 10_000,
    data: { sessionId: SESSION_ID, userId: USER_ID },
    deps: comparisonDeps({
      counters: beforeReadCounters,
      store: beforeReadStore,
      steps: new MemoizedSteps(beforeReadCounters),
      getFrozenEvidence: async () => {
        beforeReadDeleted = true;
        return frozenEvidence(1);
      },
      isDeletionPending: async () => beforeReadDeleted,
    }),
  });
  assert.deepEqual(beforeRead, { status: "fenced", report: null });
  assert.equal(beforeReadCounters.storeReads, 0);

  const beforeReturnCounters = zeroCounters();
  const beforeReturnStore = new MemoryShadowStore(beforeReturnCounters);
  const event = evaluationEvent(frozenEvidence(1));
  beforeReturnStore.seed(completedArtifact(event.intent.key));
  let beforeReturnDeleted = false;
  const beforeReturn = await runShadowFeedbackComparisonRequested({
    requestedAtMs: FREEZE_ANCHOR_MS + 10_000,
    data: { sessionId: SESSION_ID, userId: USER_ID },
    deps: comparisonDeps({
      counters: beforeReturnCounters,
      store: beforeReturnStore,
      steps: new MemoizedSteps(beforeReturnCounters),
      isDeletionPending: async () => beforeReturnDeleted,
      readBatchAuthority: async (input) => {
        beforeReturnCounters.batchReads += 1;
        beforeReturnDeleted = true;
        return batchAuthority(input.projection);
      },
    }),
  });
  assert.deepEqual(beforeReturn, { status: "fenced", report: null });
  assert.equal(beforeReturnCounters.batchReads, 1);
});

test("shadow disagreement leaves product-authority tripwires untouched", async () => {
  const forbidden = {
    feedbackWrites: 0,
    lifecycleMutations: 0,
    insightEmissions: 0,
    billingMutations: 0,
    interviewMutations: 0,
  };
  const counters = zeroCounters();
  const store = new MemoryShadowStore(counters);
  const event = evaluationEvent(frozenEvidence(1));
  store.seed(completedArtifact(event.intent.key, 1));
  const depsWithTripwires = {
    ...comparisonDeps({
      counters,
      store,
      steps: new MemoizedSteps(counters),
    }),
    forbidden,
  };
  const result = await runShadowFeedbackComparisonRequested({
    requestedAtMs: FREEZE_ANCHOR_MS + 10_000,
    data: { sessionId: SESSION_ID, userId: USER_ID },
    deps: depsWithTripwires,
  });
  assert.equal(result.status, "reported");
  assert.ok((result.report?.scores.disagree ?? 0) > 0);
  assert.deepEqual(forbidden, {
    feedbackWrites: 0,
    lifecycleMutations: 0,
    insightEmissions: 0,
    billingMutations: 0,
    interviewMutations: 0,
  });
});

class MemoryShadowStore implements ShadowFeedbackArtifactStore {
  readonly rows = new Map<string, ShadowFeedbackArtifactV1>();

  constructor(private readonly counters: ReturnType<typeof zeroCounters>) {}

  seed(artifact: ShadowFeedbackArtifactV1): void {
    this.rows.set(artifact.key.keyFingerprint, artifact);
  }

  async record(
    _gate: Parameters<ShadowFeedbackArtifactStore["record"]>[0],
    input: { userId: string; artifact: unknown }
  ): Promise<ShadowFeedbackArtifactWriteResult> {
    this.counters.storeWrites += 1;
    const artifact = parseShadowFeedbackArtifact(input.artifact);
    const existing = this.rows.get(artifact.key.keyFingerprint);
    if (!existing) {
      this.rows.set(artifact.key.keyFingerprint, artifact);
      return "inserted";
    }
    return JSON.stringify(existing) === JSON.stringify(artifact)
      ? "duplicate"
      : "conflict";
  }

  async readExact(
    _gate: Parameters<ShadowFeedbackArtifactStore["readExact"]>[0],
    expectedKeys: readonly unknown[]
  ): Promise<ShadowFeedbackArtifactSetV1> {
    this.counters.storeReads += 1;
    return aggregateShadowFeedbackArtifacts({
      expectedKeys,
      artifacts: [...this.rows.values()],
    });
  }
}

class MemoizedSteps {
  readonly sleeps: Array<{ name: string; durationMs: number }> = [];
  readonly results = new Map<string, unknown>();
  private failFirstPersistence: boolean;

  constructor(
    private readonly counters: ReturnType<typeof zeroCounters>,
    private readonly options: {
      failFirstPersistence?: boolean;
      onSleep?: (name: string, durationMs: number) => void;
    } = {}
  ) {
    this.failFirstPersistence = options.failFirstPersistence === true;
  }

  async run<T>(name: string, work: () => Promise<T>): Promise<T> {
    if (this.results.has(name)) return this.results.get(name) as T;
    if (
      name.startsWith("persist-shadow-feedback-") &&
      this.failFirstPersistence
    ) {
      this.failFirstPersistence = false;
      throw new Error("synthetic_persistence_crash");
    }
    const result = await work();
    this.results.set(name, result);
    return result;
  }

  async sleep(name: string, durationMs: number): Promise<void> {
    this.counters.sleeps += 1;
    this.sleeps.push({ name, durationMs });
    this.options.onSleep?.(name, durationMs);
  }
}

function evaluationDeps(input: {
  counters: ReturnType<typeof zeroCounters>;
  store: MemoryShadowStore;
  runtime: ShadowFeedbackEvaluationRuntime;
  steps: MemoizedSteps;
  now?: () => Date;
  isDeletionPending?: () => Promise<boolean>;
}) {
  let nowMs = FREEZE_ANCHOR_MS + 1_000;
  return {
    ...activeGates(),
    runtime: input.runtime,
    store: input.store,
    steps: input.steps,
    now: input.now ?? (() => new Date(nowMs++)),
    isDeletionPending:
      input.isDeletionPending ??
      (async () => {
        input.counters.deletionReads += 1;
        return false;
      }),
    getSession: async () => {
      input.counters.sessionReads += 1;
      return sessionAuthority();
    },
    getFrozenEvidence: async () => {
      input.counters.evidenceReads += 1;
      return frozenEvidence(1);
    },
  };
}

function comparisonDeps(input: {
  counters: ReturnType<typeof zeroCounters>;
  store: MemoryShadowStore;
  steps: MemoizedSteps;
  now?: () => Date;
  isDeletionPending?: () => Promise<boolean>;
  getFrozenEvidence?: () => Promise<ShadowFeedbackFrozenEvidence>;
  readBatchAuthority?: Parameters<
    typeof runShadowFeedbackComparisonRequested
  >[0]["deps"]["readBatchAuthority"];
}) {
  return {
    ...activeGates(),
    runtime: descriptor(),
    store: input.store,
    steps: input.steps,
    now: input.now ?? (() => new Date(FREEZE_ANCHOR_MS + 10_000)),
    isDeletionPending:
      input.isDeletionPending ??
      (async () => {
        input.counters.deletionReads += 1;
        return false;
      }),
    getSession: async () => {
      input.counters.sessionReads += 1;
      return sessionAuthority();
    },
    getFrozenEvidence:
      input.getFrozenEvidence ??
      (async () => {
        input.counters.evidenceReads += 1;
        return frozenEvidence(1);
      }),
    readBatchAuthority:
      input.readBatchAuthority ??
      (async ({ projection }) => {
        input.counters.batchReads += 1;
        return batchAuthority(projection);
      }),
  };
}

function evaluationRuntime(
  counters: ReturnType<typeof zeroCounters>,
  evaluate?: ShadowFeedbackEvaluationRuntime["evaluator"]["evaluate"]
): ShadowFeedbackEvaluationRuntime {
  return {
    ...descriptor(),
    evaluator: {
      async evaluate(input) {
        counters.evaluatorCalls += 1;
        if (evaluate) return evaluate(input);
        return {
          outcome: completedOutcome(5),
          usage: {
            inputTokens: 100,
            cachedInputTokens: 20,
            outputTokens: 50,
            totalTokens: 150,
          },
        };
      },
    },
  };
}

function descriptor() {
  return {
    ...DEFAULT_SHADOW_FEEDBACK_RUNTIME_VERSIONS,
    modelVersion: MODEL_VERSION,
    costRates: null,
  };
}

function evaluationEvent(
  evidence: ShadowFeedbackFrozenEvidence
): ShadowFeedbackEvaluationEventDataV1 {
  return evaluationEvents(evidence)[0]!;
}

function evaluationEvents(
  evidence: ShadowFeedbackFrozenEvidence
): ShadowFeedbackEvaluationEventDataV1[] {
  const prepared =
    prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot(evidence);
  const intents = createShadowFeedbackSchedulingIntents({
    sessionId: SESSION_ID,
    projection: prepared.projection,
    terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
    ...DEFAULT_SHADOW_FEEDBACK_RUNTIME_VERSIONS,
    modelVersion: MODEL_VERSION,
  });
  assert.ok(intents.length > 0);
  return intents.map((intent) => ({
    contractVersion: SHADOW_FEEDBACK_EVALUATION_EVENT_VERSION,
    userId: USER_ID,
    intent,
  }));
}

function frozenEvidence(
  segmentCount: (typeof ANSWER_BLOCK_SEGMENT_COUNTS)[number]
): ShadowFeedbackFrozenEvidence {
  const fixture = createAnswerBlockSegmentationFixture(segmentCount);
  const terminal = fixture.events.at(-1)!;
  const sequenced = fixture.events.filter(
    (
      event
    ): event is Extract<
      (typeof fixture.events)[number],
      { sequence: number }
    > => "sequence" in event
  );
  const authority: FrozenAnswerBlockAuthorityV1 = {
    contractVersion: "frozen-answer-block-authority.v1",
    snapshotState: "complete",
    cutoffAtMs:
      terminal.kind === "session_end" || terminal.kind === "cutoff"
        ? terminal.occurredAtMs
        : 0,
    writers: [
      {
        contractVersion: 1,
        writerId: sequenced[0]!.writerId,
        writerGeneration: sequenced[0]!.writerGeneration,
        committedSequence: sequenced.length,
        integrityState: "healthy",
        settlementState: "settled",
      },
    ],
  };
  return {
    snapshotValid: true,
    snapshotState: "complete",
    turns: fixture.events.flatMap((event) =>
      event.kind === "turn"
        ? [
            {
              contractVersion: event.contractVersion,
              eventId: event.eventId,
              writerId: event.writerId,
              writerGeneration: event.writerGeneration,
              sequence: event.sequence,
              speaker: event.speaker,
              text: event.text,
              startedAt: new Date(event.startedAtMs),
              endedAt: new Date(event.endedAtMs),
              audioMs: event.audioDurationMs,
              section: event.section,
              deliveryState: event.deliveryState,
            },
          ]
        : []
    ),
    interruptions: fixture.events.flatMap((event) =>
      event.kind === "integrity_boundary"
        ? [
            {
              eventId: event.eventId,
              writerId: event.writerId,
              writerGeneration: event.writerGeneration,
              sequence: event.sequence,
              speaker: event.speaker,
              occurredAt: new Date(event.occurredAtMs),
              reason: event.reason,
            },
          ]
        : []
    ),
    sessionEndAt:
      terminal.kind === "session_end" || terminal.kind === "cutoff"
        ? new Date(terminal.occurredAtMs)
        : null,
    sourceOverflow: false,
    authority,
    terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
  };
}

function sessionAuthority() {
  return {
    userId: USER_ID,
    roundType: "product_sense",
    terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
  };
}

function completedOutcome(score: number) {
  return {
    state: "completed" as const,
    roundType: "product_sense" as const,
    mode: "full_scorecard" as const,
    dimensions: Object.fromEntries(
      FEEDBACK_DIMENSIONS.map((dimension) => [
        dimension,
        {
          score,
          facetCodes: ROUND_DIMENSION_COVERAGE_CONFIG.product_sense[
            dimension
          ].facets
            .slice(0, 2)
            .map(({ code }) => code)
            .sort(),
        },
      ])
    ),
  };
}

function completedArtifact(
  key: ShadowFeedbackEvaluationEventDataV1["intent"]["key"],
  score = 5
): ShadowFeedbackArtifactV1 {
  return parseShadowFeedbackArtifact({
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_VERSION,
    key,
    outcome: completedOutcome(score),
    metrics: {
      durationMs: 1_000,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      totalTokens: null,
    },
    completedAt: "2026-08-14T10:00:02.000Z",
  });
}

function failedArtifact(
  key: ShadowFeedbackEvaluationEventDataV1["intent"]["key"],
  failureClass: "provider_capacity"
): ShadowFeedbackArtifactV1 {
  return parseShadowFeedbackArtifact({
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_VERSION,
    key,
    outcome: { state: "failed", failureClass },
    metrics: {
      durationMs: 1_000,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      totalTokens: null,
    },
    completedAt: "2026-08-14T10:00:02.000Z",
  });
}

function batchAuthority(
  projection: ReturnType<
    typeof prepareTrustedCandidateAnswerBlockEvidenceFromFrozenSnapshot
  >["projection"]
) {
  const answerBlockRef = projection.trustedBlocks[0]!.answerBlockId;
  const feedback = {
    roundType: "product_sense",
    mode: "full_scorecard",
    dimensions: Object.fromEntries(
      FEEDBACK_DIMENSIONS.map((dimension) => [
        dimension,
        {
          score: 5,
          evidence: ROUND_DIMENSION_COVERAGE_CONFIG.product_sense[
            dimension
          ].facets
            .slice(0, 2)
            .map((facet) => ({
              facetCode: facet.code,
              facetLabel: facet.label,
              answerBlockRef,
              evidenceText: "synthetic adapter-only evidence",
            })),
        },
      ])
    ),
  } as unknown as DimensionCoverageFeedbackResult;
  return createShadowFeedbackBatchAuthority({
    feedback,
    projection,
    sessionId: SESSION_ID,
    terminalFreezeAnchorAtMs: FREEZE_ANCHOR_MS,
    completedAtMs: FREEZE_ANCHOR_MS + 5_000,
  });
}

function activeGates() {
  return withGateEnvironment("enabled", "enabled", () => ({
    executionGate: getShadowFeedbackExecutionGate(),
    storageGate: getShadowFeedbackArtifactStorageGate(),
  }));
}

function disabledGates() {
  return withGateEnvironment(undefined, undefined, () => ({
    executionGate: getShadowFeedbackExecutionGate(),
    storageGate: getShadowFeedbackArtifactStorageGate(),
  }));
}

function withGateEnvironment<T>(
  execution: string | undefined,
  storage: string | undefined,
  work: () => T
): T {
  const previousExecution = process.env.MEELNI_SHADOW_FEEDBACK_EXECUTION;
  const previousStorage = process.env.MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE;
  setEnvironment("MEELNI_SHADOW_FEEDBACK_EXECUTION", execution);
  setEnvironment("MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE", storage);
  try {
    return work();
  } finally {
    setEnvironment("MEELNI_SHADOW_FEEDBACK_EXECUTION", previousExecution);
    setEnvironment("MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE", previousStorage);
  }
}

function setEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function zeroCounters() {
  return {
    deletionReads: 0,
    sessionReads: 0,
    evidenceReads: 0,
    storeReads: 0,
    storeWrites: 0,
    evaluatorCalls: 0,
    batchReads: 0,
    sends: 0,
    sleeps: 0,
  };
}

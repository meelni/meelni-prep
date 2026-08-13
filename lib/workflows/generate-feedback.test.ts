import assert from "node:assert/strict";
import test from "node:test";

import {
  EVIDENCE_LIMITED_ACTIONS,
  EVIDENCE_LIMITED_CONFIDENCE,
  EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS,
  EVIDENCE_LIMITED_STRENGTH_SIGNALS,
  EVIDENCE_LIMITED_SUMMARY,
  FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
  FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
  FeedbackV2ParseError,
  prepareFeedbackTranscript,
  type FeedbackEvaluationResult,
  type FeedbackEvaluationState,
  type FeedbackV2Result,
  type PreparedFeedbackTranscript,
} from "@meelni/core";
import {
  ANSWER_BLOCK_SEGMENT_COUNTS,
  createAnswerBlockSegmentationFixture,
} from "@meelni/test-fixtures";

import { getEvaluationFailureReason } from "@/lib/evaluation/failure-reason";
import {
  calculateValidatedSessionFromTurns,
  type SessionValidationTurnInput,
  type SessionStats,
} from "@/lib/evaluation/session-validator";
import type {
  FeedbackGenerationRecord,
  FeedbackGenerationStore,
} from "@/lib/db/feedback-generation-state";
import {
  failFeedbackGenerationWorkflow,
  generateFeedbackWorkflow,
  type GenerateFeedbackWorkflowDeps,
} from "./generate-feedback";

const SESSION_ID = "feedback-session-1";
const USER_ID = "feedback-user-1";
const EVENT_1 = `feedback/generate.requested:${SESSION_ID}:1`;
const EVENT_2 = `feedback/generate.requested:${SESSION_ID}:2`;
const NOW = new Date("2026-07-10T15:00:00.000Z");

test("concurrent deliveries claim once and emit insights once", async () => {
  const store = new MemoryGenerationStore(record());
  let evaluations = 0;
  const insights: string[] = [];
  const deps = dependencies(store, {
    insights,
    async evaluate() {
      evaluations += 1;
      await Promise.resolve();
      return evaluation("full");
    },
  });

  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      generateFeedbackWorkflow(input(EVENT_1), deps)
    )
  );

  assert.equal(evaluations, 1);
  assert.equal(insights.length, 1);
  assert.equal(store.current.status, "completed");
  assert.equal(
    results.filter(
      (result) =>
        result.status === "completed" && result.disposition === "applied"
    ).length,
    1
  );
});

test("completion latency is anchored to accepted end truth", async () => {
  const store = new MemoryGenerationStore(record());
  const deps = dependencies(store);
  deps.getSession = async () => ({
    userId: USER_ID,
    roundType: "strategy",
    endingAtMs: NOW.getTime() - 90_000,
  });

  const result = await generateFeedbackWorkflow(input(EVENT_1), deps);

  assert.equal(result.status, "completed");
  assert.equal(result.endToFeedbackMs, 90_000);
});

test("owner and event identity are required before provider work", async () => {
  const store = new MemoryGenerationStore(record());
  let evaluations = 0;
  const deps = dependencies(store, {
    async evaluate() {
      evaluations += 1;
      return evaluation("full");
    },
  });

  await assert.rejects(
    generateFeedbackWorkflow({ ...input(EVENT_1), userId: "other-user" }, deps),
    /not_authorized/
  );
  await assert.rejects(
    generateFeedbackWorkflow(input(EVENT_2), deps),
    /event_mismatch/
  );
  assert.equal(evaluations, 0);
  assert.equal(store.current.status, "pending");
});

test("a retired event cannot overwrite or emit insights after a retry completes", async () => {
  const store = new MemoryGenerationStore(record());
  const insights: string[] = [];
  let releaseOld!: () => void;
  const oldPaused = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  const oldRun = generateFeedbackWorkflow(
    input(EVENT_1),
    dependencies(store, {
      insights,
      async evaluate() {
        await oldPaused;
        return evaluation("full", 4);
      },
    })
  );
  await waitUntil(() => store.current.status === "processing");

  store.replace(record({ eventId: EVENT_2 }));
  const newRun = await generateFeedbackWorkflow(
    input(EVENT_2),
    dependencies(store, {
      insights,
      async evaluate() {
        return evaluation("full", 9);
      },
    })
  );
  releaseOld();
  const oldResult = await oldRun;

  assert.deepEqual(newRun, {
    status: "completed",
    disposition: "applied",
    sessionId: SESSION_ID,
    overallScore: 9,
  });
  assert.equal(oldResult.disposition, "fenced");
  assert.equal(store.current.eventId, EVENT_2);
  assert.equal(store.completedScore, 9);
  assert.deepEqual(insights, [`insights:update:${SESSION_ID}:${EVENT_2}`]);
});

test("a superseded durable retry is fenced before repeating provider work", async () => {
  const store = new MemoryGenerationStore(record());
  const cachedSteps = new Map<string, unknown>();
  let evaluations = 0;
  const deps = dependencies(store, {
    async evaluate() {
      evaluations += 1;
      throw new Error("provider_timeout");
    },
  });
  deps.steps = {
    async run<T>(name: string, work: () => Promise<T>): Promise<T> {
      if (cachedSteps.has(name)) return cachedSteps.get(name) as T;
      const result = await work();
      cachedSteps.set(name, result);
      return result;
    },
    async sendInsights() {},
  };

  await assert.rejects(
    generateFeedbackWorkflow(input(EVENT_1), deps),
    /provider_timeout/
  );
  store.replace(
    record({
      eventId: EVENT_2,
      status: "processing",
      processingStartedAt: NOW,
    })
  );

  const replay = await generateFeedbackWorkflow(input(EVENT_1), deps);

  assert.equal(replay.disposition, "fenced");
  assert.equal(evaluations, 1);
  assert.equal(store.current.eventId, EVENT_2);
  assert.equal(store.current.status, "processing");
});

test("stale failure callbacks and terminal replays are immutable", async () => {
  const completed = record({ status: "completed", eventId: EVENT_2 });
  const store = new MemoryGenerationStore(completed);
  const insights: string[] = [];
  let evaluations = 0;

  assert.equal(
    await failFeedbackGenerationWorkflow(
      { ...input(EVENT_1), reason: "old timeout" },
      {
        store,
        isDeletionPending: async () => false,
        getSession: async () => ({ userId: USER_ID, roundType: "strategy" }),
      }
    ),
    false
  );
  const replay = await generateFeedbackWorkflow(
    input(EVENT_2),
    dependencies(store, {
      insights,
      async evaluate() {
        evaluations += 1;
        return evaluation("full");
      },
    })
  );

  assert.equal(replay.disposition, "already_terminal");
  assert.equal(store.current.status, "completed");
  assert.equal(evaluations, 0);
  assert.equal(insights.length, 0);
});

test("untrusted transcript is skipped without provider or insight work", async () => {
  const store = new MemoryGenerationStore(record());
  let evaluations = 0;
  const insights: string[] = [];
  const deps = dependencies(store, {
    insights,
    transcript: {
      eligible: false,
      transcript: [],
      reasons: ["Transcript data is incomplete or corrupted"],
      issues: [],
      duplicateTurnsRemoved: 0,
    },
    async evaluate() {
      evaluations += 1;
      return evaluation("full");
    },
  });
  deps.getSession = async () => ({
    userId: USER_ID,
    roundType: "strategy",
    endingAtMs: NOW.getTime() - 45_000,
  });
  const result = await generateFeedbackWorkflow(input(EVENT_1), deps);

  assert.equal(result.status, "skipped");
  assert.equal(result.endToFeedbackMs, 45_000);
  assert.equal(store.current.status, "skipped");
  assert.equal(evaluations, 0);
  assert.equal(insights.length, 0);
});

test("unknown evidence-limited selection remains generation failure, not insufficiency", async () => {
  const store = new MemoryGenerationStore(
    record({
      completionTier: "partial",
      completionStats: {
        totalTurns: 2,
        userTurns: 1,
        totalWords: 48,
        durationSeconds: 20,
        substantiveResponses: 1,
        scoreableResponses: 0,
      },
    })
  );
  const rejection = new FeedbackV2ParseError(
    "finding_text_invalid",
    "unknown evidence-limited strength signal code"
  );
  let observedMode: "scored" | "evidence_limited" | undefined;
  const deps = dependencies(store, {
    async evaluate(input) {
      observedMode = input.mode;
      throw rejection;
    },
  });

  await assert.rejects(
    generateFeedbackWorkflow(input(EVENT_1), deps),
    /unknown evidence-limited strength signal code/
  );
  assert.equal(observedMode, "evidence_limited");
  assert.equal(store.current.status, "processing");
  assert.notEqual(store.current.status, "skipped");

  const failureReason = getEvaluationFailureReason(rejection);
  assert.equal(
    failureReason,
    "Feedback evaluation failed. Check worker logs and retry."
  );
  assert.equal(
    await failFeedbackGenerationWorkflow(
      { ...input(EVENT_1), reason: failureReason },
      {
        store,
        isDeletionPending: async () => false,
        getSession: async () => ({ userId: USER_ID, roundType: "strategy" }),
      }
    ),
    true
  );
  assert.equal(store.current.status, "failed");
  assert.equal(store.current.statusReason, failureReason);
});

test("five long-form fallback responses never unlock scored mode", async () => {
  const store = new MemoryGenerationStore(
    record({
      completionTier: "partial",
      completionStats: {
        totalTurns: 10,
        userTurns: 5,
        totalWords: 300,
        durationSeconds: 240,
        substantiveResponses: 5,
        scoreableResponses: 0,
      },
    })
  );
  let observedMode: "scored" | "evidence_limited" | undefined;
  const deps = dependencies(store, {
    async evaluate(input) {
      observedMode = input.mode;
      throw new FeedbackV2ParseError(
        "finding_text_invalid",
        "provider supplied no valid closed selection"
      );
    },
  });

  await assert.rejects(
    generateFeedbackWorkflow(input(EVENT_1), deps),
    /provider supplied no valid closed selection/
  );
  assert.equal(observedMode, "evidence_limited");
  assert.notEqual(store.current.status, "skipped");
});

test("a durable qualitative-only constraint overrides five scoreable responses", async () => {
  const store = new MemoryGenerationStore(
    record({
      completionTier: "partial",
      completionStats: {
        totalTurns: 10,
        userTurns: 5,
        totalWords: 300,
        durationSeconds: 240,
        substantiveResponses: 5,
        scoreableResponses: 5,
        feedbackModeConstraint: "evidence_limited_only",
      },
    })
  );
  let observed:
    | { mode: "scored" | "evidence_limited"; state: FeedbackEvaluationState }
    | undefined;
  const deps = dependencies(store, {
    async evaluate(input) {
      observed = { mode: input.mode, state: input.evaluationState };
      throw new FeedbackV2ParseError(
        "finding_text_invalid",
        "provider supplied no valid closed selection"
      );
    },
  });

  await assert.rejects(
    generateFeedbackWorkflow(input(EVENT_1), deps),
    /provider supplied no valid closed selection/
  );
  assert.deepEqual(observed, {
    mode: "evidence_limited",
    state: "partial",
  });
  assert.notEqual(store.current.status, "skipped");
});

test("1, 2, 5, or 10 STT finals preserve completion stats, tier, provider mode, and exact citations", async () => {
  const observations: Array<{
    stats: SessionStats;
    tier: string;
    mode: "scored" | "evidence_limited";
  }> = [];

  for (const segmentCount of ANSWER_BLOCK_SEGMENT_COUNTS) {
    const fixture = createAnswerBlockSegmentationFixture(segmentCount);
    const sourceTurns = fixture.events.flatMap((event) =>
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
    );
    const sessionEndAt = new Date(
      fixture.events.find((event) => event.kind === "session_end")!.occurredAtMs
    );
    const validation = calculateValidatedSessionFromTurns(sourceTurns, {
      sessionEndAt,
    });
    const prepared = prepareFeedbackTranscript(
      sourceTurns.map((turn) => ({
        eventId: turn.eventId,
        contractVersion: turn.contractVersion,
        speaker: turn.speaker,
        text: turn.text,
        deliveryState: turn.deliveryState,
      })),
      { requireContractV2: true }
    );
    const expectedCitations = prepared.transcript.map(({ eventId, text }) => ({
      eventId,
      text,
    }));
    const store = new MemoryGenerationStore(
      record({
        completionTier: validation.tier,
        completionStats: validation.stats,
      })
    );
    let observedMode: "scored" | "evidence_limited" | undefined;
    const deps = dependencies(store, {
      transcript: prepared,
      async evaluate(input) {
        observedMode = input.mode;
        assert.deepEqual(
          input.transcript.map(({ eventId, text }) => ({ eventId, text })),
          expectedCitations,
          String(segmentCount)
        );
        throw new Error("synthetic_stop_after_observation");
      },
    });

    await assert.rejects(
      generateFeedbackWorkflow(input(EVENT_1), deps),
      /synthetic_stop_after_observation/
    );
    assert.ok(observedMode);
    observations.push({
      stats: validation.stats,
      tier: validation.tier,
      mode: observedMode,
    });
  }

  for (const observation of observations.slice(1)) {
    assert.deepEqual(observation, observations[0]);
  }
  assert.deepEqual(observations[0], {
    stats: {
      totalTurns: 4,
      userTurns: 2,
      totalWords: 63,
      durationSeconds: 23,
      substantiveResponses: 2,
      scoreableResponses: 2,
    },
    tier: "partial",
    mode: "evidence_limited",
  });
});

test("authenticated exact replay insertion preserves completion stats, tier, provider mode, and accepted citations", async () => {
  const observations: Array<{
    variant: "none" | "literal" | "normalized";
    stats: SessionStats;
    tier: string;
    mode: "scored" | "evidence_limited";
    providerInput: Array<{ eventId: string; text: string }>;
  }> = [];

  for (const variant of ["none", "literal", "normalized"] as const) {
    const turns = createReplayContinuityWorkflowTurns(variant);
    const validation = calculateValidatedSessionFromTurns(turns, {
      sessionEndAt: turns.at(-1)!.endedAt!,
    });
    const prepared = prepareFeedbackTranscript(
      turns.map((turn) => ({
        eventId: turn.eventId ?? null,
        contractVersion: turn.contractVersion,
        speaker: turn.speaker,
        text: turn.text,
        deliveryState: turn.deliveryState,
      })),
      { requireContractV2: true }
    );
    if (variant !== "none") {
      assert.equal(prepared.duplicateTurnsRemoved, 4);
      assert.equal(
        prepared.issues.filter(
          (issue) => issue.replayKind === "authenticated_exact"
        ).length,
        4
      );
    }
    const store = new MemoryGenerationStore(
      record({
        completionTier: validation.tier,
        completionStats: validation.stats,
      })
    );
    let observedMode: "scored" | "evidence_limited" | undefined;
    let providerInput: Array<{ eventId: string; text: string }> | undefined;
    const deps = dependencies(store, {
      transcript: prepared,
      async evaluate(input) {
        observedMode = input.mode;
        providerInput = input.transcript.map(({ eventId, text }) => ({
          eventId,
          text,
        }));
        assert.deepEqual(
          providerInput,
          prepared.transcript.map(({ eventId, text }) => ({ eventId, text }))
        );
        throw new Error("synthetic_stop_after_replay_observation");
      },
    });

    await assert.rejects(
      generateFeedbackWorkflow(input(EVENT_1), deps),
      /synthetic_stop_after_replay_observation/
    );
    assert.ok(observedMode);
    assert.ok(providerInput);
    observations.push({
      variant,
      stats: validation.stats,
      tier: validation.tier,
      mode: observedMode,
      providerInput,
    });
  }

  for (const observation of observations.slice(1)) {
    assert.deepEqual(
      {
        stats: observation.stats,
        tier: observation.tier,
        mode: observation.mode,
      },
      {
        stats: observations[0]!.stats,
        tier: observations[0]!.tier,
        mode: observations[0]!.mode,
      }
    );
  }
  assert.deepEqual(
    observations[2]!.providerInput,
    observations[1]!.providerInput
  );
  assert.equal(observations[0]!.stats.userTurns, 1);
  assert.equal(observations[0]!.stats.scoreableResponses, 1);
  assert.equal(observations[0]!.tier, "partial");
  assert.equal(observations[0]!.mode, "evidence_limited");
});

test("authenticated exact replay cannot bridge long-silence blocks or change evaluator input", async () => {
  const observations: Array<{
    variant: "none" | "literal" | "normalized";
    stats: SessionStats;
    tier: string;
    mode: "scored" | "evidence_limited";
    providerInput: Array<{ eventId: string; text: string }>;
  }> = [];

  for (const variant of ["none", "literal", "normalized"] as const) {
    const turns = createLongSilenceReplayWorkflowTurns(variant);
    const validation = calculateValidatedSessionFromTurns(turns, {
      sessionEndAt: turns.at(-1)!.endedAt!,
    });
    const prepared = prepareFeedbackTranscript(
      turns.map((turn) => ({
        eventId: turn.eventId ?? null,
        contractVersion: turn.contractVersion,
        speaker: turn.speaker,
        text: turn.text,
        deliveryState: turn.deliveryState,
      })),
      { requireContractV2: true }
    );
    const expectedCitations = prepared.transcript.map(({ eventId, text }) => ({
      eventId,
      text,
    }));
    if (variant !== "none") {
      assert.equal(prepared.duplicateTurnsRemoved, 1);
      assert.equal(
        prepared.issues.filter(
          (issue) => issue.replayKind === "authenticated_exact"
        ).length,
        1
      );
    }

    const store = new MemoryGenerationStore(
      record({
        completionTier: validation.tier,
        completionStats: validation.stats,
      })
    );
    let observedMode: "scored" | "evidence_limited" | undefined;
    let providerInput: Array<{ eventId: string; text: string }> | undefined;
    const deps = dependencies(store, {
      transcript: prepared,
      async evaluate(input) {
        observedMode = input.mode;
        providerInput = input.transcript.map(({ eventId, text }) => ({
          eventId,
          text,
        }));
        assert.deepEqual(providerInput, expectedCitations);
        throw new Error("synthetic_stop_after_silence_replay_observation");
      },
    });

    await assert.rejects(
      generateFeedbackWorkflow(input(EVENT_1), deps),
      /synthetic_stop_after_silence_replay_observation/
    );
    assert.ok(observedMode);
    assert.ok(providerInput);
    observations.push({
      variant,
      stats: validation.stats,
      tier: validation.tier,
      mode: observedMode,
      providerInput,
    });
  }

  for (const observation of observations.slice(1)) {
    assert.deepEqual(
      {
        stats: observation.stats,
        tier: observation.tier,
        mode: observation.mode,
        providerText: observation.providerInput.map(({ text }) => text),
      },
      {
        stats: observations[0]!.stats,
        tier: observations[0]!.tier,
        mode: observations[0]!.mode,
        providerText: observations[0]!.providerInput.map(({ text }) => text),
      }
    );
  }
  assert.deepEqual(
    observations[2]!.providerInput,
    observations[1]!.providerInput
  );
  assert.deepEqual(observations[0]!.stats, {
    totalTurns: 3,
    userTurns: 2,
    totalWords: 42,
    durationSeconds: 11,
    substantiveResponses: 1,
    scoreableResponses: 1,
  });
  assert.equal(observations[0]!.tier, "partial");
  assert.equal(observations[0]!.mode, "evidence_limited");
});

test("conflicting exact replay identity or timing and a true missing sequence fail closed before provider work", async () => {
  const conflictingReplay = createReplayContinuityWorkflowTurns("literal");
  const replayIndex = conflictingReplay.findIndex(
    (turn, index) =>
      index > 0 && turn.text === conflictingReplay[index - 1]!.text
  );
  assert.ok(replayIndex > 0);
  conflictingReplay[replayIndex] = {
    ...conflictingReplay[replayIndex]!,
    eventId: "replacement-writer:1",
    writerId: "replacement-writer",
    writerGeneration: 2,
    sequence: 1,
  };

  const conflictingTiming = createReplayContinuityWorkflowTurns("literal");
  const timingReplayIndex = conflictingTiming.findIndex(
    (turn, index) =>
      index > 0 && turn.text === conflictingTiming[index - 1]!.text
  );
  assert.ok(timingReplayIndex > 0);
  const timingPredecessor = conflictingTiming[timingReplayIndex - 1]!;
  conflictingTiming[timingReplayIndex] = {
    ...conflictingTiming[timingReplayIndex]!,
    startedAt: new Date(timingPredecessor.endedAt!.getTime() - 100),
    endedAt: new Date(timingPredecessor.endedAt!.getTime() + 400),
    audioMs: 500,
  };

  const conflictingSuccessorTiming =
    createReplayContinuityWorkflowTurns("literal");
  const successorReplayIndex = conflictingSuccessorTiming.findIndex(
    (turn, index) =>
      index > 0 && turn.text === conflictingSuccessorTiming[index - 1]!.text
  );
  assert.ok(successorReplayIndex > 0);
  const successorReplay = conflictingSuccessorTiming[successorReplayIndex]!;
  const replaySuccessor = conflictingSuccessorTiming[successorReplayIndex + 1]!;
  const replaySuccessorStartedAt = new Date(
    successorReplay.endedAt!.getTime() - 100
  );
  conflictingSuccessorTiming[successorReplayIndex + 1] = {
    ...replaySuccessor,
    startedAt: replaySuccessorStartedAt,
    endedAt: new Date(replaySuccessorStartedAt.getTime() + 900),
    audioMs: 900,
  };

  const missingSequence = createReplayContinuityWorkflowTurns("none").map(
    (turn, index) =>
      index < 3
        ? turn
        : {
            ...turn,
            eventId: `writer:${(turn.sequence ?? 0) + 1}`,
            sequence: (turn.sequence ?? 0) + 1,
          }
  );

  for (const turns of [
    conflictingReplay,
    conflictingTiming,
    conflictingSuccessorTiming,
    missingSequence,
  ]) {
    const validation = calculateValidatedSessionFromTurns(turns, {
      sessionEndAt: turns.at(-1)!.endedAt!,
    });
    assert.equal(validation.isValid, false);
    assert.equal(
      validation.evidenceFailureReason,
      "transcript_integrity_degraded"
    );
    const prepared = prepareFeedbackTranscript(
      turns.map((turn) => ({
        eventId: turn.eventId ?? null,
        contractVersion: turn.contractVersion,
        speaker: turn.speaker,
        text: turn.text,
        deliveryState: turn.deliveryState,
      })),
      { requireContractV2: true }
    );
    let evaluations = 0;
    const store = new MemoryGenerationStore(
      record({
        completionTier: "insufficient",
        completionStats: validation.stats,
        outcomeReason: "transcript_integrity_degraded",
      })
    );
    const result = await generateFeedbackWorkflow(
      input(EVENT_1),
      dependencies(store, {
        transcript: prepared,
        async evaluate() {
          evaluations += 1;
          return evaluation("full");
        },
      })
    );

    assert.equal(result.status, "skipped");
    assert.equal(evaluations, 0);
    assert.equal(store.current.statusReason, "transcript_integrity_degraded");
  }
});

test("excluded replay families with identical accepted citations fail closed without manufacturing breadth or provider mode", async () => {
  const exactTurns = createReplayFamilyWorkflowTurns("authenticated_exact");
  const familyTurns = createReplayFamilyWorkflowTurns("semantic_family");
  const prepare = (turns: SessionValidationTurnInput[]) =>
    prepareFeedbackTranscript(
      turns.map((turn) => ({
        eventId: turn.eventId ?? null,
        contractVersion: turn.contractVersion,
        speaker: turn.speaker,
        text: turn.text,
        deliveryState: turn.deliveryState,
      })),
      { requireContractV2: true }
    );
  const exactPrepared = prepare(exactTurns);
  const familyPrepared = prepare(familyTurns);
  assert.deepEqual(
    familyPrepared.transcript.map(({ eventId, text }) => ({ eventId, text })),
    exactPrepared.transcript.map(({ eventId, text }) => ({ eventId, text }))
  );
  assert.equal(
    familyPrepared.issues.filter(
      (issue) => issue.replayKind === "semantic_family"
    ).length,
    6
  );

  const exactValidation = calculateValidatedSessionFromTurns(exactTurns, {
    sessionEndAt: exactTurns.at(-1)!.endedAt!,
  });
  const familyValidation = calculateValidatedSessionFromTurns(familyTurns, {
    sessionEndAt: familyTurns.at(-1)!.endedAt!,
  });
  assert.equal(exactValidation.isValid, true);
  assert.equal(exactValidation.tier, "partial");
  assert.equal(exactValidation.stats.userTurns, 1);
  assert.equal(exactValidation.stats.substantiveResponses, 1);
  assert.equal(exactValidation.stats.scoreableResponses, 0);
  assert.equal(familyValidation.isValid, false);
  assert.equal(familyValidation.tier, "insufficient");
  assert.deepEqual(familyValidation.stats, {
    totalTurns: 0,
    userTurns: 0,
    totalWords: 0,
    durationSeconds: 0,
    substantiveResponses: 0,
    scoreableResponses: 0,
  });
  assert.equal(
    familyValidation.evidenceFailureReason,
    "transcript_integrity_degraded"
  );

  let familyEvaluations = 0;
  const familyStore = new MemoryGenerationStore(
    record({
      completionTier: "insufficient",
      completionStats: familyValidation.stats,
      outcomeReason: "transcript_integrity_degraded",
    })
  );
  const result = await generateFeedbackWorkflow(
    input(EVENT_1),
    dependencies(familyStore, {
      transcript: familyPrepared,
      async evaluate() {
        familyEvaluations += 1;
        return evaluation("full");
      },
    })
  );
  assert.equal(result.status, "skipped");
  assert.equal(familyEvaluations, 0);
  assert.equal(
    familyStore.current.statusReason,
    "transcript_integrity_degraded"
  );
});

test("duplicate evidence-limited selection identities fail before persistence as provider-neutral generation failure", async () => {
  const turns = [
    {
      eventId: "turn-1",
      speaker: "user" as const,
      text: "I would focus on new parents and measure retained use.",
    },
    {
      eventId: "turn-2",
      speaker: "user" as const,
      text: "I would interview working parents and connect the need to prioritization.",
    },
  ];
  const store = new MemoryGenerationStore(
    record({
      completionTier: "partial",
      completionStats: {
        totalTurns: 2,
        userTurns: 2,
        totalWords: 22,
        durationSeconds: 24,
        substantiveResponses: 1,
        scoreableResponses: 1,
      },
    })
  );
  const duplicateFinding = {
    signalCode: "customer_problem_connection" as const,
    actionCode: "connect_customer_to_decision" as const,
    dimension: "insight" as const,
    observation:
      EVIDENCE_LIMITED_STRENGTH_SIGNALS.customer_problem_connection.observation,
    transcriptRefs: [turns[0]!.eventId],
    evidence: [{ turnRef: turns[0]!.eventId, quote: turns[0]!.text }],
    nextStep: EVIDENCE_LIMITED_ACTIONS.connect_customer_to_decision.nextStep,
    rubricVersion: "pm-feedback-rubric.v2" as const,
    confidence: EVIDENCE_LIMITED_CONFIDENCE,
  };
  const invalidEvaluation = {
    schemaVersion: FEEDBACK_EVIDENCE_LIMITED_SCHEMA_VERSION,
    promptVersion: FEEDBACK_EVIDENCE_LIMITED_PROMPT_VERSION,
    modelVersion: "fixture-model-v2",
    rubricVersion: "pm-feedback-rubric.v2" as const,
    evaluationState: "partial" as const,
    strengths: [
      duplicateFinding,
      {
        ...duplicateFinding,
        transcriptRefs: [turns[1]!.eventId],
        evidence: [{ turnRef: turns[1]!.eventId, quote: turns[1]!.text }],
      },
    ],
    improvements: [
      {
        signalCode: "structure_progression" as const,
        actionCode: "outline_reasoning" as const,
        dimension: "structure" as const,
        observation:
          EVIDENCE_LIMITED_IMPROVEMENT_SIGNALS.structure_progression
            .observation,
        transcriptRefs: [turns[0]!.eventId],
        evidence: [{ turnRef: turns[0]!.eventId, quote: turns[0]!.text }],
        nextStep: EVIDENCE_LIMITED_ACTIONS.outline_reasoning.nextStep,
        rubricVersion: "pm-feedback-rubric.v2" as const,
        confidence: EVIDENCE_LIMITED_CONFIDENCE,
      },
    ],
    summary: EVIDENCE_LIMITED_SUMMARY,
  };
  const deps = dependencies(store, {
    transcript: {
      eligible: true,
      transcript: turns,
      reasons: [],
      issues: [],
      duplicateTurnsRemoved: 0,
    },
    async evaluate() {
      return invalidEvaluation;
    },
  });

  let rejection: unknown;
  try {
    await generateFeedbackWorkflow(input(EVENT_1), deps);
  } catch (error) {
    rejection = error;
  }
  assert.ok(rejection instanceof FeedbackV2ParseError);
  assert.match(rejection.message, /selections must be unique/);
  assert.equal(store.current.status, "processing");
  assert.equal(store.completedScore, null);

  const failureReason = getEvaluationFailureReason(rejection);
  assert.equal(
    failureReason,
    "Feedback evaluation failed. Check worker logs and retry."
  );
  assert.equal(
    await failFeedbackGenerationWorkflow(
      { ...input(EVENT_1), reason: failureReason },
      {
        store,
        isDeletionPending: async () => false,
        getSession: async () => ({ userId: USER_ID, roundType: "strategy" }),
      }
    ),
    true
  );
  assert.equal(store.current.status, "failed");
  assert.notEqual(store.current.status, "skipped");
});

test("durable replay closes the completion-to-insights crash window exactly once", async () => {
  const store = new MemoryGenerationStore(record());
  const cachedSteps = new Map<string, unknown>();
  const acceptedInsights = new Set<string>();
  let sendAttempts = 0;
  const deps = dependencies(store);
  deps.steps = {
    async run<T>(name: string, work: () => Promise<T>): Promise<T> {
      if (cachedSteps.has(name)) return cachedSteps.get(name) as T;
      const result = await work();
      cachedSteps.set(name, result);
      return result;
    },
    async sendInsights(event) {
      sendAttempts += 1;
      acceptedInsights.add(event.id);
      if (sendAttempts === 1) throw new Error("crash_after_event_acceptance");
    },
  };

  await assert.rejects(
    generateFeedbackWorkflow(input(EVENT_1), deps),
    /crash_after_event_acceptance/
  );
  const replay = await generateFeedbackWorkflow(input(EVENT_1), deps);

  assert.equal(replay.status, "completed");
  assert.equal(replay.disposition, "applied");
  assert.equal(sendAttempts, 2);
  assert.deepEqual(
    [...acceptedInsights],
    [`insights:update:${SESSION_ID}:${EVENT_1}`]
  );
});

test("legacy rows without a durable event identity fail closed", async () => {
  const store = new MemoryGenerationStore(record({ eventId: null }));
  let evaluations = 0;
  const deps = dependencies(store, {
    async evaluate() {
      evaluations += 1;
      return evaluation("full");
    },
  });

  await assert.rejects(
    generateFeedbackWorkflow(input(EVENT_1), deps),
    /event_mismatch/
  );
  assert.equal(store.current.status, "pending");
  assert.equal(evaluations, 0);
});

test("account deletion fences evaluation and insight work", async () => {
  const store = new MemoryGenerationStore(record());
  let evaluations = 0;
  const insights: string[] = [];
  const deps = dependencies(store, {
    insights,
    async evaluate() {
      evaluations += 1;
      return evaluation("full");
    },
  });
  deps.isDeletionPending = async () => true;

  await assert.rejects(
    generateFeedbackWorkflow(input(EVENT_1), deps),
    /account_deletion_pending/
  );
  assert.equal(evaluations, 0);
  assert.equal(insights.length, 0);
  assert.equal(store.current.status, "pending");
});

function createReplayContinuityWorkflowTurns(
  replayVariant: "none" | "literal" | "normalized"
): SessionValidationTurnInput[] {
  const baseMs = Date.parse("2026-07-10T12:00:00.000Z");
  const fragments = [
    "I would start with working parents whose recurring household coordination creates frequent planning failures each week.",
    "I would validate severity through interviews and task diaries before choosing the first narrow workflow to support.",
    "I would prioritize the segment using frequency urgency willingness to change and access for rapid product discovery.",
    "I would test a lightweight shared planning prototype and watch whether families complete the recurring coordination job.",
    "I would measure weekly retained households alongside successful task handoffs and qualitative evidence that coordination improved.",
  ];
  const turns: SessionValidationTurnInput[] = [
    {
      contractVersion: 2,
      eventId: "writer:1",
      writerId: "writer",
      writerGeneration: 1,
      sequence: 1,
      speaker: "interviewer",
      text: "How would you identify and validate the first customer problem?",
      startedAt: new Date(baseMs),
      endedAt: new Date(baseMs + 1_000),
      audioMs: 1_000,
      section: "product_sense",
      deliveryState: "delivered",
    },
  ];
  let sequence = 2;
  for (const [index, text] of fragments.entries()) {
    const startedAtMs = baseMs + 2_000 + index * 2_000;
    turns.push({
      contractVersion: 2,
      eventId: `writer:${sequence}`,
      writerId: "writer",
      writerGeneration: 1,
      sequence,
      speaker: "user",
      text,
      startedAt: new Date(startedAtMs),
      endedAt: new Date(startedAtMs + 900),
      audioMs: 900,
      section: "product_sense",
      deliveryState: "delivered",
    });
    sequence += 1;
    if (replayVariant !== "none" && index < fragments.length - 1) {
      turns.push({
        contractVersion: 2,
        eventId: `writer:${sequence}`,
        writerId: "writer",
        writerGeneration: 1,
        sequence,
        speaker: "user",
        text: replayVariant === "normalized" ? text.toUpperCase() : text,
        startedAt: new Date(startedAtMs + 1_000),
        endedAt: new Date(startedAtMs + 1_500),
        audioMs: 500,
        section: "product_sense",
        deliveryState: "delivered",
      });
      sequence += 1;
    }
  }
  return turns;
}

function createLongSilenceReplayWorkflowTurns(
  replayVariant: "none" | "literal" | "normalized"
): SessionValidationTurnInput[] {
  const baseMs = Date.parse("2026-07-10T12:30:00.000Z");
  const firstAnswer =
    "I would prioritize working parents because weekly coordination pain is frequent severe and poorly served.";
  const secondAnswer =
    "I would validate that segment through interviews task diaries and recurring handoff completion before building.";
  const hasReplay = replayVariant !== "none";
  const turns: SessionValidationTurnInput[] = [
    {
      contractVersion: 2,
      eventId: "silence-writer:1",
      writerId: "silence-writer",
      writerGeneration: 1,
      sequence: 1,
      speaker: "interviewer",
      text: "Which customer problem would you prioritize and how would you validate it?",
      startedAt: new Date(baseMs),
      endedAt: new Date(baseMs + 1_000),
      audioMs: 1_000,
      section: "product_sense",
      deliveryState: "delivered",
    },
    {
      contractVersion: 2,
      eventId: "silence-writer:2",
      writerId: "silence-writer",
      writerGeneration: 1,
      sequence: 2,
      speaker: "user",
      text: firstAnswer,
      startedAt: new Date(baseMs + 2_000),
      endedAt: new Date(baseMs + 3_000),
      audioMs: 1_000,
      section: "product_sense",
      deliveryState: "delivered",
    },
  ];
  if (hasReplay) {
    turns.push({
      contractVersion: 2,
      eventId: "silence-writer:3",
      writerId: "silence-writer",
      writerGeneration: 1,
      sequence: 3,
      speaker: "user",
      text:
        replayVariant === "normalized"
          ? firstAnswer.toUpperCase()
          : firstAnswer,
      startedAt: new Date(baseMs + 8_500),
      endedAt: new Date(baseMs + 9_000),
      audioMs: 500,
      section: "product_sense",
      deliveryState: "delivered",
    });
  }
  turns.push({
    contractVersion: 2,
    eventId: `silence-writer:${hasReplay ? 4 : 3}`,
    writerId: "silence-writer",
    writerGeneration: 1,
    sequence: hasReplay ? 4 : 3,
    speaker: "user",
    text: secondAnswer,
    startedAt: new Date(baseMs + 10_001),
    endedAt: new Date(baseMs + 11_001),
    audioMs: 1_000,
    section: "product_sense",
    deliveryState: "delivered",
  });
  return turns;
}

function createReplayFamilyWorkflowTurns(
  excludedKind: "authenticated_exact" | "semantic_family"
): SessionValidationTurnInput[] {
  const baseMs = Date.parse("2026-07-10T13:00:00.000Z");
  const sections = [
    "I would choose working parents whose weekly household coordination repeatedly breaks down and creates urgent planning pain",
    "I would validate severity through individual interviews plus task diaries that reveal failed handoffs and current workarounds",
    "I would prioritize opportunities by comparing frequency urgency segment reach switching friction and discovery access",
    "I would prototype a lightweight shared planner and observe whether families complete recurring responsibilities without reminders",
    "I would measure retained households successful weekly handoffs time saved and qualitative confidence in coordination",
    "I would launch with one accessible cohort then review activation retention support themes and unmet jobs before expanding",
  ];
  const turns: SessionValidationTurnInput[] = [
    {
      contractVersion: 2,
      eventId: "family-writer:1",
      writerId: "family-writer",
      writerGeneration: 1,
      sequence: 1,
      speaker: "interviewer",
      text: "Walk me through the complete discovery and launch plan.",
      startedAt: new Date(baseMs),
      endedAt: new Date(baseMs + 400),
      audioMs: 400,
      section: "product_sense",
      deliveryState: "delivered",
    },
  ];
  let sequence = 2;
  for (const [sectionIndex, base] of sections.entries()) {
    const acceptedTexts = [
      `${base} banana cucumber zeppelin giraffe`,
      `${base} marmalade telescope violin waterfall`,
    ];
    const excludedText =
      excludedKind === "authenticated_exact"
        ? acceptedTexts[1]!
        : `${base} quartz umbrella notebook lantern`;
    for (const [variantIndex, text] of [
      ...acceptedTexts,
      excludedText,
    ].entries()) {
      const startedAtMs =
        baseMs + 1_000 + (sectionIndex * 3 + variantIndex) * 600;
      turns.push({
        contractVersion: 2,
        eventId: `family-writer:${sequence}`,
        writerId: "family-writer",
        writerGeneration: 1,
        sequence,
        speaker: "user",
        text,
        startedAt: new Date(startedAtMs),
        endedAt: new Date(startedAtMs + 500),
        audioMs: 500,
        section: "product_sense",
        deliveryState: "delivered",
      });
      sequence += 1;
    }
  }
  return turns;
}

function dependencies(
  store: MemoryGenerationStore,
  overrides: {
    insights?: string[];
    transcript?: PreparedFeedbackTranscript;
    evaluate?: GenerateFeedbackWorkflowDeps["evaluate"];
  } = {}
): GenerateFeedbackWorkflowDeps {
  return {
    store,
    now: () => NOW,
    isDeletionPending: async () => false,
    steps: {
      run: (_name, work) => work(),
      async sendInsights(event) {
        overrides.insights?.push(event.id);
      },
    },
    getSession: async () => ({ userId: USER_ID, roundType: "strategy" }),
    validateLegacy: async () =>
      ({ isValid: true, tier: "full", reasons: [] }) as never,
    getTranscript: async () =>
      overrides.transcript ?? {
        eligible: true,
        transcript: [
          {
            eventId: "turn-1",
            speaker: "user",
            text: "I would focus on new parents and measure retained use.",
          },
        ],
        reasons: [],
        issues: [],
        duplicateTurnsRemoved: 0,
      },
    evaluate:
      overrides.evaluate ??
      (async ({ evaluationState }) => evaluation(evaluationState)),
  };
}

function input(eventId: string) {
  return { sessionId: SESSION_ID, userId: USER_ID, eventId };
}

function record(
  overrides: Partial<FeedbackGenerationRecord> = {}
): FeedbackGenerationRecord {
  return {
    sessionId: SESSION_ID,
    status: "pending",
    statusReason: null,
    outcomeReason: null,
    eventId: EVENT_1,
    processingStartedAt: null,
    completionTier: "full",
    completionStats: {
      totalTurns: 10,
      userTurns: 5,
      totalWords: 100,
      durationSeconds: 60,
      substantiveResponses: 5,
      scoreableResponses: 5,
    },
    dispatchStatus: "sent",
    dispatchClaimedAt: NOW,
    dispatchedAt: NOW,
    ...overrides,
  };
}

function evaluation(
  evaluationState: FeedbackEvaluationState,
  overallScore = 8
): FeedbackV2Result {
  return {
    schemaVersion: "feedback.v2",
    promptVersion: "feedback.prompt.v2",
    modelVersion: "fixture-model",
    rubricVersion: "pm-feedback-rubric.v2",
    evaluationState,
    scores: {
      structure: overallScore,
      clarity: overallScore,
      insight: overallScore,
      communication: overallScore,
      leadership: overallScore,
    },
    overallScore,
    strengths: [],
    improvements: [],
    drills: [],
    summary: "Fixture evaluation",
  };
}

class MemoryGenerationStore implements FeedbackGenerationStore {
  completedScore: number | null = null;

  constructor(public current: FeedbackGenerationRecord) {}

  replace(next: FeedbackGenerationRecord) {
    this.current = { ...next };
  }

  async get(sessionId: string) {
    return this.current.sessionId === sessionId ? { ...this.current } : null;
  }

  async claim(input: { sessionId: string; eventId: string; now: Date }) {
    if (
      this.current.sessionId !== input.sessionId ||
      this.current.eventId !== input.eventId ||
      (this.current.status !== "pending" && this.current.status !== "failed")
    ) {
      return null;
    }
    this.current = {
      ...this.current,
      status: "processing",
      statusReason: null,
      processingStartedAt: input.now,
    };
    return { ...this.current };
  }

  async complete(input: {
    sessionId: string;
    eventId: string;
    evaluation: FeedbackEvaluationResult;
  }) {
    if (!this.isActive(input.sessionId, input.eventId)) return false;
    this.current = { ...this.current, status: "completed" };
    this.completedScore =
      "overallScore" in input.evaluation ? input.evaluation.overallScore : null;
    return true;
  }

  async skip(input: {
    sessionId: string;
    eventId: string;
    reason: "no_reviewable_answer" | "transcript_integrity_degraded";
  }) {
    if (!this.isActive(input.sessionId, input.eventId)) return false;
    this.current = {
      ...this.current,
      status: "skipped",
      statusReason: input.reason,
    };
    return true;
  }

  async fail(input: { sessionId: string; eventId: string; reason: string }) {
    if (!this.isActive(input.sessionId, input.eventId)) return false;
    this.current = {
      ...this.current,
      status: "failed",
      statusReason: input.reason,
    };
    return true;
  }

  async prepareRetry() {
    return { prepared: false, record: { ...this.current } };
  }

  private isActive(sessionId: string, eventId: string) {
    return (
      this.current.sessionId === sessionId &&
      this.current.eventId === eventId &&
      this.current.status === "processing"
    );
  }
}

async function waitUntil(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("Timed out waiting for workflow state");
}

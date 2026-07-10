import assert from "node:assert/strict";
import test from "node:test";

import type {
  FeedbackEvaluationState,
  FeedbackV2Result,
  PreparedFeedbackTranscript,
} from "@meelni/core";

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
  const result = await generateFeedbackWorkflow(
    input(EVENT_1),
    dependencies(store, {
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
    })
  );

  assert.equal(result.status, "skipped");
  assert.equal(store.current.status, "skipped");
  assert.equal(evaluations, 0);
  assert.equal(insights.length, 0);
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
  assert.deepEqual([...acceptedInsights], [
    `insights:update:${SESSION_ID}:${EVENT_1}`,
  ]);
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
    eventId: EVENT_1,
    processingStartedAt: null,
    completionTier: "full",
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
    evaluation: FeedbackV2Result;
  }) {
    if (!this.isActive(input.sessionId, input.eventId)) return false;
    this.current = { ...this.current, status: "completed" };
    this.completedScore = input.evaluation.overallScore;
    return true;
  }

  async skip(input: { sessionId: string; eventId: string; reason: string }) {
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

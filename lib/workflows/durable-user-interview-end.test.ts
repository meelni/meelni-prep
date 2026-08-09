import assert from "node:assert/strict";
import test from "node:test";

import { SessionTier } from "@/lib/evaluation/session-validator";
import type { InterviewSessionSettlement } from "./end-interview-session";
import {
  DURABLE_USER_END_STEP_IDS,
  classifyRuntimeSettlement,
  durableUserInterviewEndWorkflow,
  type DurableUserInterviewEndDeps,
  type DurableUserInterviewEndStepRunner,
} from "./durable-user-interview-end";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "650e8400-e29b-41d4-a716-446655440000";
const ENV = {
  apiKey: "key",
  apiSecret: "secret",
  url: "wss://test.livekit.cloud",
};

test("durable end checkpoints every stage and prioritizes feedback before operational convergence", async () => {
  const calls: string[] = [];
  const steps = new MemoizingSteps();
  const result = await durableUserInterviewEndWorkflow(
    { sessionId: SESSION_ID, userId: USER_ID, env: ENV },
    steps,
    createDeps({
      requestRuntimeSettlement: async () => {
        calls.push("runtime");
        return settledRuntime();
      },
      finalizeSession: async () => {
        calls.push("finalize");
        return completion();
      },
      recoverFeedback: async () => {
        calls.push("dispatch");
        return queuedFeedback();
      },
      scheduleCleanup: async () => {
        calls.push("cleanup");
      },
      settleCredit: async () => {
        calls.push("credit");
      },
    })
  );

  assert.equal(result.ok, true);
  assert.deepEqual(calls.slice(0, 3), ["runtime", "finalize", "dispatch"]);
  assert.deepEqual(new Set(calls.slice(3)), new Set(["cleanup", "credit"]));
  assert.deepEqual(
    steps.completedIds(),
    Object.values(DURABLE_USER_END_STEP_IDS)
  );
});

test("runtime settlement failure is checkpointed as degraded exit and cannot veto terminalization", async () => {
  let finalized = 0;
  const result = await durableUserInterviewEndWorkflow(
    { sessionId: SESSION_ID, userId: USER_ID, env: ENV },
    new MemoizingSteps(),
    createDeps({
      requestRuntimeSettlement: async () => {
        throw new Error("runtime unavailable");
      },
      finalizeSession: async () => {
        finalized += 1;
        return completion();
      },
    })
  );

  assert.equal(result.runtimeSettlement, "failed");
  assert.equal(finalized, 1);
  assert.equal(result.ok, true);
});

test("a degraded runtime acknowledgement remains distinct from complete evidence", () => {
  assert.equal(
    classifyRuntimeSettlement({
      ok: true,
      settlement: {
        settled: true,
        pending: 0,
        failed: 1,
        overflowed: false,
        integrityUnavailable: true,
      },
    }),
    "degraded"
  );
});

test("a finalization retry resumes after the memoized runtime stage", async () => {
  const steps = new MemoizingSteps();
  let finalizationAttempts = 0;
  const deps = createDeps({
    finalizeSession: async () => {
      finalizationAttempts += 1;
      if (finalizationAttempts === 1) throw new Error("database unavailable");
      return completion();
    },
  });

  await assert.rejects(() => run(steps, deps), /database unavailable/);
  const result = await run(steps, deps);

  assert.equal(result.ok, true);
  assert.equal(steps.attempts(DURABLE_USER_END_STEP_IDS.runtimeSettlement), 1);
  assert.equal(steps.attempts(DURABLE_USER_END_STEP_IDS.finalizeSession), 2);
});

test("a feedback dispatch retry does not replay finalization, cleanup, or credit", async () => {
  const steps = new MemoizingSteps();
  let dispatchAttempts = 0;
  const deps = createDeps({
    recoverFeedback: async () => {
      dispatchAttempts += 1;
      if (dispatchAttempts === 1) {
        return {
          ok: true,
          status: "pending",
          disposition: "dispatch_failed",
          retryable: true,
          dispatch: null,
        };
      }
      return queuedFeedback();
    },
  });

  await assert.rejects(() => run(steps, deps), /feedback_dispatch_failed/);
  await Promise.resolve();
  const result = await run(steps, deps);

  assert.equal(result.ok, true);
  assert.equal(steps.attempts(DURABLE_USER_END_STEP_IDS.finalizeSession), 1);
  assert.equal(steps.attempts(DURABLE_USER_END_STEP_IDS.dispatchFeedback), 2);
  assert.equal(steps.attempts(DURABLE_USER_END_STEP_IDS.scheduleCleanup), 1);
  assert.equal(steps.attempts(DURABLE_USER_END_STEP_IDS.settleCredit), 1);
});

for (const stage of ["cleanup", "credit"] as const) {
  test(`${stage} failure retries only its checkpoint`, async () => {
    const steps = new MemoizingSteps();
    let attempts = 0;
    const deps = createDeps({
      ...(stage === "cleanup"
        ? {
            scheduleCleanup: async () => {
              attempts += 1;
              if (attempts === 1) throw new Error("cleanup unavailable");
            },
          }
        : {
            settleCredit: async () => {
              attempts += 1;
              if (attempts === 1) throw new Error("ledger unavailable");
            },
          }),
    });

    await assert.rejects(() => run(steps, deps), /unavailable/);
    await Promise.resolve();
    const result = await run(steps, deps);

    assert.equal(result.ok, true);
    assert.equal(steps.attempts(DURABLE_USER_END_STEP_IDS.dispatchFeedback), 1);
    assert.equal(
      steps.attempts(
        stage === "cleanup"
          ? DURABLE_USER_END_STEP_IDS.scheduleCleanup
          : DURABLE_USER_END_STEP_IDS.settleCredit
      ),
      2
    );
  });
}

test("feedback-only recovery skips provider settlement and replays stored terminal truth", async () => {
  let runtimeCalls = 0;
  const result = await durableUserInterviewEndWorkflow(
    {
      sessionId: SESSION_ID,
      userId: USER_ID,
      env: ENV,
      resumeFrom: "feedback_dispatch",
    },
    new MemoizingSteps(),
    createDeps({
      requestRuntimeSettlement: async () => {
        runtimeCalls += 1;
        return settledRuntime();
      },
      finalizeSession: async () => ({
        ...completion(),
        disposition: "existing",
      }),
    })
  );

  assert.equal(runtimeCalls, 0);
  assert.equal(result.runtimeSettlement, "not_required");
  assert.equal(
    result.finalization.ok && result.finalization.disposition,
    "existing"
  );
});

test("missing transcript evidence is persisted as a safe checkpoint classification", async () => {
  const missing = completion();
  missing.feedback.status = "skipped";
  missing.feedback.dispatchStatus = "not_required";
  missing.feedback.statusReason =
    "Voice runtime transcript settlement was not confirmed for 1 writer generation(s)";
  missing.transcriptEvidence = "missing";
  const result = await durableUserInterviewEndWorkflow(
    { sessionId: SESSION_ID, userId: USER_ID, env: null },
    new MemoizingSteps(),
    createDeps({ finalizeSession: async () => missing })
  );

  assert.equal(
    result.finalization.ok && result.finalization.transcriptEvidence,
    "missing"
  );
  assert.equal(result.feedbackDispatch?.status, "not_required");
});

function run(
  steps: DurableUserInterviewEndStepRunner,
  deps: DurableUserInterviewEndDeps
) {
  return durableUserInterviewEndWorkflow(
    { sessionId: SESSION_ID, userId: USER_ID, env: ENV },
    steps,
    deps
  );
}

function createDeps(
  overrides: Partial<DurableUserInterviewEndDeps> = {}
): DurableUserInterviewEndDeps {
  let now = 0;
  return {
    now: () => ++now,
    requestRuntimeSettlement: async () => settledRuntime(),
    finalizeSession: async () => completion(),
    recoverFeedback: async () => queuedFeedback(),
    scheduleCleanup: async () => undefined,
    settleCredit: async () => undefined,
    ...overrides,
  };
}

function settledRuntime() {
  return {
    ok: true,
    settlement: {
      settled: true,
      pending: 0,
      failed: 0,
      overflowed: false as const,
      integrityUnavailable: false,
    },
  } as const;
}

function queuedFeedback() {
  return {
    ok: true,
    status: "pending",
    disposition: "queued",
    retryable: false,
    dispatch: null,
  } as const;
}

function completion(): InterviewSessionSettlement {
  return {
    ok: true,
    disposition: "applied",
    userId: USER_ID,
    roomName: "interview-room",
    lifecycle: {
      state: "completed",
      version: 4,
      terminalReason: "user_end",
      endedAt: new Date("2026-07-28T03:00:00.000Z"),
    },
    transcriptEvidence: "available",
    feedback: {
      sessionId: SESSION_ID,
      status: "pending",
      statusReason: null,
      dispatchStatus: "pending",
    },
    deadlineRoomCleanupStatus: null,
    stats: {
      totalTurns: 12,
      userTurns: 6,
      totalWords: 480,
      durationSeconds: 420,
      substantiveResponses: 5,
    },
    tier: SessionTier.FULL,
    recommendations: [],
  } as unknown as InterviewSessionSettlement;
}

class MemoizingSteps implements DurableUserInterviewEndStepRunner {
  private readonly completed = new Map<string, unknown>();
  private readonly attemptCounts = new Map<string, number>();

  async run<T>(id: string, work: () => Promise<T>): Promise<T> {
    if (this.completed.has(id)) return this.completed.get(id) as T;
    this.attemptCounts.set(id, (this.attemptCounts.get(id) ?? 0) + 1);
    const result = await work();
    this.completed.set(id, result);
    return result;
  }

  attempts(id: string): number {
    return this.attemptCounts.get(id) ?? 0;
  }

  completedIds(): string[] {
    return [...this.completed.keys()];
  }
}

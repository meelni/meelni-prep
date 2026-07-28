import assert from "node:assert/strict";
import test from "node:test";

import type { EndInterviewSessionResult } from "./end-interview-session";
import { SessionTier } from "@/lib/evaluation/session-validator";
import {
  classifyRuntimeSettlement,
  endUserInterviewSessionWorkflow,
  EXPLICIT_END_RUNTIME_SETTLEMENT_TIMEOUT_MS,
  type EndUserInterviewSessionDeps,
} from "./end-user-interview-session";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "650e8400-e29b-41d4-a716-446655440000";
const ENV = {
  apiKey: "key",
  apiSecret: "secret",
  url: "wss://test.livekit.cloud",
};

test("explicit end requests bounded settlement before durable completion", async () => {
  const calls: string[] = [];
  const result = await endUserInterviewSessionWorkflow(
    { sessionId: SESSION_ID, userId: USER_ID, env: ENV },
    createDeps({
      requestRuntimeSettlement: async (input) => {
        calls.push("settlement");
        assert.equal(
          input.timeoutMs,
          EXPLICIT_END_RUNTIME_SETTLEMENT_TIMEOUT_MS
        );
        return settledRuntime();
      },
      endSession: async (input) => {
        calls.push("completion");
        assert.deepEqual(input, {
          sessionId: SESSION_ID,
          actor: { type: "user", userId: USER_ID },
          requestedTerminalReason: "user_end",
        });
        return completedInterview();
      },
    })
  );

  assert.deepEqual(calls, ["settlement", "completion"]);
  assert.equal(result.ok, true);
  assert.equal(result.runtimeSettlement, "settled");
});

test("missing agent during an early exit cannot veto durable completion", async () => {
  let completions = 0;
  const result = await endUserInterviewSessionWorkflow(
    { sessionId: SESSION_ID, userId: USER_ID, env: ENV },
    createDeps({
      requestRuntimeSettlement: async () => ({
        ok: false,
        reason: "runtime_not_ready",
        retryable: true,
      }),
      endSession: async () => {
        completions += 1;
        return skippedInterview();
      },
    })
  );

  assert.equal(completions, 1);
  assert.equal(result.ok, true);
  assert.equal(result.runtimeSettlement, "runtime_not_ready");
  if (result.ok) assert.equal(result.completion.feedback.status, "skipped");
});

test("provider unavailability still terminalizes the interview", async () => {
  let settlementCalls = 0;
  const result = await endUserInterviewSessionWorkflow(
    { sessionId: SESSION_ID, userId: USER_ID, env: null },
    createDeps({
      requestRuntimeSettlement: async () => {
        settlementCalls += 1;
        return settledRuntime();
      },
      endSession: async () => skippedInterview(),
    })
  );

  assert.equal(settlementCalls, 0);
  assert.equal(result.ok, true);
  assert.equal(result.runtimeSettlement, "provider_unavailable");
});

test("settlement exceptions during in-flight speech or model work are fail-open for exit", async () => {
  let completions = 0;
  const result = await endUserInterviewSessionWorkflow(
    { sessionId: SESSION_ID, userId: USER_ID, env: ENV },
    createDeps({
      requestRuntimeSettlement: async () => {
        throw new Error("runtime closed while settling");
      },
      endSession: async () => {
        completions += 1;
        return skippedInterview();
      },
    })
  );

  assert.equal(completions, 1);
  assert.equal(result.runtimeSettlement, "failed");
  assert.equal(result.ok, true);
});

test("a degraded acknowledgment remains distinguishable from complete evidence", () => {
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

test("already-terminal or duplicate end replays stored terminal truth", async () => {
  const result = await endUserInterviewSessionWorkflow(
    { sessionId: SESSION_ID, userId: USER_ID, env: ENV },
    createDeps({
      requestRuntimeSettlement: async () => settledRuntime(),
      endSession: async () => ({
        ...completedInterview(),
        completion: {
          ...completedInterview().completion,
          disposition: "existing",
        },
      }),
    })
  );

  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.completion.disposition, "existing");
});

function createDeps(
  overrides: Partial<EndUserInterviewSessionDeps> = {}
): EndUserInterviewSessionDeps {
  return {
    requestRuntimeSettlement: async () => settledRuntime(),
    endSession: async () => completedInterview(),
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

function completedInterview(): Extract<
  EndInterviewSessionResult,
  { ok: true }
> {
  return {
    ok: true,
    completion: {
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
      feedback: feedbackRecord("pending"),
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
    },
    dispatch: null,
    creditSettlementStatus: "settled",
  };
}

function skippedInterview(): Extract<EndInterviewSessionResult, { ok: true }> {
  const completed = completedInterview();
  return {
    ...completed,
    completion: {
      ...completed.completion,
      lifecycle: {
        ...completed.completion.lifecycle,
        state: "abandoned",
        terminalReason: "insufficient_signal",
      },
      feedback: feedbackRecord("skipped"),
      tier: SessionTier.INSUFFICIENT,
    },
  };
}

function feedbackRecord(
  status: "pending" | "skipped"
): Extract<EndInterviewSessionResult, { ok: true }>["completion"]["feedback"] {
  return {
    id: "750e8400-e29b-41d4-a716-446655440000",
    sessionId: SESSION_ID,
    status,
    statusReason:
      status === "skipped"
        ? "Voice runtime transcript settlement was not confirmed"
        : null,
    rubricVersion: "1.0.0",
    completionTier: status === "skipped" ? "insufficient" : "full",
    completionStats: null,
    completionRecommendations: [],
    retryCount: 0,
    errorCode: null,
    errorDetails: null,
    overallScore: null,
    summary: null,
    rubricScores: null,
    strengths: null,
    improvements: null,
    highlights: null,
    analysis: null,
    exercises: null,
    generatedAt: null,
    createdAt: new Date("2026-07-28T03:00:00.000Z"),
    updatedAt: new Date("2026-07-28T03:00:00.000Z"),
    dispatchStatus: status === "skipped" ? "not_required" : "pending",
    dispatchEventId:
      status === "skipped"
        ? null
        : `feedback/generate.requested:${SESSION_ID}:0`,
    dispatchAttempts: 0,
    dispatchClaimedAt: null,
    dispatchedAt: null,
  } as unknown as Extract<
    EndInterviewSessionResult,
    { ok: true }
  >["completion"]["feedback"];
}

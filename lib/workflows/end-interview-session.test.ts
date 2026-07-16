import assert from "node:assert/strict";
import test from "node:test";

import {
  SessionTier,
  type SessionValidation,
} from "@/lib/evaluation/session-validator";
import type { FinalizeInterviewSessionResult } from "@/lib/db/end-interview-session";
import { feedback as feedbackTable } from "@/lib/db/schema";
import type { DispatchFeedbackGenerationResult } from "./dispatch-feedback-generation";
import {
  endInterviewSessionWorkflow,
  type EndInterviewSessionDeps,
} from "./end-interview-session";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const USER_ID = "650e8400-e29b-41d4-a716-446655440000";

test("dispatch failure does not turn committed completion into end failure", async () => {
  const deps = createDeps({
    dispatch: async () => ({
      ok: false,
      disposition: "failed",
      dispatch: null,
    }),
  });
  const result = await endInterviewSessionWorkflow(userEndInput(), deps);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.completion.lifecycle.state, "completed");
    assert.equal(result.dispatch?.disposition, "failed");
  }
});

test("dispatch infrastructure exceptions preserve committed completion", async () => {
  const result = await endInterviewSessionWorkflow(
    userEndInput(),
    createDeps({
      dispatch: async () => {
        throw new Error("dispatch store unavailable");
      },
    })
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.completion.lifecycle.state, "completed");
    assert.equal(result.dispatch?.disposition, "failed");
    assert.equal(result.dispatch?.dispatch?.status, "pending");
  }
});

test("skipped feedback never dispatches", async () => {
  let dispatches = 0;
  const skipped = completion({
    feedback: feedbackRecord({
      status: "skipped",
      dispatchStatus: "not_required",
      dispatchEventId: null,
    }),
  });
  const result = await endInterviewSessionWorkflow(
    userEndInput(),
    createDeps({
      finalize: async () => skipped,
      dispatch: async () => {
        dispatches += 1;
        return sentDispatch();
      },
    })
  );

  assert.equal(result.ok, true);
  assert.equal(dispatches, 0);
  if (result.ok) assert.equal(result.dispatch, null);
});

test("pending deadline cleanup blocks feedback dispatch", async () => {
  let dispatches = 0;
  const pendingCleanup = completion({ deadlineRoomCleanupStatus: "pending" });
  const result = await endInterviewSessionWorkflow(
    userEndInput(),
    createDeps({
      finalize: async () => pendingCleanup,
      dispatch: async () => {
        dispatches += 1;
        return sentDispatch();
      },
    })
  );

  assert.equal(result.ok, true);
  assert.equal(dispatches, 0);
  if (result.ok) assert.equal(result.dispatch, null);
});

test("failed generation can redispatch its stored event identity", async () => {
  let dispatches = 0;
  const failed = completion({
    feedback: feedbackRecord({
      status: "failed",
      statusReason: "provider timeout",
      dispatchStatus: "sent",
    }),
  });

  const result = await endInterviewSessionWorkflow(
    userEndInput(),
    createDeps({
      finalize: async () => failed,
      dispatch: async () => {
        dispatches += 1;
        return sentDispatch();
      },
    })
  );

  assert.equal(result.ok, true);
  assert.equal(dispatches, 1);
  if (result.ok) assert.equal(result.dispatch?.disposition, "sent");
});

test("not-found completion is returned without dispatch", async () => {
  let dispatches = 0;
  const result = await endInterviewSessionWorkflow(
    userEndInput(),
    createDeps({
      finalize: async () => ({ ok: false, reason: "not_found" }),
      dispatch: async () => {
        dispatches += 1;
        return sentDispatch();
      },
    })
  );

  assert.deepEqual(result, { ok: false, reason: "not_found" });
  assert.equal(dispatches, 0);
});

test("authorization runs before atomic transcript settlement", async () => {
  let finalizations = 0;
  const result = await endInterviewSessionWorkflow(
    userEndInput(),
    createDeps({
      authorize: async () => false,
      finalize: async () => {
        finalizations += 1;
        return completion();
      },
    })
  );

  assert.deepEqual(result, { ok: false, reason: "not_found" });
  assert.equal(finalizations, 0);
});

test("workflow passes only the authorized end command to finalization", async () => {
  let finalizedInput: Parameters<EndInterviewSessionDeps["finalize"]>[0] | null =
    null;
  const input = userEndInput();
  const result = await endInterviewSessionWorkflow(
    input,
    createDeps({
      finalize: async (finalizeInput) => {
        finalizedInput = finalizeInput;
        return completion();
      },
    })
  );

  assert.equal(result.ok, true);
  assert.deepEqual(finalizedInput, input);
});

test("terminal credit settlement completes before feedback dispatch", async () => {
  const order: string[] = [];
  const result = await endInterviewSessionWorkflow(
    userEndInput(),
    createDeps({
      finalize: async () => {
        order.push("finalize");
        return completion();
      },
      settleCredit: async () => {
        order.push("settle_credit");
      },
      dispatch: async () => {
        order.push("dispatch_feedback");
        return sentDispatch();
      },
    })
  );

  assert.equal(result.ok, true);
  assert.deepEqual(order, ["finalize", "settle_credit", "dispatch_feedback"]);
});

test("a failed terminal credit settlement stays retryable and blocks dispatch", async () => {
  let dispatches = 0;
  await assert.rejects(
    endInterviewSessionWorkflow(
      userEndInput(),
      createDeps({
        settleCredit: async () => {
          throw new Error("credit settlement unavailable");
        },
        dispatch: async () => {
          dispatches += 1;
          return sentDispatch();
        },
      })
    ),
    /credit settlement unavailable/
  );
  assert.equal(dispatches, 0);
});

test("hard deadline sends a system time-limit command and dispatches for the stored owner", async () => {
  const finalized: Parameters<EndInterviewSessionDeps["finalize"]>[0][] = [];
  const dispatched: Parameters<EndInterviewSessionDeps["dispatch"]>[0][] = [];
  const result = await endInterviewSessionWorkflow(
    {
      sessionId: SESSION_ID,
      actor: { type: "system", source: "hard_deadline" },
      requestedTerminalReason: "time_limit",
    },
    createDeps({
      finalize: async (input) => {
        finalized.push(input);
        return completion({
          lifecycle: {
            state: "completed",
            version: 3,
            terminalReason: "time_limit",
            endedAt: new Date("2026-07-09T22:00:00.000Z"),
          },
        });
      },
      dispatch: async (input) => {
        dispatched.push(input);
        return sentDispatch();
      },
    })
  );

  assert.equal(result.ok, true);
  assert.equal(finalized[0]?.requestedTerminalReason, "time_limit");
  assert.deepEqual(finalized[0]?.actor, {
    type: "system",
    source: "hard_deadline",
  });
  assert.equal(dispatched[0]?.userId, USER_ID);
});

function createDeps(
  overrides: Partial<EndInterviewSessionDeps> = {}
): EndInterviewSessionDeps {
  return {
    authorize: async () => true,
    finalize: async () => completion(),
    settleCredit: async () => undefined,
    dispatch: async () => sentDispatch(),
    ...overrides,
  };
}

function validation(): SessionValidation {
  return {
    tier: SessionTier.FULL,
    isValid: true,
    stats: {
      totalTurns: 20,
      userTurns: 10,
      totalWords: 800,
      durationSeconds: 1200,
      substantiveResponses: 8,
    },
    reasons: [],
    recommendations: [],
  };
}

function completion(
  overrides: Partial<Extract<FinalizeInterviewSessionResult, { ok: true }>> = {}
): Extract<FinalizeInterviewSessionResult, { ok: true }> {
  return {
    ok: true,
    disposition: "applied",
    userId: USER_ID,
    roomName: "interview-deadline-room",
    lifecycle: {
      state: "completed",
      version: 3,
      terminalReason: "user_end",
      endedAt: new Date("2026-07-09T22:00:00.000Z"),
    },
    feedback: feedbackRecord(),
    deadlineRoomCleanupStatus: null,
    stats: validation().stats,
    tier: SessionTier.FULL,
    recommendations: [],
    ...overrides,
  };
}

function userEndInput() {
  return {
    sessionId: SESSION_ID,
    actor: { type: "user" as const, userId: USER_ID },
    requestedTerminalReason: "user_end" as const,
  };
}

function feedbackRecord(
  overrides: Partial<typeof feedbackTable.$inferSelect> = {}
): typeof feedbackTable.$inferSelect {
  return { ...feedbackRecordBase(), ...overrides };
}

function feedbackRecordBase(): typeof feedbackTable.$inferSelect {
  return {
    id: "750e8400-e29b-41d4-a716-446655440000",
    sessionId: SESSION_ID,
    structureScore: null,
    clarityScore: null,
    insightScore: null,
    communicationScore: null,
    leadershipScore: null,
    overallScore: null,
    strengths: null,
    improvements: null,
    drills: null,
    summary: null,
    createdAt: new Date("2026-07-09T22:00:00.000Z"),
    status: "pending" as const,
    statusReason: null,
    rubricVersion: "1.0.0",
    processingStartedAt: null,
    processingDurationMs: null,
    completionTier: "full" as const,
    completionStats: validation().stats,
    completionRecommendations: [],
    dispatchStatus: "pending" as const,
    dispatchEventId: `feedback/generate.requested:${SESSION_ID}:0`,
    dispatchAttempts: 0,
    dispatchClaimedAt: null,
    dispatchedAt: null,
    dispatchLastError: null,
  };
}

function sentDispatch(): DispatchFeedbackGenerationResult {
  return {
    ok: true,
    disposition: "sent",
    dispatch: {
      sessionId: SESSION_ID,
      eventId: `feedback/generate.requested:${SESSION_ID}:1`,
      status: "sent",
      attempts: 1,
      claimedAt: new Date("2026-07-09T22:00:00.000Z"),
      dispatchedAt: new Date("2026-07-09T22:00:01.000Z"),
    },
  };
}

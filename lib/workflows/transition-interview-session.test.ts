import assert from "node:assert/strict";
import test from "node:test";

import type {
  CompareAndSetInterviewLifecycleInput,
  InterviewSessionLifecycleStore,
  PersistedInterviewLifecycle,
} from "@/lib/db/session-lifecycle";
import {
  transitionInterviewSessionWorkflow,
  type TransitionInterviewSessionDeps,
} from "./transition-interview-session";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const NOW = new Date("2026-07-09T21:00:00.000Z");

test("workflow validates and applies one canonical lifecycle edge", async () => {
  const store = createMemoryStore(createLifecycle());
  const result = await transitionInterviewSessionWorkflow(
    { sessionId: SESSION_ID, to: "connecting" },
    createDeps(store)
  );

  assert.equal(result.ok, true);
  assert.equal(result.disposition, "applied");
  assert.equal(result.lifecycle?.state, "connecting");
  assert.equal(result.lifecycle?.version, 2);
});

test("workflow rejects invalid edges before persistence", async () => {
  let writes = 0;
  const store = createMemoryStore(createLifecycle(), () => {
    writes += 1;
  });
  const result = await transitionInterviewSessionWorkflow(
    { sessionId: SESSION_ID, to: "completed", terminalReason: "user_end" },
    createDeps(store)
  );

  assert.deepEqual(result, {
    ok: false,
    disposition: "rejected",
    code: "invalid_transition",
    lifecycle: createLifecycle(),
  });
  assert.equal(writes, 0);
});

test("equivalent concurrent transitions converge idempotently", async () => {
  const winning = createLifecycle({ state: "connecting", version: 2 });
  const store = createConflictStore(winning);

  const result = await transitionInterviewSessionWorkflow(
    { sessionId: SESSION_ID, to: "connecting" },
    createDeps(store)
  );

  assert.equal(result.ok, true);
  assert.equal(result.disposition, "idempotent");
  assert.equal(result.lifecycle, winning);
});

test("conflicting concurrent terminal claims preserve the stored winner", async () => {
  const current = createLifecycle({
    state: "ending",
    version: 5,
    terminalReason: "provider_failure",
    activatedAt: NOW,
    endingAt: NOW,
  });
  const result = await transitionInterviewSessionWorkflow(
    { sessionId: SESSION_ID, to: "ending", terminalReason: "user_end" },
    createDeps(createMemoryStore(current))
  );

  assert.equal(result.ok, false);
  assert.equal(result.disposition, "conflict");
  assert.equal(result.lifecycle, current);
});

for (const scenario of [
  {
    reason: "user_end",
    activatedAt: NOW,
    expectedState: "completed",
  },
  {
    reason: "user_end",
    activatedAt: null,
    expectedState: "abandoned",
  },
  {
    reason: "provider_failure",
    activatedAt: NOW,
    expectedState: "failed",
  },
] as const) {
  test(`workflow finalizes a stored ${scenario.reason} claim as ${scenario.expectedState}`, async () => {
    const current = createLifecycle({
      state: "ending",
      version: 3,
      terminalReason: scenario.reason,
      activatedAt: scenario.activatedAt,
      endingAt: NOW,
    });
    const result = await transitionInterviewSessionWorkflow(
      { sessionId: SESSION_ID, to: scenario.expectedState },
      createDeps(createMemoryStore(current))
    );

    assert.equal(result.ok, true);
    assert.equal(result.disposition, "applied");
    assert.equal(result.lifecycle?.state, scenario.expectedState);
    assert.equal(result.lifecycle?.terminalReason, scenario.reason);
  });
}

test("workflow rejects a terminal state that contradicts the stored claim", async () => {
  const current = createLifecycle({
    state: "ending",
    version: 3,
    terminalReason: "provider_failure",
    endingAt: NOW,
  });
  const result = await transitionInterviewSessionWorkflow(
    { sessionId: SESSION_ID, to: "completed" },
    createDeps(createMemoryStore(current))
  );

  assert.equal(result.ok, false);
  assert.equal(result.disposition, "rejected");
  if (result.disposition === "rejected") {
    assert.equal(result.code, "terminal_outcome_mismatch");
  }
});

function createDeps(
  lifecycleStore: InterviewSessionLifecycleStore
): TransitionInterviewSessionDeps {
  return { lifecycleStore, now: () => NOW };
}

function createLifecycle(
  overrides: Partial<PersistedInterviewLifecycle> = {}
): PersistedInterviewLifecycle {
  return {
    sessionId: SESSION_ID,
    state: "created",
    version: 1,
    terminalReason: null,
    legacyStatus: "in_progress",
    activatedAt: null,
    endingAt: null,
    lastTransitionAt: new Date("2026-07-09T20:59:00.000Z"),
    endedAt: null,
    ...overrides,
  };
}

function createMemoryStore(
  initial: PersistedInterviewLifecycle,
  onWrite: () => void = () => undefined
): InterviewSessionLifecycleStore {
  let current: PersistedInterviewLifecycle | null = initial;
  return {
    get: async () => current,
    compareAndSet: async (input) => {
      onWrite();
      if (
        !current ||
        current.state !== input.expectedState ||
        current.version !== input.expectedVersion
      ) {
        return {
          applied: false,
          reason: current ? "conflict" : "not_found",
          current,
        };
      }
      current = applyTransition(current, input);
      return { applied: true, current };
    },
  };
}

function createConflictStore(
  winner: PersistedInterviewLifecycle
): InterviewSessionLifecycleStore {
  return {
    get: async () => createLifecycle(),
    compareAndSet: async () => ({
      applied: false,
      reason: "conflict",
      current: winner,
    }),
  };
}

function applyTransition(
  current: PersistedInterviewLifecycle,
  input: CompareAndSetInterviewLifecycleInput
): PersistedInterviewLifecycle {
  return {
    ...current,
    state: input.nextState,
    version: current.version + 1,
    terminalReason: input.terminalReason ?? null,
    lastTransitionAt: input.transitionedAt ?? NOW,
  };
}

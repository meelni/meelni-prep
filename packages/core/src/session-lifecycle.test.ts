import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERVIEW_LIFECYCLE_STATES,
  INTERVIEW_TERMINAL_REASONS,
  INTERVIEW_TERMINAL_STATES,
  canTransitionInterviewLifecycle,
  deriveInterviewTerminalState,
  isInterviewTerminalState,
  isInterviewSessionCompletedForRead,
  projectLegacyInterviewSessionStatus,
  resolveInterviewTerminalOutcome,
  validateInterviewLifecycleTransition,
  type InterviewLifecycleState,
  type InterviewTerminalReason,
} from "./session-lifecycle";

const VALID_TRANSITIONS = new Set([
  "created->connecting",
  "created->ending",
  "connecting->active",
  "connecting->ending",
  "active->reconnecting",
  "active->ending",
  "reconnecting->active",
  "reconnecting->ending",
  "ending->completed",
  "ending->abandoned",
  "ending->failed",
]);

test("transition matrix exhaustively accepts only canonical lifecycle edges", () => {
  for (const from of INTERVIEW_LIFECYCLE_STATES) {
    for (const to of INTERVIEW_LIFECYCLE_STATES) {
      assert.equal(
        canTransitionInterviewLifecycle(from, to),
        VALID_TRANSITIONS.has(`${from}->${to}`),
        `${from}->${to}`
      );
    }
  }
});

test("terminal-state guard exhaustively identifies immutable outcomes", () => {
  for (const state of INTERVIEW_LIFECYCLE_STATES) {
    assert.equal(
      isInterviewTerminalState(state),
      INTERVIEW_TERMINAL_STATES.includes(
        state as (typeof INTERVIEW_TERMINAL_STATES)[number]
      ),
      state
    );
  }
});

test("valid nonterminal transitions reject terminal reasons", () => {
  for (const [from, to] of [
    ["created", "connecting"],
    ["connecting", "active"],
    ["active", "reconnecting"],
    ["reconnecting", "active"],
  ] as const) {
    assert.deepEqual(validateInterviewLifecycleTransition({ from, to }), {
      ok: true,
    });
    assert.deepEqual(
      validateInterviewLifecycleTransition({
        from,
        to,
        terminalReason: "user_end",
      }),
      { ok: false, code: "terminal_reason_not_allowed" }
    );
  }
});

test("every preterminal state can claim ending with a new terminal reason", () => {
  for (const from of [
    "created",
    "connecting",
    "active",
    "reconnecting",
  ] as const) {
    for (const terminalReason of INTERVIEW_TERMINAL_REASONS) {
      const expected =
        terminalReason === "legacy_unknown"
          ? { ok: false, code: "terminal_reason_not_allowed" }
          : { ok: true };

      assert.deepEqual(
        validateInterviewLifecycleTransition({
          from,
          to: "ending",
          terminalReason,
        }),
        expected,
        `${from} with ${terminalReason}`
      );
    }
  }
});

test("ending requires a terminal reason", () => {
  assert.deepEqual(
    validateInterviewLifecycleTransition({
      from: "active",
      to: "ending",
    }),
    { ok: false, code: "terminal_reason_required" }
  );
});

test("terminalization accepts only the outcome derived from reason and activation", () => {
  for (const reason of INTERVIEW_TERMINAL_REASONS) {
    for (const activated of [false, true]) {
      const expectedState = deriveInterviewTerminalState({
        reason,
        activated,
      });

      for (const to of INTERVIEW_TERMINAL_STATES) {
        const expected =
          reason === "legacy_unknown"
            ? { ok: false, code: "terminal_reason_not_allowed" }
            : to === expectedState
              ? { ok: true }
              : { ok: false, code: "terminal_outcome_mismatch" };

        assert.deepEqual(
          validateInterviewLifecycleTransition({
            from: "ending",
            to,
            terminalReason: reason,
            activated,
          }),
          expected,
          `${reason}, activated=${activated}, to=${to}`
        );
      }
    }
  }
});

test("invalid graph edges fail before terminal metadata validation", () => {
  for (const from of INTERVIEW_LIFECYCLE_STATES) {
    for (const to of INTERVIEW_LIFECYCLE_STATES) {
      if (VALID_TRANSITIONS.has(`${from}->${to}`)) continue;

      assert.deepEqual(validateInterviewLifecycleTransition({ from, to }), {
        ok: false,
        code: "invalid_transition",
      });
    }
  }
});

test("terminal outcome derivation is exhaustive across reasons and activation", () => {
  const expected: Record<
    InterviewTerminalReason,
    { inactive: string; active: string }
  > = {
    user_end: { inactive: "abandoned", active: "completed" },
    time_limit: { inactive: "abandoned", active: "completed" },
    disconnect_timeout: { inactive: "abandoned", active: "completed" },
    provider_failure: { inactive: "failed", active: "failed" },
    insufficient_signal: { inactive: "abandoned", active: "abandoned" },
    legacy_unknown: { inactive: "abandoned", active: "completed" },
  };

  for (const reason of INTERVIEW_TERMINAL_REASONS) {
    assert.equal(
      deriveInterviewTerminalState({ reason, activated: false }),
      expected[reason].inactive,
      `${reason} before activation`
    );
    assert.equal(
      deriveInterviewTerminalState({ reason, activated: true }),
      expected[reason].active,
      `${reason} after activation`
    );
  }
});

test("legacy projection covers every lifecycle state", () => {
  const expected: Record<InterviewLifecycleState, string> = {
    created: "in_progress",
    connecting: "in_progress",
    active: "in_progress",
    reconnecting: "in_progress",
    ending: "in_progress",
    completed: "completed",
    abandoned: "abandoned",
    failed: "error",
  };

  for (const state of INTERVIEW_LIFECYCLE_STATES) {
    assert.equal(
      projectLegacyInterviewSessionStatus({ state }),
      expected[state]
    );
  }

  assert.equal(
    projectLegacyInterviewSessionStatus({
      state: "abandoned",
      terminalReason: "insufficient_signal",
    }),
    "too_short"
  );
});

test("completion reads prefer canonical terminal truth with a temporary legacy fallback", () => {
  assert.equal(
    isInterviewSessionCompletedForRead({
      state: "connecting",
      legacyStatus: "completed",
    }),
    true
  );
  assert.equal(
    isInterviewSessionCompletedForRead({
      state: "completed",
      legacyStatus: "in_progress",
    }),
    true
  );
  for (const state of ["abandoned", "failed"] as const) {
    assert.equal(
      isInterviewSessionCompletedForRead({
        state,
        legacyStatus: "completed",
      }),
      false
    );
  }
});

test("terminal resolver accepts the first writer", () => {
  const result = resolveInterviewTerminalOutcome(null, {
    reason: "user_end",
    activated: true,
  });

  assert.deepEqual(result, {
    disposition: "accepted",
    outcome: { state: "completed", reason: "user_end" },
    requested: { state: "completed", reason: "user_end" },
  });
});

test("terminal resolver makes equivalent retries idempotent", () => {
  const current = { state: "completed", reason: "time_limit" } as const;
  const result = resolveInterviewTerminalOutcome(current, {
    reason: "time_limit",
    activated: true,
  });

  assert.equal(result.disposition, "idempotent");
  assert.equal(result.outcome, current);
  assert.deepEqual(result.requested, current);
});

test("terminal resolver preserves the first outcome on conflicts", () => {
  const current = { state: "failed", reason: "provider_failure" } as const;
  const result = resolveInterviewTerminalOutcome(current, {
    reason: "user_end",
    activated: true,
  });

  assert.deepEqual(result, {
    disposition: "conflict",
    outcome: current,
    requested: { state: "completed", reason: "user_end" },
  });
});

test("terminal resolver preserves legacy outcomes against new requests", () => {
  const current = { state: "completed", reason: "legacy_unknown" } as const;
  const result = resolveInterviewTerminalOutcome(current, {
    reason: "disconnect_timeout",
    activated: true,
  });

  assert.deepEqual(result, {
    disposition: "conflict",
    outcome: current,
    requested: { state: "completed", reason: "disconnect_timeout" },
  });
});

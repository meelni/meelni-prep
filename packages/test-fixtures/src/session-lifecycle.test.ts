import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERVIEW_LIFECYCLE_STATES,
  INTERVIEW_TERMINAL_REASONS,
  deriveInterviewTerminalState,
  validateInterviewLifecycleTransition,
} from "@meelni/core";

import { createInterviewLifecycleScenarioFixtures } from "./session-lifecycle";

test("lifecycle fixtures cover every canonical state and new terminal reason", () => {
  const fixtures = createInterviewLifecycleScenarioFixtures();
  const states = new Set(
    fixtures.flatMap((fixture) => [
      fixture.initialState,
      ...fixture.transitions.flatMap((transition) => [
        transition.from,
        transition.to,
      ]),
    ])
  );
  const reasons = new Set(
    fixtures.flatMap((fixture) =>
      fixture.transitions.flatMap((transition) =>
        transition.terminalReason ? [transition.terminalReason] : []
      )
    )
  );

  assert.deepEqual([...states].sort(), [...INTERVIEW_LIFECYCLE_STATES].sort());
  assert.deepEqual(
    [...reasons].sort(),
    INTERVIEW_TERMINAL_REASONS.filter(
      (reason) => reason !== "legacy_unknown"
    ).sort()
  );
});

test("accepted lifecycle fixture transitions satisfy the core contract", () => {
  for (const fixture of createInterviewLifecycleScenarioFixtures()) {
    assert.equal(
      fixture.transitions[0]?.expectedVersionBefore,
      fixture.initialVersion,
      `${fixture.id}: initial version`
    );

    for (const transition of fixture.transitions) {
      if (transition.expectedDisposition !== "accepted") continue;

      assert.deepEqual(
        validateInterviewLifecycleTransition({
          from: transition.from,
          to: transition.to,
          terminalReason: transition.terminalReason,
          activated: transition.activated,
        }),
        { ok: true },
        `${fixture.id}: ${transition.from}->${transition.to}`
      );
      assert.equal(
        transition.expectedVersionAfter,
        transition.expectedVersionBefore + 1,
        `${fixture.id}: ${transition.commandId}`
      );
    }
  }
});

test("terminal expectations agree with reason and activation semantics", () => {
  for (const fixture of createInterviewLifecycleScenarioFixtures()) {
    if (!fixture.expectedTerminal) continue;

    const terminalTransition = fixture.transitions.findLast(
      (transition) =>
        transition.expectedDisposition === "accepted" &&
        transition.terminalReason &&
        transition.to === fixture.expectedTerminal?.state
    );

    if (!terminalTransition) {
      assert.equal(fixture.id, "invalid-terminal-reopen");
      continue;
    }

    assert.equal(
      deriveInterviewTerminalState({
        reason: terminalTransition.terminalReason!,
        activated: terminalTransition.activated,
      }),
      fixture.expectedTerminal.state
    );
    assert.equal(
      terminalTransition.terminalReason,
      fixture.expectedTerminal.reason
    );
  }
});

test("fixtures encode invalid-transition and concurrent-terminal behavior", () => {
  const fixtures = createInterviewLifecycleScenarioFixtures();
  const invalid = fixtures.find(
    (fixture) => fixture.id === "invalid-terminal-reopen"
  );
  const race = fixtures.find(
    (fixture) => fixture.id === "concurrent-terminal-claims"
  );

  assert.equal(invalid?.transitions[0]?.expectedDisposition, "rejected");
  assert.equal(
    invalid?.transitions[0]?.expectedErrorCode,
    "invalid_transition"
  );
  assert.equal(race?.transitions[1]?.expectedDisposition, "conflict");
  assert.equal(race?.transitions[1]?.expectedErrorCode, "version_conflict");
  assert.deepEqual(race?.expectedTerminal, {
    state: "completed",
    reason: "user_end",
  });
});

test("lifecycle fixtures stay provider-neutral and return fresh copies", () => {
  const first = createInterviewLifecycleScenarioFixtures();
  const second = createInterviewLifecycleScenarioFixtures();

  assert.doesNotMatch(JSON.stringify(first), /livekit|daily|twilio|webrtc/i);

  first[0]!.transitions[0]!.commandId = "changed-by-test";
  assert.notEqual(
    first[0]!.transitions[0]!.commandId,
    second[0]!.transitions[0]!.commandId
  );
});

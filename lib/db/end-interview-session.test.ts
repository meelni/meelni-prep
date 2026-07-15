import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTranscriptIntegrityValidation,
  resolveInterviewTerminalReason,
  shouldRefineProvisionalTerminalReason,
} from "./end-interview-session";
import { SessionTier } from "@/lib/evaluation/session-validator";

test("valid durable signal preserves the command's terminal reason", () => {
  assert.equal(
    resolveInterviewTerminalReason({ isValid: true }, "user_end"),
    "user_end"
  );
  assert.equal(
    resolveInterviewTerminalReason({ isValid: true }, "time_limit"),
    "time_limit"
  );
});

test("insufficient durable signal wins before a deadline claim is committed", () => {
  assert.equal(
    resolveInterviewTerminalReason({ isValid: false }, "time_limit"),
    "insufficient_signal"
  );
});

test("invalid-session recovery preserves provider failure without transcript signal", () => {
  assert.equal(
    resolveInterviewTerminalReason({ isValid: false }, "provider_failure"),
    "provider_failure"
  );
});

test("only matching invalid deadline and reconnect provisional claims may refine", () => {
  assert.equal(
    shouldRefineProvisionalTerminalReason({
      state: "ending",
      terminalReason: "time_limit",
      isValid: false,
      source: "hard_deadline",
    }),
    true
  );
  assert.equal(
    shouldRefineProvisionalTerminalReason({
      state: "ending",
      terminalReason: "disconnect_timeout",
      isValid: false,
      source: "reconnect_timeout",
    }),
    true
  );

  for (const [terminalReason, source] of [
    ["user_end", "user_end"],
    ["provider_failure", "invalid_session_recovery"],
    ["disconnect_timeout", "hard_deadline"],
    ["time_limit", "reconnect_timeout"],
    ["insufficient_signal", "reconnect_timeout"],
  ] as const) {
    assert.equal(
      shouldRefineProvisionalTerminalReason({
        state: "ending",
        terminalReason,
        isValid: false,
        source,
      }),
      false
    );
  }

  assert.equal(
    shouldRefineProvisionalTerminalReason({
      state: "ending",
      terminalReason: "time_limit",
      isValid: true,
      source: "hard_deadline",
    }),
    false
  );
  assert.equal(
    shouldRefineProvisionalTerminalReason({
      state: "completed",
      terminalReason: "time_limit",
      isValid: false,
      source: "hard_deadline",
    }),
    false
  );
});

test("runtime settlement and textless interruption own final feedback eligibility", () => {
  const baseValidation = {
    isValid: true,
    tier: SessionTier.PARTIAL,
    stats: {
      totalTurns: 6,
      userTurns: 3,
      totalWords: 90,
      durationSeconds: 360,
      substantiveResponses: 3,
    },
    reasons: [],
    recommendations: [],
  };

  for (const input of [
    { runtimeWriterStates: [], interruptionCount: 0 },
    {
      runtimeWriterStates: [{ generation: 1, state: "degraded" as const }],
      interruptionCount: 0,
    },
    {
      runtimeWriterStates: [{ generation: 1, state: "settled" as const }],
      interruptionCount: 1,
    },
  ]) {
    const result = applyTranscriptIntegrityValidation({
      baseValidation,
      ...input,
    });
    assert.equal(result.isValid, false);
    assert.equal(result.reasons.length > 0, true);
  }

  assert.deepEqual(
    applyTranscriptIntegrityValidation({
      baseValidation,
      runtimeWriterStates: [{ generation: 1, state: "settled" }],
      interruptionCount: 0,
    }),
    baseValidation
  );

  const replacementMissing = applyTranscriptIntegrityValidation({
    baseValidation,
    interruptionCount: 0,
    runtimeWriterStates: [
      { generation: 1, state: null },
      { generation: 2, state: "settled" },
    ],
  });
  assert.equal(replacementMissing.isValid, false);
  assert.match(replacementMissing.reasons[0] ?? "", /1 writer generation/);

  const replacementDegraded = applyTranscriptIntegrityValidation({
    baseValidation,
    interruptionCount: 0,
    runtimeWriterStates: [
      { generation: 1, state: "degraded" },
      { generation: 2, state: "settled" },
    ],
  });
  assert.equal(replacementDegraded.isValid, false);

  assert.deepEqual(
    applyTranscriptIntegrityValidation({
      baseValidation,
      interruptionCount: 0,
      runtimeWriterStates: [
        { generation: 1, state: "settled" },
        { generation: 2, state: "settled" },
      ],
    }),
    baseValidation
  );
});

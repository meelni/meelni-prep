import assert from "node:assert/strict";
import test from "node:test";

import { reportRuntimeSettlementStage } from "./runtime-settlement-stage";

test("runtime-settlement telemetry emits only the closed identity-free schema", () => {
  let serialized = "";
  const event = reportRuntimeSettlementStage(
    {
      stage: "target_resolution",
      targetSource: "dispatch",
      outcome: "succeeded",
      reason: "dispatch_exact",
      durationMs: 28.6,
      sessionId: "must-not-serialize",
      roomName: "must-not-serialize",
      providerBody: "must-not-serialize",
      transcript: "must-not-serialize",
    } as never,
    {
      now: () => new Date("2026-08-12T12:00:00.000Z"),
      env: {
        GIT_COMMIT_SHA: "abcdef1234567890",
        CUSTOMER_CONTENT: "must-not-serialize",
      },
      write: (value) => {
        serialized = value;
      },
    }
  );

  assert.deepEqual(event, {
    event: "meelni_runtime_settlement_stage",
    version: 1,
    occurredAt: "2026-08-12T12:00:00.000Z",
    stage: "target_resolution",
    targetSource: "dispatch",
    outcome: "succeeded",
    reason: "dispatch_exact",
    durationMs: 29,
    release: "abcdef1234567890",
  });
  assert.equal(serialized, JSON.stringify(event));
  assert.doesNotMatch(
    serialized,
    /must-not-serialize|session|room|customer|provider|transcript/i
  );
});

test("runtime-settlement telemetry rejects poisoned fields and release values", () => {
  const validInput = {
    stage: "packet_send" as const,
    targetSource: "participant" as const,
    outcome: "succeeded" as const,
    reason: "packet_sent" as const,
    durationMs: 1,
  };

  for (const input of [
    { ...validInput, stage: "session-1" },
    { ...validInput, targetSource: "agent-identity" },
    { ...validInput, outcome: "provider-message" },
    { ...validInput, reason: "request-id" },
    { ...validInput, durationMs: Number.NaN },
    { ...validInput, durationMs: -1 },
  ]) {
    assert.equal(reportRuntimeSettlementStage(input as never), null);
  }

  const event = reportRuntimeSettlementStage(validInput, {
    env: { GIT_COMMIT_SHA: "customer-secret-not-a-sha" },
    write: () => undefined,
  });
  assert.equal(event?.release, null);
});

test("runtime-settlement telemetry write failures never block behavior", () => {
  assert.equal(
    reportRuntimeSettlementStage(
      {
        stage: "durable_ack",
        targetSource: "none",
        outcome: "deferred",
        reason: "ack_missing",
        durationMs: 1,
      },
      {
        write: () => {
          throw new Error("hostile provider content");
        },
      }
    ),
    null
  );
});

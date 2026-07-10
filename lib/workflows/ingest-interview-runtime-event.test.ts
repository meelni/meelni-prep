import assert from "node:assert/strict";
import test from "node:test";

import type { InterviewRuntimeEvent } from "@meelni/agent";
import {
  ingestInterviewRuntimeEvent,
  type InterviewRuntimeFailureStore,
} from "./ingest-interview-runtime-event";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

test("provider failure persists then converges credit on every replay", async () => {
  let persisted = false;
  let settlements = 0;
  const store: InterviewRuntimeFailureStore = {
    async persistProviderFailure() {
      const disposition = persisted ? "existing" : "created";
      persisted = true;
      return { ok: true, disposition, sessionId: SESSION_ID };
    },
  };
  const settleCredit = async () => {
    settlements += 1;
    return { disposition: "released" };
  };

  const first = await ingestInterviewRuntimeEvent({
    requestSessionId: SESSION_ID,
    event: providerFailure(),
    store,
    settleCredit,
  });
  const replay = await ingestInterviewRuntimeEvent({
    requestSessionId: SESSION_ID,
    event: providerFailure(),
    store,
    settleCredit,
  });

  assert.equal(first.ok && first.disposition, "created");
  assert.equal(replay.ok && replay.disposition, "existing");
  assert.equal(settlements, 2);
});
test("settlement failure remains retryable behind immutable failure evidence", async () => {
  let persisted = false;
  let settlementAttempts = 0;
  const store: InterviewRuntimeFailureStore = {
    async persistProviderFailure() {
      const disposition = persisted ? "existing" : "created";
      persisted = true;
      return { ok: true, disposition, sessionId: SESSION_ID };
    },
  };
  const settleCredit = async () => {
    settlementAttempts += 1;
    if (settlementAttempts === 1) throw new Error("database unavailable");
    return { disposition: "refunded" };
  };

  await assert.rejects(
    ingestInterviewRuntimeEvent({
      requestSessionId: SESSION_ID,
      event: providerFailure(),
      store,
      settleCredit,
    }),
    /database unavailable/
  );
  const repaired = await ingestInterviewRuntimeEvent({
    requestSessionId: SESSION_ID,
    event: providerFailure(),
    store,
    settleCredit,
  });
  assert.equal(repaired.ok && repaired.creditDisposition, "refunded");
});

test("runtime failure rejects missing correlation and cross-session claims", async () => {
  let writes = 0;
  const store: InterviewRuntimeFailureStore = {
    async persistProviderFailure() {
      writes += 1;
      return { ok: true, disposition: "created", sessionId: SESSION_ID };
    },
  };

  assert.deepEqual(
    await ingestInterviewRuntimeEvent({
      requestSessionId: SESSION_ID,
      event: { ...providerFailure(), runtime_ref: undefined },
      store,
      settleCredit: async () => ({ disposition: "released" }),
    }),
    { ok: false, reason: "invalid_event" }
  );
  assert.deepEqual(
    await ingestInterviewRuntimeEvent({
      requestSessionId: "660e8400-e29b-41d4-a716-446655440000",
      event: providerFailure(),
      store,
      settleCredit: async () => ({ disposition: "released" }),
    }),
    { ok: false, reason: "session_mismatch" }
  );
  assert.equal(writes, 0);
});

function providerFailure(): InterviewRuntimeEvent {
  return {
    contract_version: 1,
    event_id: "runtime-failure-1",
    session_id: SESSION_ID,
    type: "provider_failed",
    occurred_at: "2026-07-10T08:30:00.000Z",
    runtime_ref: { provider: "livekit", id: `interview-${SESSION_ID}` },
    failure: {
      reason: "provider_failure",
      code: "voice_session_failed",
      retryable: true,
    },
  };
}

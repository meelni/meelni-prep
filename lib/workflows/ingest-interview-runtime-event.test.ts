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
  const store: InterviewRuntimeFailureStore = {
    async persistProviderFailure() {
      const disposition = persisted ? "existing" : "created";
      persisted = true;
      return {
        ok: true,
        disposition,
        sessionId: SESSION_ID,
        creditDisposition: "released",
      };
    },
  };

  const first = await ingestInterviewRuntimeEvent({
    requestSessionId: SESSION_ID,
    event: providerFailure(),
    store,
  });
  const replay = await ingestInterviewRuntimeEvent({
    requestSessionId: SESSION_ID,
    event: providerFailure(),
    store,
  });

  assert.equal(first.ok && first.disposition, "created");
  assert.equal(replay.ok && replay.disposition, "existing");
  assert.equal(first.ok && first.creditDisposition, "released");
  assert.equal(replay.ok && replay.creditDisposition, "released");
});
test("atomic store failures reject the runtime request for a safe replay", async () => {
  const store: InterviewRuntimeFailureStore = {
    async persistProviderFailure() {
      throw new Error("database unavailable");
    },
  };

  await assert.rejects(
    ingestInterviewRuntimeEvent({
      requestSessionId: SESSION_ID,
      event: providerFailure(),
      store,
    }),
    /database unavailable/
  );
});

test("runtime failure rejects missing correlation and cross-session claims", async () => {
  let writes = 0;
  const store: InterviewRuntimeFailureStore = {
    async persistProviderFailure() {
      writes += 1;
      return {
        ok: true,
        disposition: "created",
        sessionId: SESSION_ID,
        creditDisposition: "released",
      };
    },
  };

  assert.deepEqual(
    await ingestInterviewRuntimeEvent({
      requestSessionId: SESSION_ID,
      event: { ...providerFailure(), runtime_ref: undefined },
      store,
    }),
    { ok: false, reason: "invalid_event" }
  );
  assert.deepEqual(
    await ingestInterviewRuntimeEvent({
      requestSessionId: "660e8400-e29b-41d4-a716-446655440000",
      event: providerFailure(),
      store,
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

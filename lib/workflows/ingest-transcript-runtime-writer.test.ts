import assert from "node:assert/strict";
import test from "node:test";

import {
  ingestTranscriptRuntimeWriter,
  type TranscriptRuntimeWriterStore,
} from "./ingest-transcript-runtime-writer";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

test("runtime writer registration returns the durable generation idempotently", async () => {
  type StoredWriter = ReturnType<typeof registration> & { generation: number };
  let stored: StoredWriter | null = null;
  const store: TranscriptRuntimeWriterStore<StoredWriter> = {
    async register(value) {
      if (stored) {
        return {
          ok: true,
          disposition: "existing",
          writer: stored,
          writerGeneration: stored.generation,
          lifecycleState: "active",
          lifecycleVersion: 4,
        };
      }
      stored = { ...value, generation: 1 };
      return {
        ok: true,
        disposition: "created",
        writer: stored,
        writerGeneration: 1,
        lifecycleState: "active",
        lifecycleVersion: 4,
      };
    },
  };

  const created = await ingestTranscriptRuntimeWriter({
    requestSessionId: SESSION_ID,
    registration: registration(),
    store,
  });
  const replay = await ingestTranscriptRuntimeWriter({
    requestSessionId: SESSION_ID,
    registration: registration(),
    store,
  });

  assert.equal(created.ok && created.writerGeneration, 1);
  assert.equal(replay.ok && replay.disposition, "existing");
});

test("registration rejects invented fields and cross-session claims before storage", async () => {
  let calls = 0;
  const store: TranscriptRuntimeWriterStore<object> = {
    async register() {
      calls += 1;
      return {
        ok: true,
        disposition: "created",
        writer: {},
        writerGeneration: 1,
        lifecycleState: "active",
        lifecycleVersion: 4,
      };
    },
  };

  assert.deepEqual(
    await ingestTranscriptRuntimeWriter({
      requestSessionId: SESSION_ID,
      registration: { ...registration(), text: "not metadata" },
      store,
    }),
    { ok: false, reason: "invalid_registration" }
  );
  assert.deepEqual(
    await ingestTranscriptRuntimeWriter({
      requestSessionId: "660e8400-e29b-41d4-a716-446655440000",
      registration: registration(),
      store,
    }),
    { ok: false, reason: "session_mismatch" }
  );
  assert.equal(calls, 0);
});

function registration() {
  return {
    contract_version: 1 as const,
    event_type: "runtime_writer_registration" as const,
    session_id: SESSION_ID,
    room_name: "interview-room",
    writer_id: "writer-1",
    registered_at: "2026-07-10T08:00:00.000Z",
  };
}

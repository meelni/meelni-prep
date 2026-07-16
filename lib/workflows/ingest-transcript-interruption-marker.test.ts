import assert from "node:assert/strict";
import test from "node:test";

import type { TranscriptInterruptionMarker } from "@meelni/agent";
import {
  ingestTranscriptInterruptionMarker,
  type TranscriptInterruptionMarkerStore,
} from "./ingest-transcript-interruption-marker";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

test("textless integrity markers persist idempotently outside transcript turns", async () => {
  const events = new Map<string, TranscriptInterruptionMarker>();
  const store: TranscriptInterruptionMarkerStore<TranscriptInterruptionMarker> =
    {
      async persist(marker) {
        const existing = events.get(marker.event_id);
        if (existing) {
          return JSON.stringify(existing) === JSON.stringify(marker)
            ? { ok: true, disposition: "existing", marker: existing }
            : { ok: false, reason: "event_conflict" };
        }
        events.set(marker.event_id, marker);
        return { ok: true, disposition: "created", marker };
      },
    };
  const marker = interruptionMarker();

  const created = await ingestTranscriptInterruptionMarker({
    requestSessionId: SESSION_ID,
    marker,
    store,
  });
  const replay = await ingestTranscriptInterruptionMarker({
    requestSessionId: SESSION_ID,
    marker,
    store,
  });

  assert.equal(created.ok && created.disposition, "created");
  assert.equal(replay.ok && replay.disposition, "existing");
  assert.equal("text" in marker, false);
  assert.equal(events.size, 1);
});

test("malformed and cross-session interruption markers fail before storage", async () => {
  let calls = 0;
  const store: TranscriptInterruptionMarkerStore<TranscriptInterruptionMarker> =
    {
      async persist(marker) {
        calls += 1;
        return { ok: true, disposition: "created", marker };
      },
    };
  const malformed = await ingestTranscriptInterruptionMarker({
    requestSessionId: SESSION_ID,
    marker: { ...interruptionMarker(), text: "invented transcript" },
    store,
  });
  const mismatch = await ingestTranscriptInterruptionMarker({
    requestSessionId: "660e8400-e29b-41d4-a716-446655440000",
    marker: interruptionMarker(),
    store,
  });

  assert.deepEqual(malformed, { ok: false, reason: "invalid_marker" });
  assert.deepEqual(mismatch, { ok: false, reason: "session_mismatch" });
  assert.equal(calls, 0);
});

function interruptionMarker(): TranscriptInterruptionMarker {
  return {
    contract_version: 1,
    event_type: "integrity_unavailable",
    event_id: "writer-1:speech-1:unavailable",
    writer_id: "writer-1",
    writer_generation: 1,
    sequence: 1,
    session_id: SESSION_ID,
    room_name: "interview-room",
    speaker: "interviewer",
    occurred_at: "2026-07-10T08:30:00.000Z",
    reason: "no_provider_confirmed_prefix",
  };
}

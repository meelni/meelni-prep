import assert from "node:assert/strict";
import test from "node:test";

import type { TranscriptRuntimeSettlement } from "@meelni/agent";
import {
  ingestTranscriptRuntimeSettlement,
  type TranscriptRuntimeSettlementStore,
} from "./ingest-transcript-runtime-settlement";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

test("runtime settlement persists idempotently without transcript content", async () => {
  let stored: TranscriptRuntimeSettlement | undefined;
  const store: TranscriptRuntimeSettlementStore<TranscriptRuntimeSettlement> = {
    async persist(settlement) {
      if (stored) {
        return JSON.stringify(stored) === JSON.stringify(settlement)
          ? { ok: true, disposition: "existing", settlement: stored }
          : { ok: false, reason: "settlement_conflict" };
      }
      stored = settlement;
      return { ok: true, disposition: "created", settlement };
    },
  };
  const settlement = runtimeSettlement();

  const created = await ingestTranscriptRuntimeSettlement({
    requestSessionId: SESSION_ID,
    settlement,
    store,
  });
  const replay = await ingestTranscriptRuntimeSettlement({
    requestSessionId: SESSION_ID,
    settlement,
    store,
  });

  assert.equal(created.ok && created.disposition, "created");
  assert.equal(replay.ok && replay.disposition, "existing");
  assert.equal("text" in settlement, false);
});

test("runtime settlement rejects content and cross-session claims", async () => {
  let calls = 0;
  const store: TranscriptRuntimeSettlementStore<TranscriptRuntimeSettlement> = {
    async persist(settlement) {
      calls += 1;
      return { ok: true, disposition: "created", settlement };
    },
  };

  assert.deepEqual(
    await ingestTranscriptRuntimeSettlement({
      requestSessionId: SESSION_ID,
      settlement: { ...runtimeSettlement(), text: "forged evidence" },
      store,
    }),
    { ok: false, reason: "invalid_settlement" }
  );
  assert.deepEqual(
    await ingestTranscriptRuntimeSettlement({
      requestSessionId: "660e8400-e29b-41d4-a716-446655440000",
      settlement: runtimeSettlement(),
      store,
    }),
    { ok: false, reason: "session_mismatch" }
  );
  assert.equal(calls, 0);
});

function runtimeSettlement(): TranscriptRuntimeSettlement {
  return {
    contract_version: 1,
    event_type: "runtime_settlement",
    session_id: SESSION_ID,
    room_name: "interview-room",
    writer_id: "writer-1",
    writer_generation: 1,
    state: "settled",
    settled_at: "2026-07-10T08:30:00.000Z",
  };
}

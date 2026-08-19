import assert from "node:assert/strict";
import test from "node:test";

import {
  readInterviewRuntimeLifecycle,
  type InterviewRuntimeLifecycleStore,
  type RuntimeLifecycleRead,
} from "./read-interview-runtime-lifecycle";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

test("runtime lifecycle read returns only the current writer-bound snapshot", async () => {
  const request = lifecycleRead();
  const store: InterviewRuntimeLifecycleStore = {
    async read(value) {
      return {
        ok: true,
        snapshot: {
          contract_version: "trusted-interview-lifecycle-snapshot.v1",
          session_id: value.session_id,
          room_name: value.room_name,
          writer_id: value.writer_id,
          writer_generation: value.writer_generation,
          state: "active",
          version: 7,
        },
      };
    },
  };

  assert.deepEqual(
    await readInterviewRuntimeLifecycle({
      requestSessionId: SESSION_ID,
      request,
      store,
    }),
    {
      ok: true,
      snapshot: {
        contract_version: "trusted-interview-lifecycle-snapshot.v1",
        session_id: SESSION_ID,
        room_name: "interview-room",
        writer_id: "writer-1",
        writer_generation: 3,
        state: "active",
        version: 7,
      },
    }
  );
});

test("runtime lifecycle read rejects malformed and cross-session input before storage", async () => {
  let calls = 0;
  const store: InterviewRuntimeLifecycleStore = {
    async read() {
      calls += 1;
      return { ok: false, reason: "not_found" };
    },
  };

  assert.deepEqual(
    await readInterviewRuntimeLifecycle({
      requestSessionId: SESSION_ID,
      request: { ...lifecycleRead(), transcript: "forbidden" },
      store,
    }),
    { ok: false, reason: "invalid_request" }
  );
  assert.deepEqual(
    await readInterviewRuntimeLifecycle({
      requestSessionId: "660e8400-e29b-41d4-a716-446655440000",
      request: lifecycleRead(),
      store,
    }),
    { ok: false, reason: "session_mismatch" }
  );
  assert.equal(calls, 0);
});

function lifecycleRead(): RuntimeLifecycleRead {
  return {
    contract_version: 1,
    event_type: "runtime_lifecycle_read",
    session_id: SESSION_ID,
    room_name: "interview-room",
    writer_id: "writer-1",
    writer_generation: 3,
  };
}

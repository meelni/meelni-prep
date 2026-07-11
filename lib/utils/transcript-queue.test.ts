import assert from "node:assert/strict";
import test from "node:test";

import { createTranscriptEvent } from "@meelni/agent";

import {
  clearTranscriptQueueStorage,
  getTranscriptQueue,
  TranscriptQueue,
} from "./transcript-queue";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";

test("concurrent duplicate saves share one event-ID request", async () => {
  const queue = boundQueue();
  let requests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json({ disposition: "created", turn: { id: "turn-1" } });
  };

  try {
    const input = request();
    const [first, replay] = await Promise.all([
      queue.save(input),
      queue.save(input),
    ]);
    assert.equal(requests, 1);
    assert.equal(first.success, true);
    assert.deepEqual(replay, first);
  } finally {
    queue.stop();
    globalThis.fetch = originalFetch;
  }
});

test("retryable failures remain queued until explicit settlement succeeds", async () => {
  const queue = boundQueue();
  let available = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    available
      ? Response.json({ disposition: "existing", turn: { id: "turn-1" } })
      : Response.json({ error: "unavailable" }, { status: 503 });

  try {
    const first = await queue.save(request());
    assert.equal(first.success, false);
    available = true;
    const settlement = await queue.flush("user-1", SESSION_ID, 1_000);
    assert.deepEqual(settlement, { settled: true, pending: 0, failed: 0 });
  } finally {
    queue.stop();
    globalThis.fetch = originalFetch;
  }
});

test("identity conflicts are permanent and block transcript settlement", async () => {
  const queue = boundQueue();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json(
      { error: "transcript_event_identity_conflict" },
      { status: 409 }
    );

  try {
    const result = await queue.save(request());
    assert.equal(result.success, false);
    const settlement = await queue.flush("user-1", SESSION_ID, 20);
    assert.equal(settlement.settled, false);
    assert.equal(settlement.pending, 0);
    assert.equal(settlement.failed, 1);
  } finally {
    queue.stop();
    globalThis.fetch = originalFetch;
  }
});

test("terminal session closure discards raw transcript content without blocking settlement", async () => {
  const storage = new MemoryStorage();
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  );
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  globalThis.fetch = async () =>
    Response.json({ error: "transcript_session_closed" }, { status: 409 });

  try {
    const queue = boundQueue();
    const result = await queue.save(request());
    assert.deepEqual(result, {
      success: false,
      error: "transcript_session_closed",
    });
    assert.deepEqual(await queue.flush("user-1", SESSION_ID, 20), {
      settled: true,
      pending: 0,
      failed: 0,
    });
    assert.doesNotMatch(
      storage.getItem("transcript_queue_v2") ?? "",
      /clarifying the goal/
    );
    queue.stop();
  } finally {
    globalThis.fetch = originalFetch;
    restoreGlobal("localStorage", originalStorage);
  }
});

test("restored events stay paused until owner binding filters account data", async () => {
  const storage = new MemoryStorage();
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  );
  const originalFetch = globalThis.fetch;
  let requests = 0;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  globalThis.fetch = async () => {
    requests += 1;
    return Response.json({ disposition: "created" });
  };
  storage.setItem(
    "transcript_queue_v2",
    JSON.stringify({
      items: [serializedQueueItem(request())],
      overflowedSessions: [],
    })
  );

  const queue = new TranscriptQueue();
  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(requests, 0);
    queue.bindOwner("user-2");
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(requests, 0);
    assert.equal(queue.getStatus().queueLength, 0);
  } finally {
    queue.stop();
    globalThis.fetch = originalFetch;
    restoreGlobal("localStorage", originalStorage);
  }
});

test("permanent failures survive reload and continue blocking settlement", async () => {
  const storage = new MemoryStorage();
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  );
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  storage.setItem(
    "transcript_queue_v2",
    JSON.stringify({
      items: [
        {
          ...serializedQueueItem(request()),
          error: "transcript_event_identity_conflict",
          permanent: true,
        },
      ],
      overflowedSessions: [],
    })
  );

  const queue = new TranscriptQueue();
  queue.bindOwner("user-1");
  try {
    const settlement = await queue.flush("user-1", SESSION_ID, 20);
    assert.deepEqual(settlement, { settled: false, pending: 0, failed: 1 });
    const persisted = storage.getItem("transcript_queue_v2") ?? "";
    assert.doesNotMatch(persisted, /clarifying the goal/);
    assert.match(persisted, /identity_conflict/);
  } finally {
    queue.stop();
    restoreGlobal("localStorage", originalStorage);
  }
});

test("expired retry entries are purged instead of retaining transcript text indefinitely", () => {
  const storage = new MemoryStorage();
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  );
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  storage.setItem(
    "transcript_queue_v2",
    JSON.stringify({
      items: [
        {
          ...serializedQueueItem(request()),
          enqueuedAt: "2020-01-01T00:00:00.000Z",
          lastAttempt: "2020-01-01T00:00:00.000Z",
        },
      ],
      overflowedSessions: [],
    })
  );

  try {
    const queue = new TranscriptQueue();
    assert.equal(queue.getStatus().queueLength, 0);
    assert.doesNotMatch(
      storage.getItem("transcript_queue_v2") ?? "",
      /clarifying the goal/
    );
    queue.stop();
  } finally {
    restoreGlobal("localStorage", originalStorage);
  }
});

test("an unresolved old-owner save cannot rebind or delete the new owner's queue", async () => {
  const storage = new MemoryStorage();
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  );
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  let resolveOldRequest!: (response: Response) => void;
  const oldRequest = new Promise<Response>((resolve) => {
    resolveOldRequest = resolve;
  });
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    if (requests === 1) return oldRequest;
    return Response.json({ error: "unavailable" }, { status: 503 });
  };

  const queue = boundQueue();
  try {
    const staleSave = queue.save(request());
    await new Promise((resolve) => setTimeout(resolve, 0));
    queue.bindOwner("user-2");
    queue.add(
      request({
        ownerId: "user-2",
        text: "New owner's private answer.",
        eventId: "writer-2:message-1",
      })
    );
    resolveOldRequest(Response.json({ error: "unavailable" }, { status: 503 }));

    assert.deepEqual(await staleSave, {
      success: false,
      error: "transcript_owner_changed",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const persisted = storage.getItem("transcript_queue_v2") ?? "";
    assert.match(persisted, /New owner's private answer/);
    assert.doesNotMatch(persisted, /clarifying the goal/);
    assert.equal(queue.getStatus().queueLength, 1);
  } finally {
    queue.stop();
    globalThis.fetch = originalFetch;
    restoreGlobal("localStorage", originalStorage);
  }
});

test("sign-out or deletion cleanup fences in-flight failure and stale callbacks", async () => {
  const storage = new MemoryStorage();
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  );
  const originalFetch = globalThis.fetch;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  let resolveRequest!: (response: Response) => void;
  globalThis.fetch = async () =>
    new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });

  const queue = getTranscriptQueue();
  queue.bindOwner("user-1");
  try {
    const inFlight = queue.save(request());
    await new Promise((resolve) => setTimeout(resolve, 0));
    clearTranscriptQueueStorage();
    resolveRequest(Response.json({ error: "unavailable" }, { status: 503 }));

    assert.deepEqual(await inFlight, {
      success: false,
      error: "transcript_owner_changed",
    });
    assert.equal(storage.getItem("transcript_queue_v2"), null);

    let staleRequests = 0;
    globalThis.fetch = async () => {
      staleRequests += 1;
      return Response.json({ error: "unavailable" }, { status: 503 });
    };
    assert.deepEqual(await queue.save(request()), {
      success: false,
      error: "transcript_owner_changed",
    });
    assert.equal(staleRequests, 0);
    assert.equal(storage.getItem("transcript_queue_v2"), null);
  } finally {
    queue.stop();
    globalThis.fetch = originalFetch;
    restoreGlobal("localStorage", originalStorage);
  }
});

function request(
  overrides: { ownerId?: string; text?: string; eventId?: string } = {}
) {
  const ownerId = overrides.ownerId ?? "user-1";
  return {
    ownerId,
    sessionId: SESSION_ID,
    event: createTranscriptEvent({
      event_id: overrides.eventId ?? "writer-1:message-1",
      writer_id: "writer-1",
      sequence: 1,
      session_id: SESSION_ID,
      room_name: "interview-room",
      speaker: "user",
      text: overrides.text ?? "I would begin by clarifying the goal.",
      started_at: "2026-07-10T05:00:00.000Z",
      ended_at: "2026-07-10T05:00:04.000Z",
      audio_duration_ms: 4_000,
      section: "product_sense",
      delivery_state: "delivered",
    }),
  };
}

function serializedQueueItem(value: ReturnType<typeof request>) {
  return {
    id: `${value.ownerId}:${value.sessionId}:${value.event.event_id}`,
    request: value,
    attemptCount: 1,
    enqueuedAt: "2026-07-10T05:00:05.000Z",
    lastAttempt: "2026-07-10T05:00:05.000Z",
  };
}

function boundQueue(ownerId = "user-1") {
  const queue = new TranscriptQueue();
  queue.bindOwner(ownerId);
  return queue;
}

function restoreGlobal(
  key: string,
  descriptor: PropertyDescriptor | undefined
) {
  if (descriptor) Object.defineProperty(globalThis, key, descriptor);
  else Reflect.deleteProperty(globalThis, key);
}

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

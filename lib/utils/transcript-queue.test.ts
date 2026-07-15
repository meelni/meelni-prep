import assert from "node:assert/strict";
import test from "node:test";

import { createTranscriptEvent } from "@meelni/agent";

import {
  clearTranscriptQueueStorage,
  getTranscriptQueue,
  TranscriptQueue,
} from "./transcript-queue";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const SECOND_SESSION_ID = "550e8400-e29b-41d4-a716-446655440001";

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

test("a hung retry in session A cannot head-of-line block session B flush", async () => {
  const queue = boundQueue();
  const originalFetch = globalThis.fetch;
  const requestedSessions: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { sessionId: string };
    requestedSessions.push(body.sessionId);
    if (body.sessionId === SESSION_ID) return new Promise<Response>(() => {});
    return Response.json({ disposition: "created" });
  };

  try {
    assert.equal(queue.add(request()), true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(queue.add(request({ sessionId: SECOND_SESSION_ID })), true);

    assert.deepEqual(await queue.flush("user-1", SECOND_SESSION_ID, 1_000), {
      settled: true,
      pending: 0,
      failed: 0,
    });
    assert.ok(requestedSessions.includes(SESSION_ID));
    assert.ok(requestedSessions.includes(SECOND_SESSION_ID));
    assert.equal(queue.getStatus().queueLength, 1);
  } finally {
    queue.clearSession("user-1", SESSION_ID);
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

test("legacy overflow markers migrate to timestamped bounded state and expired markers are pruned", () => {
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
      items: [],
      overflowedSessions: Array.from(
        { length: 1_005 },
        (_, index) => `user-1:legacy-session-${index}`
      ),
      overflowMarkers: [
        {
          id: `user-1:${SECOND_SESSION_ID}`,
          recordedAt: "2020-01-01T00:00:00.000Z",
        },
      ],
    })
  );

  try {
    const queue = new TranscriptQueue();
    queue.bindOwner("user-1");
    queue.stop();
    assert.equal(queue.getStatus().failed, 1_000);
    const persisted = JSON.parse(
      storage.getItem("transcript_queue_v2") ?? "{}"
    ) as {
      overflowedSessions?: string[];
      overflowMarkers?: Array<{ id: string; recordedAt: string }>;
    };
    assert.equal(persisted.overflowedSessions, undefined);
    assert.equal(persisted.overflowMarkers?.length, 1_000);
    assert.ok(
      persisted.overflowMarkers?.every((marker) =>
        Number.isFinite(new Date(marker.recordedAt).getTime())
      )
    );
    assert.equal(
      persisted.overflowMarkers?.some(
        (marker) => marker.id === `user-1:${SECOND_SESSION_ID}`
      ),
      false
    );
  } finally {
    restoreGlobal("localStorage", originalStorage);
  }
});

test("malformed storage is deleted instead of retaining unknown raw text", () => {
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
    '{"items":[{"raw":"private malformed transcript"}]'
  );

  try {
    const queue = new TranscriptQueue();
    assert.equal(queue.getStatus().queueLength, 0);
    assert.equal(storage.getItem("transcript_queue_v2"), null);
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

test("two queue instances retain disjoint events across canonical clobber and honor cross-instance removal", async () => {
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
    Response.json({ error: "unavailable" }, { status: 503 });

  const first = new TranscriptQueue();
  const second = new TranscriptQueue();
  first.bindOwner("user-1");
  second.bindOwner("user-1");
  first.stop();
  second.stop();
  try {
    const firstEvent = request({
      eventId: "writer-1:message-a",
      text: "Private event from tab A.",
    });
    const secondEvent = request({
      sessionId: SECOND_SESSION_ID,
      eventId: "writer-1:message-b",
      text: "Private event from tab B.",
    });
    assert.equal(first.add(firstEvent), true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(second.add(secondEvent), true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const clobbered = JSON.parse(
      storage.getItem("transcript_queue_v2") ?? "{}"
    ) as { items: Array<{ id: string }> };
    clobbered.items = clobbered.items.filter(
      (item) => item.id === queueItemId(secondEvent)
    );
    storage.setItem("transcript_queue_v2", JSON.stringify(clobbered));

    const restored = new TranscriptQueue();
    restored.stop();
    assert.equal(restored.getStatus().queueLength, 2);

    first.clearSession("user-1", SESSION_ID);
    second.add(
      request({
        sessionId: SECOND_SESSION_ID,
        eventId: "writer-1:message-c",
        text: "A later private event from tab B.",
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const afterRemoval = new TranscriptQueue();
    afterRemoval.stop();
    assert.equal(afterRemoval.getStatus().queueLength, 2);
    const reconciled = storage.getItem("transcript_queue_v2") ?? "";
    assert.doesNotMatch(reconciled, /Private event from tab A/);
    assert.match(reconciled, /Private event from tab B/);
    assert.match(reconciled, /A later private event from tab B/);
  } finally {
    first.stop();
    second.stop();
    globalThis.fetch = originalFetch;
    restoreGlobal("localStorage", originalStorage);
  }
});

test("writer shards keep many maximum-size events within bounded storage amplification", async () => {
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
    Response.json({ error: "unavailable" }, { status: 503 });

  const queues = Array.from({ length: 64 }, () => new TranscriptQueue());
  try {
    for (const queue of queues) {
      queue.bindOwner("user-1");
      queue.stop();
    }
    for (const [index, queue] of queues.entries()) {
      assert.equal(
        queue.add(
          request({
            eventId: `writer-${index}:message-${index}`,
            text: "x".repeat(10_000),
          })
        ),
        true
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    const canonicalBytes = byteLength(
      storage.getItem("transcript_queue_v2") ?? ""
    );
    const shardBytes = storage
      .entries()
      .filter(([key]) => key.startsWith("transcript_queue_v2:writer:"))
      .reduce((total, [, value]) => total + byteLength(value), 0);
    const totalBytes = storage
      .entries()
      .reduce(
        (total, [key, value]) => total + byteLength(key) + byteLength(value),
        0
      );

    assert.equal(
      storage
        .entries()
        .filter(([key]) => key.startsWith("transcript_queue_v2:writer:"))
        .length,
      64
    );
    assert.ok(canonicalBytes > 600_000);
    assert.ok(
      shardBytes <= canonicalBytes * 1.15,
      `writer shards amplified ${shardBytes} bytes over ${canonicalBytes} canonical bytes`
    );
    assert.ok(
      totalBytes <= canonicalBytes * 2.2,
      `total storage amplified ${totalBytes} bytes over ${canonicalBytes} canonical bytes`
    );

    const restored = new TranscriptQueue();
    restored.stop();
    assert.equal(restored.getStatus().queueLength, 64);
  } finally {
    for (const queue of queues) queue.stop();
    globalThis.fetch = originalFetch;
    restoreGlobal("localStorage", originalStorage);
  }
});

test("quota failures cannot claim retry durability from add or save", async () => {
  const storage = new QuotaStorage();
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  );
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  globalThis.fetch = async () =>
    Response.json({ error: "unavailable" }, { status: 503 });
  console.error = () => undefined;

  const queue = boundQueue();
  queue.stop();
  storage.rejectWrites = true;
  try {
    const added = request({
      eventId: "writer-1:quota-add",
      text: "Private quota add payload.",
    });
    assert.equal(queue.add(added), false);
    assert.equal(queue.getStatus().queueLength, 0);
    assert.deepEqual(await queue.flush("user-1", SESSION_ID, 20), {
      settled: false,
      pending: 0,
      failed: 1,
    });

    const saved = request({
      eventId: "writer-1:quota-save",
      text: "Private quota save payload.",
    });
    assert.deepEqual(await queue.save(saved), {
      success: false,
      error: "transcript_retry_queue_unavailable",
    });
    assert.equal(queue.getStatus().queueLength, 0);
    assert.doesNotMatch(
      storage
        .entries()
        .map(([, value]) => value)
        .join("\n"),
      /Private quota (add|save) payload/
    );
  } finally {
    storage.rejectWrites = false;
    queue.stop();
    console.error = originalConsoleError;
    globalThis.fetch = originalFetch;
    restoreGlobal("localStorage", originalStorage);
  }
});

test("quota during a permanent-failure transition preserves the prior durable retry", async () => {
  const storage = new QuotaStorage();
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage"
  );
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  const durableRequest = request({ eventId: "writer-1:durable-before-quota" });
  storage.setItem(
    "transcript_queue_v2",
    JSON.stringify({
      items: [serializedQueueItem(durableRequest)],
      generation: 0,
      ownerId: "user-1",
      revision: 1,
    })
  );
  storage.setItem(
    "transcript_queue_v2:generation",
    JSON.stringify({ generation: 0, ownerId: "user-1" })
  );
  globalThis.fetch = async () =>
    Response.json({ error: "unavailable" }, { status: 503 });
  console.error = () => undefined;

  const queue = boundQueue();
  queue.stop();
  storage.rejectWrites = true;
  globalThis.fetch = async () =>
    Response.json(
      { error: "transcript_event_identity_conflict" },
      { status: 409 }
    );
  try {
    assert.deepEqual(await queue.save(durableRequest), {
      success: false,
      error: "identity_conflict",
    });
    assert.deepEqual(queue.getStatus(), {
      queueLength: 0,
      isProcessing: false,
      failed: 1,
    });

    storage.rejectWrites = false;
    const restored = new TranscriptQueue();
    restored.stop();
    assert.equal(restored.getStatus().queueLength, 1);
    assert.equal(restored.getStatus().failed, 0);
  } finally {
    storage.rejectWrites = false;
    queue.stop();
    console.error = originalConsoleError;
    globalThis.fetch = originalFetch;
    restoreGlobal("localStorage", originalStorage);
  }
});

test("a never-resolving old-owner retry cannot block a new owner's flush", async () => {
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
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    if (requests === 1) return new Promise<Response>(() => {});
    return Response.json({ disposition: "created" });
  };

  const queue = boundQueue();
  try {
    queue.add(request());
    await new Promise((resolve) => setTimeout(resolve, 0));
    queue.bindOwner("user-2");
    queue.add(
      request({
        ownerId: "user-2",
        text: "New owner's durable answer.",
        eventId: "writer-2:message-1",
      })
    );

    assert.deepEqual(await queue.flush("user-2", SESSION_ID, 1_000), {
      settled: true,
      pending: 0,
      failed: 0,
    });
    assert.equal(requests, 2);
    const persisted = storage.getItem("transcript_queue_v2") ?? "";
    assert.doesNotMatch(persisted, /clarifying the goal/);
    assert.doesNotMatch(persisted, /New owner's durable answer/);
  } finally {
    queue.stop();
    globalThis.fetch = originalFetch;
    restoreGlobal("localStorage", originalStorage);
  }
});

test("flush returns at its deadline when the current request never resolves", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Promise<Response>(() => {});
  const queue = boundQueue();

  try {
    queue.add(request());
    const startedAt = Date.now();
    const settlement = await queue.flush("user-1", SESSION_ID, 30);
    const elapsedMs = Date.now() - startedAt;

    assert.equal(settlement.settled, false);
    assert.equal(settlement.pending, 1);
    assert.ok(elapsedMs >= 20, `flush returned too early after ${elapsedMs}ms`);
    assert.ok(elapsedMs < 250, `flush exceeded its deadline: ${elapsedMs}ms`);
  } finally {
    queue.clearSession("user-1", SESSION_ID);
    queue.stop();
    globalThis.fetch = originalFetch;
  }
});

test("terminal cleanup detaches a hung retry before the owner's next session", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    if (requests === 1) return new Promise<Response>(() => {});
    return Response.json({ disposition: "created" });
  };

  const queue = boundQueue();
  try {
    queue.add(request());
    await new Promise((resolve) => setTimeout(resolve, 0));
    queue.clearSession("user-1", SESSION_ID);
    queue.add(request({ sessionId: SECOND_SESSION_ID }));

    assert.deepEqual(await queue.flush("user-1", SECOND_SESSION_ID, 1_000), {
      settled: true,
      pending: 0,
      failed: 0,
    });
    assert.equal(requests, 2);
  } finally {
    queue.stop();
    globalThis.fetch = originalFetch;
  }
});

test("clearing one session does not abort another session's direct save", async () => {
  const originalFetch = globalThis.fetch;
  let resolveFirst!: (response: Response) => void;
  let resolveSecond!: (response: Response) => void;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Promise<Response>((resolve) => {
      if (requests === 1) resolveFirst = resolve;
      else resolveSecond = resolve;
    });
  };
  const queue = boundQueue();

  try {
    const first = queue.save(request());
    const second = queue.save(request({ sessionId: SECOND_SESSION_ID }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    queue.clearSession("user-1", SESSION_ID);

    resolveSecond(Response.json({ disposition: "created" }));
    assert.deepEqual(await second, {
      success: true,
      disposition: "created",
      turn: undefined,
    });
    assert.equal(queue.getStatus().queueLength, 0);

    resolveFirst(Response.json({ disposition: "created" }));
    assert.deepEqual(await first, {
      success: false,
      error: "transcript_owner_changed",
    });
  } finally {
    queue.stop();
    globalThis.fetch = originalFetch;
  }
});

test("an old owner's successful response is generation-fenced", async () => {
  const originalFetch = globalThis.fetch;
  let resolveRequest!: (response: Response) => void;
  globalThis.fetch = async () =>
    new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    });
  const queue = boundQueue();

  try {
    const stale = queue.save(request());
    await new Promise((resolve) => setTimeout(resolve, 0));
    queue.bindOwner("user-2");
    resolveRequest(Response.json({ disposition: "created" }));

    assert.deepEqual(await stale, {
      success: false,
      error: "transcript_owner_changed",
    });
  } finally {
    queue.stop();
    globalThis.fetch = originalFetch;
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
  const staleTab = new TranscriptQueue();
  staleTab.bindOwner("user-1");
  staleTab.stop();
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
    assert.equal(
      staleTab.add(
        request({
          eventId: "writer-1:stale-after-clear",
          text: "This stale-tab event must never be restored.",
        })
      ),
      false
    );

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
    assert.doesNotMatch(
      [...Array(storage.length)]
        .map((_, index) => {
          const key = storage.key(index);
          return key ? (storage.getItem(key) ?? "") : "";
        })
        .join("\n"),
      /This stale-tab event must never be restored/
    );
  } finally {
    staleTab.stop();
    queue.stop();
    globalThis.fetch = originalFetch;
    restoreGlobal("localStorage", originalStorage);
  }
});

function request(
  overrides: {
    ownerId?: string;
    sessionId?: string;
    text?: string;
    eventId?: string;
  } = {}
) {
  const ownerId = overrides.ownerId ?? "user-1";
  const sessionId = overrides.sessionId ?? SESSION_ID;
  return {
    ownerId,
    sessionId,
    event: createTranscriptEvent({
      event_id: overrides.eventId ?? "writer-1:message-1",
      writer_id: "writer-1",
      sequence: 1,
      session_id: sessionId,
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
  const queuedAt = new Date().toISOString();
  return {
    id: `${value.ownerId}:${value.sessionId}:${value.event.event_id}`,
    request: value,
    attemptCount: 1,
    enqueuedAt: queuedAt,
    lastAttempt: queuedAt,
  };
}

function queueItemId(value: ReturnType<typeof request>) {
  return `${value.ownerId}:${value.sessionId}:${value.event.event_id}`;
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

  entries() {
    return [...this.values.entries()];
  }
}

class QuotaStorage extends MemoryStorage {
  rejectWrites = false;

  override setItem(key: string, value: string) {
    if (this.rejectWrites)
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    super.setItem(key, value);
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

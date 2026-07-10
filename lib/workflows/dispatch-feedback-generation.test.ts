import assert from "node:assert/strict";
import test from "node:test";

import type {
  FeedbackDispatchRecord,
  FeedbackDispatchStore,
} from "@/lib/db/feedback-dispatch";
import { feedbackGenerationEventId } from "@/lib/db/feedback-event-id";
import {
  dispatchFeedbackGenerationWorkflow,
  type DispatchFeedbackGenerationDeps,
} from "./dispatch-feedback-generation";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const INITIAL_EVENT_ID = feedbackGenerationEventId(SESSION_ID, 0);
const EVENT_ID = feedbackGenerationEventId(SESSION_ID, 1);
const RETRY_EVENT_ID = feedbackGenerationEventId(SESSION_ID, 2);
const NOW = new Date("2026-07-09T22:00:00.000Z");

test("concurrent dispatch attempts accept one claim and one send", async () => {
  const store = createMemoryStore();
  let sends = 0;
  const deps = createDeps(store, async () => {
    sends += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
  });

  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      dispatchFeedbackGenerationWorkflow(
        { sessionId: SESSION_ID, userId: "user-1", tier: "full" },
        deps
      )
    )
  );

  assert.equal(sends, 1);
  assert.equal(
    results.filter((result) => result.disposition === "sent").length,
    1
  );
  assert.ok(
    results.every((result) =>
      ["sent", "already_sent", "in_progress"].includes(result.disposition)
    )
  );
  assert.equal((await store.get(SESSION_ID))?.status, "sent");
});

test("failed send remains retryable with a unique event identity per attempt", async () => {
  const store = createMemoryStore();
  const sentIds: string[] = [];
  const failed = await dispatchFeedbackGenerationWorkflow(
    { sessionId: SESSION_ID, userId: "user-1", tier: "partial" },
    createDeps(store, async (event) => {
      sentIds.push(event.id);
      throw new Error("provider unavailable");
    })
  );
  assert.equal(failed.disposition, "failed");
  assert.equal((await store.get(SESSION_ID))?.status, "failed");

  const retried = await dispatchFeedbackGenerationWorkflow(
    { sessionId: SESSION_ID, userId: "user-1", tier: "partial" },
    createDeps(store, async (event) => {
      sentIds.push(event.id);
    })
  );
  assert.equal(retried.disposition, "sent");
  assert.deepEqual(sentIds, [EVENT_ID, RETRY_EVENT_ID]);
  assert.equal((await store.get(SESSION_ID))?.attempts, 2);
});

test("an already sent dispatch is idempotent", async () => {
  const store = createMemoryStore({ status: "sent", attempts: 1 });
  let sends = 0;
  const result = await dispatchFeedbackGenerationWorkflow(
    { sessionId: SESSION_ID, userId: "user-1", tier: "full" },
    createDeps(store, async () => {
      sends += 1;
    })
  );

  assert.equal(result.disposition, "already_sent");
  assert.equal(sends, 0);
});

test("a stale sender reports the newer fenced claim instead of sent", async () => {
  const store = createMemoryStore();
  const result = await dispatchFeedbackGenerationWorkflow(
    { sessionId: SESSION_ID, userId: "user-1", tier: "full" },
    createDeps(store, async () => {
      assert.equal(
        await store.markFailed({
          sessionId: SESSION_ID,
          eventId: EVENT_ID,
          attempt: 1,
          errorCode: "lease_expired",
        }),
        true
      );
      const newer = await store.claim({
        sessionId: SESSION_ID,
        now: new Date(NOW.getTime() + 1_000),
        staleBefore: new Date(NOW.getTime() - 119_000),
      });
      assert.equal(newer?.attempts, 2);
    })
  );

  assert.equal(result.disposition, "in_progress");
  assert.equal(result.dispatch?.attempts, 2);
  assert.equal(result.dispatch?.status, "sending");
});

test("a corrupt claim without an event identity fails immediately", async () => {
  const store = createMemoryStore({ eventId: null }, false);
  let sends = 0;

  const result = await dispatchFeedbackGenerationWorkflow(
    { sessionId: SESSION_ID, userId: "user-1", tier: "full" },
    createDeps(store, async () => {
      sends += 1;
    })
  );

  assert.equal(result.disposition, "failed");
  assert.equal(result.dispatch?.eventId, null);
  assert.equal((await store.get(SESSION_ID))?.status, "failed");
  assert.equal(sends, 0);
});

function createDeps(
  store: FeedbackDispatchStore,
  send: DispatchFeedbackGenerationDeps["send"]
): DispatchFeedbackGenerationDeps {
  return { store, send, now: () => NOW };
}

function createMemoryStore(
  overrides: Partial<FeedbackDispatchRecord> = {},
  assignAttemptEventId = true
): FeedbackDispatchStore {
  let current: FeedbackDispatchRecord = {
    sessionId: SESSION_ID,
    eventId: INITIAL_EVENT_ID,
    status: "pending",
    attempts: 0,
    claimedAt: null,
    dispatchedAt: null,
    ...overrides,
  };

  return {
    get: async () => ({ ...current }),
    claim: async ({ now, staleBefore }) => {
      const claimable =
        current.status === "pending" ||
        current.status === "failed" ||
        (current.status === "sending" &&
          current.claimedAt !== null &&
          current.claimedAt < staleBefore);
      if (!claimable) return null;
      current = {
        ...current,
        status: "sending",
        attempts: current.attempts + 1,
        eventId: assignAttemptEventId
          ? feedbackGenerationEventId(SESSION_ID, current.attempts + 1)
          : current.eventId,
        claimedAt: now,
      };
      return { ...current };
    },
    markSent: async ({ eventId, attempt, now }) => {
      if (
        current.status !== "sending" ||
        current.eventId !== eventId ||
        current.attempts !== attempt
      ) {
        return false;
      }
      current = { ...current, status: "sent", dispatchedAt: now };
      return true;
    },
    markFailed: async ({ eventId, attempt }) => {
      if (
        current.status !== "sending" ||
        current.eventId !== eventId ||
        current.attempts !== attempt
      ) {
        return false;
      }
      current = { ...current, status: "failed" };
      return true;
    },
  };
}

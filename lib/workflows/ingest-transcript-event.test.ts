import assert from "node:assert/strict";
import test from "node:test";

import { createTranscriptEvent, type TranscriptEvent } from "@meelni/agent";

import {
  compareTranscriptOrdering,
  ingestTranscriptEvent,
  isTranscriptEventWithinSessionWindow,
  isTimestampWithinSessionWindow,
  type TranscriptIngestStore,
} from "./ingest-transcript-event";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_SESSION_ID = "660e8400-e29b-41d4-a716-446655440000";
const USER_ID = "user-1";
const ROOM_NAME = "interview-room";

test("duplicate transcript delivery returns the existing durable turn", async () => {
  const store = createMemoryStore();
  const event = transcriptEvent();

  const first = await ingest(store, event);
  const replay = await ingest(store, event);

  assert.equal(first.ok && first.disposition, "created");
  assert.equal(replay.ok && replay.disposition, "existing");
  assert.equal(store.events.size, 1);
});

test("identical text remains distinct when canonical event identity differs", async () => {
  const store = createMemoryStore();
  const first = transcriptEvent();
  const second = transcriptEvent({
    event_id: "writer-1:message-2",
    sequence: 2,
    started_at: "2026-07-10T05:00:05.000Z",
    ended_at: "2026-07-10T05:00:09.000Z",
  });

  assert.equal((await ingest(store, first)).ok, true);
  assert.equal((await ingest(store, second)).ok, true);
  assert.equal(store.events.size, 2);
  assert.deepEqual(
    [...store.events.values()].map((event) => event.text),
    [first.text, first.text]
  );
});

test("out-of-order arrivals use the complete durable ordering contract", () => {
  const turns = [
    {
      timestamp: new Date("2026-07-10T05:00:05.000Z"),
      writerGeneration: 1,
      writerId: "writer-z",
      sequence: 2,
      eventId: "event-3",
      rowId: "row-d",
    },
    {
      timestamp: new Date("2026-07-10T05:00:00.000Z"),
      writerGeneration: 2,
      writerId: "writer-a",
      sequence: 1,
      eventId: "event-2",
      rowId: "row-c",
    },
    {
      timestamp: new Date("2026-07-10T05:00:00.000Z"),
      writerGeneration: 1,
      writerId: "writer-z",
      sequence: 1,
      eventId: "event-1",
      rowId: "row-b",
    },
    {
      timestamp: new Date("2026-07-10T05:00:00.000Z"),
      writerGeneration: 1,
      writerId: "writer-z",
      sequence: 1,
      eventId: "event-1",
      rowId: "row-a",
    },
  ];

  turns.sort(compareTranscriptOrdering);
  assert.deepEqual(
    turns.map((turn) => turn.rowId),
    ["row-a", "row-b", "row-c", "row-d"]
  );
});

test("canonical timing must stay inside the server-owned session window", () => {
  const window = {
    startedAt: new Date("2026-07-10T05:00:00.000Z"),
    deadlineAt: new Date("2026-07-10T05:30:00.000Z"),
  };

  assert.equal(
    isTranscriptEventWithinSessionWindow(transcriptEvent(), window),
    true
  );
  assert.equal(
    isTranscriptEventWithinSessionWindow(
      transcriptEvent({
        started_at: "2026-07-10T04:59:59.999Z",
        ended_at: "2026-07-10T05:00:03.999Z",
      }),
      window
    ),
    false
  );
  assert.equal(
    isTranscriptEventWithinSessionWindow(
      transcriptEvent({
        started_at: "2026-07-10T05:29:56.001Z",
        ended_at: "2026-07-10T05:30:00.001Z",
      }),
      window
    ),
    false
  );
  assert.equal(
    isTimestampWithinSessionWindow("2026-07-10T05:00:00.000Z", window),
    true
  );
  assert.equal(
    isTimestampWithinSessionWindow("2026-07-10T05:30:00.000Z", window),
    true
  );
  assert.equal(
    isTimestampWithinSessionWindow("2026-07-10T05:30:00.001Z", window),
    false
  );
  assert.equal(isTimestampWithinSessionWindow("not-a-date", window), false);
});

test("same-writer timestamp inversions fail instead of violating sequence order", async () => {
  const store = createMemoryStore();
  assert.equal(
    (
      await ingest(
        store,
        transcriptEvent({
          event_id: "writer-1:message-2",
          sequence: 2,
          started_at: "2026-07-10T05:00:05.000Z",
          ended_at: "2026-07-10T05:00:09.000Z",
        })
      )
    ).ok,
    true
  );

  const inverted = await ingest(
    store,
    transcriptEvent({
      started_at: "2026-07-10T05:00:06.000Z",
      ended_at: "2026-07-10T05:00:10.000Z",
    })
  );
  assert.deepEqual(inverted, { ok: false, reason: "writer_order_conflict" });
});

test("malformed and mismatched-session events fail before persistence", async () => {
  const store = createMemoryStore();
  const malformed = await ingestTranscriptEvent({
    requestSessionId: SESSION_ID,
    principal: { kind: "authenticated_user", userId: USER_ID },
    event: { ...transcriptEvent(), is_final: false },
    store,
  });
  const mismatched = await ingestTranscriptEvent({
    requestSessionId: OTHER_SESSION_ID,
    principal: { kind: "authenticated_user", userId: USER_ID },
    event: transcriptEvent(),
    store,
  });

  assert.deepEqual(malformed, { ok: false, reason: "invalid_event" });
  assert.deepEqual(mismatched, { ok: false, reason: "session_mismatch" });
  assert.equal(store.events.size, 0);
});

test("ownership and room correlation fail without exposing session existence", async () => {
  const store = createMemoryStore();
  const wrongUser = await ingestTranscriptEvent({
    requestSessionId: SESSION_ID,
    principal: { kind: "authenticated_user", userId: "other-user" },
    event: transcriptEvent(),
    store,
  });
  const wrongRoom = await ingest(
    store,
    transcriptEvent({ room_name: "other-room" })
  );

  assert.deepEqual(wrongUser, { ok: false, reason: "not_found" });
  assert.deepEqual(wrongRoom, { ok: false, reason: "room_mismatch" });
  assert.equal(store.events.size, 0);
});

test("event IDs are globally unique and writer sequence collisions fail closed", async () => {
  const store = createMemoryStore();
  assert.equal((await ingest(store, transcriptEvent())).ok, true);

  const crossSession = await ingestTranscriptEvent({
    requestSessionId: OTHER_SESSION_ID,
    principal: { kind: "authenticated_user", userId: USER_ID },
    event: transcriptEvent({
      session_id: OTHER_SESSION_ID,
      room_name: "other-session-room",
    }),
    store,
  });
  const sequenceCollision = await ingest(
    store,
    transcriptEvent({ event_id: "different-event-id" })
  );

  assert.deepEqual(crossSession, { ok: false, reason: "event_conflict" });
  assert.deepEqual(sequenceCollision, {
    ok: false,
    reason: "writer_sequence_conflict",
  });
});

test("ending closes distinct writes while preserving an exact replay", async () => {
  const store = createMemoryStore();
  const event = transcriptEvent();
  assert.equal((await ingest(store, event)).ok, true);
  store.sessions.get(SESSION_ID)!.lifecycleState = "ending";

  const replay = await ingest(store, event);
  const distinct = await ingest(
    store,
    transcriptEvent({
      event_id: "writer-1:message-2",
      sequence: 2,
      started_at: "2026-07-10T05:00:05.000Z",
      ended_at: "2026-07-10T05:00:09.000Z",
    })
  );

  assert.equal(replay.ok && replay.disposition, "existing");
  assert.deepEqual(distinct, { ok: false, reason: "session_closed" });
});

function transcriptEvent(
  overrides: Partial<TranscriptEvent> = {}
): TranscriptEvent {
  return createTranscriptEvent({
    event_id: "writer-1:message-1",
    writer_id: "writer-1",
    writer_generation: 1,
    sequence: 1,
    session_id: SESSION_ID,
    room_name: ROOM_NAME,
    speaker: "user",
    text: "I would begin by clarifying the goal.",
    started_at: "2026-07-10T05:00:00.000Z",
    ended_at: "2026-07-10T05:00:04.000Z",
    audio_duration_ms: 4_000,
    section: "product_sense",
    delivery_state: "delivered",
    ...overrides,
  });
}

type MemoryStore = ReturnType<typeof createMemoryStore>;

function ingest(store: MemoryStore, event: TranscriptEvent) {
  return ingestTranscriptEvent({
    requestSessionId: SESSION_ID,
    principal: { kind: "authenticated_user", userId: USER_ID },
    event,
    store,
  });
}

function createMemoryStore() {
  const events = new Map<string, TranscriptEvent>();
  const writerSequences = new Map<string, string>();
  const sessions = new Map([
    [
      SESSION_ID,
      { userId: USER_ID, roomName: ROOM_NAME, lifecycleState: "active" },
    ],
    [
      OTHER_SESSION_ID,
      {
        userId: USER_ID,
        roomName: "other-session-room",
        lifecycleState: "active",
      },
    ],
  ]);

  const store: TranscriptIngestStore<TranscriptEvent> & {
    events: typeof events;
    sessions: typeof sessions;
  } = {
    events,
    sessions,
    async persist({ principal, event }) {
      const session = sessions.get(event.session_id);
      if (
        !session ||
        (principal.kind === "authenticated_user" &&
          session.userId !== principal.userId)
      ) {
        return { ok: false, reason: "not_found" };
      }
      if (session.roomName !== event.room_name) {
        return { ok: false, reason: "room_mismatch" };
      }

      const existing = events.get(event.event_id);
      if (existing) {
        return JSON.stringify(existing) === JSON.stringify(event)
          ? { ok: true, disposition: "existing", turn: existing }
          : { ok: false, reason: "event_conflict" };
      }

      if (session.lifecycleState === "ending") {
        return { ok: false, reason: "session_closed" };
      }

      const writerKey = `${event.session_id}:${event.writer_id}:${event.sequence}`;
      if (writerSequences.has(writerKey)) {
        return { ok: false, reason: "writer_sequence_conflict" };
      }
      const sameWriterEvents = [...events.values()].filter(
        (stored) =>
          stored.session_id === event.session_id &&
          stored.writer_id === event.writer_id
      );
      const eventStartedAt = Date.parse(event.started_at);
      if (
        sameWriterEvents.some(
          (stored) =>
            (stored.sequence < event.sequence &&
              Date.parse(stored.started_at) > eventStartedAt) ||
            (stored.sequence > event.sequence &&
              Date.parse(stored.started_at) < eventStartedAt)
        )
      ) {
        return { ok: false, reason: "writer_order_conflict" };
      }
      events.set(event.event_id, event);
      writerSequences.set(writerKey, event.event_id);
      return { ok: true, disposition: "created", turn: event };
    },
  };
  return store;
}

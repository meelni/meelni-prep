import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeFrozenFeedbackTranscriptDisplayResponse,
  projectFrozenFeedbackTranscriptDisplayTurns,
} from "./frozen-feedback-transcript-display";

const ROW = {
  id: "650e8400-e29b-41d4-a716-446655440000",
  eventId: "synthetic-writer:1",
  speaker: "user",
  text: "A finalized synthetic answer.",
  startedAt: new Date("2026-08-14T12:00:00.000Z"),
  writerId: "server-only-writer",
  writerGeneration: 2,
  sequence: 1,
  contractVersion: 2,
  deliveryState: "delivered",
  endedAt: new Date("2026-08-14T12:00:01.000Z"),
  audioMs: 1_000,
  section: "answer",
};

test("projects only display-safe frozen transcript fields", () => {
  assert.deepEqual(projectFrozenFeedbackTranscriptDisplayTurns([ROW]), [
    {
      id: ROW.id,
      eventId: ROW.eventId,
      speaker: "user",
      text: ROW.text,
      startedAt: ROW.startedAt.toISOString(),
    },
  ]);
});

test("preserves distinct terminal legacy rows without canonical event IDs", () => {
  assert.deepEqual(
    projectFrozenFeedbackTranscriptDisplayTurns([
      { ...ROW, id: "650e8400-e29b-41d4-a716-446655440001", eventId: null },
      { ...ROW, id: "650e8400-e29b-41d4-a716-446655440002", eventId: null },
    ]),
    [
      {
        id: "650e8400-e29b-41d4-a716-446655440001",
        speaker: "user",
        text: ROW.text,
        startedAt: ROW.startedAt.toISOString(),
      },
      {
        id: "650e8400-e29b-41d4-a716-446655440002",
        speaker: "user",
        text: ROW.text,
        startedAt: ROW.startedAt.toISOString(),
      },
    ]
  );
});

test("requires stable unique opaque row identities", () => {
  assert.equal(
    projectFrozenFeedbackTranscriptDisplayTurns([ROW, { ...ROW }]),
    null
  );
  assert.equal(
    projectFrozenFeedbackTranscriptDisplayTurns([{ ...ROW, id: "writer:1" }]),
    null
  );
});

test("client decoder rejects internal fields and malformed timestamps", () => {
  const response = {
    scope: "frozen",
    turns: [
      {
        id: ROW.id,
        eventId: ROW.eventId,
        speaker: ROW.speaker,
        text: ROW.text,
        startedAt: ROW.startedAt.toISOString(),
      },
    ],
  };
  assert.deepEqual(
    decodeFrozenFeedbackTranscriptDisplayResponse(response),
    response
  );
  assert.equal(
    decodeFrozenFeedbackTranscriptDisplayResponse({
      ...response,
      turns: [{ ...response.turns[0], writerGeneration: 2 }],
    }),
    null
  );
  assert.equal(
    decodeFrozenFeedbackTranscriptDisplayResponse({
      ...response,
      turns: [{ ...response.turns[0], startedAt: "not-a-date" }],
    }),
    null
  );
});

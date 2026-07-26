import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeInitialInterviewRoomCredentials,
  INTERVIEW_ROOM_HANDOFF_MAX_AGE_MS,
  storeInitialInterviewRoomCredentials,
} from "./room-credential-handoff";

const SESSION_ID = "10000000-0000-4000-8000-000000000001";
const NOW = 1_000_000;
const RESPONSE = {
  sessionId: SESSION_ID,
  token: "signed-start-token",
  url: "wss://preview.livekit.cloud",
  roomName: "interview-room",
};

test("hands successful start credentials to the matching owner exactly once", () => {
  assert.equal(
    storeInitialInterviewRoomCredentials(
      { response: RESPONSE, sessionId: SESSION_ID, ownerId: "owner-a" },
      () => NOW
    ),
    true
  );

  assert.deepEqual(
    consumeInitialInterviewRoomCredentials(
      {
        sessionId: SESSION_ID,
        ownerId: "owner-a",
        expectedRoomName: "interview-room",
      },
      () => NOW + 1
    ),
    {
      token: "signed-start-token",
      url: "wss://preview.livekit.cloud",
      roomName: "interview-room",
    }
  );
  assert.equal(
    consumeInitialInterviewRoomCredentials(
      {
        sessionId: SESSION_ID,
        ownerId: "owner-a",
        expectedRoomName: "interview-room",
      },
      () => NOW + 2
    ),
    null
  );
});

test("consumes and rejects credentials for another owner, room, or expired handoff", () => {
  for (const input of [
    {
      ownerId: "owner-b",
      expectedRoomName: "interview-room",
      now: NOW + 1,
    },
    {
      ownerId: "owner-a",
      expectedRoomName: "another-room",
      now: NOW + 1,
    },
    {
      ownerId: "owner-a",
      expectedRoomName: "interview-room",
      now: NOW + INTERVIEW_ROOM_HANDOFF_MAX_AGE_MS + 1,
    },
  ]) {
    storeInitialInterviewRoomCredentials(
      { response: RESPONSE, sessionId: SESSION_ID, ownerId: "owner-a" },
      () => NOW
    );
    assert.equal(
      consumeInitialInterviewRoomCredentials(
        {
          sessionId: SESSION_ID,
          ownerId: input.ownerId,
          expectedRoomName: input.expectedRoomName,
        },
        () => input.now
      ),
      null
    );
  }
});

test("does not persist malformed or non-LiveKit credentials", () => {
  assert.equal(
    storeInitialInterviewRoomCredentials(
      {
        response: { ...RESPONSE, url: "https://preview.livekit.cloud" },
        sessionId: SESSION_ID,
        ownerId: "owner-a",
      },
      () => NOW
    ),
    false
  );
});

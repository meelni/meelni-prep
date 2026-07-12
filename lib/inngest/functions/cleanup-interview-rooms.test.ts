import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInterviewRoomCleanupEvents,
  INTERVIEW_ROOM_CLEANUP_EVENT_NAME,
} from "./cleanup-interview-rooms";

test("cleanup recovery fans every pending room into an independent retry", () => {
  const events = buildInterviewRoomCleanupEvents(
    [
      { sessionId: "session-a" },
      { sessionId: "session-b" },
      { sessionId: "session-c" },
    ],
    "recovery-1"
  );

  assert.deepEqual(
    events.map((event) => event.id),
    [
      "interview-room-cleanup:session-a:recovery-1",
      "interview-room-cleanup:session-b:recovery-1",
      "interview-room-cleanup:session-c:recovery-1",
    ]
  );
  assert.ok(
    events.every((event) => event.name === INTERVIEW_ROOM_CLEANUP_EVENT_NAME)
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  attachCanonicalInterviewDeadline,
  InterviewSessionDeadlineUnavailableError,
} from "./interview-session-details";

test("session details expose the canonical server-derived deadline", () => {
  const session = attachCanonicalInterviewDeadline({
    id: "session-1",
    startedAt: new Date("2026-07-10T06:00:00.000Z"),
    config: { duration: 45 },
  });

  assert.equal(session.deadlineAt, "2026-07-10T06:45:00.000Z");
});

test("session details fail explicitly for missing or invalid start truth", () => {
  for (const startedAt of [null, new Date(Number.NaN)]) {
    assert.throws(
      () =>
        attachCanonicalInterviewDeadline({
          id: "session-invalid-start",
          startedAt,
          config: { duration: 30 },
        }),
      InterviewSessionDeadlineUnavailableError
    );
  }
});

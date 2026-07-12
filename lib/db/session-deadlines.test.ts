import assert from "node:assert/strict";
import test from "node:test";

import { buildInterviewDeadlineSchedules } from "./session-deadlines";

test("recovery prioritizes absolute deadlines across mixed durations", () => {
  const schedules = buildInterviewDeadlineSchedules(
    [
      {
        id: "older-long",
        startedAt: new Date("2026-07-10T06:00:00.000Z"),
        config: { duration: 45 },
      },
      {
        id: "newer-short",
        startedAt: new Date("2026-07-10T06:20:00.000Z"),
        config: { duration: 15 },
      },
      {
        id: "middle-medium",
        startedAt: new Date("2026-07-10T06:10:00.000Z"),
        config: { duration: 30 },
      },
    ],
    2,
    new Date("2026-07-10T07:00:00.000Z")
  );

  assert.deepEqual(schedules, [
    {
      kind: "deadline",
      sessionId: "newer-short",
      deadlineAt: "2026-07-10T06:35:00.000Z",
    },
    {
      kind: "deadline",
      sessionId: "middle-medium",
      deadlineAt: "2026-07-10T06:40:00.000Z",
    },
  ]);
});

test("recovery quarantines an open room without a persisted start time", () => {
  assert.deepEqual(
    buildInterviewDeadlineSchedules(
      [{ id: "missing-start", startedAt: null, config: { duration: 15 } }],
      250,
      new Date("2026-07-10T07:00:00.000Z")
    ),
    [
      {
        kind: "invalid_session",
        sessionId: "missing-start",
        reason: "missing_started_at",
      },
    ]
  );
});

test("recovery emits only deadlines that are already due", () => {
  assert.deepEqual(
    buildInterviewDeadlineSchedules(
      [
        {
          id: "due",
          startedAt: new Date("2026-07-10T06:00:00.000Z"),
          config: { duration: 30 },
        },
        {
          id: "future",
          startedAt: new Date("2026-07-10T06:20:00.000Z"),
          config: { duration: 30 },
        },
      ],
      250,
      new Date("2026-07-10T06:40:00.000Z")
    ),
    [
      {
        kind: "deadline",
        sessionId: "due",
        deadlineAt: "2026-07-10T06:30:00.000Z",
      },
    ]
  );
});

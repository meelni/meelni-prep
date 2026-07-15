import assert from "node:assert/strict";
import test from "node:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import {
  buildInterviewDeadlineSchedules,
  claimInterviewDeadline,
  listInterviewDeadlineSchedules,
} from "./session-deadlines";

test("hard deadline claim is one atomic database-time state/version/deadline CAS", async () => {
  let values: Record<string, unknown> = {};
  let predicate: SQL | null = null;
  const database = {
    update() {
      const builder = {
        set(input: Record<string, unknown>) {
          values = input;
          return builder;
        },
        where(input: SQL) {
          predicate = input;
          return builder;
        },
        async returning() {
          return [{ id: "session-1" }];
        },
      };
      return builder;
    },
  } as never;

  const claimed = await claimInterviewDeadline(
    {
      sessionId: "session-1",
      expectedState: "reconnecting",
      expectedVersion: 4,
      deadlineAt: new Date("2026-07-10T08:00:30.000Z"),
      terminalReason: "time_limit",
    },
    database
  );

  assert.equal(claimed, true);
  assert.equal(values.lifecycleState, "ending");
  assert.equal(values.terminalReason, "time_limit");
  assert.equal(values.deadlineRoomCleanupStatus, "pending");
  const query = new PgDialect().sqlToQuery(predicate!);
  assert.match(query.sql, /lifecycle_state/);
  assert.match(query.sql, /lifecycle_version/);
  assert.match(query.sql, /started_at/);
  assert.match(query.sql, /config/);
  assert.match(query.sql, /interval '1 minute'/);
  assert.match(query.sql, /clock_timestamp\(\)/);
});

test("recovery eligibility and ordering are computed in PostgreSQL time", async () => {
  let predicate: SQL | null = null;
  let requestedLimit = 0;
  const database = {
    select() {
      const builder = {
        from() {
          return builder;
        },
        leftJoin() {
          return builder;
        },
        where(input: SQL) {
          predicate = input;
          return builder;
        },
        orderBy() {
          return builder;
        },
        async limit(input: number) {
          requestedLimit = input;
          return [
            {
              id: "due",
              startedAt: new Date("2026-07-10T06:00:00.000Z"),
              deadlineAt: new Date("2026-07-10T06:30:00.000Z"),
            },
          ];
        },
      };
      return builder;
    },
  } as never;

  const schedules = await listInterviewDeadlineSchedules(25, database);

  assert.equal(requestedLimit, 25);
  assert.deepEqual(schedules, [
    {
      kind: "deadline",
      sessionId: "due",
      deadlineAt: "2026-07-10T06:30:00.000Z",
    },
  ]);
  const query = new PgDialect().sqlToQuery(predicate!);
  assert.match(query.sql, /clock_timestamp\(\)/);
  assert.match(query.sql, /interval '1 minute'/);
});

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

test("recovery re-emits terminal deadline cleanup claims until provider acknowledgement", () => {
  assert.deepEqual(
    buildInterviewDeadlineSchedules(
      [
        {
          id: "terminal-pending",
          startedAt: new Date("2026-07-10T06:00:00.000Z"),
          config: { duration: 30 },
          lifecycleState: "completed",
          terminalReason: "insufficient_signal",
          deadlineRoomCleanupStatus: "pending",
        },
        {
          id: "terminal-acknowledged",
          startedAt: new Date("2026-07-10T06:00:00.000Z"),
          config: { duration: 30 },
          lifecycleState: "completed",
          terminalReason: "time_limit",
          deadlineRoomCleanupStatus: "already_absent",
        },
      ],
      250,
      new Date("2026-07-10T07:00:00.000Z")
    ),
    [
      {
        kind: "deadline",
        sessionId: "terminal-pending",
        deadlineAt: "2026-07-10T06:30:00.000Z",
      },
    ]
  );
});

test("recovery retains acknowledged deadline feedback until its outbox is ready", () => {
  const now = new Date("2026-07-10T07:00:00.000Z");
  const base = {
    startedAt: new Date("2026-07-10T06:00:00.000Z"),
    config: { duration: 30 },
    lifecycleState: "completed",
    terminalReason: "time_limit",
    deadlineRoomCleanupStatus: "already_absent" as const,
    feedbackStatus: "pending",
  };

  assert.deepEqual(
    buildInterviewDeadlineSchedules(
      [
        {
          ...base,
          id: "dispatch-pending",
          feedbackDispatchStatus: "pending",
        },
        {
          ...base,
          id: "dispatch-failed",
          feedbackDispatchStatus: "failed",
        },
        {
          ...base,
          id: "dispatch-sending-stale",
          feedbackDispatchStatus: "sending",
          feedbackDispatchClaimedAt: new Date("2026-07-10T06:57:59.999Z"),
        },
        {
          ...base,
          id: "dispatch-sending-fresh",
          feedbackDispatchStatus: "sending",
          feedbackDispatchClaimedAt: new Date("2026-07-10T06:58:00.001Z"),
        },
        {
          ...base,
          id: "dispatch-sent",
          feedbackDispatchStatus: "sent",
        },
        {
          ...base,
          id: "generation-failed-after-send",
          feedbackStatus: "failed",
          feedbackDispatchStatus: "sent",
        },
      ],
      250,
      now
    ),
    [
      {
        kind: "deadline",
        sessionId: "dispatch-failed",
        deadlineAt: "2026-07-10T06:30:00.000Z",
      },
      {
        kind: "deadline",
        sessionId: "dispatch-pending",
        deadlineAt: "2026-07-10T06:30:00.000Z",
      },
      {
        kind: "deadline",
        sessionId: "dispatch-sending-stale",
        deadlineAt: "2026-07-10T06:30:00.000Z",
      },
      {
        kind: "deadline",
        sessionId: "generation-failed-after-send",
        deadlineAt: "2026-07-10T06:30:00.000Z",
      },
    ]
  );
});

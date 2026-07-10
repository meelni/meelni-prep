import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_INTERVIEW_DURATION_MINUTES,
  INTERVIEW_DURATION_MINUTES,
  deriveInterviewDeadlineAt,
  getInterviewDeadlineRemainingMs,
  isInterviewDeadlineReached,
  isInterviewDurationMinutes,
  normalizeInterviewDurationMinutes,
  parseInterviewDeadlineAt,
  serializeInterviewDeadlineAt,
} from "./session-deadline";

test("duration policy accepts only the supported interview lengths", () => {
  assert.deepEqual(INTERVIEW_DURATION_MINUTES, [15, 30, 45]);
  assert.equal(DEFAULT_INTERVIEW_DURATION_MINUTES, 30);

  for (const duration of INTERVIEW_DURATION_MINUTES) {
    assert.equal(isInterviewDurationMinutes(duration), true);
    assert.equal(normalizeInterviewDurationMinutes(duration), duration);
  }
});

test("duration policy normalizes every unsupported shape to one safe default", () => {
  for (const value of [
    undefined,
    null,
    false,
    true,
    "15",
    0,
    -15,
    14,
    15.5,
    46,
    60,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    {},
    [],
  ]) {
    assert.equal(isInterviewDurationMinutes(value), false, String(value));
    assert.equal(
      normalizeInterviewDurationMinutes(value),
      DEFAULT_INTERVIEW_DURATION_MINUTES,
      String(value)
    );
  }
});

test("deadline derivation uses the server start instant and does not mutate it", () => {
  const cases = [
    {
      startedAt: "2026-07-09T23:55:00.000Z",
      durationMinutes: 15,
      expected: "2026-07-10T00:10:00.000Z",
    },
    {
      startedAt: "2028-02-29T23:45:00.000Z",
      durationMinutes: 30,
      expected: "2028-03-01T00:15:00.000Z",
    },
    {
      startedAt: "2026-12-31T23:30:00.000Z",
      durationMinutes: 45,
      expected: "2027-01-01T00:15:00.000Z",
    },
  ] as const;

  for (const scenario of cases) {
    const startedAt = new Date(scenario.startedAt);
    const originalEpoch = startedAt.getTime();
    const deadlineAt = deriveInterviewDeadlineAt({
      startedAt,
      durationMinutes: scenario.durationMinutes,
    });

    assert.equal(deadlineAt.toISOString(), scenario.expected);
    assert.equal(startedAt.getTime(), originalEpoch);
    assert.notEqual(deadlineAt, startedAt);
  }
});

test("deadline derivation applies the shared default to invalid duration input", () => {
  const deadlineAt = deriveInterviewDeadlineAt({
    startedAt: new Date("2026-07-09T12:00:00.000Z"),
    durationMinutes: 999,
  });

  assert.equal(deadlineAt.toISOString(), "2026-07-09T12:30:00.000Z");
});

test("deadline parsing accepts only canonical UTC ISO strings", () => {
  const canonical = "2026-07-09T12:30:00.123Z";
  assert.equal(parseInterviewDeadlineAt(canonical)?.toISOString(), canonical);

  for (const value of [
    undefined,
    null,
    0,
    "",
    "2026-07-09T12:30:00Z",
    "2026-07-09T12:30:00.123+00:00",
    "2026-07-09 12:30:00.123Z",
    "2026-02-30T12:30:00.123Z",
    "not-a-date",
  ]) {
    assert.equal(parseInterviewDeadlineAt(value), null, String(value));
  }
});

test("deadline serialization rejects invalid Date values", () => {
  const deadlineAt = new Date("2026-07-09T12:30:00.123Z");
  assert.equal(
    serializeInterviewDeadlineAt(deadlineAt),
    "2026-07-09T12:30:00.123Z"
  );
  assert.throws(
    () => serializeInterviewDeadlineAt(new Date(Number.NaN)),
    /deadlineAt must be a valid Date/
  );
  assert.throws(
    () =>
      deriveInterviewDeadlineAt({
        startedAt: new Date(Number.NaN),
        durationMinutes: 30,
      }),
    /startedAt must be a valid Date/
  );
});

test("fake clock treats the exact deadline as reached and clamps remaining time", () => {
  const deadlineAt = new Date("2026-07-09T12:30:00.000Z");
  const oneMillisecondBefore = new Date(deadlineAt.getTime() - 1);
  const exactDeadline = new Date(deadlineAt);
  const oneMillisecondAfter = new Date(deadlineAt.getTime() + 1);

  assert.equal(
    isInterviewDeadlineReached({ deadlineAt, now: oneMillisecondBefore }),
    false
  );
  assert.equal(
    getInterviewDeadlineRemainingMs({
      deadlineAt,
      now: oneMillisecondBefore,
    }),
    1
  );
  assert.equal(
    isInterviewDeadlineReached({ deadlineAt, now: exactDeadline }),
    true
  );
  assert.equal(
    getInterviewDeadlineRemainingMs({ deadlineAt, now: exactDeadline }),
    0
  );
  assert.equal(
    isInterviewDeadlineReached({ deadlineAt, now: oneMillisecondAfter }),
    true
  );
  assert.equal(
    getInterviewDeadlineRemainingMs({
      deadlineAt,
      now: oneMillisecondAfter,
    }),
    0
  );
});

test("fake clock helpers reject invalid clock instants", () => {
  const valid = new Date("2026-07-09T12:30:00.000Z");
  const invalid = new Date(Number.NaN);

  assert.throws(
    () => isInterviewDeadlineReached({ deadlineAt: invalid, now: valid }),
    /deadlineAt must be a valid Date/
  );
  assert.throws(
    () => getInterviewDeadlineRemainingMs({ deadlineAt: valid, now: invalid }),
    /now must be a valid Date/
  );
});

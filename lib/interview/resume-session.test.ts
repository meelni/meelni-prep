import assert from "node:assert/strict";
import test from "node:test";

import { requireInterviewResumeTiming } from "./resume-session";

test("resume trusts the canonical server deadline without recomputing it", () => {
  assert.deepEqual(
    requireInterviewResumeTiming({
      startedAt: "2026-07-10T06:00:00.000Z",
      deadlineAt: "2026-07-10T06:17:00.000Z",
    }),
    {
      startedAt: "2026-07-10T06:00:00.000Z",
      deadlineAt: "2026-07-10T06:17:00.000Z",
    }
  );
});

test("resume fails explicitly for null start or malformed deadline truth", () => {
  assert.throws(
    () =>
      requireInterviewResumeTiming({
        startedAt: null,
        deadlineAt: "2026-07-10T06:30:00.000Z",
      }),
    /start time is unavailable/
  );
  assert.throws(
    () =>
      requireInterviewResumeTiming({
        startedAt: "2026-07-10T06:00:00.000Z",
        deadlineAt: null,
      }),
    /deadline is unavailable/
  );
});

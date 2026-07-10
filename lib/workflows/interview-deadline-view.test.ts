import assert from "node:assert/strict";
import test from "node:test";

import {
  formatInterviewTime,
  getRemainingSeconds,
} from "@/lib/interview/deadline-view";

const DEADLINE = new Date("2026-07-09T22:00:00.000Z");

test("countdown rounds a partial final second up without ending early", () => {
  assert.equal(
    getRemainingSeconds(DEADLINE, new Date("2026-07-09T21:59:59.001Z")),
    1
  );
});

test("countdown reaches zero exactly at the server deadline and never goes negative", () => {
  assert.equal(getRemainingSeconds(DEADLINE, DEADLINE), 0);
  assert.equal(
    getRemainingSeconds(DEADLINE, new Date("2026-07-09T22:00:01.000Z")),
    0
  );
});

test("countdown exposes missing deadline truth instead of inventing a duration", () => {
  assert.equal(getRemainingSeconds(null, new Date()), null);
});

test("countdown formatting is stable and defensive", () => {
  assert.equal(formatInterviewTime(65), "01:05");
  assert.equal(formatInterviewTime(-1), "00:00");
  assert.equal(formatInterviewTime(Number.NaN), "00:00");
});

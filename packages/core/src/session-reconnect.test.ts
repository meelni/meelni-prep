import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveInterviewReconnectDeadline,
  isInterviewReconnectDeadlineReached,
} from "./session-reconnect";

const DISCONNECTED_AT = new Date("2026-07-10T08:00:00.000Z");

test("reconnect grace owns a deadline when it ends before the hard limit", () => {
  assert.deepEqual(
    deriveInterviewReconnectDeadline({
      disconnectedAt: DISCONNECTED_AT,
      hardDeadlineAt: new Date("2026-07-10T08:01:00.000Z"),
    }),
    {
      deadlineAt: new Date("2026-07-10T08:00:30.000Z"),
      owner: "reconnect_grace",
    }
  );
});

test("hard deadline wins ties and earlier limits", () => {
  for (const hardDeadlineAt of [
    new Date("2026-07-10T08:00:29.999Z"),
    new Date("2026-07-10T08:00:30.000Z"),
  ]) {
    assert.deepEqual(
      deriveInterviewReconnectDeadline({
        disconnectedAt: DISCONNECTED_AT,
        hardDeadlineAt,
      }),
      { deadlineAt: null, owner: "hard_deadline" }
    );
  }
});

test("reconnect deadline is reached at the exact instant", () => {
  const deadlineAt = new Date("2026-07-10T08:00:30.000Z");
  assert.equal(
    isInterviewReconnectDeadlineReached({
      deadlineAt,
      now: new Date("2026-07-10T08:00:29.999Z"),
    }),
    false
  );
  assert.equal(
    isInterviewReconnectDeadlineReached({ deadlineAt, now: deadlineAt }),
    true
  );
});

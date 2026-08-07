import assert from "node:assert/strict";
import test from "node:test";

import { buildUserEndRecoveryItems } from "./user-end-recovery";

test("ending sessions replay settlement while terminal outbox recovery starts at feedback", () => {
  assert.deepEqual(
    buildUserEndRecoveryItems([
      {
        sessionId: "ending-session",
        userId: "user-1",
        lifecycleVersion: 3,
        lifecycleState: "ending",
      },
      {
        sessionId: "terminal-undispatched",
        userId: "user-2",
        lifecycleVersion: 4,
        lifecycleState: "completed",
      },
    ]),
    [
      {
        sessionId: "ending-session",
        userId: "user-1",
        lifecycleVersion: 3,
        resumeFrom: "runtime_settlement",
      },
      {
        sessionId: "terminal-undispatched",
        userId: "user-2",
        lifecycleVersion: 4,
        resumeFrom: "feedback_dispatch",
      },
    ]
  );
});

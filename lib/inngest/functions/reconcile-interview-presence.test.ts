import assert from "node:assert/strict";
import test from "node:test";

import { buildInterviewPresenceReconciliationEvents } from "./reconcile-interview-presence";

test("presence recovery fans out an independently retryable event per session", () => {
  assert.deepEqual(
    buildInterviewPresenceReconciliationEvents(
      [{ sessionId: "session-a" }, { sessionId: "session-b" }],
      "delivery-1"
    ),
    [
      {
        id: "interview-presence:session-a:delivery-1",
        name: "interview/presence.reconciliation.requested",
        data: { sessionId: "session-a", deliveryId: "delivery-1" },
      },
      {
        id: "interview-presence:session-b:delivery-1",
        name: "interview/presence.reconciliation.requested",
        data: { sessionId: "session-b", deliveryId: "delivery-1" },
      },
    ]
  );
});

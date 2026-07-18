import assert from "node:assert/strict";
import test from "node:test";

import { deliverPostHogCapture } from "./posthog-server";

test("server capture flushes the event before delivery resolves", async () => {
  const calls: string[] = [];
  await deliverPostHogCapture(
    {
      capture(message) {
        calls.push(`capture:${message.event}`);
      },
      async flush() {
        calls.push("flush");
      },
    },
    {
      distinctId: "user_hmac",
      event: "billing_credit_granted",
      properties: { credits: 5 },
    }
  );
  assert.deepEqual(calls, ["capture:billing_credit_granted", "flush"]);
});

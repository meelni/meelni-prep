import assert from "node:assert/strict";
import test from "node:test";

import { withdrawPostHogConsent } from "./posthog-consent";

test("PostHog withdrawal persists opt-out after identity reset", () => {
  const calls: string[] = [];
  let consent: "granted" | "denied" | "pending" = "granted";

  withdrawPostHogConsent({
    stopSessionRecording() {
      calls.push("stop-recording");
    },
    reset(resetDeviceId) {
      calls.push(`reset:${String(resetDeviceId)}`);
      consent = "pending";
    },
    opt_out_capturing() {
      calls.push("opt-out");
      consent = "denied";
    },
  });

  assert.deepEqual(calls, ["stop-recording", "reset:true", "opt-out"]);
  assert.equal(consent, "denied");
});

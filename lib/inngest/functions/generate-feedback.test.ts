import assert from "node:assert/strict";
import test from "node:test";

import {
  FEEDBACK_GENERATION_QUEUE_CONFIG,
  generateFeedback,
} from "./generate-feedback";

test("feedback generation uses the calibrated bounded-concurrency queue policy", () => {
  assert.deepEqual(FEEDBACK_GENERATION_QUEUE_CONFIG, {
    concurrency: [{ limit: 8 }, { limit: 1, key: "event.data.sessionId" }],
  });

  const registered = registeredView(generateFeedback);
  assert.deepEqual(registered.opts.concurrency, [
    { limit: 8 },
    { limit: 1, key: "event.data.sessionId" },
  ]);
  assert.equal("throttle" in registered.opts, false);
});

function registeredView(value: unknown): {
  opts: {
    concurrency?: Array<{ limit: number; key?: string }>;
    throttle?: { limit: number; period: string };
  };
} {
  return value as {
    opts: {
      concurrency?: Array<{ limit: number; key?: string }>;
      throttle?: { limit: number; period: string };
    };
  };
}

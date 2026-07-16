import assert from "node:assert/strict";
import test from "node:test";

import { withStripeDeletionSerializationRetry } from "./account-deletions";

test("deletion serialization retry waits for a held gate to release", async () => {
  let attempts = 0;
  let gateHeld = true;
  const delays: number[] = [];

  const result = await withStripeDeletionSerializationRetry(
    async () => {
      attempts += 1;
      if (gateHeld) throw Object.assign(new Error("retry"), { code: "40001" });
      return "deleted";
    },
    {
      random: () => 0,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
        if (delays.length === 3) gateHeld = false;
      },
    }
  );

  assert.equal(result, "deleted");
  assert.equal(attempts, 4);
  assert.deepEqual(delays, [20, 40, 80]);
});

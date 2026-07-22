import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTACT_RATE_LIMIT_CLEANUP_BATCH_SIZE,
  cleanupContactRateLimits,
} from "./cleanup-contact-rate-limits";

test("stops after the first partial cleanup batch", async () => {
  const calls: number[] = [];
  const result = await cleanupContactRateLimits(async (batchSize, index) => {
    calls.push(index);
    assert.equal(batchSize, CONTACT_RATE_LIMIT_CLEANUP_BATCH_SIZE);
    return 27;
  });

  assert.deepEqual(result, {
    deleted: 27,
    batches: 1,
    backlogLikely: false,
  });
  assert.deepEqual(calls, [0]);
});

test("bounds full batches and reports likely backlog without unbounded work", async () => {
  const result = await cleanupContactRateLimits(async () => 5_000);

  assert.deepEqual(result, {
    deleted: 20_000,
    batches: 4,
    backlogLikely: true,
  });
});

test("rejects invalid database cleanup results", async () => {
  await assert.rejects(
    () => cleanupContactRateLimits(async () => 5_001),
    /invalid_contact_rate_limit_cleanup_result/
  );
});

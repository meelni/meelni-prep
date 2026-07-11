import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("cancellation does not collect or log user identifiers and free-form feedback", async () => {
  const source = await readFile(
    new URL("../app/api/billing/cancel/route.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /console\.log/);
  assert.doesNotMatch(source, /\breason\b|\bfeedback\b/i);
  assert.doesNotMatch(source, /console\.error\([^)]*,/);
  assert.doesNotMatch(source, /catch\s*\([^)]/);
  const errorCodes = [...source.matchAll(/console\.error\("([^"]+)"\)/g)].map(
    (match) => match[1]
  );
  assert.deepEqual(errorCodes, [
    "billing_cancel_provider_failed",
    "billing_cancel_unexpected",
    "billing_reactivate_provider_failed",
    "billing_reactivate_unexpected",
  ]);
  assert.ok(errorCodes.every((code) => /^[a-z_]+$/.test(code)));
});

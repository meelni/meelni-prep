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
});

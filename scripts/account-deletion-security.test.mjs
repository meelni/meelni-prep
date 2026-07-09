import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Inngest step history never persists raw account-deletion subjects", async () => {
  const source = await readFile(
    new URL("../lib/inngest/functions/delete-account.ts", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(source, /step\.run\(["']load-deletion-request/);
  assert.match(source, /Keep raw provider IDs out of persisted Inngest step output/);
  assert.match(source, /safeProviderError/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("question list failures do not expose database error details", async () => {
  const source = await readFile("app/api/questions/route.ts", "utf8");
  const catchIndex = source.search(/}\s*catch(?:\s*\([^)]*\))?\s*{/);

  assert.notEqual(
    catchIndex,
    -1,
    "expected question list route to define a catch handler"
  );
  const errorHandler = source.slice(catchIndex);

  assert.doesNotMatch(errorHandler, /message:\s*error/);
  assert.match(errorHandler, /error: "Failed to fetch questions"/);
});

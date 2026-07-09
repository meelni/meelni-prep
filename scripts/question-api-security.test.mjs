import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("question list failures do not expose database error details", async () => {
  const source = await readFile("app/api/questions/route.ts", "utf8");
  const errorHandler = source.slice(source.indexOf("} catch (error)"));

  assert.doesNotMatch(errorHandler, /message:\s*error/);
  assert.match(errorHandler, /error: "Failed to fetch questions"/);
});

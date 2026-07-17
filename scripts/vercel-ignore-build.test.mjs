import assert from "node:assert/strict";
import test from "node:test";

import { shouldIgnoreVercelBuild } from "./vercel-ignore-build.mjs";

test("Vercel Git integration builds Preview and ignores every other target", () => {
  assert.equal(shouldIgnoreVercelBuild({ VERCEL_ENV: "preview" }), false);
  assert.equal(shouldIgnoreVercelBuild({ VERCEL_ENV: "production" }), true);
  assert.equal(shouldIgnoreVercelBuild({ VERCEL_ENV: "development" }), true);
  assert.equal(shouldIgnoreVercelBuild({}), true);
});

import assert from "node:assert/strict";
import test from "node:test";

import { shouldIgnoreVercelBuild } from "./vercel-ignore-build.mjs";

test("Vercel Git integration builds Preview and Production main only", () => {
  assert.equal(shouldIgnoreVercelBuild({ VERCEL_ENV: "preview" }), false);
  assert.equal(
    shouldIgnoreVercelBuild({
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
    }),
    false
  );
  assert.equal(
    shouldIgnoreVercelBuild({
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "codex/sav-126",
    }),
    true
  );
  assert.equal(shouldIgnoreVercelBuild({ VERCEL_ENV: "production" }), true);
  assert.equal(shouldIgnoreVercelBuild({ VERCEL_ENV: "development" }), true);
  assert.equal(shouldIgnoreVercelBuild({}), true);
});

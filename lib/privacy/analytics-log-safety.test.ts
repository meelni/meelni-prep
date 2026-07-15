import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { identify, track } from "../analytics";

test("development analytics fallback never logs event properties or identity", () => {
  const sentinel = "PRIVATE_ANALYTICS_SENTINEL_do_not_log";
  const originalNodeEnv = process.env.NODE_ENV;
  const calls: unknown[][] = [];
  const originalLog = console.log;

  Reflect.set(process.env, "NODE_ENV", "development");
  console.log = (...values: unknown[]) => {
    calls.push(values);
  };

  try {
    track(sentinel, { transcript: sentinel });
    identify(sentinel, { email: sentinel });
  } finally {
    console.log = originalLog;
    if (originalNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, "NODE_ENV");
    } else {
      Reflect.set(process.env, "NODE_ENV", originalNodeEnv);
    }
  }

  assert.equal(JSON.stringify(calls).includes(sentinel), false);
  assert.deepEqual(calls, [
    ["[Analytics] development_event_recorded"],
    ["[Analytics] development_identity_recorded"],
  ]);
});

test("PostHog analytics logging boundary excludes content-bearing values", async () => {
  const source = await readFile("lib/analytics/analytics-service.ts", "utf8");

  assert.doesNotMatch(
    source,
    /console\.(?:log|error)\([^;]*(?:event|properties|traits|userId|sanitizedProperties|sanitizedTraits|sanitizedPath)\b/
  );
  assert.doesNotMatch(source, /console\.error\([^;]*,\s*error\s*\)/);
  assert.match(source, /toSafeErrorLog\(error\)/);
});

test("settings logging boundaries never pass raw exceptions to console", async () => {
  const sources = await Promise.all([
    readFile("app/api/user/settings/route.ts", "utf8"),
    readFile("components/dashboard/sections/settings.tsx", "utf8"),
  ]);

  for (const source of sources) {
    assert.doesNotMatch(source, /console\.error\([^;]*,\s*error\s*\)/);
    assert.match(source, /toSafeErrorLog\(error\)/);
  }
});

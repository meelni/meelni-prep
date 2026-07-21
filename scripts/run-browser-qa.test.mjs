import assert from "node:assert/strict";
import test from "node:test";

import {
  createBrowserQaEnvironment,
  isBrowserQaEnvironmentFile,
} from "./run-browser-qa.mjs";

test("browser QA child environment excludes inherited provider credentials", () => {
  const environment = createBrowserQaEnvironment(
    {
      CI: "true",
      HOME: "/tmp/home",
      PATH: "/usr/bin",
      OPENAI_API_KEY: "must-not-cross-boundary",
      STRIPE_SECRET_KEY: "must-not-cross-boundary",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-cross-boundary",
    },
    "/tmp/browser-qa"
  );

  assert.equal(environment.CI, "true");
  assert.equal(environment.HOME, "/tmp/home");
  assert.equal(environment.OPENAI_API_KEY, undefined);
  assert.equal(environment.STRIPE_SECRET_KEY, undefined);
  assert.equal(environment.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(environment.NEXT_PUBLIC_STATSIG_CLIENT_KEY, "");
  assert.equal(environment.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:9");
  assert.equal(environment.MEELNI_BROWSER_QA_TURBOPACK_ROOT, "/tmp/browser-qa");
  assert.match(environment.NODE_OPTIONS, /block-server-egress\.mjs/);

  const unsafeBuildEnvironment = createBrowserQaEnvironment(
    { PATH: "/usr/bin", NODE_OPTIONS: "--inspect --require=/tmp/unsafe.cjs" },
    "/tmp/browser-qa",
    { blockEgress: false }
  );
  assert.equal(unsafeBuildEnvironment.NODE_OPTIONS, undefined);

  const memoryBoundBuildEnvironment = createBrowserQaEnvironment(
    { PATH: "/usr/bin", NODE_OPTIONS: "--max-old-space-size=4096 --inspect" },
    "/tmp/browser-qa",
    { blockEgress: false }
  );
  assert.equal(memoryBoundBuildEnvironment.NODE_OPTIONS, "--max-old-space-size=4096");
});

test("browser QA sandbox omits every loadable Next environment file", () => {
  for (const path of [
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
    "nested/.env.test.local",
  ]) {
    assert.equal(isBrowserQaEnvironmentFile(path), true, path);
  }
  assert.equal(isBrowserQaEnvironmentFile(".env.example"), false);
  assert.equal(isBrowserQaEnvironmentFile("docs/environment.md"), false);
});

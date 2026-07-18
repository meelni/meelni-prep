import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  findBrowserFixtureBoundaryViolations,
  verifyBrowserFixtureBoundary,
} from "./verify-browser-fixture-boundary.mjs";

async function fixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), "meelni-browser-boundary-"));
  for (const directory of [
    "app",
    "components",
    "lib",
    "packages",
    "tests/browser",
  ]) {
    await mkdir(join(root, directory), { recursive: true });
  }
  await writeFile(
    join(root, "tests/browser/spec.ts"),
    "export const safe = true;\n"
  );
  await writeFile(
    join(root, "playwright.config.ts"),
    'const config = { command: "next start --strictPort block-server-egress.mjs", env: { NODE_ENV: "production" }, reuseExistingServer: false };\nvoid config;\n'
  );
  return root;
}

test("accepts an isolated synthetic browser fixture", async () => {
  await verifyBrowserFixtureBoundary(await fixtureRoot());
});

test("rejects secret shapes and production route imports", async () => {
  const root = await fixtureRoot();
  await writeFile(
    join(root, "tests/browser/spec.ts"),
    'import Page from "@/app/dashboard/page";\nconst access_token = "unsafe";\nvoid Page;\n'
  );
  const violations = await findBrowserFixtureBoundaryViolations(root);
  assert.equal(violations.length, 2);
  assert.ok(
    violations.some((item) => item.includes("production-route-import"))
  );
  assert.ok(violations.some((item) => item.includes("secret-or-token-shape")));
});

test("rejects production source that reaches into browser fixtures", async () => {
  const root = await fixtureRoot();
  await writeFile(
    join(root, "components", "bad.ts"),
    'import "../tests/browser/spec";\n'
  );
  const violations = await findBrowserFixtureBoundaryViolations(root);
  assert.deepEqual(violations, [
    "components/bad.ts:production-imports-browser-fixture",
  ]);
});

test("rejects inherited credentials and reusable browser servers", async () => {
  const root = await fixtureRoot();
  await writeFile(
    join(root, "playwright.config.ts"),
    'const config = { command: "next start", reuseExistingServer: !process.env.CI, env: { ...process.env } };\nvoid config;\n'
  );
  const violations = await findBrowserFixtureBoundaryViolations(root);
  assert.ok(
    violations.includes("playwright.config.ts:inherits-process-environment")
  );
  assert.ok(violations.includes("playwright.config.ts:reuses-existing-server"));
});

test("server egress guard terminates non-loopback provider traffic", () => {
  const preload = pathToFileURL(
    resolve("tests/browser/support/block-server-egress.mjs")
  ).href;
  const blocked = spawnSync(
    process.execPath,
    ["-e", 'fetch("https://statsigapi.net/v1/download_config_specs")'],
    {
      encoding: "utf8",
      env: { NODE_OPTIONS: `--import=${preload}` },
      timeout: 5_000,
    }
  );
  assert.equal(blocked.status, 86);
  assert.match(
    blocked.stderr,
    /Browser QA blocked server-side egress to statsigapi\.net/
  );

  const loopback = spawnSync(
    process.execPath,
    ["-e", 'fetch("http://127.0.0.1:9").catch(() => undefined)'],
    {
      encoding: "utf8",
      env: { NODE_OPTIONS: `--import=${preload}` },
      timeout: 5_000,
    }
  );
  assert.equal(loopback.status, 0);
});

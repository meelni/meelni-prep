import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  assertNodeRuntime,
  REQUIRED_NODE_VERSION,
  validateNodeRuntime,
} from "./node-runtime.mjs";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsDir, "..");

test("accepts only the exact pinned Node runtime", () => {
  assert.equal(REQUIRED_NODE_VERSION, "22.22.0");
  assert.equal(validateNodeRuntime("v22.22.0").ok, true);
  assert.equal(validateNodeRuntime("22.22.0").ok, true);
  assert.equal(validateNodeRuntime("v22.21.1").ok, false);
  assert.equal(validateNodeRuntime("v22.22.1").ok, false);
  assert.equal(validateNodeRuntime("v24.0.0").ok, false);
});

test("incompatible runtime errors explain how to select the pinned version", () => {
  assert.throws(
    () => assertNodeRuntime("v20.10.0"),
    /requires exactly Node v22\.22\.0.*`fnm use` or `nvm use`/
  );
});

test("runtime declarations stay synchronized", async () => {
  const [nodeVersion, nvmrc, packageJson] = await Promise.all([
    readFile(resolve(repoRoot, ".node-version"), "utf8"),
    readFile(resolve(repoRoot, ".nvmrc"), "utf8"),
    readFile(resolve(repoRoot, "package.json"), "utf8").then(JSON.parse),
  ]);

  assert.equal(nodeVersion.trim(), REQUIRED_NODE_VERSION);
  assert.equal(nvmrc.trim(), REQUIRED_NODE_VERSION);
  assert.equal(packageJson.engines?.node, "22.x");
});

test("GitHub workflows use the exact pinned Node runtime", async () => {
  const workflowPaths = [
    resolve(repoRoot, ".github/workflows/ci.yml"),
    resolve(repoRoot, ".github/workflows/stack-topology.yml"),
  ];

  for (const workflowPath of workflowPaths) {
    const workflow = await readFile(workflowPath, "utf8");
    const declaredVersions = [
      ...workflow.matchAll(/node-version:\s*([^\s#]+)/g),
    ].map((match) => match[1]);

    assert.ok(declaredVersions.length > 0, `${workflowPath} pins Node`);
    assert.deepEqual(
      [...new Set(declaredVersions)],
      [REQUIRED_NODE_VERSION],
      `${workflowPath} uses only the exact pinned Node runtime`
    );
  }
});

test("local setup fails on an incompatible runtime before running npm install", () => {
  const setupUrl = pathToFileURL(resolve(scriptsDir, "setup-local.mjs")).href;
  const result = runWithReportedNodeVersion(setupUrl, "v20.10.0");

  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires exactly Node v22\.22\.0/);
  assert.doesNotMatch(
    result.stdout,
    /npm install|Root env:|Local setup complete/
  );
});

test("local setup validates Node before filesystem or process mutation", async () => {
  const source = await readFile(resolve(scriptsDir, "setup-local.mjs"), "utf8");
  const guard = source.indexOf("assertNodeRuntime()");
  const firstFilesystemMutation = source.indexOf("mkdirSync(");
  const firstChildProcess = source.indexOf("spawnSync(");

  assert.notEqual(guard, -1);
  assert.notEqual(firstFilesystemMutation, -1);
  assert.notEqual(firstChildProcess, -1);
  assert.ok(guard < firstFilesystemMutation);
  assert.ok(guard < firstChildProcess);
});

test("local doctor reports an incompatible runtime as a failure", () => {
  const doctorUrl = pathToFileURL(resolve(scriptsDir, "doctor-local.mjs")).href;
  const result = runWithReportedNodeVersion(doctorUrl, "v20.10.0");

  assert.equal(result.status, 1);
  assert.match(
    result.stdout,
    /fail\s+Node: Node v20\.10\.0 is incompatible; Meelni requires exactly Node v22\.22\.0/
  );
});

function runWithReportedNodeVersion(moduleUrl, version) {
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `Object.defineProperty(process, "version", { value: ${JSON.stringify(version)} }); await import(${JSON.stringify(moduleUrl)});`,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
    }
  );
}

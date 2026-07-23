import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertPinnedNodeVersion,
  evaluateNodeVersion,
  nodeVersionRecoveryCommand,
  parsePinnedNodeVersion,
} from "./node-version.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("the exact pinned Node version is accepted", () => {
  assert.equal(parsePinnedNodeVersion("22.22.0\n"), "22.22.0");
  assert.deepEqual(
    evaluateNodeVersion({
      actualVersion: "v22.22.0",
      requiredVersion: "22.22.0",
    }),
    {
      actualVersion: "22.22.0",
      requiredVersion: "22.22.0",
      matches: true,
    }
  );
});

test("Node 20 and adjacent Node 22 versions fail with deterministic recovery", () => {
  for (const actualVersion of ["v20.10.0", "v22.21.0", "v22.22.1"]) {
    assert.throws(
      () =>
        assertPinnedNodeVersion({
          actualVersion,
          requiredVersion: "22.22.0",
        }),
      (error) => {
        assert.match(error.message, /does not match required 22\.22\.0/);
        assert.match(
          error.message,
          /fnm install 22\.22\.0 && fnm use 22\.22\.0/
        );
        return true;
      }
    );
  }

  assert.equal(
    nodeVersionRecoveryCommand("22.22.0"),
    "fnm install 22.22.0 && fnm use 22.22.0"
  );
});

test("the machine-readable version policy rejects ambiguous content", () => {
  for (const contents of [
    "22.22.0",
    " 22.22.0\n",
    "22.22.0\n\n",
    "v22.22.0\n",
    "22.x\n",
    "022.22.0\n",
  ]) {
    assert.throws(
      () => parsePinnedNodeVersion(contents),
      /node_version_policy_invalid/
    );
  }
});

test("local, CI, package, and calibration runtime Node contracts align", () => {
  const pinnedVersion = parsePinnedNodeVersion(
    readFileSync(resolve(repoRoot, ".node-version"), "utf8")
  );
  const packageJson = JSON.parse(
    readFileSync(resolve(repoRoot, "package.json"), "utf8")
  );
  const workflow = readFileSync(
    resolve(repoRoot, ".github/workflows/ci.yml"),
    "utf8"
  );
  const runtimeManifest = JSON.parse(
    readFileSync(
      resolve(repoRoot, "docs/evidence/sav-248-v6-runtime-manifest.json"),
      "utf8"
    )
  );

  assert.equal(pinnedVersion, "22.22.0");
  assert.equal(packageJson.engines.node, "22.x");
  assert.match(workflow, /node-version-file: \.node-version/);
  assert.doesNotMatch(workflow, /^\s+node-version:/m);
  assert.equal(runtimeManifest.nodeVersion, pinnedVersion);
});

test("the direct calibration builder fails before writing under a mismatched runtime", () => {
  const temporaryRoot = mkdtempSync(
    resolve(tmpdir(), "meelni-node-version-builder-")
  );
  const scriptsRoot = resolve(temporaryRoot, "scripts");
  const sentinelPath = resolve(
    scriptsRoot,
    "generated/run-evaluation-calibration.bundle.mjs"
  );

  try {
    mkdirSync(dirname(sentinelPath), { recursive: true });
    cpSync(
      resolve(repoRoot, "scripts/build-evaluation-calibration-runtime.mjs"),
      resolve(scriptsRoot, "build-evaluation-calibration-runtime.mjs")
    );
    cpSync(
      resolve(repoRoot, "scripts/node-version.mjs"),
      resolve(scriptsRoot, "node-version.mjs")
    );
    writeFileSync(resolve(temporaryRoot, ".node-version"), "20.10.0\n");
    writeFileSync(sentinelPath, "do-not-replace\n");

    const result = spawnSync(
      process.execPath,
      [
        resolve(scriptsRoot, "build-evaluation-calibration-runtime.mjs"),
        "--write",
      ],
      { encoding: "utf8" }
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not match required 20\.10\.0/);
    assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND/);
    assert.doesNotMatch(result.stderr, /\n\s+at /);
    assert.equal(readFileSync(sentinelPath, "utf8"), "do-not-replace\n");
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

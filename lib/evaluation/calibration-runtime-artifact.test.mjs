import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertCalibrationRuntimeArtifact,
  CALIBRATION_RUNTIME_BUNDLE_PATH,
  CALIBRATION_RUNTIME_BUILD_CONTRACT_SHA256,
  CALIBRATION_RUNTIME_ESBUILD_VERSION,
  CALIBRATION_RUNTIME_EXTERNAL_IMPORTS,
  CALIBRATION_RUNTIME_INPUT_COUNT,
  CALIBRATION_RUNTIME_MANIFEST_PATH,
  parseCalibrationRuntimeManifest,
} from "./calibration-live-startup.mjs";

test("tracked runtime manifest parses and attests the generated artifact", () => {
  const repositoryRoot = realpathSync(
    join(dirname(fileURLToPath(import.meta.url)), "../..")
  );
  const manifest = parseCalibrationRuntimeManifest(
    JSON.parse(
      readFileSync(
        join(repositoryRoot, CALIBRATION_RUNTIME_MANIFEST_PATH),
        "utf8"
      )
    )
  );

  assert.equal(manifest.inputCount, CALIBRATION_RUNTIME_INPUT_COUNT);
  assert.equal(
    assertCalibrationRuntimeArtifact({ repositoryRoot }),
    realpathSync(join(repositoryRoot, CALIBRATION_RUNTIME_BUNDLE_PATH))
  );
});

test("runtime artifact attestation binds a standalone credential-bearing bundle", () => {
  const root = mkdtempSync(join(tmpdir(), "meelni-runtime-artifact-"));
  const bundlePath = join(root, CALIBRATION_RUNTIME_BUNDLE_PATH);
  const packageLockPath = join(root, "package-lock.json");
  try {
    mkdirSync(join(root, "scripts", "generated"), { recursive: true });
    writeFileSync(packageLockPath, '{"lockfileVersion":3}\n');
    writeFileSync(bundlePath, "export {};\n");
    const manifest = createManifest(packageLockPath, bundlePath);
    const runtimeIdentity = {
      platform: manifest.platform,
      architecture: manifest.architecture,
      nodeVersion: manifest.nodeVersion,
    };

    assert.equal(
      assertCalibrationRuntimeArtifact({
        repositoryRoot: root,
        manifest,
        ...runtimeIdentity,
      }),
      realpathSync(bundlePath)
    );

    writeFileSync(bundlePath, "throw 1;\n");
    assert.throws(
      () =>
        assertCalibrationRuntimeArtifact({
          repositoryRoot: root,
          manifest,
          ...runtimeIdentity,
        }),
      /runtime_artifact_rejected/
    );

    writeFileSync(bundlePath, "export {};\n");
    const alias = join(root, "bundle-hardlink.mjs");
    linkSync(bundlePath, alias);
    assert.throws(
      () =>
        assertCalibrationRuntimeArtifact({
          repositoryRoot: root,
          manifest,
          ...runtimeIdentity,
        }),
      /runtime_artifact_rejected/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("runtime manifest rejects extra fields and non-built artifact identities", () => {
  const root = mkdtempSync(join(tmpdir(), "meelni-runtime-manifest-"));
  const bundlePath = join(root, CALIBRATION_RUNTIME_BUNDLE_PATH);
  const packageLockPath = join(root, "package-lock.json");
  try {
    mkdirSync(join(root, "scripts", "generated"), { recursive: true });
    writeFileSync(packageLockPath, "{}\n");
    writeFileSync(bundlePath, "export {};\n");
    const manifest = createManifest(packageLockPath, bundlePath);
    assert.throws(
      () => parseCalibrationRuntimeManifest({ ...manifest, extra: true }),
      /runtime_manifest_rejected/
    );
    assert.throws(
      () =>
        assertCalibrationRuntimeArtifact({
          repositoryRoot: root,
          manifest: { ...manifest, platform: "linux" },
        }),
      /runtime_artifact_rejected|runtime_manifest_rejected/
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function createManifest(packageLockPath, bundlePath) {
  return {
    contractVersion: "evaluation-calibration-runtime-artifact.v1",
    nodeVersion: "22.22.0",
    platform: "darwin",
    architecture: "arm64",
    packageLockSha256: sha256(packageLockPath),
    esbuildVersion: CALIBRATION_RUNTIME_ESBUILD_VERSION,
    buildContractSha256: CALIBRATION_RUNTIME_BUILD_CONTRACT_SHA256,
    bundlePath: CALIBRATION_RUNTIME_BUNDLE_PATH,
    bundleBytes: readFileSync(bundlePath).length,
    bundleSha256: sha256(bundlePath),
    externalImports: [...CALIBRATION_RUNTIME_EXTERNAL_IMPORTS],
    inputCount: CALIBRATION_RUNTIME_INPUT_COUNT,
  };
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

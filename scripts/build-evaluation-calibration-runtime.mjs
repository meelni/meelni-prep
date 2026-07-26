import { createHash } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertPinnedNodeVersion } from "./node-version.mjs";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = "scripts/generated/run-evaluation-calibration.bundle.mjs";
const manifestPath = "docs/evidence/sav-248-v22-runtime-manifest.json";
const buildContract = Object.freeze({
  contractVersion: "evaluation-calibration-runtime-build.v1",
  entryPoint: "scripts/run-evaluation-calibration.ts",
  bundlePath,
  bundle: true,
  platform: "node",
  target: "node22.22",
  format: "esm",
  charset: "utf8",
  legalComments: "none",
  minify: false,
  sourcemap: false,
  treeShaking: true,
  preserveSymlinks: true,
});

try {
  assertPinnedNodeVersion();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const { build, version: esbuildVersion } = await import("esbuild");
const packageLock = readFileSync(join(repositoryRoot, "package-lock.json"));
const result = await build({
  absWorkingDir: repositoryRoot,
  entryPoints: [buildContract.entryPoint],
  outfile: buildContract.bundlePath,
  bundle: buildContract.bundle,
  platform: buildContract.platform,
  target: buildContract.target,
  format: buildContract.format,
  charset: buildContract.charset,
  legalComments: buildContract.legalComments,
  minify: buildContract.minify,
  sourcemap: buildContract.sourcemap,
  treeShaking: buildContract.treeShaking,
  preserveSymlinks: buildContract.preserveSymlinks,
  metafile: true,
  write: false,
});
const output = result.outputFiles?.find((file) => file.path.endsWith(".mjs"));
if (!output) throw new Error("calibration_runtime_build_output_missing");
const outputMetadata = Object.values(result.metafile.outputs).find((value) =>
  value.entryPoint?.endsWith(buildContract.entryPoint)
);
if (!outputMetadata)
  throw new Error("calibration_runtime_build_metadata_missing");
const externalImports = [
  ...new Set(
    outputMetadata.imports
      .filter((entry) => entry.external)
      .map((entry) => entry.path)
  ),
].sort();
const builtins = new Set(
  builtinModules.flatMap((specifier) => [specifier, `node:${specifier}`])
);
if (
  externalImports.length === 0 ||
  externalImports.some((specifier) => !builtins.has(specifier))
) {
  throw new Error("calibration_runtime_build_external_rejected");
}
const manifest = {
  contractVersion: "evaluation-calibration-runtime-artifact.v1",
  nodeVersion: "22.22.0",
  platform: "darwin",
  architecture: "arm64",
  packageLockSha256: sha256(packageLock),
  esbuildVersion,
  buildContractSha256: sha256(
    Buffer.from(JSON.stringify(buildContract), "utf8")
  ),
  bundlePath,
  bundleBytes: output.contents.length,
  bundleSha256: sha256(output.contents),
  externalImports,
  inputCount: Object.keys(result.metafile.inputs).length,
};
const serializedManifest = `${JSON.stringify(manifest, null, 2)}\n`;

if (process.argv.length === 3 && process.argv[2] === "--write") {
  writeAtomic(join(repositoryRoot, bundlePath), output.contents);
  writeAtomic(
    join(repositoryRoot, manifestPath),
    Buffer.from(serializedManifest, "utf8")
  );
} else if (process.argv.length === 2) {
  const existingBundle = readFileSync(join(repositoryRoot, bundlePath));
  const existingManifest = readFileSync(
    join(repositoryRoot, manifestPath),
    "utf8"
  );
  if (
    !existingBundle.equals(output.contents) ||
    existingManifest !== serializedManifest
  ) {
    throw new Error("calibration_runtime_build_not_reproducible");
  }
} else {
  throw new Error("calibration_runtime_build_arguments_rejected");
}

process.stdout.write(
  `${JSON.stringify({
    contractVersion: manifest.contractVersion,
    bundleBytes: manifest.bundleBytes,
    bundleSha256: manifest.bundleSha256,
    inputCount: manifest.inputCount,
  })}\n`
);

function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, content, { flag: "wx", mode: 0o600 });
  const descriptor = openSync(temporaryPath, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  renameSync(temporaryPath, path);
  const directoryDescriptor = openSync(dirname(path), "r");
  try {
    fsyncSync(directoryDescriptor);
  } finally {
    closeSync(directoryDescriptor);
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

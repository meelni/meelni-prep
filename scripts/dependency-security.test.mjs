import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const packageJson = JSON.parse(
  await readFile(new URL("package.json", root), "utf8")
);
const packageLock = JSON.parse(
  await readFile(new URL("package-lock.json", root), "utf8")
);
const pinnedNodeVersion = (
  await readFile(new URL(".node-version", root), "utf8")
).trim();

function versionAtLeast(version, minimum) {
  const current = version.split(".").map(Number);
  const floor = minimum.split(".").map(Number);
  for (let index = 0; index < Math.max(current.length, floor.length); index += 1) {
    const difference = (current[index] ?? 0) - (floor[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

test("unused Spline dependencies stay outside the install graph", () => {
  assert.equal(packageJson.dependencies["@splinetool/react-spline"], undefined);
  assert.equal(packageJson.dependencies["@splinetool/runtime"], undefined);
  assert.equal(
    Object.keys(packageLock.packages).some((path) =>
      path.startsWith("node_modules/@splinetool/")
    ),
    false
  );
});

test("resolved PostCSS and esbuild packages stay above advisory floors", () => {
  const resolved = Object.entries(packageLock.packages);
  const postcssPackages = resolved.filter(
    ([path]) =>
      path === "node_modules/postcss" || path.endsWith("/node_modules/postcss")
  );
  const esbuildPackages = resolved.filter(
    ([path]) =>
      path === "node_modules/esbuild" || path.endsWith("/node_modules/esbuild")
  );

  assert.ok(postcssPackages.length > 0);
  assert.ok(esbuildPackages.length > 0);
  for (const [path, metadata] of postcssPackages) {
    assert.ok(
      versionAtLeast(metadata.version, "8.5.10"),
      `${path} resolved vulnerable PostCSS ${metadata.version}`
    );
  }
  for (const [path, metadata] of esbuildPackages) {
    assert.ok(
      versionAtLeast(metadata.version, "0.25.0"),
      `${path} resolved vulnerable esbuild ${metadata.version}`
    );
  }
});

test("dependency overrides remain narrow and explicit", () => {
  assert.deepEqual(packageJson.overrides, {
    "@esbuild-kit/core-utils": {
      esbuild: "0.25.12",
    },
    "camera-controls": "3.1.0",
    postcss: "8.5.16",
  });
});

test("camera controls remains compatible with the pinned Node runtime", () => {
  const cameraControlsPackages = Object.entries(packageLock.packages).filter(
    ([path]) =>
      path === "node_modules/camera-controls" ||
      path.endsWith("/node_modules/camera-controls")
  );

  assert.equal(cameraControlsPackages.length, 1);
  for (const [path, metadata] of cameraControlsPackages) {
    assert.equal(metadata.version, packageJson.overrides["camera-controls"]);
    assert.match(metadata.engines.node, /^>=\d+\.\d+\.\d+$/);
    assert.equal(
      versionAtLeast(pinnedNodeVersion, metadata.engines.node.slice(2)),
      true,
      `${path} requires Node ${metadata.engines.node}, but the project pins ${pinnedNodeVersion}`
    );
  }
});

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const UI_ROOTS = ["app", "components"];
const CONTRACT_FILES = [
  "lib/config.tsx",
  "lib/dashboard/contracts.ts",
  "lib/dashboard/analytics-contracts.ts",
];
const LEGACY_ROUTE_ALLOWLIST = new Set([
  "app/dashboard/new-rep/page.tsx",
  "lib/navigation/interview-launch.ts",
]);

async function sourceFiles(directory) {
  const entries = await readdir(path.join(ROOT, directory), {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(relativePath)));
    } else if (
      /\.(?:ts|tsx)$/.test(entry.name) &&
      !/\.test\.(?:ts|tsx)$/.test(entry.name)
    ) {
      files.push(relativePath);
    }
  }

  return files;
}

test("active product surfaces use interview-practice language", async () => {
  const files = [
    ...(await Promise.all(UI_ROOTS.map(sourceFiles))).flat(),
    ...CONTRACT_FILES,
  ];
  const violations = [];
  const forbiddenLanguage = [
    ["fitness metaphor", /\b(?:gym|rep|reps)\b/i],
    ["legacy navigation", /\bPractice Home\b/i],
    ["unsupported readiness claim", /\breadiness\b|\bInterview-ready\b/i],
  ];

  for (const file of files) {
    if (LEGACY_ROUTE_ALLOWLIST.has(file)) continue;
    const source = await readFile(path.join(ROOT, file), "utf8");

    for (const [label, pattern] of forbiddenLanguage) {
      if (pattern.test(source)) violations.push(`${file}: ${label}`);
    }
  }

  assert.deepEqual(violations, []);
});

test("the retired launcher route exists only at its compatibility boundary", async () => {
  const files = [
    ...(await Promise.all(UI_ROOTS.map(sourceFiles))).flat(),
    ...(await sourceFiles("lib")),
  ];
  const violations = [];

  for (const file of files) {
    if (LEGACY_ROUTE_ALLOWLIST.has(file)) continue;
    const source = await readFile(path.join(ROOT, file), "utf8");
    if (source.includes("/dashboard/new-rep")) violations.push(file);
  }

  assert.deepEqual(violations, []);
});

test("canonical product guidance no longer defines Meelni as a gym", async () => {
  const files = [
    "AGENTS.md",
    "DESIGN.md",
    "openspec/config.yaml",
    ".agents/skills/meelni-product-strategy/references/meelni-product-model.md",
    ".agents/skills/meelni-product-strategy/references/product-lenses.md",
  ];
  const violations = [];

  for (const file of files) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    if (/PM(?:-focused)? interview gym|live voice reps/i.test(source)) {
      violations.push(file);
    }
  }

  assert.deepEqual(violations, []);
});

test("the live hero and metadata consume the positioning contract", async () => {
  const config = await readFile(path.join(ROOT, "lib/config.tsx"), "utf8");
  const homeMetadata = await readFile(
    path.join(ROOT, "lib/seo/home-metadata.ts"),
    "utf8"
  );

  assert.match(config, /title:\s*PRODUCT_LANGUAGE\.heroPromise/);
  assert.match(config, /description:\s*PRODUCT_LANGUAGE\.oneLine/);
  assert.match(homeMetadata, /const description = PRODUCT_LANGUAGE\.oneLine/);
});

test("primary marketing launch actions enter the canonical interview flow", async () => {
  const files = [
    "components/sections/hero.tsx",
    "components/sections/header.tsx",
    "components/mobile-drawer.tsx",
    "components/sections/footer.tsx",
    "components/sections/cta.tsx",
  ];

  for (const file of files) {
    const source = await readFile(path.join(ROOT, file), "utf8");
    assert.match(source, /href="\/dashboard\/new-interview"/, file);
  }
});

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".ts", ".tsx"]);
const SECRET_SHAPES = [
  /\baccess_token\b/i,
  /\brefresh_token\b/i,
  /\bauthorization\s*:\s*["'`]bearer\b/i,
  /\beyJ[a-zA-Z0-9_-]{12,}\b/,
  /\b(?:sk|rk)_(?:live|test)_[a-zA-Z0-9]{12,}\b/,
  /\b(?:LIVEKIT_API_SECRET|SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY)\b/,
];
const PRODUCTION_ROUTE_IMPORT =
  /from\s+["']@\/app\/(?:[^"']+\/)*(?:page|layout|route)["']/;
const UNSAFE_BROWSER_SERVER_CONFIG = [
  [/\.\.\.process\.env/, "inherits-process-environment"],
];

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (SOURCE_EXTENSIONS.has(extname(entry.name))) yield path;
  }
}

export async function findBrowserFixtureBoundaryViolations(
  repoRoot = REPO_ROOT
) {
  const violations = [];
  const browserRoot = join(repoRoot, "tests/browser");
  const playwrightConfigPath = join(repoRoot, "playwright.config.ts");
  const playwrightConfig = await readFile(playwrightConfigPath, "utf8");
  const packageJson = JSON.parse(
    await readFile(join(repoRoot, "package.json"), "utf8")
  );
  const browserQaRunner = await readFile(
    join(repoRoot, "scripts/run-browser-qa.mjs"),
    "utf8"
  );

  for (const [pattern, reason] of UNSAFE_BROWSER_SERVER_CONFIG) {
    if (pattern.test(playwrightConfig)) {
      violations.push(`playwright.config.ts:${reason}`);
    }
  }
  const reuseValues = [
    ...playwrightConfig.matchAll(/reuseExistingServer:\s*([^,\n}]+)/g),
  ].map((match) => match[1].trim());
  if (
    reuseValues.length === 0 ||
    reuseValues.some((value) => value !== "false")
  ) {
    violations.push("playwright.config.ts:reuses-existing-server");
  }
  for (const required of [
    "next start",
    "--strictPort",
    "block-server-egress.mjs",
    'NODE_ENV: "production"',
  ]) {
    if (!playwrightConfig.includes(required)) {
      violations.push(`playwright.config.ts:missing:${required}`);
    }
  }
  if (
    packageJson.scripts?.["build:browser:qa"] !==
    "node scripts/run-browser-qa.mjs build"
  ) {
    violations.push("package.json:browser-qa-build-bypasses-clean-runner");
  }
  if (
    !packageJson.scripts?.["test:browser:qa"]?.includes(
      "node scripts/run-browser-qa.mjs test"
    )
  ) {
    violations.push("package.json:browser-qa-test-bypasses-clean-runner");
  }
  for (const required of [
    "SAFE_PARENT_ENV_KEYS",
    "isBrowserQaEnvironmentFile",
    "browser-qa-workspace",
  ]) {
    if (!browserQaRunner.includes(required)) {
      violations.push(`scripts/run-browser-qa.mjs:missing:${required}`);
    }
  }

  for await (const file of walk(browserRoot)) {
    const source = await readFile(file, "utf8");
    const displayPath = relative(repoRoot, file);
    if (PRODUCTION_ROUTE_IMPORT.test(source)) {
      violations.push(`${displayPath}:production-route-import`);
    }
    for (const shape of SECRET_SHAPES) {
      if (shape.test(source)) {
        violations.push(`${displayPath}:secret-or-token-shape:${shape.source}`);
      }
    }
  }

  for (const root of ["app", "components", "lib", "packages"]) {
    for await (const file of walk(join(repoRoot, root))) {
      const source = await readFile(file, "utf8");
      if (
        source.includes("tests/browser") ||
        source.includes("browser-qa-evidence") ||
        source.includes("playwright.config")
      ) {
        violations.push(
          `${relative(repoRoot, file)}:production-imports-browser-fixture`
        );
      }
    }
  }

  for await (const file of walk(join(repoRoot, "app"))) {
    const displayPath = relative(repoRoot, file);
    if (/browser[-_]qa/i.test(displayPath)) {
      violations.push(`${displayPath}:deployed-browser-qa-route`);
    }
  }

  return violations;
}

export async function verifyBrowserFixtureBoundary(repoRoot = REPO_ROOT) {
  assert.deepEqual(await findBrowserFixtureBoundaryViolations(repoRoot), []);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await verifyBrowserFixtureBoundary();
  console.log(
    "Browser QA fixture boundary is isolated from production routes."
  );
}

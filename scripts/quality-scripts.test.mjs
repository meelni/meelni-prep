import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const scripts = packageJson.scripts ?? {};
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
const playwrightConfig = readFileSync("playwright.config.ts", "utf8");
const testTsconfig = JSON.parse(readFileSync("tsconfig.tests.json", "utf8"));
const allTestsTsconfig = JSON.parse(
  readFileSync("tsconfig.tests.all.json", "utf8")
);

test("package scripts expose the aggregate quality gates", () => {
  for (const scriptName of [
    "check",
    "check:ci",
    "check:stack",
    "check:stack:ci",
    "quality",
    "quality:biome",
    "quality:biome:all",
    "quality:deps",
    "quality:deps:all",
    "quality:boundaries",
    "quality:security",
    "format:check:quality",
    "typecheck:tests",
    "typecheck:tests:all",
    "test:quality",
    "test:stack",
    "test:ui",
    "test:interview-resilience",
  ]) {
    assert.equal(
      typeof scripts[scriptName],
      "string",
      `${scriptName} should be defined in package.json`
    );
  }
});

test("CI owns one named end-interview resilience contract", () => {
  assert.equal(
    scripts["test:interview-resilience"],
    "tsx --test lib/http/deadline.test.ts lib/db/accept-user-interview-end.test.ts lib/interview/deadline-view.test.ts lib/interview/end-reconciliation.test.ts lib/interview/terminal-poll-window.test.ts lib/workflows/dispatch-feedback-generation.test.ts lib/workflows/end-interview-session.test.ts lib/utils/feedback-client-recovery.test.ts components/feedback/feedback-response.test.ts components/feedback/feedback-lifecycle-status.test.tsx && vitest run --fileParallelism=false 'app/api/session/[sessionId]/route.test.ts' app/api/interview/end/__tests__/route.test.ts 'app/api/feedback/[sessionId]/route.test.ts' app/interview/page-lifecycle.test.tsx 'app/feedback/[sessionId]/page.test.tsx' && python3 -m unittest agent.test_runtime_contracts.TranscriptIngestQueueTests"
  );
  assert.equal(
    ciWorkflow.match(/run:\s+npm run test:interview-resilience/g)?.length,
    1
  );
  assert.match(
    ciWorkflow,
    /tests:[\s\S]*?- name: Run end-interview resilience contract\s+run: npm run test:interview-resilience[\s\S]*?- name: Run regression tests/
  );
});

test("CI includes deterministic stacked PR regression fixtures", () => {
  assert.match(scripts["test:ci"], /npm\s+run\s+test:stack/);
  assert.equal(scripts["check:ci"], "npm run check && npm run test:ci");
});

test("CI installs pinned Python agent dependencies before contract tests", () => {
  assert.match(
    ciWorkflow,
    /static:[\s\S]*?- name: Install CI quality tooling\s+run: python -m pip install --disable-pip-version-check uv==0\.7\.6[\s\S]*?- name: Install pinned Python agent dependencies\s+run: uv pip install --no-config --no-cache --system --requirements agent\/requirements\.txt[\s\S]*?- name: Run Python agent contract tests/
  );
});

test("CI includes feedback and consent accessibility regression fixtures", () => {
  assert.match(scripts["test:ci"], /npm\s+run\s+test:ui/);
  assert.match(
    scripts["test:ui"],
    /components\/feedback\/\*\.test\.ts(?:\s|$)/
  );
  assert.match(
    scripts["test:ui"],
    /tsx\s+--test[\s\S]*&&\s+vitest\s+run\s+--fileParallelism=false\s+['"]app\/feedback\/\[sessionId\]\/page\.test\.tsx['"]/
  );
  assert.match(
    scripts["test:ui"],
    /vitest\s+run[\s\S]*['"]app\/feedback\/\[sessionId\]\/compare\/page\.test\.tsx['"]/
  );
});

test("the default test typecheck includes every test directory", () => {
  assert.deepEqual(testTsconfig.exclude, [
    "node_modules",
    ".next",
    "agent/venv",
  ]);
  assert.ok(testTsconfig.include.includes("**/*.test.ts"));
  assert.ok(testTsconfig.include.includes("**/*.test.tsx"));
  assert.ok(testTsconfig.include.includes("**/*.spec.ts"));
  assert.ok(testTsconfig.include.includes("**/*.spec.tsx"));
  assert.ok(testTsconfig.include.includes("**/__tests__/**/*.ts"));
  assert.ok(testTsconfig.include.includes("**/__tests__/**/*.tsx"));
  assert.deepEqual(allTestsTsconfig, { extends: "./tsconfig.tests.json" });

  const resolvedConfig = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "node_modules/typescript/bin/tsc",
        "--showConfig",
        "--project",
        "tsconfig.tests.json",
      ],
      { encoding: "utf8" }
    )
  );
  const resolvedFiles = new Set(
    resolvedConfig.files.map((file) => file.replace(/^\.\//, ""))
  );
  const trackedTestSources = execFileSync(
    "git",
    ["ls-files", "--", "*.ts", "*.tsx"],
    { encoding: "utf8" }
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter(
      (file) =>
        /\.(?:test|spec)\.tsx?$/.test(file) ||
        file.split("/").includes("__tests__")
    );
  const missingTestSources = trackedTestSources.filter(
    (file) => !resolvedFiles.has(file)
  );
  assert.deepEqual(
    missingTestSources,
    [],
    "tsconfig.tests.json must typecheck every tracked TS/TSX test source"
  );
});

test("browser QA exposes one pinned Chromium entrypoint", () => {
  assert.equal(
    scripts["build:browser:qa"],
    "node scripts/run-browser-qa.mjs build"
  );
  assert.equal(
    scripts["test:browser:install"],
    "playwright install --with-deps chromium"
  );
  assert.equal(
    scripts["test:browser:qa"],
    "node scripts/verify-browser-fixture-boundary.mjs && node scripts/run-browser-qa.mjs test"
  );
  assert.match(
    scripts["test:quality"],
    /verify-browser-fixture-boundary\.test\.mjs/
  );
});

test("CI runs browser QA in a lockfile-matched pinned container", () => {
  const productionJob = ciWorkflow.match(
    /\n {2}production:\n[\s\S]*?\n {2}validate:\n/
  )?.[0];
  const playwrightVersion =
    packageLock.packages?.["node_modules/@playwright/test"]?.version;
  const expectedContainer = `mcr.microsoft.com/playwright:v${playwrightVersion}-noble@sha256:5b8f294aff9041b7191c34a4bab3ac270157a28774d4b0660e9743297b697e48`;

  assert.ok(productionJob, "CI should define the production validation job");
  assert.equal(typeof playwrightVersion, "string");
  assert.match(
    expectedContainer,
    /mcr\.microsoft\.com\/playwright:v\d+\.\d+\.\d+-noble@sha256:[a-f0-9]{64}$/
  );
  assert.equal(
    productionJob.match(/\n\s+image: (\S+)/)?.[1],
    expectedContainer
  );
  assert.match(productionJob, /options: --user 1001/);
  assert.doesNotMatch(
    productionJob,
    /Resolve pinned Playwright version|Restore pinned Chromium|Install Chromium runtime|npm run test:browser:install|playwright install|actions\/cache@/
  );
  assert.equal(ciWorkflow.match(/run:\s+npm run test:browser:qa/g)?.length, 1);
  assert.doesNotMatch(ciWorkflow, /strategy:\s*\n\s*matrix:/);
  assert.match(
    ciWorkflow,
    /production:[\s\S]*?id: browser_qa[\s\S]*?run: npm run test:browser:qa[\s\S]*?validate:/
  );
  assert.match(
    ciWorkflow,
    /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7\.0\.1/
  );
  assert.equal(ciWorkflow.match(/run:\s+npm run build:browser:qa/g)?.length, 1);
  assert.match(playwrightConfig, /workers: process\.env\.CI \? 2 : 1/);
  assert.match(playwrightConfig, /retries: 0/);
  assert.match(playwrightConfig, /fullyParallel: false/);
});

test("the default check runs linting, formatting, type checks, and quality gates", () => {
  const defaultCheck = scripts.check;

  for (const requiredCommand of [
    "npm run format:check:quality",
    "npm run lint",
    "npm run typecheck",
    "npm run typecheck:tests",
    "npm run quality",
  ]) {
    assert.match(
      defaultCheck,
      new RegExp(requiredCommand.replaceAll(" ", "\\s+"))
    );
  }
});

test("security quality gate checks Semgrep through the uvx wrapper", () => {
  assert.equal(scripts["quality:security"], "node scripts/run-semgrep.mjs");
});

test("live calibration cannot enter through credential-inheriting npm", () => {
  assert.equal(scripts["calibration:live"], undefined);
  assert.notEqual(
    statSync("scripts/run-evaluation-calibration-live.sh").mode & 0o111,
    0
  );
});

test("generated live calibration evidence remains ignored by default", () => {
  const ignoredPaths = [
    "docs/evidence/sav-198-evaluation-calibration-live.json",
    "docs/evidence/sav-248-semantic-capture/output.json",
    "docs/evidence/sav-248-semantic-capture-report.json",
    "docs/evidence/sav-248-semantic-public-report.json",
  ];
  const trackedPublicEvidence = [
    "docs/evidence/sav-198-evaluation-calibration-preflight.json",
    "docs/evidence/sav-198-evaluation-calibration-self-test.json",
    "docs/evidence/sav-248-v32-plan-proposal.json",
  ];

  for (const path of ignoredPaths) {
    const result = execFileSync("git", ["check-ignore", "--quiet", path], {
      encoding: "utf8",
    });
    assert.equal(result, "");
  }

  for (const path of trackedPublicEvidence) {
    assert.throws(
      () =>
        execFileSync("git", ["check-ignore", "--quiet", path], {
          encoding: "utf8",
        }),
      /Command failed/
    );
  }
});

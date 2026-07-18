import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const scripts = packageJson.scripts ?? {};
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");

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
  ]) {
    assert.equal(
      typeof scripts[scriptName],
      "string",
      `${scriptName} should be defined in package.json`
    );
  }
});

test("CI includes deterministic stacked PR regression fixtures", () => {
  assert.match(scripts["check:ci"], /npm\s+run\s+test:stack/);
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

test("CI runs browser QA once in the existing PR validation job", () => {
  assert.equal(ciWorkflow.match(/run:\s+npm run test:browser:qa/g)?.length, 1);
  assert.doesNotMatch(ciWorkflow, /strategy:\s*\n\s*matrix:/);
  assert.match(
    ciWorkflow,
    /id: browser_qa[\s\S]*?github\.event_name == 'pull_request' \|\|[\s\S]*?github\.event_name == 'workflow_dispatch'[\s\S]*?run: npm run test:browser:qa/
  );
  assert.match(
    ciWorkflow,
    /actions\/cache@55cc8345863c7cc4c66a329aec7e433d2d1c52a9 # v6\.1\.0/
  );
  assert.match(
    ciWorkflow,
    /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7\.0\.1/
  );
  assert.equal(ciWorkflow.match(/run:\s+npm run build:browser:qa/g)?.length, 1);
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

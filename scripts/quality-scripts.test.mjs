import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const scripts = packageJson.scripts ?? {};

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

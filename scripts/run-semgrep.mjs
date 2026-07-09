#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const installMessage = [
  "Semgrep quality checks require uvx from the Python uv toolchain.",
  "Install uv: https://docs.astral.sh/uv/getting-started/installation/",
  "Then rerun: npm run quality:security",
].join("\n");

const uvxCheck = spawnSync("uvx", ["--version"], { stdio: "ignore" });

if (uvxCheck.error?.code === "ENOENT") {
  console.error(installMessage);
  process.exit(1);
}

if (uvxCheck.error) {
  console.error(`Unable to run uvx: ${uvxCheck.error.message}`);
  console.error(installMessage);
  process.exit(1);
}

const semgrep = spawnSync(
  "uvx",
  [
    "--from",
    "semgrep==1.168.0",
    "semgrep",
    "scan",
    "--config",
    ".semgrep.yml",
    "--error",
    "--metrics=off",
  ],
  { stdio: "inherit" }
);

if (semgrep.error) {
  console.error(`Unable to run Semgrep through uvx: ${semgrep.error.message}`);
  process.exit(1);
}

process.exit(semgrep.status ?? 1);

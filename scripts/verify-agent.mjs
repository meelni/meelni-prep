import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const requiredChecks = [
  ["doctor", "npm", ["run", "doctor"]],
  ["skills", "npm", ["run", "validate:skills"]],
  ["typecheck", "npm", ["run", "typecheck"]],
  ["local tests", "npm", ["run", "test:local"]],
  ["fixture tests", "npm", ["run", "test:fixtures"]],
  ["core tests", "npm", ["run", "test:core"]],
  ["agent tests", "npm", ["run", "test:agent"]],
  ["integration tests", "npm", ["run", "test:integrations"]],
  ["lint", "npm", ["run", "lint"]],
  ["build", "npm", ["run", "build"]],
];

const optionalChecks = [
  {
    name: "python agent tests",
    command: "npm",
    args: ["run", "test:python-agent"],
    when: () => existsSync(resolve(repoRoot, "agent/venv/bin/python")),
    skipReason:
      "agent/venv is missing; run `npm run setup:local` to enable Python agent validation.",
  },
];

for (const [name, command, args] of requiredChecks) {
  run(name, command, args);
}

for (const check of optionalChecks) {
  if (!check.when()) {
    console.log(`skip   ${check.name}: ${check.skipReason}`);
    continue;
  }

  run(check.name, check.command, check.args);
}

console.log("Agent verification passed.");

function run(name, command, args) {
  console.log(`\n==> ${name}`);

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    console.error(`\n${name} failed.`);
    process.exit(result.status ?? 1);
  }
}

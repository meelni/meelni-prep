import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const requiredChecks = [
  ["setup doctor", "npm", ["run", "doctor:setup"]],
  ["skills", "npm", ["run", "validate:skills"]],
  ["typecheck", "npm", ["run", "typecheck"]],
  ["local tests", "npm", ["run", "test:local"]],
  ["fixture tests", "npm", ["run", "test:fixtures"]],
  ["workflow tests", "npm", ["run", "test:workflows"]],
  ["package entrypoint tests", "npm", ["run", "test:packages"]],
  ["core tests", "npm", ["run", "test:core"]],
  ["agent tests", "npm", ["run", "test:agent"]],
  ["integration tests", "npm", ["run", "test:integrations"]],
  ["python agent tests", "npm", ["run", "test:python-agent"]],
  ["lint", "npm", ["run", "lint"]],
  ["build", "npm", ["run", "build"]],
];

for (const [name, command, args] of requiredChecks) {
  run(name, command, args);
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

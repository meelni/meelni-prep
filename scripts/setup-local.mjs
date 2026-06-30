import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureEnvFile, ensureSymlink } from "./local-env.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCachePath = resolve(repoRoot, ".context/npm-cache");

mkdirSync(npmCachePath, { recursive: true });

run("npm", ["install"], {
  ...process.env,
  NPM_CONFIG_CACHE: npmCachePath,
  npm_config_cache: npmCachePath,
});

const envResult = await ensureEnvFile({
  targetPath: resolve(repoRoot, ".env.local"),
  examplePath: resolve(repoRoot, ".env.example"),
});

console.log(`Root env: ${envResult.status}`);

const agentEnvTarget = resolve(repoRoot, ".env.local");
const agentEnvLink = resolve(repoRoot, "agent/.env");

if (existsSync(agentEnvTarget)) {
  const linkResult = await ensureSymlink({
    linkPath: agentEnvLink,
    targetPath: agentEnvTarget,
  });
  console.log(`Agent env: ${linkResult.status}`);
}

setupPythonAgent();

console.log("Local setup complete.");
console.log(
  "Run `npm run dev:local` to start the web app, Inngest, and agent."
);

function setupPythonAgent() {
  const agentDir = resolve(repoRoot, "agent");

  if (!existsSync(agentDir)) {
    console.log("Python agent directory is missing; skipping agent setup.");
    return;
  }

  const venvDir = resolve(agentDir, "venv");

  if (!existsSync(venvDir)) {
    run("python3", ["-m", "venv", "venv"], process.env, agentDir);
  }

  const pythonBin = resolve(venvDir, "bin/python");

  run(
    pythonBin,
    ["-m", "pip", "install", "--upgrade", "pip"],
    process.env,
    agentDir
  );
  run(
    pythonBin,
    ["-m", "pip", "install", "-r", "requirements.txt"],
    process.env,
    agentDir
  );
}

function run(command, args, env = process.env, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

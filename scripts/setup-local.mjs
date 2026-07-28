import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureEnvFile, ensureSymlink } from "./local-env.mjs";
import { createNodeInstallPlan } from "./local-setup-plan.mjs";
import { assertPinnedNodeVersion } from "./node-version.mjs";
import { buildPythonEnv } from "./python-runtime.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCachePath =
  process.env.NPM_CONFIG_CACHE || resolve(repoRoot, ".context/npm-cache");
const envPath = resolve(repoRoot, ".env.local");
const pythonEnv = buildPythonEnv();
const pythonCommand = findPythonCommand();

try {
  assertPinnedNodeVersion();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
mkdirSync(npmCachePath, { recursive: true });

const nodeInstallPlan = createNodeInstallPlan({
  nodeModulesExists: existsSync(resolve(repoRoot, "node_modules")),
  packageLockExists: existsSync(resolve(repoRoot, "package-lock.json")),
});
console.log(`Node dependencies: ${nodeInstallPlan.label}.`);
run("npm", nodeInstallPlan.args, {
  ...process.env,
  NPM_CONFIG_CACHE: npmCachePath,
  npm_config_cache: npmCachePath,
});

const envResult = await ensureEnvFile({
  targetPath: envPath,
  examplePath: resolve(repoRoot, ".env.example"),
});

console.log(`Root env: ${envResult.status}`);

const agentEnvTarget = envPath;
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
  const pythonBin = resolve(venvDir, "bin/python");
  const pipBin = resolve(venvDir, "bin/pip");

  if (
    existsSync(venvDir) &&
    (!existsSync(pythonBin) ||
      !existsSync(pipBin) ||
      pythonBinUsesSymlink(pythonBin))
  ) {
    console.log(
      "Python agent venv is incomplete or uses symlinked binaries; recreating with copied binaries for Next.js build compatibility."
    );
    rmSync(venvDir, { recursive: true, force: true });
  }

  if (!existsSync(venvDir)) {
    run(
      pythonCommand,
      ["-m", "venv", "--copies", "--without-pip", "venv"],
      pythonEnv,
      agentDir
    );
    run(
      pythonBin,
      ["-m", "ensurepip", "--upgrade", "--default-pip"],
      pythonEnv,
      agentDir
    );
  }

  run(
    pythonBin,
    ["-m", "pip", "install", "--upgrade", "pip"],
    pythonEnv,
    agentDir
  );
  run(
    pythonBin,
    ["-m", "pip", "install", "-r", "requirements.txt"],
    pythonEnv,
    agentDir
  );
}

function findPythonCommand() {
  for (const command of ["python3.12", "python3"]) {
    const result = spawnSync(command, ["--version"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: pythonEnv,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const version = `${result.stdout || ""} ${result.stderr || ""}`
      .replace(/^Python\s+/, "")
      .trim()
      .split(".")
      .map(Number);
    const [major = 0, minor = 0] = version;

    if (result.status === 0 && (major > 3 || (major === 3 && minor >= 12))) {
      return command;
    }
  }

  console.error(
    "Python 3.12+ is required. On macOS, run `brew install python@3.12`, then retry."
  );
  process.exit(1);
}

function pythonBinUsesSymlink(pythonBin) {
  try {
    return lstatSync(pythonBin).isSymbolicLink();
  } catch {
    return false;
  }
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

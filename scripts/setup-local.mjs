import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ensureEnvFile,
  ensureSymlink,
  readEnvFile,
  requiredEnvAlternativesStatus,
  requiredEnvStatus,
} from "./local-env.mjs";
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

run("npm", ["install"], {
  ...process.env,
  NPM_CONFIG_CACHE: npmCachePath,
  npm_config_cache: npmCachePath,
});

const envResult = await ensureEnvFile({
  targetPath: envPath,
  examplePath: resolve(repoRoot, ".env.example"),
});

console.log(`Root env: ${envResult.status}`);
refreshLocalEnvIfNeeded();

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

function refreshLocalEnvIfNeeded() {
  if (process.env.MEELNI_SKIP_ENV_PULL) {
    console.log("Skipping env refresh because MEELNI_SKIP_ENV_PULL is set.");
    return;
  }

  const values = readEnvFile(envPath);
  const status = requiredEnvStatus(values, [
    "DATABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "OPENAI_API_KEY",
  ]);
  const liveKitUrlStatus = requiredEnvAlternativesStatus(values, [
    {
      label: "NEXT_PUBLIC_LIVEKIT_URL or LIVEKIT_URL",
      keys: ["NEXT_PUBLIC_LIVEKIT_URL", "LIVEKIT_URL"],
    },
  ]);
  const missing = [...status.missing, ...liveKitUrlStatus.missing];
  const placeholder = [...status.placeholder, ...liveKitUrlStatus.placeholder];

  if (missing.length === 0 && placeholder.length === 0) {
    return;
  }

  console.log(
    "Root env needs refresh before runtime: " +
      [
        missing.length ? `missing ${missing.join(", ")}` : "",
        placeholder.length ? `placeholder ${placeholder.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; ")
  );

  const whoami = spawnSync("npx", ["--yes", "vercel@55.0.0", "whoami"], {
    cwd: repoRoot,
    env: process.env,
    shell: process.platform === "win32",
    stdio: ["ignore", "ignore", "ignore"],
  });

  if (whoami.status !== 0) {
    console.warn(
      "Vercel CLI is not authenticated; keeping existing .env.local. Run `npx vercel@55.0.0 login`, then `npm run env:pull`."
    );
    return;
  }

  run("npx", [
    "--yes",
    "vercel@55.0.0",
    "link",
    "--yes",
    "--project",
    "meelni",
    "--scope",
    "meelni",
  ]);
  run("npm", ["run", "env:pull"]);
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

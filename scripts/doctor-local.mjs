import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  readEnvFile,
  requiredEnvAlternativesStatus,
  requiredEnvStatus,
} from "./local-env.mjs";
import {
  evaluateNodeVersion,
  nodeVersionRecoveryCommand,
  readPinnedNodeVersion,
} from "./node-version.mjs";
import { buildPythonEnv } from "./python-runtime.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requestedMode = process.argv[2] || "--runtime";
if (!["--setup", "--runtime"].includes(requestedMode)) {
  console.error("Usage: node scripts/doctor-local.mjs [--setup|--runtime]");
  process.exit(1);
}
const runtimeMode = requestedMode === "--runtime";
const doctorLabel = runtimeMode ? "Runtime doctor" : "Setup doctor";
const results = [];
const packageJson = readJson("package.json");
const conductorJson = readJson("conductor.json", { optional: true });
const codexEnvironment = readText(".codex/environments/environment.toml", {
  optional: true,
});

check("Node", () => {
  const requiredVersion = readPinnedNodeVersion(repoRoot);
  const result = evaluateNodeVersion({
    actualVersion: process.version,
    requiredVersion,
  });

  return result.matches
    ? pass(`Node ${result.actualVersion} matches required ${requiredVersion}.`)
    : fail(
        `Node ${result.actualVersion || "unknown"} does not match required ${requiredVersion}. Run \`${nodeVersionRecoveryCommand(requiredVersion)}\`, then retry.`
      );
});

check("npm", () => {
  const version = execFileSync("npm", ["--version"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  return pass(`npm ${version} is available.`);
});

check("Package workspaces", () => {
  const workspaces = packageJson.workspaces || [];
  return workspaces.includes("packages/*")
    ? pass("packages/* workspace is registered.")
    : fail('package.json must include workspaces: ["packages/*"].');
});

check("Node dependencies", () => {
  const nextBin = resolve(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "next.cmd" : "next"
  );

  return existsSync(nextBin)
    ? pass("Next.js binary exists in node_modules.")
    : fail("Next.js binary is missing. Run `npm run setup:local`.");
});

check("Root env", () => {
  const envPath = resolve(repoRoot, ".env.local");

  if (!existsSync(envPath)) {
    return runtimeReadiness(
      ".env.local is missing. Run `npm run setup:local`, then use the explicit Pull Env action before provider-backed runtime work."
    );
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

  if (missing.length > 0) {
    return runtimeReadiness(
      `.env.local is missing required runtime value(s): ${missing.join(", ")}. Run \`npx vercel@55.0.0 link --yes --project meelni --scope meelni\`, then \`npm run env:pull\`.`
    );
  }

  if (placeholder.length > 0) {
    return runtimeReadiness(
      `.env.local contains placeholder value(s): ${placeholder.join(", ")}. Run \`npx vercel@55.0.0 link --yes --project meelni --scope meelni\`, then \`npm run env:pull\`.`
    );
  }

  return pass(
    ".env.local contains required runtime keys without placeholders."
  );
});

check("Python", () => {
  for (const command of ["python3.12", "python3"]) {
    try {
      const version = execFileSync(command, ["--version"], {
        cwd: repoRoot,
        encoding: "utf8",
        env: buildPythonEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      const [major = 0, minor = 0] = version
        .replace(/^Python\s+/, "")
        .split(".")
        .map(Number);

      return major > 3 || (major === 3 && minor >= 12)
        ? pass(`${version} is available as ${command}.`)
        : fail(
            `${version} is too old; Python 3.12+ is required. On macOS, run \`brew install python@3.12\`.`
          );
    } catch {
      // Try the next supported command name.
    }
  }

  return fail(
    "Python 3.12+ is unavailable. On macOS, run `brew install python@3.12`."
  );
});

check("Python agent venv", () => {
  const pythonBin = resolve(repoRoot, "agent/venv/bin/python");

  if (!existsSync(pythonBin)) {
    return warn(
      "agent/venv is missing. Run `npm run setup:local` before starting the agent."
    );
  }

  const version = execFileSync(pythonBin, ["--version"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: buildPythonEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  return pass(`agent/venv is ready (${version}).`);
});

check("Conductor config", () => {
  if (!conductorJson) {
    return fail("conductor.json is missing.");
  }

  if (conductorJson.scripts?.setup !== "bash scripts/bootstrap-worktree.sh") {
    return fail(
      "conductor.json setup should be `bash scripts/bootstrap-worktree.sh`."
    );
  }

  if (conductorJson.scripts?.run !== "npm run dev:local") {
    return fail("conductor.json run should be `npm run dev:local`.");
  }

  return pass("conductor.json points to local setup/run scripts.");
});

check("Codex worktree bootstrap", () => {
  if (!codexEnvironment) {
    return fail(".codex/environments/environment.toml is missing.");
  }
  if (
    !codexEnvironment.includes(
      '. "$CODEX_WORKTREE_PATH/scripts/bootstrap-worktree.sh"'
    )
  ) {
    return fail(
      "Codex setup must source scripts/bootstrap-worktree.sh from the target worktree."
    );
  }
  if (!existsSync(resolve(repoRoot, "scripts/bootstrap-worktree.sh"))) {
    return fail("scripts/bootstrap-worktree.sh is missing.");
  }
  return pass("Codex delegates setup to the target worktree bootstrap.");
});

for (const result of results) {
  console.log(`${result.status.padEnd(6)} ${result.name}: ${result.message}`);
}

const failures = results.filter((result) => result.status === "fail");
const warnings = results.filter((result) => result.status === "warn");

console.log("");

if (failures.length > 0) {
  console.log(
    `${doctorLabel} found ${failures.length} failure(s) and ${warnings.length} warning(s).`
  );
  process.exit(1);
}

console.log(`${doctorLabel} passed with ${warnings.length} warning(s).`);

function check(name, fn) {
  try {
    results.push({ name, ...fn() });
  } catch (error) {
    results.push({
      name,
      status: "fail",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function pass(message) {
  return { status: "pass", message };
}

function warn(message) {
  return { status: "warn", message };
}

function fail(message) {
  return { status: "fail", message };
}

function runtimeReadiness(message) {
  return runtimeMode
    ? fail(message)
    : warn(`${message} Setup remains provider-free.`);
}

function readJson(relativePath, options = {}) {
  const path = resolve(repoRoot, relativePath);

  if (!existsSync(path)) {
    if (options.optional) {
      return undefined;
    }

    throw new Error(`${relativePath} is missing.`);
  }

  return JSON.parse(readFileSync(path, "utf8"));
}

function readText(relativePath, options = {}) {
  const path = resolve(repoRoot, relativePath);
  if (!existsSync(path)) {
    if (options.optional) return undefined;
    throw new Error(`${relativePath} is missing.`);
  }
  return readFileSync(path, "utf8");
}

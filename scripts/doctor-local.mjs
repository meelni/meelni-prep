import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readEnvFile, requiredEnvStatus } from "./local-env.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const packageJson = readJson("package.json");
const conductorJson = readJson("conductor.json", { optional: true });

check("Node", () => pass(`Node ${process.version} is available.`));

check("npm", () => {
  const version = execFileSync("npm", ["--version"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
  return pass(`npm ${version} is available.`);
});

check("Package workspaces", () => {
  const workspaces = packageJson.workspaces || [];
  return workspaces.includes("packages/*")
    ? pass("packages/* workspace is registered.")
    : fail("package.json must include workspaces: [\"packages/*\"].");
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
    return warn(".env.local is missing. Run `npm run setup:local` and fill in required secrets.");
  }

  const status = requiredEnvStatus(readEnvFile(envPath), [
    "DATABASE_URL",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
    "OPENAI_API_KEY"
  ]);

  return status.ok
    ? pass(".env.local contains required runtime keys.")
    : warn(`.env.local is missing: ${status.missing.join(", ")}.`);
});

check("Python", () => {
  try {
    const version = execFileSync("python3", ["--version"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
    return pass(version);
  } catch {
    return fail("python3 is unavailable.");
  }
});

check("Python agent venv", () => {
  const pythonBin = resolve(repoRoot, "agent/venv/bin/python");

  return existsSync(pythonBin)
    ? pass("agent/venv exists.")
    : warn("agent/venv is missing. Run `npm run setup:local` before starting the agent.");
});

check("Conductor config", () => {
  if (!conductorJson) {
    return fail("conductor.json is missing.");
  }

  if (conductorJson.scripts?.setup !== "npm run setup:local") {
    return fail("conductor.json setup should be `npm run setup:local`.");
  }

  if (conductorJson.scripts?.run !== "npm run dev:local") {
    return fail("conductor.json run should be `npm run dev:local`.");
  }

  return pass("conductor.json points to local setup/run scripts.");
});

for (const result of results) {
  console.log(`${result.status.padEnd(6)} ${result.name}: ${result.message}`);
}

const failures = results.filter((result) => result.status === "fail");
const warnings = results.filter((result) => result.status === "warn");

console.log("");

if (failures.length > 0) {
  console.log(`Doctor found ${failures.length} failure(s) and ${warnings.length} warning(s).`);
  process.exit(1);
}

console.log(`Doctor passed with ${warnings.length} warning(s).`);

function check(name, fn) {
  try {
    results.push({ name, ...fn() });
  } catch (error) {
    results.push({
      name,
      status: "fail",
      message: error instanceof Error ? error.message : String(error)
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

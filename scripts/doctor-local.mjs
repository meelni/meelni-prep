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

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const packageJson = readJson("package.json");
const conductorJson = readJson("conductor.json", { optional: true });

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
    return warn(
      ".env.local is missing. Run `npm run setup:local` and fill in required secrets."
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
    return fail(
      `.env.local is missing required runtime value(s): ${missing.join(", ")}. Run \`npx vercel@55.0.0 link --yes --project meelni\`, then \`npm run env:pull\`.`
    );
  }

  if (placeholder.length > 0) {
    return fail(
      `.env.local contains placeholder value(s): ${placeholder.join(", ")}. Run \`npx vercel@55.0.0 link --yes --project meelni\`, then \`npm run env:pull\`.`
    );
  }

  return pass(
    ".env.local contains required runtime keys without placeholders."
  );
});

check("Python", () => {
  try {
    const version = execFileSync("python3", ["--version"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
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
    : warn(
        "agent/venv is missing. Run `npm run setup:local` before starting the agent."
      );
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
  console.log(
    `Doctor found ${failures.length} failure(s) and ${warnings.length} warning(s).`
  );
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

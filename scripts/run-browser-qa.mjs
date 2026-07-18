import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SANDBOX_ROOT = join(REPO_ROOT, ".context", "browser-qa-workspace");
const SOURCE_FINGERPRINT_FILE = join(
  SANDBOX_ROOT,
  ".meelni-source-fingerprint"
);
const ARTIFACT_DIRECTORIES = ["playwright-report", "test-results"];
const SAFE_PARENT_ENV_KEYS = [
  "CI",
  "DEBUG",
  "FORCE_COLOR",
  "HOME",
  "LANG",
  "LC_ALL",
  "NO_COLOR",
  "PATH",
  "PLAYWRIGHT_BROWSERS_PATH",
  "SHELL",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "USER",
  "XDG_CACHE_HOME",
];

export function isBrowserQaEnvironmentFile(path) {
  const name = basename(path);
  return name !== ".env.example" && /^\.env(?:\.|$)/.test(name);
}

export function createBrowserQaEnvironment(
  parentEnv = process.env,
  repoRoot = REPO_ROOT,
  { blockEgress = true, turbopackRoot = repoRoot } = {}
) {
  const environment = {};
  for (const key of SAFE_PARENT_ENV_KEYS) {
    const value = parentEnv[key];
    if (typeof value === "string" && value.length > 0) {
      environment[key] = value;
    }
  }

  const egressGuard = pathToFileURL(
    join(repoRoot, "tests/browser/support/block-server-egress.mjs")
  ).href;
  const browserQaEnvironment = {
    ...environment,
    MEELNI_BROWSER_QA: "true",
    MEELNI_BROWSER_QA_TURBOPACK_ROOT: turbopackRoot,
    MEELNI_REACTIVATION_DEFAULT: "true",
    MEELNI_RELAUNCH_PHASE: "launched",
    NEXT_PUBLIC_STATSIG_CLIENT_KEY: "",
    NEXT_PUBLIC_STATSIG_ENVIRONMENT: "production",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "browser-qa-anon-placeholder",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
    VERCEL_ENV: "production",
  };
  if (blockEgress) {
    browserQaEnvironment.NODE_OPTIONS = `--import=${egressGuard}`;
  }
  return browserQaEnvironment;
}

function sourcePaths(repoRoot = REPO_ROOT) {
  const output = execFileSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--modified",
      "--others",
      "--exclude-standard",
      "-z",
    ],
    { cwd: repoRoot, encoding: "utf8" }
  );
  return [...new Set(output.split("\0").filter(Boolean))]
    .filter((path) => !isBrowserQaEnvironmentFile(path))
    .sort();
}

async function existingSourceEntries(repoRoot = REPO_ROOT) {
  const entries = [];
  for (const path of sourcePaths(repoRoot)) {
    const source = join(repoRoot, path);
    try {
      entries.push({ path, source, stat: await lstat(source) });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return entries;
}

async function sourceFingerprint(repoRoot = REPO_ROOT) {
  const hash = createHash("sha256");
  for (const entry of await existingSourceEntries(repoRoot)) {
    hash.update(entry.path);
    hash.update("\0");
    if (entry.stat.isSymbolicLink()) {
      hash.update(await readlink(entry.source));
    } else if (entry.stat.isFile()) {
      hash.update(await readFile(entry.source));
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function prepareSandbox() {
  await rm(SANDBOX_ROOT, { force: true, recursive: true });
  await mkdir(SANDBOX_ROOT, { recursive: true });

  for (const entry of await existingSourceEntries()) {
    const destination = join(SANDBOX_ROOT, entry.path);
    await mkdir(dirname(destination), { recursive: true });
    if (entry.stat.isSymbolicLink()) {
      await symlink(await readlink(entry.source), destination);
    } else if (entry.stat.isFile()) {
      await cp(entry.source, destination);
    }
  }

  await symlink(
    join(REPO_ROOT, "node_modules"),
    join(SANDBOX_ROOT, "node_modules"),
    process.platform === "win32" ? "junction" : "dir"
  );
}

function runNode(args, environment) {
  const result = spawnSync(process.execPath, args, {
    cwd: SANDBOX_ROOT,
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal) {
    throw new Error(`Browser QA child exited from signal ${result.signal}`);
  }
  return result.status ?? 1;
}

async function build() {
  const fingerprint = await sourceFingerprint();
  await prepareSandbox();
  const environment = createBrowserQaEnvironment(process.env, SANDBOX_ROOT, {
    blockEgress: false,
    turbopackRoot: REPO_ROOT,
  });
  const commands = [
    [
      "node_modules/tsx/dist/cli.mjs",
      "scripts/deployment-preflight.ts",
      "--if-deploy",
    ],
    ["node_modules/next/dist/bin/next", "build"],
    [
      "scripts/verify-public-surface.mjs",
      "--manifest",
      ".next/server/app-paths-manifest.json",
    ],
  ];
  for (const command of commands) {
    const status = runNode(command, environment);
    if (status !== 0) process.exit(status);
  }
  await writeFile(SOURCE_FINGERPRINT_FILE, `${fingerprint}\n`, "utf8");
}

async function copyArtifacts() {
  for (const directory of ARTIFACT_DIRECTORIES) {
    const source = join(SANDBOX_ROOT, directory);
    const destination = join(REPO_ROOT, directory);
    await rm(destination, { force: true, recursive: true });
    try {
      await cp(source, destination, { recursive: true });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

async function testBrowserQa() {
  const [expected, current] = await Promise.all([
    readFile(SOURCE_FINGERPRINT_FILE, "utf8").catch(() => ""),
    sourceFingerprint(),
  ]);
  if (expected.trim() !== current) {
    throw new Error(
      "Browser QA source changed or has not been built. Run npm run build:browser:qa first."
    );
  }

  const environment = createBrowserQaEnvironment(process.env, SANDBOX_ROOT, {
    turbopackRoot: REPO_ROOT,
  });
  const status = runNode(
    [
      "node_modules/@playwright/test/cli.js",
      "test",
      "--config=playwright.config.ts",
    ],
    environment
  );
  await copyArtifacts();
  await rm(SANDBOX_ROOT, { force: true, recursive: true });
  process.exitCode = status;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const mode = process.argv[2];
  if (mode === "build") await build();
  else if (mode === "test") await testBrowserQa();
  else {
    throw new Error("Usage: node scripts/run-browser-qa.mjs <build|test>");
  }
}

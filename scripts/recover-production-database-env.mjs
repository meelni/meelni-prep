import { existsSync, lstatSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { parse as parseDotenv } from "dotenv";

import { EXPECTED_PRODUCTION_SUPABASE_PROJECT_REF } from "../lib/supabase/supabase-jwt.mjs";
import {
  acquireTargetLock,
  pullVercelEnvironment,
  readExistingText,
  validateTarget,
  writeEnvAtomically,
} from "./pull-vercel-env.mjs";
import {
  inferDatabaseProjectRef,
  inferSupabaseProjectRef,
} from "./supabase-project-ref.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_FILE = ".env.production.local";
const CANONICAL_VERCEL_LINK = Object.freeze({
  orgId: "team_rWHulu37yqEIUBTvTHqemRHU",
  projectId: "prj_NvpsSMhIhmUoaVAG5nPnbd2fRmT4",
  projectName: "meelni",
});

export async function recoverProductionDatabaseEnvironment({
  logger = console,
  pull = ({ root }) =>
    pullVercelEnvironment({ environment: "production", root, scope: "meelni" }),
  root = repoRoot,
  sourceFile,
  write = writeEnvAtomically,
} = {}) {
  const target = resolve(root, TARGET_FILE);
  const source = resolve(root, sourceFile ?? TARGET_FILE);

  validateTarget(target, "production", root);
  validateCanonicalVercelLink(root);
  validatePrivateSource(source);

  const releaseLock = acquireTargetLock(target);
  try {
    const sourceText = readExistingText(source);
    const pulledText = pull({ root });
    const recovered = buildProductionDatabaseEnv({ pulledText, sourceText });
    write(target, recovered);
    logger.log(
      `Recovered database-only ${basename(target)} for Production preflight.`
    );
    return { target };
  } finally {
    releaseLock();
  }
}

export function buildProductionDatabaseEnv({ pulledText, sourceText }) {
  assertSingleAssignment(sourceText, "DATABASE_URL", "owner-local source");
  assertSingleAssignment(pulledText, "NEXT_PUBLIC_SUPABASE_URL", "Vercel pull");
  assertSingleAssignment(
    pulledText,
    "MEELNI_PRODUCTION_SUPABASE_PROJECT_REF",
    "Vercel pull"
  );
  const pulled = parseDotenv(pulledText);
  const source = parseDotenv(sourceText);

  assertProductionIdentity(source, "owner-local source", {
    requireVercelEnvironment: false,
  });
  // Raw `vercel env pull --environment=production` may omit VERCEL_ENV. The
  // fixed CLI flag and canonical link prove the target; any present marker
  // must still agree before the command emits the canonical output marker.
  assertProductionIdentity(pulled, "Vercel pull", {
    requireVercelEnvironment: false,
  });

  const databaseUrl = source.DATABASE_URL;
  const databaseRef = inferDatabaseProjectRef(databaseUrl);
  if (!databaseUrl?.trim() || !databaseRef) {
    throw new Error(
      "The owner-local Production source has no verifiable DATABASE_URL. The existing file was kept."
    );
  }

  const publicRef = inferSupabaseProjectRef(pulled.NEXT_PUBLIC_SUPABASE_URL);
  if (!publicRef) {
    throw new Error(
      "The fresh Vercel Production pull has no verifiable public Supabase identity. The existing file was kept."
    );
  }

  const declaredProductionRef =
    pulled.MEELNI_PRODUCTION_SUPABASE_PROJECT_REF?.trim();
  const expectedRef = EXPECTED_PRODUCTION_SUPABASE_PROJECT_REF;
  if (
    databaseRef !== expectedRef ||
    publicRef !== expectedRef ||
    declaredProductionRef !== expectedRef
  ) {
    throw new Error(
      "Production database, public Supabase, and canonical project identities do not match. The existing file was kept."
    );
  }

  return [
    "MEELNI_ENV_PULL_ENVIRONMENT=production",
    "VERCEL_ENV=production",
    `MEELNI_PRODUCTION_SUPABASE_PROJECT_REF=${expectedRef}`,
    `DATABASE_URL=${JSON.stringify(databaseUrl)}`,
    "",
  ].join("\n");
}

function assertSingleAssignment(text, key, label) {
  const count =
    text.match(new RegExp(`^\\s*(?:export\\s+)?${key}(?:\\s*=|:\\s+)`, "gm"))
      ?.length ?? 0;
  if (count !== 1) {
    throw new Error(
      `${label} must contain exactly one ${key} assignment. The existing file was kept.`
    );
  }
}

export function validateCanonicalVercelLink(root) {
  const linkPath = resolve(root, ".vercel/project.json");
  if (!existsSync(linkPath)) {
    throw new Error(
      "The worktree is not linked to the canonical Meelni Vercel project."
    );
  }
  const stats = lstatSync(linkPath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error("The Vercel project link must be a regular file.");
  }

  let link;
  try {
    link = JSON.parse(readFileSync(linkPath, "utf8"));
  } catch {
    throw new Error("The Vercel project link is invalid.");
  }
  for (const [key, expected] of Object.entries(CANONICAL_VERCEL_LINK)) {
    if (link[key] !== expected) {
      throw new Error(
        "The worktree is linked to the wrong Vercel team or project."
      );
    }
  }
}

function assertProductionIdentity(env, label, { requireVercelEnvironment }) {
  const marker = env.MEELNI_ENV_PULL_ENVIRONMENT;
  if (marker && marker !== "production") {
    throw new Error(
      `${label} is not marked for Production. The existing file was kept.`
    );
  }
  if (
    (requireVercelEnvironment || env.VERCEL_ENV) &&
    env.VERCEL_ENV !== "production"
  ) {
    throw new Error(
      `${label} has a non-Production VERCEL_ENV. The existing file was kept.`
    );
  }
  if (env.VERCEL_TARGET_ENV && env.VERCEL_TARGET_ENV !== "production") {
    throw new Error(
      `${label} has a non-Production VERCEL_TARGET_ENV. The existing file was kept.`
    );
  }
  if (
    env.VERCEL_PROJECT_ID &&
    env.VERCEL_PROJECT_ID !== CANONICAL_VERCEL_LINK.projectId
  ) {
    throw new Error(
      `${label} has the wrong Vercel project identity. The existing file was kept.`
    );
  }
  if (env.VERCEL_ORG_ID && env.VERCEL_ORG_ID !== CANONICAL_VERCEL_LINK.orgId) {
    throw new Error(
      `${label} has the wrong Vercel team identity. The existing file was kept.`
    );
  }
}

function validatePrivateSource(source) {
  if (!existsSync(source)) {
    throw new Error("The owner-local Production source file does not exist.");
  }
  const stats = lstatSync(source);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(
      "The owner-local Production source must be a regular file."
    );
  }
  if ((stats.mode & 0o077) !== 0) {
    throw new Error(
      "The owner-local Production source must not be group/world accessible."
    );
  }
}

function readSourceArg(argv) {
  if (argv.length === 0) return undefined;
  if (argv.length === 2 && argv[0] === "--source-file") return argv[1];
  throw new Error(
    "Usage: npm run env:recover:database:production -- [--source-file /absolute/private/env]"
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  recoverProductionDatabaseEnvironment({
    sourceFile: readSourceArg(process.argv.slice(2)),
  }).catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Production database env recovery failed"
    );
    process.exitCode = 1;
  });
}

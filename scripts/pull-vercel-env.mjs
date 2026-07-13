import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseDotenv } from "dotenv";

import {
  inferDatabaseProjectRef,
  inferSupabaseProjectRef,
} from "./supabase-project-ref.mjs";
import { getSupabaseEnvironmentIdentityPolicy } from "./supabase-environment-guard.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const PRESERVE_WHEN_ENCRYPTED_KEYS = [
  "CONTACT_NOTIFICATION_EMAIL",
  "CRON_SECRET",
  "DATABASE_URL",
  "DEEPGRAM_API_KEY",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  "GOOGLE_SHEETS_API_KEY",
  "GOOGLE_SHEETS_CREDENTIALS",
  "GOOGLE_SHEETS_CREDENTIALS_BASE64",
  "GOOGLE_SHEET_CSV_URL",
  "GOOGLE_SHEET_ID",
  "GOOGLE_SHEET_NAME",
  "GOOGLE_SHEET_TIME_ZONE",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "LIVEKIT_DEMO_AGENT_NAME",
  "LIVEKIT_INTERVIEW_AGENT_NAME",
  "LIVEKIT_URL",
  "MEELNI_REACTIVATION_DEFAULT",
  "NEXT_PUBLIC_LIVEKIT_URL",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "OPENAI_API_KEY",
  "POSTHOG_SERVER_KEY",
  "QUESTION_SYNC_OPERATOR_SECRET",
  "RESEND_API_KEY",
  "SENTRY_DSN",
  "STRIPE_SECRET_KEY",
  "STRIPE_INTERVIEW_PASS_PRICE_ID",
  "STRIPE_PRO_MONTHLY_PRICE_ID",
  "STRIPE_STARTER_MONTHLY_PRICE_ID",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const REQUIRED_RUNTIME_KEYS = [
  "DATABASE_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "MEELNI_PRODUCTION_LIVEKIT_URL",
  "MEELNI_PRODUCTION_SUPABASE_PROJECT_REF",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "OPENAI_API_KEY",
];

const REQUIRED_BILLING_KEYS = [
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_INTERVIEW_PASS_PRICE_ID",
  "STRIPE_STARTER_MONTHLY_PRICE_ID",
  "STRIPE_PRO_MONTHLY_PRICE_ID",
];

const DEFAULTABLE_PUBLIC_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_STATSIG_CLIENT_KEY",
];

const ALLOWED_TARGETS = {
  preview: ".env.local",
  production: ".env.production.local",
};
const MAX_LOCK_AGE_MS = 5 * 60 * 1000;
const PRODUCTION_APP_HOSTS = new Set(["meelni.com", "www.meelni.com"]);

export async function refreshEnvironment({
  adoptExisting = false,
  environment,
  target,
  pull = pullVercelEnvironment,
  logger = console,
  root = repoRoot,
} = {}) {
  const selectedEnvironment = environment ?? "preview";
  const selectedTarget = resolve(root, target ?? ALLOWED_TARGETS.preview);

  validateTarget(selectedTarget, selectedEnvironment, root);
  hardenExistingTarget(selectedTarget);

  const releaseLock = acquireTargetLock(selectedTarget);
  try {
    const previousText = readExistingText(selectedTarget);
    const pulledText = pull({
      environment: selectedEnvironment,
      root,
    });
    const defaults = readPublicDefaults(root);
    const env = buildRefreshedEnv({
      adoptExisting,
      defaults,
      environment: selectedEnvironment,
      previousText,
      pulledText,
    });

    validateRefreshedEnv(env, selectedEnvironment);
    writeEnvAtomically(selectedTarget, env);
    logger.log(
      `Refreshed ${basename(selectedTarget)} from the Vercel ${selectedEnvironment} environment.`
    );

    return { environment: selectedEnvironment, target: selectedTarget };
  } finally {
    releaseLock();
  }
}

export function buildRefreshedEnv({
  adoptExisting = false,
  defaults = {},
  environment,
  previousText = "",
  pulledText,
}) {
  let env = pulledText;
  const previous = parseEnv(previousText);

  assertEnvironmentMarker(previous, environment);
  assertEnvironmentMarker(parseEnv(pulledText), environment);
  const preservableKeys = resolvePreservableKeys({
    adoptExisting,
    environment,
    previous,
    previousText,
    pulledText,
  });

  for (const key of preservableKeys) {
    const previousRawValue = readRawEnvValue(previousText, key);
    if (
      hasEnvKey(env, key) &&
      isBlankOrPlaceholder(readEnvValue(env, key)) &&
      isUsableEnvValue(previous[key])
    ) {
      env = upsertRaw(env, key, previousRawValue);
    }
  }

  const defaultableKeys =
    environment === "production"
      ? DEFAULTABLE_PUBLIC_KEYS.filter((key) => key !== "NEXT_PUBLIC_APP_URL")
      : DEFAULTABLE_PUBLIC_KEYS;
  for (const key of defaultableKeys) {
    const value = defaults[key];
    if (
      isBlankOrPlaceholder(readEnvValue(env, key)) &&
      isUsableEnvValue(value)
    ) {
      env = upsert(env, key, value);
    }
  }

  env = upsert(env, "MEELNI_ENV_PULL_ENVIRONMENT", environment);
  env = upsert(env, "NEXT_PUBLIC_STATSIG_ENVIRONMENT", environment);
  return ensureTrailingNewline(env);
}

export function validateRefreshedEnv(env, environment) {
  const runtimeKeys =
    environment === "preview"
      ? [...REQUIRED_RUNTIME_KEYS, "MEELNI_PREVIEW_LIVEKIT_URL"]
      : REQUIRED_RUNTIME_KEYS;
  const requiredKeys =
    environment === "production"
      ? [...runtimeKeys, ...REQUIRED_BILLING_KEYS, "NEXT_PUBLIC_APP_URL"]
      : [...runtimeKeys, ...REQUIRED_BILLING_KEYS];
  const missing = requiredKeys.filter((key) =>
    isBlankOrPlaceholder(readEnvValue(env, key))
  );
  if (
    isBlankOrPlaceholder(readEnvValue(env, "NEXT_PUBLIC_LIVEKIT_URL")) &&
    isBlankOrPlaceholder(readEnvValue(env, "LIVEKIT_URL"))
  ) {
    missing.push("NEXT_PUBLIC_LIVEKIT_URL or LIVEKIT_URL");
  }

  if (missing.length > 0) {
    throw new Error(
      `Vercel ${environment} did not provide usable ${missing.join(
        ", "
      )}. The existing file was kept. Restore the missing ${environment} value from its provider dashboard or rotate it in Vercel, then retry.`
    );
  }

  const databaseRef = inferDatabaseProjectRef(
    readEnvValue(env, "DATABASE_URL")
  );
  const publicRef = inferSupabaseProjectRef(
    readEnvValue(env, "NEXT_PUBLIC_SUPABASE_URL")
  );
  if (!databaseRef || !publicRef) {
    throw new Error(
      `Could not verify the Vercel ${environment} Supabase project alignment. The existing file was kept.`
    );
  }

  if (databaseRef !== publicRef) {
    throw new Error(
      `Vercel ${environment} DATABASE_URL and NEXT_PUBLIC_SUPABASE_URL target different Supabase projects. The existing file was kept.`
    );
  }

  const anonClaims = readSupabaseAnonClaims(
    readEnvValue(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
  const anonRef = anonClaims?.ref;
  if (!anonRef) {
    throw new Error(
      `Could not verify the Vercel ${environment} Supabase anon key project. The existing file was kept.`
    );
  }
  if (anonRef && anonRef !== publicRef) {
    throw new Error(
      `Vercel ${environment} NEXT_PUBLIC_SUPABASE_ANON_KEY targets a different Supabase project. The existing file was kept.`
    );
  }
  if (anonClaims.role !== "anon") {
    throw new Error(
      `Vercel ${environment} NEXT_PUBLIC_SUPABASE_ANON_KEY is not an anon-role token. The existing file was kept.`
    );
  }
  if (!issuerMatchesProject(anonClaims.iss, publicRef)) {
    throw new Error(
      `Vercel ${environment} NEXT_PUBLIC_SUPABASE_ANON_KEY has an unexpected issuer. The existing file was kept.`
    );
  }

  const identityPolicy = getSupabaseEnvironmentIdentityPolicy({
    databaseUrl: readEnvValue(env, "DATABASE_URL"),
    environment,
    expectedEnvironment: environment,
    productionProjectRef: readEnvValue(
      env,
      "MEELNI_PRODUCTION_SUPABASE_PROJECT_REF"
    ),
    vercelEnvironment: readEnvValue(env, "VERCEL_ENV"),
  });
  if (!identityPolicy.allowed) {
    throw new Error(
      `Vercel ${environment} environment identity check failed: ${identityPolicy.reason}. The existing file was kept.`
    );
  }

  validateLiveKitIdentity(env, environment);
  validateStripeMode(env, environment);

  if (environment === "production") {
    validateProductionAppUrl(readEnvValue(env, "NEXT_PUBLIC_APP_URL"));
  }
}

export function inferSupabaseAnonProjectRef(value) {
  return readSupabaseAnonClaims(value)?.ref;
}

export function readSupabaseAnonClaims(value) {
  if (!value) return undefined;

  try {
    const payload = value.split(".")[1];
    if (!payload) return undefined;
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );
    return {
      iss: typeof decoded.iss === "string" ? decoded.iss : undefined,
      ref: typeof decoded.ref === "string" ? decoded.ref : undefined,
      role: typeof decoded.role === "string" ? decoded.role : undefined,
    };
  } catch {
    return undefined;
  }
}

export function parseEnv(env) {
  return parseDotenv(env);
}

export function readEnvValue(env, key) {
  return parseDotenv(env)[key];
}

export function readRawEnvValue(env, key) {
  return findEnvAssignment(env, key)?.rawValue;
}

export function normalizeEnvValue(value) {
  return value.trim().replace(/^(['"])(.*)\1$/, "$2");
}

export function hasEnvKey(env, key) {
  return Boolean(findEnvAssignment(env, key));
}

export function isBlankOrPlaceholder(value) {
  return isBlank(value) || isPlaceholderEnvValue(value);
}

export function isUsableEnvValue(value) {
  return !isBlankOrPlaceholder(value);
}

export function validateTarget(target, environment, root) {
  const expected = ALLOWED_TARGETS[environment];
  if (!expected) {
    throw new Error(`Unsupported Vercel environment: ${environment}`);
  }
  if (basename(target) !== expected) {
    throw new Error(
      `The ${environment} environment may only be written to ${expected}.`
    );
  }
  if (root) {
    const canonicalTarget = resolve(root, expected);
    const targetFromRoot = relative(canonicalTarget, resolve(target));
    if (targetFromRoot !== "" || isAbsolute(targetFromRoot)) {
      throw new Error(
        `The ${environment} environment may only use the root ${expected} file.`
      );
    }
  }
  if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
    throw new Error(
      `Refusing to replace symlinked environment file: ${expected}`
    );
  }
}

function pullVercelEnvironment({ environment, root }) {
  const tempRoot = resolve(root, ".context/tmp");
  mkdirSync(tempRoot, { recursive: true, mode: 0o700 });
  chmodSync(tempRoot, 0o700);
  const tempDir = mkdtempSync(resolve(tempRoot, "vercel-env-"));
  chmodSync(tempDir, 0o700);
  const tempTarget = resolve(tempDir, "pulled.env");

  try {
    execFileSync(
      "npx",
      [
        "--yes",
        "vercel@55.0.0",
        "env",
        "pull",
        tempTarget,
        `--environment=${environment}`,
        "--yes",
      ],
      { cwd: root, stdio: "inherit", timeout: 120_000 }
    );
    chmodSync(tempTarget, 0o600);
    return readFileSync(tempTarget, "utf8");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function readPublicDefaults(root) {
  const example = parseEnv(readFileSync(resolve(root, ".env.example"), "utf8"));
  return Object.fromEntries(
    DEFAULTABLE_PUBLIC_KEYS.map((key) => [
      key,
      example[key]?.split("  # ")[0].trim(),
    ]).filter(([, value]) => isUsableEnvValue(value))
  );
}

function readExistingText(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function writeEnvAtomically(target, env) {
  mkdirSync(dirname(target), { recursive: true });
  const tempDir = mkdtempSync(resolve(dirname(target), ".env-refresh-"));
  chmodSync(tempDir, 0o700);
  const tempTarget = resolve(tempDir, "environment");

  try {
    writeFileSync(tempTarget, env, { encoding: "utf8", mode: 0o600 });
    chmodSync(tempTarget, 0o600);
    renameSync(tempTarget, target);
    chmodSync(target, 0o600);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function acquireTargetLock(target) {
  const lockPath = `${target}.lock`;
  mkdirSync(dirname(target), { recursive: true });
  const token = randomUUID();
  let descriptor;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      descriptor = openSync(lockPath, "wx", 0o600);
      writeFileSync(
        descriptor,
        JSON.stringify({ pid: process.pid, startedAt: Date.now(), token })
      );
      break;
    } catch (error) {
      if (descriptor !== undefined) {
        closeSync(descriptor);
        descriptor = undefined;
        rmSync(lockPath, { force: true });
      } else if (
        error?.code === "EEXIST" &&
        attempt === 0 &&
        removeStaleLock(lockPath)
      ) {
        continue;
      }
      throw new Error(
        `Another environment refresh may already be running for ${basename(target)}.`,
        { cause: error }
      );
    }
  }

  return () => {
    closeSync(descriptor);
    try {
      const lock = JSON.parse(readFileSync(lockPath, "utf8"));
      if (lock.token === token) unlinkSync(lockPath);
    } catch {
      // The refresh result is already durable and a newer lock must not be removed.
    }
  };
}

function removeStaleLock(lockPath) {
  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    if (!Number.isInteger(lock.pid) || lock.pid <= 0) return false;
    if (
      Number.isFinite(lock.startedAt) &&
      Date.now() - lock.startedAt > MAX_LOCK_AGE_MS
    ) {
      unlinkSync(lockPath);
      return true;
    }
    if (lock.pid === process.pid) return false;
    try {
      process.kill(lock.pid, 0);
      return false;
    } catch (error) {
      if (error?.code !== "ESRCH") return false;
    }
    unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

function hardenExistingTarget(target) {
  if (existsSync(target)) chmodSync(target, 0o600);
}

function resolvePreservableKeys({
  adoptExisting,
  environment,
  previous,
  previousText,
  pulledText,
}) {
  const marker = previous.MEELNI_ENV_PULL_ENVIRONMENT ?? previous.VERCEL_ENV;
  if (marker === environment) return PRESERVE_WHEN_ENCRYPTED_KEYS;

  const previousDatabaseRef = inferDatabaseProjectRef(previous.DATABASE_URL);
  const pulledPublicRef = inferSupabaseProjectRef(
    readEnvValue(pulledText, "NEXT_PUBLIC_SUPABASE_URL")
  );
  if (previousDatabaseRef && previousDatabaseRef === pulledPublicRef) {
    if (adoptExisting) return PRESERVE_WHEN_ENCRYPTED_KEYS;

    const keys = ["DATABASE_URL"];
    if (
      serviceRoleMatchesProject(
        previous.SUPABASE_SERVICE_ROLE_KEY,
        pulledPublicRef
      )
    ) {
      keys.push("SUPABASE_SERVICE_ROLE_KEY");
    }
    return keys;
  }

  const wouldPreserve = PRESERVE_WHEN_ENCRYPTED_KEYS.some(
    (key) =>
      hasEnvKey(pulledText, key) &&
      isBlankOrPlaceholder(readEnvValue(pulledText, key)) &&
      isUsableEnvValue(readEnvValue(previousText, key))
  );
  if (wouldPreserve) {
    throw new Error(
      `Refusing to preserve unverified existing values during a ${environment} refresh. Pull into the canonical environment file or restore the value from the matching provider.`
    );
  }

  return [];
}

function assertEnvironmentMarker(env, environment) {
  const marker = env.MEELNI_ENV_PULL_ENVIRONMENT;
  if (marker && marker !== environment) {
    throw new Error(
      `Refusing to reuse ${marker} values during a ${environment} environment refresh.`
    );
  }

  const vercelEnvironment = env.VERCEL_ENV;
  if (
    vercelEnvironment &&
    ["preview", "production"].includes(vercelEnvironment) &&
    vercelEnvironment !== environment
  ) {
    throw new Error(
      `Vercel returned ${vercelEnvironment} values for a requested ${environment} refresh.`
    );
  }
}

function upsert(env, key, value) {
  const line = `${key}=${formatEnvValue(value)}`;
  const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
  return pattern.test(env)
    ? env.replace(pattern, () => line)
    : `${line}\n${env}`;
}

function upsertRaw(env, key, rawValue) {
  const assignment = findEnvAssignment(env, key);
  const line = `${key}=${rawValue}`;
  return assignment
    ? `${env.slice(0, assignment.start)}${line}${env.slice(assignment.end)}`
    : `${line}\n${env}`;
}

function issuerMatchesProject(issuer, projectRef) {
  if (!issuer || issuer === "supabase") return true;
  try {
    const url = new URL(issuer);
    return (
      url.hostname === `${projectRef}.supabase.co` &&
      url.pathname.replace(/\/$/, "") === "/auth/v1"
    );
  } catch {
    return false;
  }
}

function findEnvAssignment(env, key) {
  const match = new RegExp(`^${escapeRegExp(key)}=`, "m").exec(env);
  if (!match || match.index === undefined) return undefined;

  const start = match.index;
  const valueStart = start + match[0].length;
  const firstValueIndex = skipHorizontalWhitespace(env, valueStart);
  const quote = env[firstValueIndex];
  let end;

  if (quote === '"' || quote === "'") {
    let escaped = false;
    for (let index = firstValueIndex + 1; index < env.length; index += 1) {
      const character = env[index];
      if (character === quote && !escaped) {
        end = lineEnd(env, index + 1);
        break;
      }
      escaped = character === "\\" ? !escaped : false;
    }
  }

  end ??= lineEnd(env, valueStart);
  return {
    end,
    rawValue: env.slice(valueStart, end),
    start,
  };
}

function skipHorizontalWhitespace(value, start) {
  let index = start;
  while (value[index] === " " || value[index] === "\t") index += 1;
  return index;
}

function lineEnd(value, start) {
  const newline = value.indexOf("\n", start);
  return newline === -1 ? value.length : newline;
}

function validateProductionAppUrl(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !PRODUCTION_APP_HOSTS.has(url.hostname) ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.username ||
      url.password
    ) {
      throw new Error("unsafe");
    }
  } catch {
    throw new Error(
      "Vercel production NEXT_PUBLIC_APP_URL must be a public HTTPS URL. The existing file was kept."
    );
  }
}

function validateStripeMode(env, environment) {
  const secretKey = readEnvValue(env, "STRIPE_SECRET_KEY");
  const publishableKey = readEnvValue(
    env,
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
  );
  const mode = environment === "production" ? "live" : "test";
  if (!new RegExp(`^(?:sk|rk)_${mode}_[A-Za-z0-9]+$`).test(secretKey)) {
    throw new Error(
      `Vercel ${environment} STRIPE_SECRET_KEY is not a valid ${mode}-mode key. The existing file was kept.`
    );
  }
  if (!new RegExp(`^pk_${mode}_[A-Za-z0-9]+$`).test(publishableKey)) {
    throw new Error(
      `Vercel ${environment} NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not a valid ${mode}-mode key. The existing file was kept.`
    );
  }
}

function validateLiveKitIdentity(env, environment) {
  const publicValue = readEnvValue(env, "NEXT_PUBLIC_LIVEKIT_URL");
  const serverValue = readEnvValue(env, "LIVEKIT_URL");
  const publicOrigin = publicValue
    ? canonicalLiveKitCloudOrigin(publicValue)
    : undefined;
  const serverOrigin = serverValue
    ? canonicalLiveKitCloudOrigin(serverValue)
    : undefined;
  const selectedOrigin = publicOrigin ?? serverOrigin;
  const productionOrigin = canonicalLiveKitCloudOrigin(
    readEnvValue(env, "MEELNI_PRODUCTION_LIVEKIT_URL")
  );
  const previewValue = readEnvValue(env, "MEELNI_PREVIEW_LIVEKIT_URL");
  const previewOrigin = previewValue
    ? canonicalLiveKitCloudOrigin(previewValue)
    : undefined;
  if (
    !selectedOrigin ||
    (publicValue && !publicOrigin) ||
    (serverValue && !serverOrigin) ||
    !productionOrigin ||
    (previewValue && !previewOrigin)
  ) {
    throw new Error(
      `Vercel ${environment} LiveKit project identity is invalid. The existing file was kept.`
    );
  }
  if (publicOrigin && serverOrigin && serverOrigin !== publicOrigin) {
    throw new Error(
      `Vercel ${environment} LiveKit URLs identify different projects. The existing file was kept.`
    );
  }
  if (previewOrigin === productionOrigin) {
    throw new Error(
      `Vercel ${environment} Preview and Production LiveKit identity anchors conflict. The existing file was kept.`
    );
  }
  const matchesProduction = selectedOrigin === productionOrigin;
  if (environment === "production" && !matchesProduction) {
    throw new Error(
      `Vercel ${environment} LiveKit project violates the Production identity boundary. The existing file was kept.`
    );
  }
  if (environment === "preview" && selectedOrigin !== previewOrigin) {
    throw new Error(
      `Vercel ${environment} LiveKit project does not match the Preview identity anchor. The existing file was kept.`
    );
  }
}

function canonicalLiveKitCloudOrigin(value) {
  if (!value || value !== value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "wss:" ||
      url.username ||
      url.password ||
      url.port ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!hostname.endsWith(".livekit.cloud")) return undefined;
    return `wss://${hostname}`;
  } catch {
    return undefined;
  }
}

function serviceRoleMatchesProject(value, projectRef) {
  const claims = readSupabaseAnonClaims(value);
  return (
    claims?.ref === projectRef &&
    claims.role === "service_role" &&
    issuerMatchesProject(claims.iss, projectRef)
  );
}

function formatEnvValue(value) {
  return /[\s#"']/.test(value) ? JSON.stringify(value) : value;
}

function ensureTrailingNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isBlank(value) {
  return value === undefined || value.trim() === "";
}

function isPlaceholderEnvValue(value) {
  const normalized = normalizeEnvValue(value);

  return [
    /^postgresql:\/\/\.\.\.$/,
    /^https:\/\/xxx\.supabase\.co$/,
    /^eyJxxx\.\.\.$/,
    /^your[_-]/,
    /your-project/,
    /^sk-proj-xxx$/,
    /^sk_test_xxx$/,
    /^pk_test_xxx$/,
    /^whsec_xxx$/,
    /^price_xxx$/,
    /^xxx$/,
    /\.\.\.$/,
  ].some((pattern) => pattern.test(normalized));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await refreshEnvironment({
    adoptExisting: process.argv[4] === "--adopt-existing",
    environment: process.argv[3] ?? "preview",
    target: process.argv[2] ?? ALLOWED_TARGETS.preview,
  });
}

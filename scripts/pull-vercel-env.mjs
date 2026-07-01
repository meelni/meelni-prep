import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const target = process.argv[2] ?? ".env.local";
const environment = process.argv[3] ?? "preview";
const siteUrl = "https://www.meelni.com";
const previousEnv = readExistingEnv(target);
const fallbackEnv =
  environment === "preview" ? readFallbackEnv("development") : {};

execFileSync(
  "npx",
  [
    "--yes",
    "vercel@latest",
    "env",
    "pull",
    target,
    `--environment=${environment}`,
    "--yes",
  ],
  { stdio: "inherit" }
);

const publicDefaults = readPublicDefaults();
const publicSupabase = await readPublicSupabaseConfig(siteUrl);
let env = readFileSync(target, "utf8");

for (const [key, value] of Object.entries({
  ...publicDefaults,
  NEXT_PUBLIC_STATSIG_ENVIRONMENT: environment,
  ...publicSupabase,
})) {
  env = upsert(env, key, value);
}

const preserveableKeys = [
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "NEXT_PUBLIC_LIVEKIT_URL",
  "LIVEKIT_URL",
  "LIVEKIT_INTERVIEW_AGENT_NAME",
  "LIVEKIT_DEMO_AGENT_NAME",
  "GOOGLE_SHEET_CSV_URL",
  "GOOGLE_SHEETS_API_KEY",
  "GOOGLE_SHEETS_CREDENTIALS_BASE64",
  "GOOGLE_SHEETS_CREDENTIALS",
  "GOOGLE_SERVICE_ACCOUNT_EMAIL",
  "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY",
  "GOOGLE_SHEET_ID",
  "GOOGLE_SHEET_NAME",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "OPENAI_API_KEY",
];

for (const key of preserveableKeys) {
  const pulled = readEnvValue(env, key);
  const previous = previousEnv[key];
  if (isBlankOrPlaceholder(pulled) && isUsableEnvValue(previous)) {
    env = upsert(env, key, previous);
  }
}

env = mergeFallbackEnv(env, fallbackEnv, preserveableKeys);

writeFileSync(target, env);
console.log(`Refreshed ${target} and restored public browser config.`);

function readFallbackEnv(fallbackEnvironment) {
  const tempRoot = resolve(".context/tmp");
  mkdirSync(tempRoot, { recursive: true });
  const tempDir = mkdtempSync(resolve(tempRoot, "vercel-env-"));
  const tempTarget = resolve(tempDir, ".env.local");

  try {
    console.log(
      `Checking ${fallbackEnvironment} environment for local fallback values.`
    );
    execFileSync(
      "npx",
      [
        "--yes",
        "vercel@latest",
        "env",
        "pull",
        tempTarget,
        `--environment=${fallbackEnvironment}`,
        "--yes",
      ],
      { stdio: "inherit" }
    );

    return readExistingEnv(tempTarget);
  } catch {
    console.warn(
      `Could not pull ${fallbackEnvironment} environment fallback values.`
    );
    return {};
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function readExistingEnv(file) {
  try {
    return parseEnv(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function parseEnv(env) {
  return Object.fromEntries(
    env
      .split(/\n/)
      .map((line) => {
        const index = line.indexOf("=");
        if (index === -1 || line.startsWith("#")) {
          return null;
        }

        return [line.slice(0, index), normalizeEnvValue(line.slice(index + 1))];
      })
      .filter(Boolean)
  );
}

function readPublicDefaults() {
  const example = readFileSync(".env.example", "utf8");
  const keys = new Set([
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_POSTHOG_HOST",
    "NEXT_PUBLIC_STATSIG_CLIENT_KEY",
  ]);

  return Object.fromEntries(
    example
      .split(/\n/)
      .map((line) => {
        const index = line.indexOf("=");
        if (index === -1) {
          return null;
        }

        const key = line.slice(0, index);
        const value = line
          .slice(index + 1)
          .split("  # ")[0]
          .trim();
        return keys.has(key) && value ? [key, value] : null;
      })
      .filter(Boolean)
  );
}

async function readPublicSupabaseConfig(base) {
  const html = await fetch(base).then((response) => response.text());
  const scriptUrls = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
    (match) => new URL(match[1], base).href
  );
  const chunks = await Promise.all(
    scriptUrls.map(async (url) => {
      try {
        const response = await fetch(url);
        return response.ok ? response.text() : "";
      } catch {
        return "";
      }
    })
  );
  const text = [html, ...chunks].join("\n");
  const supabaseUrl = text.match(/https:\/\/[a-z0-9.-]+\.supabase\.co/i)?.[0];
  const anonKey = text.match(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/
  )?.[0];

  if (!supabaseUrl || !anonKey) {
    throw new Error(
      "Could not recover public Supabase config from deployed app."
    );
  }

  return {
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  };
}

function upsert(env, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${escapeRegExp(key)}=.*$`, "m");
  return pattern.test(env) ? env.replace(pattern, line) : `${line}\n${env}`;
}

function mergeFallbackEnv(env, fallbackEnv, keys) {
  let merged = env;

  for (const key of keys) {
    const current = readEnvValue(merged, key);
    const fallback = fallbackEnv[key];

    if (isBlankOrPlaceholder(current) && isUsableEnvValue(fallback)) {
      merged = upsert(merged, key, fallback);
    }
  }

  return merged;
}

function readEnvValue(env, key) {
  const match = env.match(new RegExp(`^${escapeRegExp(key)}=(.*)$`, "m"));
  return match ? normalizeEnvValue(match[1]) : undefined;
}

function normalizeEnvValue(value) {
  return value.trim().replace(/^(['"])(.*)\1$/, "$2");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isBlank(value) {
  return value === undefined || value.trim() === "";
}

function isBlankOrPlaceholder(value) {
  return isBlank(value) || isPlaceholderEnvValue(value);
}

function isUsableEnvValue(value) {
  return !isBlankOrPlaceholder(value);
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

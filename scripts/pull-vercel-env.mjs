import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const target = process.argv[2] ?? ".env.local";
const environment = process.argv[3] ?? "preview";
const siteUrl = "https://www.meelni.com";
const previousEnv = readExistingEnv(target);

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

for (const key of [
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
]) {
  const pulled = readEnvValue(env, key);
  const previous = previousEnv[key];
  if (isBlank(pulled) && !isBlank(previous)) {
    env = upsert(env, key, previous);
  }
}

writeFileSync(target, env);
console.log(`Refreshed ${target} and restored public browser config.`);

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
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(env) ? env.replace(pattern, line) : `${line}\n${env}`;
}

function readEnvValue(env, key) {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? normalizeEnvValue(match[1]) : undefined;
}

function normalizeEnvValue(value) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function isBlank(value) {
  return value === undefined || value.trim() === "";
}

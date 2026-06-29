import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const target = process.argv[2] ?? ".env.local";
const environment = process.argv[3] ?? "preview";
const siteUrl = "https://www.meelni.com";

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

writeFileSync(target, env);
console.log(`Refreshed ${target} and restored public browser config.`);

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
        const value = line.slice(index + 1).split("  # ")[0].trim();
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
    throw new Error("Could not recover public Supabase config from deployed app.");
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

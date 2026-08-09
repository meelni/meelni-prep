import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "dotenv";

export function buildLocalDevEnv({ baseEnv = process.env, repoRoot }) {
  const envPath = resolve(repoRoot, ".env.local");
  const fileEnv = existsSync(envPath) ? parse(readFileSync(envPath)) : {};
  const env = {
    ...fileEnv,
    ...baseEnv,
  };

  if (!env.LIVEKIT_URL && env.NEXT_PUBLIC_LIVEKIT_URL) {
    env.LIVEKIT_URL = env.NEXT_PUBLIC_LIVEKIT_URL;
  }

  return env;
}

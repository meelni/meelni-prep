import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildLocalDevEnv } from "./start-local-dev-env.mjs";

test("buildLocalDevEnv loads .env.local for child processes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "meelni-dev-env-"));
  try {
    await writeFile(
      join(dir, ".env.local"),
      "LIVEKIT_API_KEY=key-from-file\nLIVEKIT_API_SECRET=secret-from-file\n"
    );

    const env = buildLocalDevEnv({
      baseEnv: {},
      repoRoot: dir
    });

    assert.equal(env.LIVEKIT_API_KEY, "key-from-file");
    assert.equal(env.LIVEKIT_API_SECRET, "secret-from-file");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("buildLocalDevEnv maps public LiveKit URL to LIVEKIT_URL when needed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "meelni-dev-env-"));
  try {
    await writeFile(join(dir, ".env.local"), "NEXT_PUBLIC_LIVEKIT_URL=wss://example.livekit.cloud\n");

    const env = buildLocalDevEnv({
      baseEnv: {},
      repoRoot: dir
    });

    assert.equal(env.LIVEKIT_URL, "wss://example.livekit.cloud");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("buildLocalDevEnv parses .env.local inline comments like Next.js", async () => {
  const dir = await mkdtemp(join(tmpdir(), "meelni-dev-env-"));
  try {
    await writeFile(join(dir, ".env.local"), "NEXT_PUBLIC_APP_URL=http://localhost:3000  # local app\n");

    const env = buildLocalDevEnv({
      baseEnv: {},
      repoRoot: dir
    });

    assert.equal(env.NEXT_PUBLIC_APP_URL, "http://localhost:3000");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("buildLocalDevEnv preserves explicit shell values over .env.local", async () => {
  const dir = await mkdtemp(join(tmpdir(), "meelni-dev-env-"));
  try {
    await writeFile(join(dir, ".env.local"), "LIVEKIT_URL=wss://file.livekit.cloud\n");

    const env = buildLocalDevEnv({
      baseEnv: {
        LIVEKIT_URL: "wss://shell.livekit.cloud"
      },
      repoRoot: dir
    });

    assert.equal(env.LIVEKIT_URL, "wss://shell.livekit.cloud");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

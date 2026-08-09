import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  ensureEnvFile,
  ensureSymlink,
  isPlaceholderEnvValue,
  isUsableEnvValue,
  parseEnvContent,
  requiredEnvAlternativesStatus,
  requiredEnvStatus,
} from "./local-env.mjs";

test("parseEnvContent keeps unquoted values with spaces", () => {
  const values = parseEnvContent(`
# comment
DATABASE_URL=postgresql://example
GOOGLE_SHEET_NAME=Form Responses 1
EMPTY=
`);

  assert.equal(values.get("DATABASE_URL"), "postgresql://example");
  assert.equal(values.get("GOOGLE_SHEET_NAME"), "Form Responses 1");
  assert.equal(values.get("EMPTY"), "");
});

test("requiredEnvStatus reports missing keys", () => {
  const status = requiredEnvStatus(
    new Map([
      ["DATABASE_URL", "postgresql://example"],
      ["LIVEKIT_API_KEY", ""],
      ["OPENAI_API_KEY", "sk-test"],
    ]),
    ["DATABASE_URL", "LIVEKIT_API_KEY", "OPENAI_API_KEY"]
  );

  assert.deepEqual(status.missing, ["LIVEKIT_API_KEY"]);
  assert.equal(status.ok, false);
});

test("requiredEnvStatus reports placeholder values separately from missing keys", () => {
  const status = requiredEnvStatus(
    new Map([
      ["DATABASE_URL", "postgresql://..."],
      ["NEXT_PUBLIC_SUPABASE_URL", "https://xxx.supabase.co"],
      ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "eyJxxx..."],
      ["NEXT_PUBLIC_LIVEKIT_URL", "wss://your-project.livekit.cloud"],
      ["OPENAI_API_KEY", "sk-proj-xxx"],
      ["LIVEKIT_API_KEY", "livekit-key"],
    ]),
    [
      "DATABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_LIVEKIT_URL",
      "OPENAI_API_KEY",
      "LIVEKIT_API_KEY",
    ]
  );

  assert.deepEqual(status.missing, []);
  assert.deepEqual(status.placeholder, [
    "DATABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_LIVEKIT_URL",
    "OPENAI_API_KEY",
  ]);
  assert.equal(status.ok, false);
});

test("env value helpers reject placeholders but accept real-looking provider values", () => {
  assert.equal(isPlaceholderEnvValue("your_api_key"), true);
  assert.equal(isPlaceholderEnvValue("wss://your-project.livekit.cloud"), true);
  assert.equal(isPlaceholderEnvValue("https://xxx.supabase.co"), true);
  assert.equal(isPlaceholderEnvValue("sk-proj-xxx"), true);
  assert.equal(isPlaceholderEnvValue("real-value-ending-with..."), false);

  assert.equal(isUsableEnvValue("wss://meelni-ek4vaisp.livekit.cloud"), true);
  assert.equal(
    isUsableEnvValue("https://rarrrwkjuhfyfatcmrkw.supabase.co"),
    true
  );
  assert.equal(isUsableEnvValue("sk-real-looking-value"), true);
});

test("requiredEnvAlternativesStatus accepts any usable alternative value", () => {
  const status = requiredEnvAlternativesStatus(
    new Map([["LIVEKIT_URL", "wss://server.livekit.cloud"]]),
    [
      {
        label: "NEXT_PUBLIC_LIVEKIT_URL or LIVEKIT_URL",
        keys: ["NEXT_PUBLIC_LIVEKIT_URL", "LIVEKIT_URL"],
      },
    ]
  );

  assert.deepEqual(status.missing, []);
  assert.deepEqual(status.placeholder, []);
  assert.equal(status.ok, true);
});

test("requiredEnvAlternativesStatus reports missing and placeholder alternative groups", () => {
  const missingStatus = requiredEnvAlternativesStatus(new Map(), [
    {
      label: "NEXT_PUBLIC_LIVEKIT_URL or LIVEKIT_URL",
      keys: ["NEXT_PUBLIC_LIVEKIT_URL", "LIVEKIT_URL"],
    },
  ]);
  const placeholderStatus = requiredEnvAlternativesStatus(
    new Map([
      ["NEXT_PUBLIC_LIVEKIT_URL", "wss://your-project.livekit.cloud"],
      ["LIVEKIT_URL", "wss://server.livekit.cloud"],
    ]),
    [
      {
        label: "NEXT_PUBLIC_LIVEKIT_URL or LIVEKIT_URL",
        keys: ["NEXT_PUBLIC_LIVEKIT_URL", "LIVEKIT_URL"],
      },
    ]
  );

  assert.deepEqual(missingStatus.missing, [
    "NEXT_PUBLIC_LIVEKIT_URL or LIVEKIT_URL",
  ]);
  assert.deepEqual(placeholderStatus.placeholder, ["NEXT_PUBLIC_LIVEKIT_URL"]);
  assert.equal(missingStatus.ok, false);
  assert.equal(placeholderStatus.ok, false);
});

test("ensureEnvFile creates target from example when target is absent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "meelni-env-"));
  try {
    const targetPath = join(dir, ".env.local");
    const examplePath = join(dir, ".env.example");
    await writeFile(examplePath, "DATABASE_URL=postgresql://example\n");

    const result = await ensureEnvFile({ targetPath, examplePath });

    assert.equal(result.status, "created-from-example");
    assert.equal(
      await readFile(targetPath, "utf8"),
      "DATABASE_URL=postgresql://example\n"
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ensureSymlink replaces an existing symlink that points elsewhere", async () => {
  const dir = await mkdtemp(join(tmpdir(), "meelni-link-"));
  try {
    const targetPath = resolve(dir, "target.env");
    const previousPath = resolve(dir, "previous.env");
    const linkPath = resolve(dir, ".env.local");
    await writeFile(targetPath, "A=1\n");
    await writeFile(previousPath, "A=0\n");
    await symlink(previousPath, linkPath);

    const result = await ensureSymlink({ linkPath, targetPath });

    assert.equal(result.status, "linked");
    assert.equal(existsSync(linkPath), true);
    assert.equal(lstatSync(linkPath).isSymbolicLink(), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

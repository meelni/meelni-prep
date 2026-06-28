import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { existsSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  ensureEnvFile,
  ensureSymlink,
  parseEnvContent,
  requiredEnvStatus
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
      ["OPENAI_API_KEY", "sk-test"]
    ]),
    ["DATABASE_URL", "LIVEKIT_API_KEY", "OPENAI_API_KEY"]
  );

  assert.deepEqual(status.missing, ["LIVEKIT_API_KEY"]);
  assert.equal(status.ok, false);
});

test("ensureEnvFile creates target from example when target is absent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "meelni-env-"));
  try {
    const targetPath = join(dir, ".env.local");
    const examplePath = join(dir, ".env.example");
    await writeFile(examplePath, "DATABASE_URL=postgresql://example\n");

    const result = await ensureEnvFile({ targetPath, examplePath });

    assert.equal(result.status, "created-from-example");
    assert.equal(await readFile(targetPath, "utf8"), "DATABASE_URL=postgresql://example\n");
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

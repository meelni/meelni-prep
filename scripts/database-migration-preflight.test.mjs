import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const productionRef = "productionproject123";

test("Preview preflight rejects a Production-marked canonical env file before connecting", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meelni-preflight-identity-"));
  const envFile = join(directory, ".env.local");
  await writeFile(
    envFile,
    [
      `DATABASE_URL=${databaseUrl(productionRef)}`,
      "MEELNI_ENV_PULL_ENVIRONMENT=production",
      `MEELNI_PRODUCTION_SUPABASE_PROJECT_REF=${productionRef}`,
      "VERCEL_ENV=production",
      "",
    ].join("\n")
  );

  try {
    const result = spawnSync(
      "npx",
      [
        "tsx",
        new URL("./database-migration-preflight.ts", import.meta.url).pathname,
      ],
      {
        cwd: directory,
        encoding: "utf8",
        env: {
          ...process.env,
          MEELNI_ENV_FILE: ".env.local",
        },
        timeout: 10_000,
      }
    );
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 1);
    assert.match(output, /does not match expected preview/);
    assert.doesNotMatch(output, /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function databaseUrl(ref) {
  return `postgresql://postgres.${ref}:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres`;
}

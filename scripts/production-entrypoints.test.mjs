import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..");

test("LiveKit Preview remains usable while Production denies before lk", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meelni-livekit-guard-"));
  const fakeBin = join(directory, "bin");
  const logPath = join(directory, "lk.log");
  const configPath = join(directory, "interview.toml");
  const { mkdir, chmod } = await import("node:fs/promises");
  await mkdir(fakeBin);
  await writeFile(
    configPath,
    '[project]\nsubdomain = "preview-project"\n[agent]\nid = "CA_preview"\n'
  );
  const fakeLk = join(fakeBin, "lk");
  await writeFile(fakeLk, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$LK_LOG"\n');
  await chmod(fakeLk, 0o755);

  const baseEnv = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    LK_LOG: logPath,
    MEELNI_LIVEKIT_PREVIEW_INTERVIEW_CONFIG: configPath,
    MEELNI_LIVEKIT_PREVIEW_INTERVIEW_AGENT_ID: "CA_preview",
    MEELNI_PREVIEW_LIVEKIT_URL: "wss://preview-project.livekit.cloud",
  };
  try {
    const preview = spawnSync(
      join(repoRoot, "agent/interview/deploy.sh"),
      ["preview"],
      { cwd: repoRoot, env: baseEnv, encoding: "utf8" }
    );
    assert.equal(preview.status, 0, preview.stderr);
    const callsAfterPreview = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n");
    assert.equal(callsAfterPreview.length, 1);

    const linkedConfig = join(directory, "linked.toml");
    await symlink(configPath, linkedConfig);
    const linked = spawnSync(
      join(repoRoot, "agent/interview/deploy.sh"),
      ["preview"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...baseEnv,
          MEELNI_LIVEKIT_PREVIEW_INTERVIEW_CONFIG: linkedConfig,
        },
      }
    );
    assert.notEqual(linked.status, 0);
    assert.equal(
      (await readFile(logPath, "utf8")).trim().split("\n").length,
      1
    );

    const production = spawnSync(
      join(repoRoot, "agent/interview/deploy.sh"),
      ["production"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...baseEnv,
          NODE_OPTIONS: "--require /tmp/meelni-forbidden-injection.cjs",
          MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_CONFIG: configPath,
          MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_AGENT_ID: "CA_production",
          MEELNI_PRODUCTION_LIVEKIT_URL:
            "wss://production-project.livekit.cloud",
        },
      }
    );
    assert.notEqual(production.status, 0);
    assert.match(
      production.stderr,
      /authorization_file_path_invalid|fixed system Node runtime/
    );
    assert.equal(
      (await readFile(logPath, "utf8")).trim().split("\n").length,
      1
    );
    assert.doesNotMatch(production.stderr, /production-project|CA_production/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("repository-owned Production entrypoints stay in the reviewed inventory", async () => {
  const expectations = new Map([
    [
      "scripts/setup-stripe-credit-catalog.mjs",
      ["STRIPE_LIVE_CATALOG", "consumeProductionActionAuthorization"],
    ],
    [
      "scripts/database-command.mjs",
      ["PRODUCTION_DATABASE_MIGRATE", "consumeProductionActionAuthorization"],
    ],
    [
      "scripts/run-question-sync.ts",
      ["production-question-sync-manual", "authorizeProductionQuestionSync"],
    ],
    [
      "agent/interview/deploy.sh",
      ["livekit-production-interview-deploy", "/usr/local/bin/node"],
    ],
    [
      "agent/demo/deploy.sh",
      ["livekit-production-demo-deploy", "/usr/local/bin/node"],
    ],
    [
      "app/api/cron/sync-questions/manual/route.ts",
      ["getEnvironment", "VERCEL_ENV"],
    ],
  ]);

  for (const [path, required] of expectations) {
    const source = await readFile(join(repoRoot, path), "utf8");
    for (const token of required) assert.match(source, new RegExp(token));
  }

  for (const path of [
    "scripts/apply-rls-policies.ts",
    "scripts/fix-stuck-feedback.ts",
    "scripts/seed-questions.ts",
    "scripts/test-feedback-generation.ts",
    "scripts/test-feedback-polling.ts",
    "scripts/verify-cache-headers.ts",
  ]) {
    const source = await readFile(join(repoRoot, path), "utf8");
    assert.match(source, /non-production-script-guard/);
    const guardImport = source.indexOf("non-production-script-guard");
    const databaseImport = source.search(/(?:@\/lib\/db|\.\.\/lib\/db)/);
    if (databaseImport !== -1) assert.ok(guardImport < databaseImport);
  }

  const deployment = await readFile(
    join(repoRoot, "docs/deployment/quickstart.md"),
    "utf8"
  );
  const tooling = await readFile(
    join(repoRoot, "docs/operations/tooling.md"),
    "utf8"
  );
  assert.match(deployment, /Production promotion remains unsupported/);
  assert.match(tooling, /relaunch-default-on.*remains unsupported/s);
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
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
    '[project]\nsubdomain = "meelni-preview-dk7443ua"\n[agent]\nid = "CA_ZbGxFjfEYwsD"\n'
  );
  const productionConfigPath = join(directory, "production.toml");
  await writeFile(
    productionConfigPath,
    '[project]\nsubdomain = "meelni-ek4vaisp"\n[agent]\nid = "CA_yawKG67rCMG4"\n'
  );
  const fakeLk = join(fakeBin, "lk");
  await writeFile(fakeLk, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$LK_LOG"\n');
  await chmod(fakeLk, 0o755);

  const baseEnv = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    LK_LOG: logPath,
    MEELNI_LIVEKIT_PREVIEW_INTERVIEW_CONFIG: configPath,
    MEELNI_LIVEKIT_PREVIEW_INTERVIEW_AGENT_ID: "CA_ZbGxFjfEYwsD",
    MEELNI_PREVIEW_LIVEKIT_URL: "wss://meelni-preview-dk7443ua.livekit.cloud",
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

    for (const mutation of [
      { MEELNI_LIVEKIT_PREVIEW_INTERVIEW_CONFIG: productionConfigPath },
      { MEELNI_LIVEKIT_PREVIEW_INTERVIEW_AGENT_ID: "CA_yawKG67rCMG4" },
      { MEELNI_PREVIEW_LIVEKIT_URL: "wss://meelni-ek4vaisp.livekit.cloud" },
    ]) {
      const confused = spawnSync(
        join(repoRoot, "agent/interview/deploy.sh"),
        ["preview"],
        {
          cwd: repoRoot,
          encoding: "utf8",
          env: { ...baseEnv, ...mutation },
        }
      );
      assert.notEqual(confused.status, 0);
      assert.match(confused.stderr, /canonical preview interview target/);
      assert.equal(
        (await readFile(logPath, "utf8")).trim().split("\n").length,
        1
      );
    }

    const confusedDemo = spawnSync(
      join(repoRoot, "agent/demo/deploy.sh"),
      ["preview"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...baseEnv,
          MEELNI_LIVEKIT_PREVIEW_DEMO_CONFIG: productionConfigPath,
          MEELNI_LIVEKIT_PREVIEW_DEMO_AGENT_ID: "CA_t3sKQEihMQ7x",
          MEELNI_PREVIEW_LIVEKIT_URL: "wss://meelni-ek4vaisp.livekit.cloud",
        },
      }
    );
    assert.notEqual(confusedDemo.status, 0);
    assert.match(confusedDemo.stderr, /has not been provisioned/);
    assert.equal(
      (await readFile(logPath, "utf8")).trim().split("\n").length,
      1
    );

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
          MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_CONFIG: productionConfigPath,
          MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_AGENT_ID: "CA_yawKG67rCMG4",
          MEELNI_PRODUCTION_LIVEKIT_URL: "wss://meelni-ek4vaisp.livekit.cloud",
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
    assert.doesNotMatch(production.stderr, /meelni-ek4vaisp|CA_yawKG67rCMG4/);
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
      ["getDatabaseIdentity", "MEELNI_ENV_PULL_ENVIRONMENT", "DATABASE_URL"],
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
    assert.doesNotMatch(
      source,
      /^import .*?(?:@\/lib\/db|\.\.\/lib\/db)/m,
      `${path} must not statically initialize the database adapter`
    );
    const guardCall = source.indexOf("assertNonProductionScriptEnvironment();");
    const databaseImport = source.search(
      /await import\(["'](?:@\/lib\/db|\.\.\/lib\/db)/
    );
    if (databaseImport !== -1) assert.ok(guardCall < databaseImport);
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

  const vercelConfiguration = JSON.parse(
    await readFile(join(repoRoot, "vercel.json"), "utf8")
  );
  assert.equal(
    vercelConfiguration.ignoreCommand,
    "node scripts/vercel-ignore-build.mjs"
  );
  const scheduledRoute = await readFile(
    join(repoRoot, "app/api/cron/sync-questions/route.ts"),
    "utf8"
  );
  assert.match(scheduledRoute, /getDatabaseIdentity/);

  const operatorDocs = await markdownFiles([
    join(repoRoot, ".claude"),
    join(repoRoot, "agent"),
    join(repoRoot, "docs/deployment"),
    join(repoRoot, "docs/LIVEKIT_DEBUGGING.md"),
  ]);
  for (const path of operatorDocs) {
    if (
      path.includes("/.claude/archive/") ||
      path.includes("/.claude/sprints/")
    ) {
      continue;
    }
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(
      source,
      /\blk\s+agent\s+(?:create|deploy)\b/i,
      `${path} must point operators to the target-bound wrapper`
    );
  }

  const connectionSkill = await readFile(
    join(
      repoRoot,
      ".agents/skills/meelni-ops-connections/references/connections.md"
    ),
    "utf8"
  );
  assert.match(connectionSkill, /MEELNI_PRODUCTION_ACTION_AUTHORIZATION/);
  assert.match(
    connectionSkill,
    /direct Dashboard creation is not a substitute/
  );
});

async function markdownFiles(paths) {
  const output = [];
  for (const path of paths) {
    const entries = await readdir(path, { withFileTypes: true }).catch(
      () => []
    );
    if (entries.length === 0) {
      if (path.endsWith(".md")) output.push(path);
      continue;
    }
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) output.push(...(await markdownFiles([child])));
      else if (entry.isFile() && child.endsWith(".md")) output.push(child);
    }
  }
  return output;
}

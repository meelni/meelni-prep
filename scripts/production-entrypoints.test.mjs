import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

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
  const previewDemoConfigPath = join(directory, "preview-demo.toml");
  await writeFile(
    previewDemoConfigPath,
    '[project]\nsubdomain = "meelni-preview-dk7443ua"\n[agent]\nid = "CA_M5XTD4CMyXk3"\n'
  );
  const productionConfigPath = join(directory, "production.toml");
  await writeFile(
    productionConfigPath,
    '[project]\nsubdomain = "meelni-ek4vaisp"\n[agent]\nid = "CA_yawKG67rCMG4"\n'
  );
  const productionSecretsPath = join(directory, "production-secrets.env");
  const productionProjectShadowSecretsPath = join(
    directory,
    "production-project-shadow-secrets.env"
  );
  const previewShadowSecretsPath = join(
    directory,
    "preview-shadow-secrets.env"
  );
  const productionDemoSecretsPath = join(
    directory,
    "production-demo-secrets.env"
  );
  const opikSecrets = [
    "OPIK_TRACING_ENABLED=true",
    `OPIK_API_KEY=${"k".repeat(25)}`,
    "OPIK_WORKSPACE=savi-singh",
    "OPIK_PROJECT_NAME=meelni",
    "OPIK_CAPTURE_CONTENT=true",
    "",
  ].join("\n");
  await writeFile(
    productionSecretsPath,
    `MEELNI_TRANSCRIPT_INGEST_SECRET=${"a".repeat(32)}\n${opikSecrets.trimEnd()}\nOPENAI_API_KEY=${"o".repeat(25)}\n`,
    { mode: 0o600 }
  );
  await writeFile(productionDemoSecretsPath, opikSecrets, { mode: 0o600 });
  const candidateSha = spawnSync(
    "/usr/bin/git",
    ["-C", repoRoot, "rev-parse", "HEAD"],
    { encoding: "utf8" }
  ).stdout.trim();
  const previewShadowControlPlaneUrl =
    "https://meelni-candidate-meelni.vercel.app/api/internal/preview-shadow";
  await writeFile(
    previewShadowSecretsPath,
    [
      "MEELNI_PREVIEW_SHADOW_EXECUTION=enabled",
      "MEELNI_PREVIEW_SHADOW_KILL_SWITCH=open",
      `MEELNI_PREVIEW_SHADOW_RUN_ID=${"b".repeat(64)}`,
      `MEELNI_PREVIEW_SHADOW_CANDIDATE_SHA=${candidateSha}`,
      `MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_URL=${previewShadowControlPlaneUrl}`,
      "",
    ].join("\n"),
    { mode: 0o600 }
  );
  await writeFile(
    productionProjectShadowSecretsPath,
    [
      `MEELNI_TRANSCRIPT_INGEST_SECRET=${"a".repeat(32)}`,
      opikSecrets.trimEnd(),
      `OPENAI_API_KEY=${"o".repeat(25)}`,
      "MEELNI_PREVIEW_SHADOW_EXECUTION=enabled",
      "MEELNI_PREVIEW_SHADOW_KILL_SWITCH=open",
      `MEELNI_PREVIEW_SHADOW_RUN_ID=${"b".repeat(64)}`,
      `MEELNI_PREVIEW_SHADOW_CANDIDATE_SHA=${candidateSha}`,
      "MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_URL=https://meelni-env-staging-meelni.vercel.app/api/internal/preview-shadow",
      "",
    ].join("\n"),
    { mode: 0o600 }
  );
  await chmod(productionSecretsPath, 0o600);
  await chmod(productionDemoSecretsPath, 0o600);
  await chmod(previewShadowSecretsPath, 0o600);
  await chmod(productionProjectShadowSecretsPath, 0o600);
  const commentConfusedInterviewConfigPath = join(
    directory,
    "comment-confused-interview.toml"
  );
  await writeFile(
    commentConfusedInterviewConfigPath,
    '[project]\nsubdomain = "meelni-ek4vaisp" # = "meelni-preview-dk7443ua"\n[agent]\nid = "wrong" # = "CA_ZbGxFjfEYwsD"\n'
  );
  const commentConfusedDemoConfigPath = join(
    directory,
    "comment-confused-demo.toml"
  );
  await writeFile(
    commentConfusedDemoConfigPath,
    '[project]\nsubdomain = "wrong" # = "meelni-ek4vaisp"\n[agent]\nid = "wrong" # = "CA_t3sKQEihMQ7x"\n'
  );
  const fakeLk = join(fakeBin, "lk");
  await writeFile(
    fakeLk,
    [
      "#!/bin/sh",
      'if [ "$*" = "agent deploy --help" ]; then',
      '  printf "%s\\n" "--no-default-attributes --attribute"',
      "  exit 0",
      "fi",
      'if [ "$*" = "agent update-secrets --help" ]; then',
      '  printf "%s\\n" "--overwrite --secrets-file"',
      "  exit 0",
      "fi",
      'case "$*" in',
      '  *"agent secrets --json"*)',
      '    printf "%s\\n" \'{"secrets":[{"name":"OPENAI_API_KEY"}]}\'',
      "    exit 0",
      "    ;;",
      "esac",
      'printf "%s\\n" "$*" >> "$LK_LOG"',
      "",
    ].join("\n")
  );
  await chmod(fakeLk, 0o755);

  const baseEnv = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    LK_LOG: logPath,
    MEELNI_LIVEKIT_PREVIEW_INTERVIEW_CONFIG: configPath,
    MEELNI_LIVEKIT_PREVIEW_INTERVIEW_AGENT_ID: "CA_ZbGxFjfEYwsD",
    MEELNI_LIVEKIT_PREVIEW_DEMO_CONFIG: previewDemoConfigPath,
    MEELNI_LIVEKIT_PREVIEW_DEMO_AGENT_ID: "CA_M5XTD4CMyXk3",
    MEELNI_PREVIEW_LIVEKIT_URL: "wss://meelni-preview-dk7443ua.livekit.cloud",
  };
  try {
    const preview = spawnSync(
      join(repoRoot, "agent/interview/deploy.sh"),
      ["preview"],
      {
        cwd: join(repoRoot, "agent/interview"),
        env: baseEnv,
        encoding: "utf8",
      }
    );
    assert.equal(preview.status, 0, preview.stderr);
    const callsAfterPreview = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n");
    assert.equal(callsAfterPreview.length, 1);

    const previewDemo = spawnSync(
      join(repoRoot, "agent/demo/deploy.sh"),
      ["preview"],
      {
        cwd: join(repoRoot, "agent/demo"),
        env: baseEnv,
        encoding: "utf8",
      }
    );
    assert.equal(previewDemo.status, 0, previewDemo.stderr);
    assert.equal(
      (await readFile(logPath, "utf8")).trim().split("\n").length,
      2
    );

    for (const mutation of [
      { MEELNI_LIVEKIT_PREVIEW_INTERVIEW_CONFIG: productionConfigPath },
      {
        MEELNI_LIVEKIT_PREVIEW_INTERVIEW_CONFIG:
          commentConfusedInterviewConfigPath,
      },
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
        2
      );
    }

    const confusedDemo = spawnSync(
      join(repoRoot, "agent/demo/deploy.sh"),
      ["preview"],
      {
        cwd: join(repoRoot, "agent/demo"),
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
    assert.match(confusedDemo.stderr, /canonical preview demo target/);
    assert.equal(
      (await readFile(logPath, "utf8")).trim().split("\n").length,
      2
    );

    const confusedProductionDemo = spawnSync(
      join(repoRoot, "agent/demo/deploy.sh"),
      ["production"],
      {
        cwd: join(repoRoot, "agent/demo"),
        encoding: "utf8",
        env: {
          ...baseEnv,
          MEELNI_LIVEKIT_PRODUCTION_DEMO_CONFIG: commentConfusedDemoConfigPath,
          MEELNI_LIVEKIT_PRODUCTION_DEMO_AGENT_ID: "CA_t3sKQEihMQ7x",
          MEELNI_LIVEKIT_PRODUCTION_DEMO_SECRETS_FILE:
            productionDemoSecretsPath,
          MEELNI_PRODUCTION_LIVEKIT_URL: "wss://meelni-ek4vaisp.livekit.cloud",
        },
      }
    );
    assert.notEqual(confusedProductionDemo.status, 0);
    assert.match(
      confusedProductionDemo.stderr,
      /canonical production demo target/
    );
    assert.equal(
      (await readFile(logPath, "utf8")).trim().split("\n").length,
      2
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
      2
    );

    const production = spawnSync(
      join(repoRoot, "agent/interview/deploy.sh"),
      ["production"],
      {
        cwd: join(repoRoot, "agent/interview"),
        encoding: "utf8",
        env: {
          ...baseEnv,
          NODE_OPTIONS: "--require /tmp/meelni-forbidden-injection.cjs",
          MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_CONFIG: productionConfigPath,
          MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_SECRETS_FILE:
            productionSecretsPath,
          MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_AGENT_ID: "CA_yawKG67rCMG4",
          MEELNI_PRODUCTION_LIVEKIT_URL: "wss://meelni-ek4vaisp.livekit.cloud",
        },
      }
    );
    assert.notEqual(production.status, 0);
    assert.match(
      production.stderr,
      /authorization_file_path_invalid|fixed system Node runtime|LiveKit CLI must support explicit source attributes/
    );
    const callsAfterProduction = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n");
    const reachedLiveKitCapabilityCheck = production.stderr.includes(
      "LiveKit CLI must support explicit source attributes"
    );
    assert.equal(
      callsAfterProduction.length,
      reachedLiveKitCapabilityCheck ? 3 : 2
    );
    if (reachedLiveKitCapabilityCheck) {
      assert.equal(callsAfterProduction.at(-1), "agent deploy --help");
    }
    assert.doesNotMatch(production.stderr, /meelni-ek4vaisp|CA_yawKG67rCMG4/);

    const missingProductionSecret = spawnSync(
      join(repoRoot, "agent/interview/deploy.sh"),
      ["production"],
      {
        cwd: join(repoRoot, "agent/interview"),
        encoding: "utf8",
        env: {
          ...baseEnv,
          MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_CONFIG: productionConfigPath,
          MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_AGENT_ID: "CA_yawKG67rCMG4",
          MEELNI_PRODUCTION_LIVEKIT_URL: "wss://meelni-ek4vaisp.livekit.cloud",
        },
      }
    );
    assert.notEqual(missingProductionSecret.status, 0);
    assert.match(
      missingProductionSecret.stderr,
      /external runtime secrets file/
    );
    assert.equal(
      (await readFile(logPath, "utf8")).trim().split("\n").length,
      callsAfterProduction.length
    );

    const productionProjectShadow = spawnSync(
      join(repoRoot, "agent/interview/deploy.sh"),
      ["production-project-shadow"],
      {
        cwd: join(repoRoot, "agent/interview"),
        encoding: "utf8",
        env: {
          ...baseEnv,
          MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_CONFIG: productionConfigPath,
          MEELNI_LIVEKIT_PRODUCTION_PROJECT_SHADOW_SECRETS_FILE:
            productionProjectShadowSecretsPath,
          MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_AGENT_ID: "CA_yawKG67rCMG4",
          MEELNI_PRODUCTION_LIVEKIT_URL: "wss://meelni-ek4vaisp.livekit.cloud",
          MEELNI_PREVIEW_SHADOW_CANDIDATE_SHA: candidateSha,
          MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_URL:
            "https://meelni-env-staging-meelni.vercel.app/api/internal/preview-shadow",
        },
      }
    );
    assert.notEqual(productionProjectShadow.status, 0);
    assert.match(
      productionProjectShadow.stderr,
      /authorization_file_path_invalid|fixed system Node runtime/
    );
    assert.equal(
      (await readFile(logPath, "utf8")).trim().split("\n").length,
      callsAfterProduction.length
    );

    const previewShadow = spawnSync(
      join(repoRoot, "agent/interview/deploy.sh"),
      ["preview-shadow"],
      {
        cwd: join(repoRoot, "agent/interview"),
        encoding: "utf8",
        env: {
          ...baseEnv,
          MEELNI_LIVEKIT_PREVIEW_SHADOW_SECRETS_FILE: previewShadowSecretsPath,
          MEELNI_PREVIEW_SHADOW_CANDIDATE_SHA: candidateSha,
          MEELNI_PREVIEW_SHADOW_CONTROL_PLANE_URL: previewShadowControlPlaneUrl,
        },
      }
    );
    assert.equal(previewShadow.status, 0, previewShadow.stderr);
    const previewShadowCall = (await readFile(logPath, "utf8"))
      .trim()
      .split("\n")
      .at(-1);
    assert.match(previewShadowCall, /--no-default-attributes/);
    assert.match(
      previewShadowCall,
      new RegExp(`--attribute meelni\\.source_sha=${candidateSha}`)
    );
    assert.match(previewShadowCall, /--secrets-file/);
    assert.doesNotMatch(previewShadowCall, /MEELNI_PREVIEW_SHADOW_RUN_ID/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("repository-owned Production entrypoints stay in the reviewed inventory", async () => {
  for (const retiredPath of [
    "scripts/test-stripe-automated.sh",
    "scripts/test-stripe-simple.sh",
    "scripts/test-stripe-flow.sh",
  ]) {
    await assert.rejects(readFile(join(repoRoot, retiredPath), "utf8"), {
      code: "ENOENT",
    });
  }

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
      [
        "livekit-production-interview-deploy",
        "/usr/local/bin/node",
        "prepare-livekit-production-deploy-source.mjs",
        "meelni.source_sha",
        "--no-default-attributes",
        "production-project-shadow",
        "agent update-secrets",
        "--overwrite",
        "LiveKit CLI must support explicit source attributes",
      ],
    ],
    [
      "agent/demo/deploy.sh",
      [
        "livekit-production-demo-deploy",
        "/usr/local/bin/node",
        "prepare-livekit-production-deploy-source.mjs",
        "meelni.source_sha",
        "--no-default-attributes",
        "--secrets-file",
      ],
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

  const authorizationConsumer = await readFile(
    join(repoRoot, "scripts/consume-production-action-authorization.mjs"),
    "utf8"
  );
  assert.match(
    authorizationConsumer,
    /const repoRoot = resolve\(dirname\(fileURLToPath\(import\.meta\.url\)\), "\.\."\)/
  );
  assert.match(
    authorizationConsumer,
    /consumeProductionActionAuthorization\(\{[\s\S]*?repoRoot,/
  );

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
      /\blk\s+agent\s+(?:create|deploy|rollback|delete|update-secrets)\b/i,
      `${path} must point operators to the target-bound wrapper`
    );
    assert.doesNotMatch(
      source,
      /(?:^|\n)[ \t]*(?:npx[ \t]+)?drizzle-kit[ \t]+(?:studio|push|migrate)\b/im,
      `${path} must route database commands through the guarded npm wrapper`
    );
    assert.doesNotMatch(
      source,
      /(?:update|apply|create|edit)[^\n]*(?:RLS|polic(?:y|ies)|schema)[^\n]*Supabase (?:dashboard|SQL Editor)/i,
      `${path} must not instruct direct provider schema or policy mutation`
    );
  }

  for (const path of [
    ".claude/agents/developer.md",
    "app/api/questions/DEPLOYMENT.md",
  ]) {
    const source = await readFile(join(repoRoot, path), "utf8");
    assert.doesNotMatch(
      source,
      /Supabase SQL Editor|INSERT INTO interview_question|drizzle-kit push|db:push/i,
      `${path} must not instruct direct database mutation`
    );
    assert.match(source, /npm run db:migrate/);
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

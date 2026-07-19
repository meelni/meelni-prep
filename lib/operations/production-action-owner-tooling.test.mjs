import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  consumeProductionActionAuthorization,
  PRODUCTION_ACTION_KEY_REGISTRY_CONTRACT,
  PRODUCTION_ACTION_MUTATION_SCOPES,
  PRODUCTION_ACTION_OWNER_ID,
  PRODUCTION_ACTIONS,
  sha256,
} from "./production-action-authorization.mjs";
import {
  enrollProductionActionOwner,
  prepareUnsignedProductionAction,
  PRODUCTION_ACTION_SYNTHETIC_PROOF_CONTRACT,
  signProductionActionPayload,
  verifyExternalProductionAction,
} from "./production-action-owner-tooling.mjs";

const REPO_ROOT = process.cwd();
const SCRIPT = join(REPO_ROOT, "scripts", "production-action-owner.mjs");
const NOW = new Date("2030-01-01T00:00:00.000Z");
const CANDIDATE = "a".repeat(40);
const CONFIGURATION = sha256("synthetic-configuration");
const TARGET = sha256("synthetic-target");
const KEY_ID = "owner-test-key";

test("owner enrollment writes only external mode-0600 private material", async () => {
  const directory = await privateDirectory("meelni-owner-enrollment-");
  const privateKeyPath = join(directory, "owner-private.pem");
  const executorIdentityPath = join(directory, "executor-id");
  try {
    const result = await enrollment({
      directory,
      privateKeyPath,
      executorIdentityPath,
    });
    const privateKey = await readFile(privateKeyPath, "utf8");
    const executorIdentity = (
      await readFile(executorIdentityPath, "utf8")
    ).trim();

    assert.match(privateKey, /BEGIN PRIVATE KEY/);
    assert.match(executorIdentity, /^[A-Za-z0-9_-]{43}$/);
    assert.equal((await lstat(privateKeyPath)).mode & 0o777, 0o600);
    assert.equal((await lstat(executorIdentityPath)).mode & 0o777, 0o600);
    assert.deepEqual(Object.keys(result.publicRegistryEntry).sort(), [
      "algorithm",
      "keyId",
      "notAfter",
      "notBefore",
      "publicKeyPem",
      "status",
    ]);
    assert.match(result.publicRegistryEntry.publicKeyPem, /BEGIN PUBLIC KEY/);
    assert.doesNotMatch(
      JSON.stringify(result.publicRegistryEntry),
      /PRIVATE KEY|executor/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("enrollment refuses repository paths and unknown CLI options before writing", async () => {
  const directory = await mkdtemp(join(REPO_ROOT, ".sav275-private-test-"));
  const missingDirectory = join(
    REPO_ROOT,
    `.sav275-private-missing-${process.pid}`
  );
  await chmod(directory, 0o700);
  const privateKeyPath = join(directory, "owner-private.pem");
  const executorIdentityPath = join(directory, "executor-id");
  try {
    await assert.rejects(
      enrollment({ directory, privateKeyPath, executorIdentityPath }),
      /must_be_external/
    );
    await assert.rejects(lstat(privateKeyPath), { code: "ENOENT" });
    await assert.rejects(lstat(executorIdentityPath), { code: "ENOENT" });
    await assert.rejects(
      enrollment({
        privateKeyPath: join(missingDirectory, "owner-private.pem"),
        executorIdentityPath: join(missingDirectory, "executor-id"),
      }),
      /must_be_external/
    );
    await assert.rejects(lstat(missingDirectory), { code: "ENOENT" });

    const external = await privateDirectory("meelni-owner-options-");
    try {
      const result = spawnSync(
        process.execPath,
        [
          SCRIPT,
          "enroll",
          "--key-id",
          KEY_ID,
          "--not-before",
          "2029-01-01T00:00:00.000Z",
          "--not-after",
          "2031-01-01T00:00:00.000Z",
          "--private-key-path",
          join(external, "owner-private.pem"),
          "--executor-id-path",
          join(external, "executor-id"),
          "--unexpected",
          "value",
        ],
        { cwd: REPO_ROOT, encoding: "utf8" }
      );
      assert.equal(result.status, 1);
      assert.equal(result.stderr, "production_action_owner_option_unknown\n");
      await assert.rejects(lstat(join(external, "owner-private.pem")), {
        code: "ENOENT",
      });
    } finally {
      await rm(external, { recursive: true, force: true });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(missingDirectory, { recursive: true, force: true });
  }
});

test("CLI enrollment emits public registry material without private values", async () => {
  const directory = await privateDirectory("meelni-owner-cli-");
  const privateKeyPath = join(directory, "owner-private.pem");
  const executorIdentityPath = join(directory, "executor-id");
  try {
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        "enroll",
        "--key-id",
        KEY_ID,
        "--not-before",
        "2029-01-01T00:00:00.000Z",
        "--not-after",
        "2031-01-01T00:00:00.000Z",
        "--private-key-path",
        privateKeyPath,
        "--executor-id-path",
        executorIdentityPath,
      ],
      { cwd: REPO_ROOT, encoding: "utf8" }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    const publicEntry = JSON.parse(result.stdout);
    const privateKey = await readFile(privateKeyPath, "utf8");
    const executorIdentity = (
      await readFile(executorIdentityPath, "utf8")
    ).trim();
    assert.match(publicEntry.publicKeyPem, /BEGIN PUBLIC KEY/);
    assert.doesNotMatch(result.stdout, /PRIVATE KEY/);
    assert.equal(result.stdout.includes(privateKey), false);
    assert.equal(result.stdout.includes(executorIdentity), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("prepared and signed artifacts enforce exact binding, expiry, mutation, and replay", async () => {
  const fixture = await signedFixture();
  try {
    assert.equal((await lstat(fixture.payloadPath)).mode & 0o777, 0o600);
    assert.equal((await lstat(fixture.artifactPath)).mode & 0o777, 0o600);

    const verified = await verifyExternalProductionAction({
      artifactPath: fixture.artifactPath,
      action: PRODUCTION_ACTIONS.PRODUCTION_DATABASE_MIGRATE,
      configurationSha256: CONFIGURATION,
      targetFingerprint: TARGET,
      executorIdentityPath: fixture.executorIdentityPath,
      keyRegistryPath: fixture.keyRegistryPath,
      repoRoot: REPO_ROOT,
      now: NOW,
      resolveCandidate: () => CANDIDATE,
    });
    assert.equal(verified.candidateSha, CANDIDATE);

    await assert.rejects(
      verifyExternalProductionAction({
        artifactPath: fixture.artifactPath,
        action: PRODUCTION_ACTIONS.PRODUCTION_DATABASE_MIGRATE,
        configurationSha256: "b".repeat(64),
        targetFingerprint: TARGET,
        executorIdentityPath: fixture.executorIdentityPath,
        keyRegistryPath: fixture.keyRegistryPath,
        repoRoot: REPO_ROOT,
        now: NOW,
        resolveCandidate: () => CANDIDATE,
      }),
      /authorization_configurationSha256_mismatch/
    );

    await assert.rejects(
      verifyExternalProductionAction({
        artifactPath: fixture.artifactPath,
        action: PRODUCTION_ACTIONS.PRODUCTION_DATABASE_MIGRATE,
        configurationSha256: CONFIGURATION,
        targetFingerprint: TARGET,
        executorIdentityPath: fixture.executorIdentityPath,
        keyRegistryPath: fixture.keyRegistryPath,
        repoRoot: REPO_ROOT,
        now: new Date("2030-01-01T00:15:00.000Z"),
        resolveCandidate: () => CANDIDATE,
      }),
      /authorization_expired/
    );

    const mutatedPath = join(fixture.directory, "mutated-authorization.json");
    const mutated = JSON.parse(await readFile(fixture.artifactPath, "utf8"));
    mutated.payload.authorizationId = "ora_fedcba9876543210fedcba9876543210";
    await writeFile(mutatedPath, `${JSON.stringify(mutated)}\n`, {
      mode: 0o600,
    });
    await chmod(mutatedPath, 0o600);
    await assert.rejects(
      verifyExternalProductionAction({
        artifactPath: mutatedPath,
        action: PRODUCTION_ACTIONS.PRODUCTION_DATABASE_MIGRATE,
        configurationSha256: CONFIGURATION,
        targetFingerprint: TARGET,
        executorIdentityPath: fixture.executorIdentityPath,
        keyRegistryPath: fixture.keyRegistryPath,
        repoRoot: REPO_ROOT,
        now: NOW,
        resolveCandidate: () => CANDIDATE,
      }),
      /authorization_signature_mismatch/
    );

    const consumption = {
      authorizationPath: fixture.artifactPath,
      expected: {
        action: PRODUCTION_ACTIONS.PRODUCTION_DATABASE_MIGRATE,
        provider: "supabase",
        configurationSha256: CONFIGURATION,
        targetFingerprint: TARGET,
      },
      repoRoot: REPO_ROOT,
      keyRegistryPath: fixture.keyRegistryPath,
      ledgerPath: join(fixture.directory, "ledger", "consumed.json"),
      executorIdentityPath: fixture.executorIdentityPath,
      resolveCandidate: () => CANDIDATE,
      now: NOW,
    };
    await consumeProductionActionAuthorization(consumption);
    await assert.rejects(
      consumeProductionActionAuthorization(consumption),
      /authorization_replay_rejected/
    );
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("private inputs fail closed when readable by group or world", async () => {
  const fixture = await signedFixture();
  try {
    await chmod(fixture.privateKeyPath, 0o644);
    const secondArtifact = join(fixture.directory, "second-authorization.json");
    await assert.rejects(
      signProductionActionPayload({
        payloadPath: fixture.payloadPath,
        privateKeyPath: fixture.privateKeyPath,
        artifactPath: secondArtifact,
        keyId: KEY_ID,
        keyRegistryPath: fixture.keyRegistryPath,
        repoRoot: REPO_ROOT,
        now: NOW,
      }),
      /owner_private_key_insecure/
    );
    await assert.rejects(lstat(secondArtifact), { code: "ENOENT" });
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test("relaunch default-on is not exposed by generic owner tooling", async () => {
  const directory = await privateDirectory("meelni-owner-no-go-");
  const privateKeyPath = join(directory, "owner-private.pem");
  const executorIdentityPath = join(directory, "executor-id");
  try {
    const enrolled = await enrollment({
      directory,
      privateKeyPath,
      executorIdentityPath,
    });
    await assert.rejects(
      prepareUnsignedProductionAction({
        action: PRODUCTION_ACTIONS.RELAUNCH_DEFAULT_ON,
        configurationSha256: CONFIGURATION,
        targetFingerprint: TARGET,
        outputPath: join(directory, "payload.json"),
        executorIdentityPath,
        repoRoot: REPO_ROOT,
        now: NOW,
        resolveCandidate: () => CANDIDATE,
      }),
      /owner_tooling_relaunch_default_on_unsupported/
    );

    const keyRegistryPath = join(directory, "keys.json");
    const payloadPath = join(directory, "manual-relaunch-payload.json");
    const artifactPath = join(directory, "manual-relaunch-artifact.json");
    const executorIdentity = (
      await readFile(executorIdentityPath, "utf8")
    ).trim();
    await writeFile(
      keyRegistryPath,
      `${JSON.stringify({
        contract: PRODUCTION_ACTION_KEY_REGISTRY_CONTRACT,
        ownerId: PRODUCTION_ACTION_OWNER_ID,
        keys: [enrolled.publicRegistryEntry],
      })}\n`,
      { mode: 0o600 }
    );
    await writeFile(
      payloadPath,
      `${JSON.stringify({
        action: PRODUCTION_ACTIONS.RELAUNCH_DEFAULT_ON,
        authorizationId: "ora_0123456789abcdef0123456789abcdef",
        candidateSha: CANDIDATE,
        configurationSha256: CONFIGURATION,
        environment: "production",
        executorFingerprint: sha256(`executor:${executorIdentity}`),
        expiresAt: "2030-01-01T00:15:00.000Z",
        issuedAt: NOW.toISOString(),
        maxUses: 1,
        mutationScope:
          PRODUCTION_ACTION_MUTATION_SCOPES[
            PRODUCTION_ACTIONS.RELAUNCH_DEFAULT_ON
          ],
        ownerId: PRODUCTION_ACTION_OWNER_ID,
        ownerLaunchDecision: "GO",
        provider: "statsig-vercel",
        targetFingerprint: TARGET,
      })}\n`,
      { mode: 0o600 }
    );
    await assert.rejects(
      signProductionActionPayload({
        payloadPath,
        privateKeyPath,
        artifactPath,
        keyId: KEY_ID,
        keyRegistryPath,
        repoRoot: REPO_ROOT,
        now: NOW,
      }),
      /owner_tooling_relaunch_default_on_unsupported/
    );
    await assert.rejects(lstat(artifactPath), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("synthetic CLI proves the contract without emitting private material", () => {
  const result = spawnSync(process.execPath, [SCRIPT, "synthetic-dry-run"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: "forbidden-provider-value",
      STRIPE_SECRET_KEY: "forbidden-provider-value",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const proof = JSON.parse(result.stdout);
  assert.deepEqual(proof, {
    contract: PRODUCTION_ACTION_SYNTHETIC_PROOF_CONTRACT,
    productionCalls: 0,
    proofs: [
      "exact_binding",
      "candidate_mutation_rejection",
      "artifact_mutation_rejection",
      "expiry_rejection",
      "replay_rejection",
    ],
    providerCalls: 0,
    result: "pass",
  });
  assert.doesNotMatch(
    result.stdout,
    /PRIVATE KEY|ora_|forbidden-provider-value/
  );
});

async function signedFixture() {
  const directory = await privateDirectory("meelni-owner-signed-");
  const privateKeyPath = join(directory, "owner-private.pem");
  const executorIdentityPath = join(directory, "executor-id");
  const payloadPath = join(directory, "unsigned.json");
  const artifactPath = join(directory, "authorization.json");
  const keyRegistryPath = join(directory, "keys.json");
  const enrolled = await enrollment({
    directory,
    privateKeyPath,
    executorIdentityPath,
  });
  await writeFile(
    keyRegistryPath,
    `${JSON.stringify({
      contract: PRODUCTION_ACTION_KEY_REGISTRY_CONTRACT,
      ownerId: PRODUCTION_ACTION_OWNER_ID,
      keys: [enrolled.publicRegistryEntry],
    })}\n`,
    { mode: 0o600 }
  );
  await prepareUnsignedProductionAction({
    action: PRODUCTION_ACTIONS.PRODUCTION_DATABASE_MIGRATE,
    authorizationId: "ora_0123456789abcdef0123456789abcdef",
    configurationSha256: CONFIGURATION,
    targetFingerprint: TARGET,
    outputPath: payloadPath,
    executorIdentityPath,
    repoRoot: REPO_ROOT,
    now: NOW,
    resolveCandidate: () => CANDIDATE,
  });
  await signProductionActionPayload({
    payloadPath,
    privateKeyPath,
    artifactPath,
    keyId: KEY_ID,
    keyRegistryPath,
    repoRoot: REPO_ROOT,
    now: NOW,
  });
  return {
    directory,
    privateKeyPath,
    executorIdentityPath,
    payloadPath,
    artifactPath,
    keyRegistryPath,
  };
}

async function enrollment({ privateKeyPath, executorIdentityPath }) {
  return enrollProductionActionOwner({
    keyId: KEY_ID,
    notBefore: "2029-01-01T00:00:00.000Z",
    notAfter: "2031-01-01T00:00:00.000Z",
    privateKeyPath,
    executorIdentityPath,
    repoRoot: REPO_ROOT,
  });
}

async function privateDirectory(prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  await chmod(directory, 0o700);
  return directory;
}

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  canonicalJson,
  consumeProductionActionAuthorization,
  productionActionSignatureMessage,
  PRODUCTION_ACTION_AUTHORIZATION_CONTRACT,
  PRODUCTION_ACTION_KEY_REGISTRY_CONTRACT,
  PRODUCTION_ACTION_MUTATION_SCOPES,
  PRODUCTION_ACTIONS,
  resolveCleanGitCandidate,
  sha256,
  verifyProductionActionAuthorization,
} from "./production-action-authorization.mjs";

const NOW = new Date("2026-07-13T19:00:00.000Z");
const CANDIDATE = "a".repeat(40);
const CONFIGURATION = "b".repeat(64);
const TARGET = "c".repeat(64);
const EXECUTOR_ID = "e".repeat(43);
const EXECUTOR = sha256(`executor:${EXECUTOR_ID}`);
const KEY_ID = "owner-key-1";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");

test("an exact signed Production action is accepted without creating launch GO", () => {
  const artifact = signedArtifact();
  const verified = verifyProductionActionAuthorization({
    artifact,
    keyRegistry: registry(),
    expected: expected(),
    now: NOW,
  });
  assert.equal(verified.authorizationId, artifact.payload.authorizationId);
  assert.equal(artifact.payload.ownerLaunchDecision, null);
});

test("authorization signatures are domain-separated from bare payload signatures", () => {
  const artifact = signedArtifact();
  artifact.signature.value = sign(
    null,
    Buffer.from(canonicalJson(artifact.payload)),
    privateKey
  ).toString("base64");
  assert.throws(
    () =>
      verifyProductionActionAuthorization({
        artifact,
        keyRegistry: registry(),
        expected: expected(),
        now: NOW,
      }),
    /authorization_signature_mismatch/
  );
});

test("authorization rejects schema, signature, time, candidate, action, and target drift", () => {
  const mutations = [
    (artifact) => (artifact.extra = true),
    (artifact) => (artifact.payload.environment = "preview"),
    (artifact) => (artifact.payload.maxUses = 2),
    (artifact) => (artifact.payload.mutationScope = "provider.admin:*"),
    (artifact) => (artifact.payload.candidateSha = "d".repeat(40)),
    (artifact) => (artifact.payload.configurationSha256 = "d".repeat(64)),
    (artifact) => (artifact.payload.executorFingerprint = "d".repeat(64)),
    (artifact) => (artifact.payload.targetFingerprint = "d".repeat(64)),
    (artifact) => (artifact.payload.provider = "vercel"),
    (artifact) => (artifact.payload.ownerLaunchDecision = "GO"),
    (artifact) => (artifact.signature.value = "A".repeat(88)),
  ];
  for (const mutate of mutations) {
    const artifact = signedArtifact();
    mutate(artifact);
    assert.throws(() =>
      verifyProductionActionAuthorization({
        artifact,
        keyRegistry: registry(),
        expected: expected(),
        now: NOW,
      })
    );
  }

  assert.throws(() =>
    verifyProductionActionAuthorization({
      artifact: signedArtifact({ expiresAt: NOW.toISOString() }),
      keyRegistry: registry(),
      expected: expected(),
      now: NOW,
    })
  );
  assert.throws(() =>
    verifyProductionActionAuthorization({
      artifact: signedArtifact({ issuedAt: "2026-07-13T19:00:01.000Z" }),
      keyRegistry: registry(),
      expected: expected(),
      now: NOW,
    })
  );
});

test("authorization rejects keys that are expired at use or before artifact expiry", () => {
  const expiredAtUse = registry();
  expiredAtUse.keys[0].notAfter = "2026-07-13T18:59:59.000Z";
  assert.throws(
    () =>
      verifyProductionActionAuthorization({
        artifact: signedArtifact(),
        keyRegistry: expiredAtUse,
        expected: expected(),
        now: NOW,
      }),
    /signing_key_outside_window/
  );

  const expiresPastKey = registry();
  expiresPastKey.keys[0].notAfter = "2026-07-13T19:10:00.000Z";
  assert.throws(
    () =>
      verifyProductionActionAuthorization({
        artifact: signedArtifact(),
        keyRegistry: expiresPastKey,
        expected: expected(),
        now: NOW,
      }),
    /signing_key_outside_window/
  );
});

test("default-on uniquely requires exact-candidate owner GO", () => {
  const action = PRODUCTION_ACTIONS.RELAUNCH_DEFAULT_ON;
  const provider = "statsig-vercel";
  const withoutGo = signedArtifact({ action, provider });
  assert.throws(
    () =>
      verifyProductionActionAuthorization({
        artifact: withoutGo,
        keyRegistry: registry(),
        expected: expected({ action, provider }),
        now: NOW,
      }),
    /owner_launch_go_required/
  );

  const withGo = signedArtifact({
    action,
    provider,
    ownerLaunchDecision: "GO",
  });
  assert.doesNotThrow(() =>
    verifyProductionActionAuthorization({
      artifact: withGo,
      keyRegistry: registry(),
      expected: expected({ action, provider }),
      now: NOW,
    })
  );
});

test("an external private authorization is consumed once and replay fails closed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meelni-production-action-"));
  const authorizationPath = join(directory, "authorization.json");
  const keyRegistryPath = join(directory, "keys.json");
  const ledgerPath = join(directory, "ledger", "consumed.json");
  const executorIdentityPath = join(directory, "executor-id");
  await writeFile(authorizationPath, `${JSON.stringify(signedArtifact())}\n`, {
    mode: 0o600,
  });
  await chmod(authorizationPath, 0o600);
  await writeFile(keyRegistryPath, `${JSON.stringify(registry())}\n`, {
    mode: 0o600,
  });
  await writeFile(executorIdentityPath, `${EXECUTOR_ID}\n`, { mode: 0o600 });
  await chmod(executorIdentityPath, 0o600);
  try {
    const input = {
      authorizationPath,
      expected: expected(),
      repoRoot: process.cwd(),
      keyRegistryPath,
      ledgerPath,
      executorIdentityPath,
      resolveCandidate: () => CANDIDATE,
      now: NOW,
    };
    const first = await consumeProductionActionAuthorization(input);
    assert.equal(first.action, PRODUCTION_ACTIONS.STRIPE_LIVE_CATALOG);
    await assert.rejects(
      consumeProductionActionAuthorization(input),
      /authorization_replay_rejected/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("concurrent reuse cannot produce two successful consumptions", async () => {
  const directory = await mkdtemp(
    join(tmpdir(), "meelni-production-action-race-")
  );
  const authorizationPath = join(directory, "authorization.json");
  const keyRegistryPath = join(directory, "keys.json");
  const ledgerPath = join(directory, "ledger", "consumed.json");
  const executorIdentityPath = join(directory, "executor-id");
  await writeFile(authorizationPath, JSON.stringify(signedArtifact()), {
    mode: 0o600,
  });
  await writeFile(keyRegistryPath, JSON.stringify(registry()), { mode: 0o600 });
  await writeFile(executorIdentityPath, EXECUTOR_ID, { mode: 0o600 });
  try {
    const input = {
      authorizationPath,
      expected: expected(),
      repoRoot: process.cwd(),
      keyRegistryPath,
      ledgerPath,
      executorIdentityPath,
      resolveCandidate: () => CANDIDATE,
      now: NOW,
    };
    const outcomes = await Promise.allSettled([
      consumeProductionActionAuthorization(input),
      consumeProductionActionAuthorization(input),
    ]);
    assert.equal(
      outcomes.filter(({ status }) => status === "fulfilled").length,
      1
    );
    assert.equal(
      outcomes.filter(({ status }) => status === "rejected").length,
      1
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("authorization denials expose stable codes rather than signed material", () => {
  const artifact = signedArtifact();
  artifact.signature.value = "A".repeat(88);
  let denial;
  try {
    verifyProductionActionAuthorization({
      artifact,
      keyRegistry: registry(),
      expected: expected(),
      now: NOW,
    });
  } catch (error) {
    denial = error;
  }
  assert.ok(denial instanceof Error);
  assert.equal(denial.message, "authorization_signature_mismatch");
  assert.doesNotMatch(
    denial.message,
    new RegExp(
      [artifact.payload.authorizationId, CANDIDATE, CONFIGURATION, TARGET].join(
        "|"
      )
    )
  );
});

test("candidate resolution rejects tracked and untracked worktree drift", async () => {
  const directory = await mkdtemp(join(tmpdir(), "meelni-clean-candidate-"));
  const git = (args) =>
    execFileSync("/usr/bin/git", args, {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    git(["init"]);
    git(["config", "user.email", "test@meelni.invalid"]);
    git(["config", "user.name", "Meelni Test"]);
    await writeFile(join(directory, "tracked.txt"), "clean\n");
    git(["add", "tracked.txt"]);
    git(["commit", "-m", "fixture"]);
    const candidate = resolveCleanGitCandidate(directory);
    assert.match(candidate, /^[a-f0-9]{40}$/);

    const injectedGitDir = await mkdtemp(
      join(tmpdir(), "meelni-injected-git-dir-")
    );
    execFileSync("/usr/bin/git", ["init", "--bare", injectedGitDir], {
      stdio: "ignore",
    });
    const previousGitDir = process.env.GIT_DIR;
    process.env.GIT_DIR = injectedGitDir;
    try {
      assert.equal(resolveCleanGitCandidate(directory), candidate);
    } finally {
      if (previousGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previousGitDir;
      await rm(injectedGitDir, { recursive: true, force: true });
    }

    await writeFile(join(directory, "untracked.txt"), "drift\n");
    assert.throws(
      () => resolveCleanGitCandidate(directory),
      /candidate_worktree_dirty/
    );
    await rm(join(directory, "untracked.txt"));
    await writeFile(join(directory, "tracked.txt"), "changed\n");
    assert.throws(
      () => resolveCleanGitCandidate(directory),
      /candidate_worktree_dirty/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the tracked empty key registry cannot authorize an agent-authored receipt", async () => {
  const tracked = JSON.parse(
    await import("node:fs/promises").then(({ readFile }) =>
      readFile("config/production-action-owner-keys.json", "utf8")
    )
  );
  assert.throws(
    () =>
      verifyProductionActionAuthorization({
        artifact: signedArtifact(),
        keyRegistry: tracked,
        expected: expected(),
        now: NOW,
      }),
    /signing_key_untrusted/
  );
});

function signedArtifact(overrides = {}) {
  const action = overrides.action ?? PRODUCTION_ACTIONS.STRIPE_LIVE_CATALOG;
  const payload = {
    action,
    authorizationId: "ora_0123456789abcdef0123456789abcdef",
    candidateSha: CANDIDATE,
    configurationSha256: CONFIGURATION,
    environment: "production",
    executorFingerprint: EXECUTOR,
    expiresAt: "2026-07-13T19:15:00.000Z",
    issuedAt: "2026-07-13T18:59:00.000Z",
    maxUses: 1,
    mutationScope: PRODUCTION_ACTION_MUTATION_SCOPES[action],
    ownerId: "saviii",
    ownerLaunchDecision: null,
    provider: "stripe",
    targetFingerprint: TARGET,
    ...overrides,
  };
  return {
    contract: PRODUCTION_ACTION_AUTHORIZATION_CONTRACT,
    payload,
    signature: {
      algorithm: "ed25519",
      keyId: KEY_ID,
      value: sign(
        null,
        productionActionSignatureMessage(payload),
        privateKey
      ).toString("base64"),
    },
  };
}

function registry() {
  return {
    contract: PRODUCTION_ACTION_KEY_REGISTRY_CONTRACT,
    ownerId: "saviii",
    keys: [
      {
        algorithm: "ed25519",
        keyId: KEY_ID,
        notAfter: "2027-01-01T00:00:00.000Z",
        notBefore: "2026-01-01T00:00:00.000Z",
        publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
        status: "active",
      },
    ],
  };
}

function expected(overrides = {}) {
  return {
    action: PRODUCTION_ACTIONS.STRIPE_LIVE_CATALOG,
    provider: "stripe",
    candidateSha: CANDIDATE,
    configurationSha256: CONFIGURATION,
    executorFingerprint: EXECUTOR,
    targetFingerprint: TARGET,
    ...overrides,
  };
}

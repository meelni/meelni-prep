import { execFileSync } from "node:child_process";
import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export const PRODUCTION_ACTION_AUTHORIZATION_CONTRACT =
  "meelni.production-action-authorization.v1";
export const PRODUCTION_ACTION_KEY_REGISTRY_CONTRACT =
  "meelni.production-action-key-registry.v1";
export const PRODUCTION_ACTION_LEDGER_CONTRACT =
  "meelni.production-action-consumption-ledger.v1";
export const PRODUCTION_ACTION_OWNER_ID = "saviii";
export const PRODUCTION_ACTION_MAX_TTL_MS = 30 * 60 * 1_000;

export const PRODUCTION_ACTIONS = Object.freeze({
  STRIPE_LIVE_CATALOG: "stripe-live-catalog",
  LIVEKIT_PRODUCTION_INTERVIEW_DEPLOY: "livekit-production-interview-deploy",
  LIVEKIT_PRODUCTION_DEMO_DEPLOY: "livekit-production-demo-deploy",
  PRODUCTION_DATABASE_MIGRATE: "production-database-migrate",
  PRODUCTION_QUESTION_SYNC_ACTIVATE: "production-question-sync-activate",
  PRODUCTION_QUESTION_SYNC_MANUAL: "production-question-sync-manual",
  VERCEL_PRODUCTION_PROMOTE: "vercel-production-promote",
  RELAUNCH_DEFAULT_ON: "relaunch-default-on",
});

const ACTION_PROVIDERS = new Map([
  [PRODUCTION_ACTIONS.STRIPE_LIVE_CATALOG, "stripe"],
  [PRODUCTION_ACTIONS.LIVEKIT_PRODUCTION_INTERVIEW_DEPLOY, "livekit"],
  [PRODUCTION_ACTIONS.LIVEKIT_PRODUCTION_DEMO_DEPLOY, "livekit"],
  [PRODUCTION_ACTIONS.PRODUCTION_DATABASE_MIGRATE, "supabase"],
  [PRODUCTION_ACTIONS.PRODUCTION_QUESTION_SYNC_ACTIVATE, "vercel"],
  [PRODUCTION_ACTIONS.PRODUCTION_QUESTION_SYNC_MANUAL, "google-sheets"],
  [PRODUCTION_ACTIONS.VERCEL_PRODUCTION_PROMOTE, "vercel"],
  [PRODUCTION_ACTIONS.RELAUNCH_DEFAULT_ON, "statsig-vercel"],
]);

export function getProductionActionProvider(action) {
  const provider = ACTION_PROVIDERS.get(action);
  if (!provider) throw new Error("authorization_action_invalid");
  return provider;
}

export const PRODUCTION_ACTION_MUTATION_SCOPES = Object.freeze({
  [PRODUCTION_ACTIONS.STRIPE_LIVE_CATALOG]:
    "stripe.products-prices.write:meelni-credit-catalog",
  [PRODUCTION_ACTIONS.LIVEKIT_PRODUCTION_INTERVIEW_DEPLOY]:
    "livekit.agent.deploy:interview",
  [PRODUCTION_ACTIONS.LIVEKIT_PRODUCTION_DEMO_DEPLOY]:
    "livekit.agent.deploy:demo",
  [PRODUCTION_ACTIONS.PRODUCTION_DATABASE_MIGRATE]:
    "supabase.schema.migrate:canonical",
  [PRODUCTION_ACTIONS.PRODUCTION_QUESTION_SYNC_ACTIVATE]:
    "vercel.cron.activate:question-sync",
  [PRODUCTION_ACTIONS.PRODUCTION_QUESTION_SYNC_MANUAL]:
    "supabase.questions.sync:manual",
  [PRODUCTION_ACTIONS.VERCEL_PRODUCTION_PROMOTE]:
    "vercel.deployment.promote:production",
  [PRODUCTION_ACTIONS.RELAUNCH_DEFAULT_ON]:
    "statsig-vercel.relaunch.enable:default-on",
});

const ARTIFACT_KEYS = ["contract", "payload", "signature"];
const PAYLOAD_KEYS = [
  "action",
  "authorizationId",
  "candidateSha",
  "configurationSha256",
  "environment",
  "executorFingerprint",
  "expiresAt",
  "issuedAt",
  "maxUses",
  "mutationScope",
  "ownerId",
  "ownerLaunchDecision",
  "provider",
  "targetFingerprint",
];
const SIGNATURE_KEYS = ["algorithm", "keyId", "value"];
const REGISTRY_KEYS = ["contract", "keys", "ownerId"];
const REGISTRY_ENTRY_KEYS = [
  "algorithm",
  "keyId",
  "notAfter",
  "notBefore",
  "publicKeyPem",
  "status",
];

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function productionActionSignatureMessage(payload) {
  return Buffer.from(
    `${PRODUCTION_ACTION_AUTHORIZATION_CONTRACT}\u0000${canonicalJson(payload)}`
  );
}

export function verifyProductionActionAuthorization({
  artifact,
  keyRegistry,
  expected,
  now = new Date(),
}) {
  assertPlainObject(artifact, "authorization_artifact_invalid");
  assertExactKeys(artifact, ARTIFACT_KEYS, "authorization_artifact_invalid");
  if (artifact.contract !== PRODUCTION_ACTION_AUTHORIZATION_CONTRACT) {
    throw new Error("authorization_contract_invalid");
  }

  assertPlainObject(artifact.payload, "authorization_payload_invalid");
  assertExactKeys(
    artifact.payload,
    PAYLOAD_KEYS,
    "authorization_payload_invalid"
  );
  assertPlainObject(artifact.signature, "authorization_signature_invalid");
  assertExactKeys(
    artifact.signature,
    SIGNATURE_KEYS,
    "authorization_signature_invalid"
  );
  assertRegistry(keyRegistry);

  const payload = artifact.payload;
  const provider = ACTION_PROVIDERS.get(payload.action);
  if (!provider || provider !== payload.provider) {
    throw new Error("authorization_action_provider_invalid");
  }
  if (payload.environment !== "production") {
    throw new Error("authorization_environment_invalid");
  }
  if (payload.ownerId !== PRODUCTION_ACTION_OWNER_ID) {
    throw new Error("authorization_owner_invalid");
  }
  if (!/^ora_[a-f0-9]{32}$/.test(payload.authorizationId)) {
    throw new Error("authorization_id_invalid");
  }
  if (!/^[a-f0-9]{40}$/.test(payload.candidateSha)) {
    throw new Error("authorization_candidate_invalid");
  }
  if (!/^[a-f0-9]{64}$/.test(payload.configurationSha256)) {
    throw new Error("authorization_configuration_invalid");
  }
  if (!/^[a-f0-9]{64}$/.test(payload.executorFingerprint)) {
    throw new Error("authorization_executor_invalid");
  }
  if (!/^[a-f0-9]{64}$/.test(payload.targetFingerprint)) {
    throw new Error("authorization_target_invalid");
  }
  if (payload.maxUses !== 1) {
    throw new Error("authorization_scope_invalid");
  }
  if (
    payload.mutationScope !== PRODUCTION_ACTION_MUTATION_SCOPES[payload.action]
  ) {
    throw new Error("authorization_mutation_scope_invalid");
  }

  const issuedAt = parseTimestamp(
    payload.issuedAt,
    "authorization_issued_at_invalid"
  );
  const expiresAt = parseTimestamp(
    payload.expiresAt,
    "authorization_expires_at_invalid"
  );
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error("authorization_clock_invalid");
  if (issuedAt.getTime() > nowMs) {
    throw new Error("authorization_not_yet_valid");
  }
  if (expiresAt.getTime() <= nowMs) {
    throw new Error("authorization_expired");
  }
  if (
    expiresAt.getTime() <= issuedAt.getTime() ||
    expiresAt.getTime() - issuedAt.getTime() > PRODUCTION_ACTION_MAX_TTL_MS
  ) {
    throw new Error("authorization_ttl_invalid");
  }

  if (payload.action === PRODUCTION_ACTIONS.RELAUNCH_DEFAULT_ON) {
    if (payload.ownerLaunchDecision !== "GO") {
      throw new Error("authorization_owner_launch_go_required");
    }
  } else if (payload.ownerLaunchDecision !== null) {
    throw new Error("authorization_launch_decision_out_of_scope");
  }

  for (const field of [
    "action",
    "provider",
    "candidateSha",
    "configurationSha256",
    "executorFingerprint",
    "targetFingerprint",
  ]) {
    if (payload[field] !== expected[field]) {
      throw new Error(`authorization_${field}_mismatch`);
    }
  }

  if (
    artifact.signature.algorithm !== "ed25519" ||
    !/^[A-Za-z0-9._-]{1,80}$/.test(artifact.signature.keyId) ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(artifact.signature.value)
  ) {
    throw new Error("authorization_signature_invalid");
  }
  const keyEntry = keyRegistry.keys.find(
    ({ keyId }) => keyId === artifact.signature.keyId
  );
  if (!keyEntry || keyEntry.status !== "active") {
    throw new Error("authorization_signing_key_untrusted");
  }
  const keyNotBefore = parseTimestamp(
    keyEntry.notBefore,
    "authorization_key_window_invalid"
  );
  const keyNotAfter = parseTimestamp(
    keyEntry.notAfter,
    "authorization_key_window_invalid"
  );
  if (
    issuedAt.getTime() < keyNotBefore.getTime() ||
    issuedAt.getTime() >= keyNotAfter.getTime() ||
    nowMs < keyNotBefore.getTime() ||
    nowMs >= keyNotAfter.getTime() ||
    expiresAt.getTime() > keyNotAfter.getTime()
  ) {
    throw new Error("authorization_signing_key_outside_window");
  }

  let publicKey;
  try {
    publicKey = createPublicKey(keyEntry.publicKeyPem);
  } catch {
    throw new Error("authorization_signing_key_invalid");
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error("authorization_signing_key_invalid");
  }
  const signature = Buffer.from(artifact.signature.value, "base64");
  if (
    signature.length !== 64 ||
    !verifySignature(
      null,
      productionActionSignatureMessage(payload),
      publicKey,
      signature
    )
  ) {
    throw new Error("authorization_signature_mismatch");
  }

  return {
    authorizationId: payload.authorizationId,
    action: payload.action,
    candidateSha: payload.candidateSha,
    configurationSha256: payload.configurationSha256,
    targetFingerprint: payload.targetFingerprint,
    expiresAt: payload.expiresAt,
  };
}

export async function consumeProductionActionAuthorization({
  authorizationPath,
  expected,
  repoRoot = process.cwd(),
  keyRegistryPath = join(
    repoRoot,
    "config",
    "production-action-owner-keys.json"
  ),
  ledgerPath = join(
    homedir(),
    ".config",
    "meelni",
    "production-actions",
    "consumed-v1.json"
  ),
  executorIdentityPath = join(
    homedir(),
    ".config",
    "meelni",
    "production-actions",
    "executor-id"
  ),
  resolveCandidate = resolveCleanGitCandidate,
  now = new Date(),
}) {
  const canonicalRepoRoot = await realpath(repoRoot);
  const canonicalAuthorizationPath = await assertPrivateExternalFile(
    authorizationPath,
    canonicalRepoRoot,
    "authorization_file"
  );
  const canonicalExecutorIdentityPath = await assertPrivateExternalFile(
    executorIdentityPath,
    canonicalRepoRoot,
    "executor_identity_file"
  );
  const [artifactText, registryText, executorIdentityText] = await Promise.all([
    readFile(canonicalAuthorizationPath, "utf8"),
    readFile(keyRegistryPath, "utf8"),
    readFile(canonicalExecutorIdentityPath, "utf8"),
  ]);
  const artifact = parseJson(artifactText, "authorization_artifact_invalid");
  const keyRegistry = parseJson(
    registryText,
    "authorization_key_registry_invalid"
  );
  const candidateSha = await resolveCandidate(canonicalRepoRoot);
  const executorIdentity = executorIdentityText.trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(executorIdentity)) {
    throw new Error("executor_identity_invalid");
  }
  const verified = verifyProductionActionAuthorization({
    artifact,
    keyRegistry,
    expected: {
      ...expected,
      candidateSha,
      executorFingerprint: sha256(`executor:${executorIdentity}`),
    },
    now,
  });
  const artifactSha256 = sha256(artifactText);
  await consumeOnce({
    ledgerPath,
    entry: {
      authorizationId: verified.authorizationId,
      action: verified.action,
      artifactSha256,
      candidateSha: verified.candidateSha,
      configurationSha256: verified.configurationSha256,
      consumedAt: now.toISOString(),
      targetFingerprint: verified.targetFingerprint,
    },
  });
  return { ...verified, artifactSha256 };
}

export function resolveCleanGitCandidate(repoRoot = process.cwd()) {
  const gitEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))
  );
  gitEnvironment.LC_ALL = "C";
  const value = execFileSync(
    "/usr/bin/git",
    ["rev-parse", "--verify", "HEAD"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: gitEnvironment,
      stdio: ["ignore", "pipe", "ignore"],
    }
  ).trim();
  if (!/^[a-f0-9]{40}$/.test(value)) {
    throw new Error("authorization_candidate_unavailable");
  }
  const worktree = execFileSync(
    "/usr/bin/git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: gitEnvironment,
      stdio: ["ignore", "pipe", "ignore"],
    }
  );
  if (worktree.trim() !== "") {
    throw new Error("authorization_candidate_worktree_dirty");
  }
  return value;
}

async function consumeOnce({ ledgerPath, entry }) {
  if (!isAbsolute(ledgerPath)) {
    throw new Error("authorization_ledger_path_invalid");
  }
  const parent = dirname(resolve(ledgerPath));
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await chmod(parent, 0o700);
  const lockPath = `${ledgerPath}.lock`;
  try {
    await mkdir(lockPath, { mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error("authorization_consumption_busy");
    }
    throw error;
  }

  try {
    const ledger = await readLedger(ledgerPath);
    if (
      ledger.consumed.some(
        (candidate) =>
          candidate.authorizationId === entry.authorizationId ||
          candidate.artifactSha256 === entry.artifactSha256
      )
    ) {
      throw new Error("authorization_replay_rejected");
    }
    const next = {
      contract: PRODUCTION_ACTION_LEDGER_CONTRACT,
      consumed: [...ledger.consumed, entry],
    };
    const temporaryPath = `${ledgerPath}.${process.pid}.${Date.now()}.tmp`;
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(next, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, ledgerPath);
    await chmod(ledgerPath, 0o600);
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

async function readLedger(ledgerPath) {
  try {
    const stats = await lstat(ledgerPath);
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      (stats.mode & 0o077) !== 0
    ) {
      throw new Error("authorization_ledger_insecure");
    }
    const value = parseJson(
      await readFile(ledgerPath, "utf8"),
      "authorization_ledger_invalid"
    );
    assertPlainObject(value, "authorization_ledger_invalid");
    assertExactKeys(
      value,
      ["consumed", "contract"],
      "authorization_ledger_invalid"
    );
    if (
      value.contract !== PRODUCTION_ACTION_LEDGER_CONTRACT ||
      !Array.isArray(value.consumed)
    ) {
      throw new Error("authorization_ledger_invalid");
    }
    return value;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { contract: PRODUCTION_ACTION_LEDGER_CONTRACT, consumed: [] };
    }
    throw error;
  }
}

export async function assertPrivateExternalFile(path, repoRoot, label) {
  if (!path || !isAbsolute(path)) throw new Error(`${label}_path_invalid`);
  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink() || (stats.mode & 0o077) !== 0) {
    throw new Error(`${label}_insecure`);
  }
  const canonicalPath = await realpath(path);
  const fromRepo = relative(repoRoot, canonicalPath);
  if (
    fromRepo === "" ||
    (!fromRepo.startsWith("..") && !isAbsolute(fromRepo))
  ) {
    throw new Error(`${label}_must_be_external`);
  }
  return canonicalPath;
}

function assertRegistry(registry) {
  assertPlainObject(registry, "authorization_key_registry_invalid");
  assertExactKeys(
    registry,
    REGISTRY_KEYS,
    "authorization_key_registry_invalid"
  );
  if (
    registry.contract !== PRODUCTION_ACTION_KEY_REGISTRY_CONTRACT ||
    registry.ownerId !== PRODUCTION_ACTION_OWNER_ID ||
    !Array.isArray(registry.keys)
  ) {
    throw new Error("authorization_key_registry_invalid");
  }
  const keyIds = new Set();
  for (const entry of registry.keys) {
    assertPlainObject(entry, "authorization_key_registry_invalid");
    assertExactKeys(
      entry,
      REGISTRY_ENTRY_KEYS,
      "authorization_key_registry_invalid"
    );
    if (
      entry.algorithm !== "ed25519" ||
      !["active", "revoked"].includes(entry.status) ||
      keyIds.has(entry.keyId)
    ) {
      throw new Error("authorization_key_registry_invalid");
    }
    keyIds.add(entry.keyId);
  }
}

function parseTimestamp(value, code) {
  if (typeof value !== "string") throw new Error(code);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(code);
  }
  return parsed;
}

function parseJson(value, code) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(code);
  }
}

function assertPlainObject(value, code) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(code);
  }
}

function assertExactKeys(value, expected, code) {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (
    actual.length !== required.length ||
    actual.some((key, index) => key !== required[index])
  ) {
    throw new Error(code);
  }
}

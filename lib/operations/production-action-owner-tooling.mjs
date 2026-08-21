import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import {
  assertPrivateExternalFile,
  assertOutsideProductionActionGitCustody,
  consumeProductionActionAuthorization,
  getProductionActionProvider,
  productionActionSignatureMessage,
  PRODUCTION_ACTION_AUTHORIZATION_CONTRACT,
  PRODUCTION_ACTION_KEY_REGISTRY_CONTRACT,
  PRODUCTION_ACTION_MAX_TTL_MS,
  PRODUCTION_ACTION_MUTATION_SCOPES,
  PRODUCTION_ACTION_OWNER_ID,
  PRODUCTION_ACTIONS,
  resolveProductionActionGitCustodyRoots,
  resolveCleanGitCandidate,
  sha256,
  verifyProductionActionAuthorization,
} from "./production-action-authorization.mjs";

export const PRODUCTION_ACTION_OWNER_TOOLING_CONTRACT =
  "meelni.production-action-owner-tooling.v1";
export const PRODUCTION_ACTION_SYNTHETIC_PROOF_CONTRACT =
  "meelni.production-action-synthetic-proof.v1";
export const DEFAULT_OWNER_PRIVATE_KEY_PATH = join(
  homedir(),
  ".config",
  "meelni",
  "production-actions",
  "owner-ed25519-private.pem"
);
export const DEFAULT_EXECUTOR_IDENTITY_PATH = join(
  homedir(),
  ".config",
  "meelni",
  "production-actions",
  "executor-id"
);

const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;
const SHA_256_PATTERN = /^[a-f0-9]{64}$/;
const CANDIDATE_PATTERN = /^[a-f0-9]{40}$/;
const EXECUTOR_PATTERN = /^[A-Za-z0-9_-]{43}$/;
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

export async function enrollProductionActionOwner({
  keyId,
  notBefore,
  notAfter,
  privateKeyPath = DEFAULT_OWNER_PRIVATE_KEY_PATH,
  executorIdentityPath = DEFAULT_EXECUTOR_IDENTITY_PATH,
  repoRoot = process.cwd(),
} = {}) {
  assertKeyWindow({ keyId, notBefore, notAfter });
  const [privateTarget, executorTarget] = await Promise.all([
    preparePrivateExternalTarget(privateKeyPath, repoRoot, "owner_private_key"),
    preparePrivateExternalTarget(
      executorIdentityPath,
      repoRoot,
      "executor_identity_file"
    ),
  ]);
  if (privateTarget === executorTarget) {
    throw new Error("owner_enrollment_paths_must_differ");
  }

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const executorIdentity = randomBytes(32).toString("base64url");
  if (!EXECUTOR_PATTERN.test(executorIdentity)) {
    throw new Error("executor_identity_generation_failed");
  }

  const created = [];
  try {
    await writePrivateFileCreateOnly(privateTarget, `${privateKeyPem}`);
    created.push(privateTarget);
    await writePrivateFileCreateOnly(executorTarget, `${executorIdentity}\n`);
    created.push(executorTarget);
  } catch (error) {
    await Promise.all(
      created.map((path) => rm(path, { force: true }).catch(() => undefined))
    );
    throw error;
  }

  return {
    contract: PRODUCTION_ACTION_OWNER_TOOLING_CONTRACT,
    publicRegistryEntry: publicRegistryEntry({
      keyId,
      notAfter,
      notBefore,
      publicKey,
    }),
  };
}

export async function createProductionActionOwnerSigningKey({
  keyId,
  notBefore,
  notAfter,
  privateKeyPath,
  repoRoot = process.cwd(),
} = {}) {
  assertKeyWindow({ keyId, notBefore, notAfter });
  const privateTarget = await preparePrivateExternalTarget(
    privateKeyPath,
    repoRoot,
    "owner_private_key"
  );
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  await writePrivateFileCreateOnly(
    privateTarget,
    `${privateKey.export({ type: "pkcs8", format: "pem" })}`
  );
  return {
    contract: PRODUCTION_ACTION_OWNER_TOOLING_CONTRACT,
    publicRegistryEntry: publicRegistryEntry({
      keyId,
      notAfter,
      notBefore,
      publicKey,
    }),
  };
}

export async function inspectProductionActionOwnerPublicEntry({
  keyId,
  notBefore,
  notAfter,
  privateKeyPath = DEFAULT_OWNER_PRIVATE_KEY_PATH,
  repoRoot = process.cwd(),
} = {}) {
  assertKeyWindow({ keyId, notBefore, notAfter });
  const canonicalRepoRoot = await realpath(repoRoot);
  const canonicalPrivateKeyPath = await assertPrivateExternalFile(
    privateKeyPath,
    canonicalRepoRoot,
    "owner_private_key"
  );
  const privateKey = parseOwnerPrivateKey(
    await readFile(canonicalPrivateKeyPath, "utf8")
  );
  return {
    contract: PRODUCTION_ACTION_OWNER_TOOLING_CONTRACT,
    publicRegistryEntry: publicRegistryEntry({
      keyId,
      notAfter,
      notBefore,
      publicKey: createPublicKey(privateKey),
    }),
  };
}

export async function prepareUnsignedProductionAction({
  action,
  configurationSha256,
  targetFingerprint,
  outputPath,
  executorIdentityPath = DEFAULT_EXECUTOR_IDENTITY_PATH,
  repoRoot = process.cwd(),
  now = new Date(),
  ttlMs = 15 * 60 * 1_000,
  authorizationId = `ora_${randomBytes(16).toString("hex")}`,
  resolveCandidate = resolveCleanGitCandidate,
} = {}) {
  if (action === PRODUCTION_ACTIONS.RELAUNCH_DEFAULT_ON) {
    throw new Error("owner_tooling_relaunch_default_on_unsupported");
  }
  const provider = getProductionActionProvider(action);
  assertSha256(configurationSha256, "authorization_configuration_invalid");
  assertSha256(targetFingerprint, "authorization_target_invalid");
  if (
    !Number.isSafeInteger(ttlMs) ||
    ttlMs <= 0 ||
    ttlMs > PRODUCTION_ACTION_MAX_TTL_MS
  ) {
    throw new Error("authorization_ttl_invalid");
  }
  const issuedAt = assertDate(now, "authorization_clock_invalid");
  const candidateSha = await resolveCandidate(await realpath(repoRoot));
  if (!CANDIDATE_PATTERN.test(candidateSha)) {
    throw new Error("authorization_candidate_unavailable");
  }
  if (!/^ora_[a-f0-9]{32}$/.test(authorizationId)) {
    throw new Error("authorization_id_invalid");
  }
  const executorFingerprint = await readExecutorFingerprint({
    executorIdentityPath,
    repoRoot,
  });
  const payload = {
    action,
    authorizationId,
    candidateSha,
    configurationSha256,
    environment: "production",
    executorFingerprint,
    expiresAt: new Date(issuedAt.getTime() + ttlMs).toISOString(),
    issuedAt: issuedAt.toISOString(),
    maxUses: 1,
    mutationScope: PRODUCTION_ACTION_MUTATION_SCOPES[action],
    ownerId: PRODUCTION_ACTION_OWNER_ID,
    ownerLaunchDecision: null,
    provider,
    targetFingerprint,
  };
  assertExactKeys(payload, PAYLOAD_KEYS, "authorization_payload_invalid");
  const target = await preparePrivateExternalTarget(
    outputPath,
    repoRoot,
    "unsigned_payload_file"
  );
  await writePrivateFileCreateOnly(
    target,
    `${JSON.stringify(payload, null, 2)}\n`
  );
  return { contract: PRODUCTION_ACTION_OWNER_TOOLING_CONTRACT, payload };
}

export async function signProductionActionPayload({
  payloadPath,
  privateKeyPath = DEFAULT_OWNER_PRIVATE_KEY_PATH,
  artifactPath,
  keyId,
  keyRegistryPath = join(
    process.cwd(),
    "config",
    "production-action-owner-keys.json"
  ),
  repoRoot = process.cwd(),
  now = new Date(),
} = {}) {
  if (!KEY_ID_PATTERN.test(keyId ?? "")) {
    throw new Error("authorization_key_id_invalid");
  }
  const [canonicalPayloadPath, canonicalPrivateKeyPath] = await Promise.all([
    assertPrivateExternalFile(
      payloadPath,
      await realpath(repoRoot),
      "unsigned_payload_file"
    ),
    assertPrivateExternalFile(
      privateKeyPath,
      await realpath(repoRoot),
      "owner_private_key"
    ),
  ]);
  const [payloadText, privateKeyText, registryText] = await Promise.all([
    readFile(canonicalPayloadPath, "utf8"),
    readFile(canonicalPrivateKeyPath, "utf8"),
    readFile(keyRegistryPath, "utf8"),
  ]);
  const payload = parseJson(payloadText, "authorization_payload_invalid");
  assertPlainObject(payload, "authorization_payload_invalid");
  assertExactKeys(payload, PAYLOAD_KEYS, "authorization_payload_invalid");
  if (payload.action === PRODUCTION_ACTIONS.RELAUNCH_DEFAULT_ON) {
    throw new Error("owner_tooling_relaunch_default_on_unsupported");
  }
  const privateKey = parseOwnerPrivateKey(privateKeyText);
  const artifact = {
    contract: PRODUCTION_ACTION_AUTHORIZATION_CONTRACT,
    payload,
    signature: {
      algorithm: "ed25519",
      keyId,
      value: sign(
        null,
        productionActionSignatureMessage(payload),
        privateKey
      ).toString("base64"),
    },
  };
  const keyRegistry = parseJson(
    registryText,
    "authorization_key_registry_invalid"
  );
  verifyProductionActionAuthorization({
    artifact,
    keyRegistry,
    expected: expectedFromPayload(payload),
    now,
  });
  const target = await preparePrivateExternalTarget(
    artifactPath,
    repoRoot,
    "authorization_file"
  );
  await writePrivateFileCreateOnly(
    target,
    `${JSON.stringify(artifact, null, 2)}\n`
  );
  return { contract: PRODUCTION_ACTION_OWNER_TOOLING_CONTRACT, artifact };
}

export async function verifyExternalProductionAction({
  artifactPath,
  action,
  configurationSha256,
  targetFingerprint,
  executorIdentityPath = DEFAULT_EXECUTOR_IDENTITY_PATH,
  keyRegistryPath = join(
    process.cwd(),
    "config",
    "production-action-owner-keys.json"
  ),
  repoRoot = process.cwd(),
  now = new Date(),
  resolveCandidate = resolveCleanGitCandidate,
} = {}) {
  const canonicalRepoRoot = await realpath(repoRoot);
  const canonicalArtifactPath = await assertPrivateExternalFile(
    artifactPath,
    canonicalRepoRoot,
    "authorization_file"
  );
  const [artifactText, registryText, executorFingerprint, candidateSha] =
    await Promise.all([
      readFile(canonicalArtifactPath, "utf8"),
      readFile(keyRegistryPath, "utf8"),
      readExecutorFingerprint({ executorIdentityPath, repoRoot }),
      resolveCandidate(canonicalRepoRoot),
    ]);
  return verifyProductionActionAuthorization({
    artifact: parseJson(artifactText, "authorization_artifact_invalid"),
    keyRegistry: parseJson(registryText, "authorization_key_registry_invalid"),
    expected: {
      action,
      provider: getProductionActionProvider(action),
      candidateSha,
      configurationSha256,
      executorFingerprint,
      targetFingerprint,
    },
    now,
  });
}

export async function runSyntheticProductionActionDryRun({
  repoRoot = process.cwd(),
} = {}) {
  const directory = await mkdtemp(
    join(tmpdir(), "meelni-production-action-synthetic-")
  );
  await chmod(directory, 0o700);
  const privateKeyPath = join(directory, "owner-private.pem");
  const executorIdentityPath = join(directory, "executor-id");
  const payloadPath = join(directory, "unsigned.json");
  const artifactPath = join(directory, "authorization.json");
  const keyRegistryPath = join(directory, "keys.json");
  const ledgerPath = join(directory, "ledger", "consumed.json");
  const candidateSha = "a".repeat(40);
  const configurationSha256 = sha256("synthetic-configuration");
  const targetFingerprint = sha256("synthetic-non-production-target");
  const keyId = "synthetic-owner-key";
  const now = new Date("2030-01-01T00:00:00.000Z");

  try {
    const enrollment = await enrollProductionActionOwner({
      keyId,
      notBefore: "2029-01-01T00:00:00.000Z",
      notAfter: "2031-01-01T00:00:00.000Z",
      privateKeyPath,
      executorIdentityPath,
      repoRoot,
    });
    await writeFile(
      keyRegistryPath,
      `${JSON.stringify(
        {
          contract: PRODUCTION_ACTION_KEY_REGISTRY_CONTRACT,
          ownerId: PRODUCTION_ACTION_OWNER_ID,
          keys: [enrollment.publicRegistryEntry],
        },
        null,
        2
      )}\n`,
      { mode: 0o600 }
    );
    await chmod(keyRegistryPath, 0o600);
    await prepareUnsignedProductionAction({
      action: PRODUCTION_ACTIONS.PRODUCTION_DATABASE_MIGRATE,
      authorizationId: "ora_0123456789abcdef0123456789abcdef",
      configurationSha256,
      targetFingerprint,
      outputPath: payloadPath,
      executorIdentityPath,
      repoRoot,
      now,
      resolveCandidate: () => candidateSha,
    });
    const { artifact } = await signProductionActionPayload({
      payloadPath,
      privateKeyPath,
      artifactPath,
      keyId,
      keyRegistryPath,
      repoRoot,
      now,
    });
    const keyRegistry = parseJson(
      await readFile(keyRegistryPath, "utf8"),
      "authorization_key_registry_invalid"
    );
    const expected = expectedFromPayload(artifact.payload);
    verifyProductionActionAuthorization({
      artifact,
      keyRegistry,
      expected,
      now,
    });

    expectRejection(
      () =>
        verifyProductionActionAuthorization({
          artifact,
          keyRegistry,
          expected: { ...expected, candidateSha: "b".repeat(40) },
          now,
        }),
      "authorization_candidateSha_mismatch"
    );
    const mutated = structuredClone(artifact);
    mutated.payload.authorizationId = "ora_fedcba9876543210fedcba9876543210";
    expectRejection(
      () =>
        verifyProductionActionAuthorization({
          artifact: mutated,
          keyRegistry,
          expected,
          now,
        }),
      "authorization_signature_mismatch"
    );
    expectRejection(
      () =>
        verifyProductionActionAuthorization({
          artifact,
          keyRegistry,
          expected,
          now: new Date(artifact.payload.expiresAt),
        }),
      "authorization_expired"
    );
    const consumptionInput = {
      authorizationPath: artifactPath,
      expected: {
        action: expected.action,
        provider: expected.provider,
        configurationSha256,
        targetFingerprint,
      },
      repoRoot,
      keyRegistryPath,
      ledgerPath,
      executorIdentityPath,
      resolveCandidate: () => candidateSha,
      now,
    };
    await consumeProductionActionAuthorization(consumptionInput);
    await expectAsyncRejection(
      () => consumeProductionActionAuthorization(consumptionInput),
      "authorization_replay_rejected"
    );

    return {
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
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function readExecutorFingerprint({ executorIdentityPath, repoRoot }) {
  const canonicalPath = await assertPrivateExternalFile(
    executorIdentityPath,
    await realpath(repoRoot),
    "executor_identity_file"
  );
  const executorIdentity = (await readFile(canonicalPath, "utf8")).trim();
  if (!EXECUTOR_PATTERN.test(executorIdentity)) {
    throw new Error("executor_identity_invalid");
  }
  return sha256(`executor:${executorIdentity}`);
}

export async function preparePrivateExternalTarget(path, repoRoot, label) {
  if (!path || !isAbsolute(path)) throw new Error(`${label}_path_invalid`);
  const canonicalRepoRoot = await realpath(repoRoot);
  const gitCustodyRoots =
    await resolveProductionActionGitCustodyRoots(canonicalRepoRoot);
  const requested = resolve(path);
  assertOutsideProductionActionGitCustody(requested, gitCustodyRoots, label);
  const parent = dirname(requested);
  const prospectiveTarget = await resolveProspectiveTarget(requested, label);
  assertOutsideProductionActionGitCustody(
    prospectiveTarget,
    gitCustodyRoots,
    label
  );
  let firstCreatedDirectory;
  try {
    firstCreatedDirectory = await mkdir(parent, {
      recursive: true,
      mode: 0o700,
    });
    const parentStats = await lstat(parent);
    if (
      !parentStats.isDirectory() ||
      parentStats.isSymbolicLink() ||
      (parentStats.mode & 0o077) !== 0
    ) {
      throw new Error(`${label}_directory_insecure`);
    }
    const canonicalParent = await realpath(parent);
    const canonicalTarget = join(canonicalParent, basename(requested));
    const refreshedGitCustodyRoots =
      await resolveProductionActionGitCustodyRoots(canonicalRepoRoot);
    assertOutsideProductionActionGitCustody(
      canonicalTarget,
      refreshedGitCustodyRoots,
      label
    );
    try {
      await lstat(canonicalTarget);
      throw new Error(`${label}_already_exists`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return canonicalTarget;
  } catch (error) {
    if (firstCreatedDirectory) {
      await removeCreatedDirectoryChain(parent, firstCreatedDirectory);
    }
    throw error;
  }
}

async function resolveProspectiveTarget(requested, label) {
  const missingSegments = [];
  let cursor = dirname(requested);
  while (true) {
    try {
      const stats = await lstat(cursor);
      if (!stats.isDirectory() && !stats.isSymbolicLink()) {
        throw new Error(`${label}_directory_insecure`);
      }
      const canonicalExistingParent = await realpath(cursor);
      return join(
        canonicalExistingParent,
        ...missingSegments.reverse(),
        basename(requested)
      );
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const next = dirname(cursor);
      if (next === cursor) throw new Error(`${label}_path_invalid`);
      missingSegments.push(basename(cursor));
      cursor = next;
    }
  }
}

async function removeCreatedDirectoryChain(parent, firstCreatedDirectory) {
  const first = resolve(firstCreatedDirectory);
  let cursor = resolve(parent);
  while (true) {
    try {
      await rmdir(cursor);
    } catch {
      return;
    }
    if (cursor === first) return;
    const next = dirname(cursor);
    if (next === cursor) return;
    cursor = next;
  }
}

export async function writePrivateFileCreateOnly(
  path,
  value,
  { openFile = open } = {}
) {
  let created = false;
  let handle;
  try {
    handle = await openFile(path, "wx", 0o600);
    created = true;
    await handle.writeFile(value, "utf8");
    await handle.chmod(0o600);
    await handle.sync();
    await handle.close();
    handle = undefined;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if (created) await rm(path, { force: true }).catch(() => undefined);
    throw error;
  }
}

function parseOwnerPrivateKey(value) {
  let privateKey;
  try {
    privateKey = createPrivateKey(value);
  } catch {
    throw new Error("owner_private_key_invalid");
  }
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("owner_private_key_invalid");
  }
  return privateKey;
}

function publicRegistryEntry({ keyId, notAfter, notBefore, publicKey }) {
  return {
    algorithm: "ed25519",
    keyId,
    notAfter,
    notBefore,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    status: "active",
  };
}

function expectedFromPayload(payload) {
  return {
    action: payload.action,
    provider: payload.provider,
    candidateSha: payload.candidateSha,
    configurationSha256: payload.configurationSha256,
    executorFingerprint: payload.executorFingerprint,
    targetFingerprint: payload.targetFingerprint,
  };
}

function assertKeyWindow({ keyId, notBefore, notAfter }) {
  if (!KEY_ID_PATTERN.test(keyId ?? "")) {
    throw new Error("authorization_key_id_invalid");
  }
  const start = parseTimestamp(notBefore, "authorization_key_window_invalid");
  const end = parseTimestamp(notAfter, "authorization_key_window_invalid");
  if (end.getTime() <= start.getTime()) {
    throw new Error("authorization_key_window_invalid");
  }
}

function assertSha256(value, code) {
  if (!SHA_256_PATTERN.test(value ?? "")) throw new Error(code);
}

function assertDate(value, code) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(code);
  }
  return value;
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

function expectRejection(callback, expectedCode) {
  try {
    callback();
  } catch (error) {
    if (error instanceof Error && error.message === expectedCode) return;
    throw new Error("synthetic_rejection_code_unexpected");
  }
  throw new Error("synthetic_rejection_missing");
}

async function expectAsyncRejection(callback, expectedCode) {
  try {
    await callback();
  } catch (error) {
    if (error instanceof Error && error.message === expectedCode) return;
    throw new Error("synthetic_rejection_code_unexpected");
  }
  throw new Error("synthetic_rejection_missing");
}

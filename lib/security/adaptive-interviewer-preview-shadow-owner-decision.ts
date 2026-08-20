import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

import {
  adaptiveInterviewerPreviewShadowAuthorizationId,
  parseAdaptiveInterviewerPreviewShadowAuthorization,
  type AdaptiveInterviewerPreviewShadowAuthorization,
  type PreviewShadowAuthorizationBindings,
} from "@meelni/agent";

export const PREVIEW_SHADOW_OWNER_DECISION_CONTRACT =
  "meelni.adaptive-interviewer-preview-shadow-owner-decision.v1" as const;
export const PREVIEW_SHADOW_OWNER_KEY_REGISTRY_CONTRACT =
  "meelni.adaptive-interviewer-preview-shadow-owner-key-registry.v1" as const;
export const PREVIEW_SHADOW_OWNER_DECISION_DIGEST_CONTRACT =
  "meelni.adaptive-interviewer-preview-shadow-owner-decision-digest.v1" as const;
export const PREVIEW_SHADOW_OWNER_ID = "saviii" as const;
export const PREVIEW_SHADOW_OWNER_ROLE = "human_product_owner" as const;
export const PREVIEW_SHADOW_OWNER_APPROVAL =
  "APPROVE_BOUNDED_PREVIEW_SHADOW" as const;
export const PREVIEW_SHADOW_OWNER_DECISION_MAX_BYTES = 64 * 1024;
export const PREVIEW_SHADOW_OWNER_DECISION_MAX_DEPTH = 32;

const ARTIFACT_KEYS = ["contract", "payload", "signature"] as const;
const PAYLOAD_KEYS = [
  "authorization_expires_at",
  "authorization_id",
  "authorization_nonce",
  "candidate_git_sha",
  "default_on_authorized",
  "exposure",
  "later_stage_authorized",
  "launch_go_no_go_authorized",
  "owner_decided_at",
  "owner_decision",
  "owner_decision_reference",
  "owner_direction_reference",
  "owner_id",
  "owner_role",
  "preview_influence_authorized",
  "preview_shadow_configuration_sha256",
  "production_authorized",
  "selected_candidate_configuration_sha256",
  "signing_key_id",
  "target_cohort",
  "target_environment",
  "target_stage",
] as const;
const SIGNATURE_KEYS = ["algorithm", "keyId", "value"] as const;
const REGISTRY_KEYS = ["contract", "keys", "ownerId"] as const;
const REGISTRY_ENTRY_KEYS = [
  "algorithm",
  "keyId",
  "notAfter",
  "notBefore",
  "publicKeyPem",
  "status",
] as const;
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;
const KEY_ID = /^[A-Za-z0-9._-]{1,80}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const DECISION_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,199}$/;

export interface PreviewShadowOwnerDecisionPayload {
  authorization_expires_at: string;
  authorization_id: string;
  authorization_nonce: string;
  candidate_git_sha: string;
  default_on_authorized: false;
  exposure: "none";
  later_stage_authorized: false;
  launch_go_no_go_authorized: false;
  owner_decided_at: string;
  owner_decision: typeof PREVIEW_SHADOW_OWNER_APPROVAL;
  owner_decision_reference: string;
  owner_direction_reference: string;
  owner_id: typeof PREVIEW_SHADOW_OWNER_ID;
  owner_role: typeof PREVIEW_SHADOW_OWNER_ROLE;
  preview_influence_authorized: false;
  preview_shadow_configuration_sha256: string;
  production_authorized: false;
  selected_candidate_configuration_sha256: string;
  signing_key_id: string;
  target_cohort: "shadow";
  target_environment: "preview_staging";
  target_stage: "preview_shadow";
}

export interface PreviewShadowOwnerDecisionArtifact {
  contract: typeof PREVIEW_SHADOW_OWNER_DECISION_CONTRACT;
  payload: PreviewShadowOwnerDecisionPayload;
  signature: {
    algorithm: "ed25519";
    keyId: string;
    value: string;
  };
}

export interface PreviewShadowOwnerKeyRegistry {
  contract: typeof PREVIEW_SHADOW_OWNER_KEY_REGISTRY_CONTRACT;
  ownerId: typeof PREVIEW_SHADOW_OWNER_ID;
  keys: Array<{
    algorithm: "ed25519";
    keyId: string;
    notAfter: string;
    notBefore: string;
    publicKeyPem: string;
    status: "active" | "revoked";
  }>;
}

export interface PreviewShadowActivationContext
  extends PreviewShadowAuthorizationBindings {
  targetStage: "preview_shadow";
  targetEnvironment: "preview_staging";
  targetCohort: "shadow";
  exposure: "none";
}

declare const VERIFIED_OWNER_DECISION: unique symbol;

export interface VerifiedPreviewShadowOwnerDecision {
  readonly [VERIFIED_OWNER_DECISION]: true;
  readonly authorization: AdaptiveInterviewerPreviewShadowAuthorization;
  readonly authorizationId: string;
  readonly artifactSha256: string;
  readonly ownerDecisionReference: string;
  readonly ownerDecidedAt: string;
  readonly authorizationExpiresAt: string;
  readonly ownerSigningKeyId: string;
  readonly candidateGitSha: string;
  readonly previewShadowConfigurationSha256: string;
  readonly selectedCandidateConfigurationSha256: string;
  readonly targetStage: "preview_shadow";
  readonly targetEnvironment: "preview_staging";
  readonly targetCohort: "shadow";
  readonly exposure: "none";
}

const verifiedDecisions = new WeakSet<VerifiedPreviewShadowOwnerDecision>();

export function parsePreviewShadowOwnerDecisionArtifactJson(
  contents: string
): PreviewShadowOwnerDecisionArtifact {
  if (
    typeof contents !== "string" ||
    Buffer.byteLength(contents, "utf8") >
      PREVIEW_SHADOW_OWNER_DECISION_MAX_BYTES
  ) {
    invalidArtifact();
  }
  try {
    return parseArtifact(parseJsonRejectingDuplicateKeys(contents));
  } catch {
    invalidArtifact();
  }
}

export function previewShadowOwnerDecisionSignatureMessage(
  payload: PreviewShadowOwnerDecisionPayload
): Buffer {
  const canonical = canonicalPayload(
    exactRecord(payload, PAYLOAD_KEYS, invalidArtifact)
  );
  return Buffer.from(
    `${PREVIEW_SHADOW_OWNER_DECISION_CONTRACT}\0${canonicalPayloadJson(canonical)}`,
    "utf8"
  );
}

export function verifyPreviewShadowOwnerDecision(input: {
  artifact: unknown;
  authorization: unknown;
  context: PreviewShadowActivationContext;
  keyRegistry: unknown;
  now: Date;
}): VerifiedPreviewShadowOwnerDecision {
  const request = exactRecord(input, [
    "artifact",
    "authorization",
    "context",
    "keyRegistry",
    "now",
  ]);
  const now = snapshotWholeSecondDate(request.now, invalidClock);
  const context = parseActivationContext(request.context);
  let authorization: AdaptiveInterviewerPreviewShadowAuthorization;
  try {
    authorization = parseAdaptiveInterviewerPreviewShadowAuthorization(
      snapshotDataRecord(request.authorization, invalidAuthorization),
      {
        candidateGitSha: context.candidateGitSha,
        previewShadowConfigurationSha256:
          context.previewShadowConfigurationSha256,
        selectedCandidateConfigurationSha256:
          context.selectedCandidateConfigurationSha256,
      },
      now
    );
  } catch {
    invalidAuthorization();
  }
  const artifact = parseArtifact(request.artifact);
  const registry = parseRegistry(request.keyRegistry);
  const payload = artifact.payload;
  const authorizationId =
    adaptiveInterviewerPreviewShadowAuthorizationId(authorization);

  if (
    payload.authorization_id !== authorizationId ||
    payload.authorization_nonce !== authorization.authorization_nonce ||
    payload.candidate_git_sha !== context.candidateGitSha ||
    payload.preview_shadow_configuration_sha256 !==
      context.previewShadowConfigurationSha256 ||
    payload.selected_candidate_configuration_sha256 !==
      context.selectedCandidateConfigurationSha256 ||
    payload.target_stage !== context.targetStage ||
    payload.target_environment !== context.targetEnvironment ||
    payload.target_cohort !== context.targetCohort ||
    payload.exposure !== context.exposure ||
    payload.owner_direction_reference !==
      authorization.owner_direction_reference ||
    payload.owner_decision_reference !==
      authorization.owner_decision_reference ||
    payload.owner_decided_at !== authorization.owner_decided_at ||
    payload.authorization_expires_at !==
      authorization.authorization_expires_at ||
    payload.owner_id !== PREVIEW_SHADOW_OWNER_ID ||
    payload.owner_role !== PREVIEW_SHADOW_OWNER_ROLE ||
    payload.owner_decision !== PREVIEW_SHADOW_OWNER_APPROVAL ||
    payload.preview_influence_authorized !== false ||
    payload.later_stage_authorized !== false ||
    payload.production_authorized !== false ||
    payload.default_on_authorized !== false ||
    payload.launch_go_no_go_authorized !== false
  ) {
    invalidBinding();
  }

  const decidedAt = parseWholeSecond(payload.owner_decided_at, invalidArtifact);
  const expiresAt = parseWholeSecond(
    payload.authorization_expires_at,
    invalidArtifact
  );
  if (
    decidedAt.getTime() > now.getTime() ||
    expiresAt.getTime() <= now.getTime()
  ) {
    invalidTime();
  }
  if (
    !KEY_ID.test(payload.signing_key_id) ||
    payload.signing_key_id !== artifact.signature.keyId ||
    artifact.signature.algorithm !== "ed25519" ||
    !BASE64.test(artifact.signature.value)
  ) {
    invalidSignature();
  }

  const key = registry.keys.find(
    (entry) => entry.keyId === artifact.signature.keyId
  );
  if (!key || key.status !== "active") invalidKey();
  const keyNotBefore = parseWholeSecond(key.notBefore, invalidKey);
  const keyNotAfter = parseWholeSecond(key.notAfter, invalidKey);
  if (
    decidedAt.getTime() < keyNotBefore.getTime() ||
    decidedAt.getTime() >= keyNotAfter.getTime() ||
    now.getTime() < keyNotBefore.getTime() ||
    now.getTime() >= keyNotAfter.getTime() ||
    expiresAt.getTime() > keyNotAfter.getTime()
  ) {
    invalidKey();
  }

  let publicKey;
  try {
    publicKey = createPublicKey(key.publicKeyPem);
  } catch {
    invalidKey();
  }
  if (publicKey.asymmetricKeyType !== "ed25519") invalidKey();
  const signature = Buffer.from(artifact.signature.value, "base64");
  if (
    signature.length !== 64 ||
    signature.toString("base64") !== artifact.signature.value ||
    !verifySignature(
      null,
      previewShadowOwnerDecisionSignatureMessage(payload),
      publicKey,
      signature
    )
  ) {
    invalidSignature();
  }

  const canonicalArtifact = canonicalArtifactJson(artifact);
  const verified = deepFreeze({
    authorization,
    authorizationId,
    artifactSha256: createHash("sha256")
      .update(
        `${PREVIEW_SHADOW_OWNER_DECISION_DIGEST_CONTRACT}\0${canonicalArtifact}`,
        "utf8"
      )
      .digest("hex"),
    ownerDecisionReference: payload.owner_decision_reference,
    ownerDecidedAt: payload.owner_decided_at,
    authorizationExpiresAt: payload.authorization_expires_at,
    ownerSigningKeyId: payload.signing_key_id,
    candidateGitSha: context.candidateGitSha,
    previewShadowConfigurationSha256: context.previewShadowConfigurationSha256,
    selectedCandidateConfigurationSha256:
      context.selectedCandidateConfigurationSha256,
    targetStage: context.targetStage,
    targetEnvironment: context.targetEnvironment,
    targetCohort: context.targetCohort,
    exposure: context.exposure,
  }) as VerifiedPreviewShadowOwnerDecision;
  verifiedDecisions.add(verified);
  return verified;
}

export function assertPreviewShadowOwnerDecisionVerified(
  value: VerifiedPreviewShadowOwnerDecision
): void {
  if (!verifiedDecisions.has(value)) {
    throw new Error("preview_shadow_owner_decision_unverified");
  }
}

function parseActivationContext(
  value: unknown
): PreviewShadowActivationContext {
  const record = exactRecord(value, [
    "candidateGitSha",
    "previewShadowConfigurationSha256",
    "selectedCandidateConfigurationSha256",
    "targetStage",
    "targetEnvironment",
    "targetCohort",
    "exposure",
  ]);
  if (
    typeof record.candidateGitSha !== "string" ||
    !GIT_SHA.test(record.candidateGitSha) ||
    typeof record.previewShadowConfigurationSha256 !== "string" ||
    !SHA256.test(record.previewShadowConfigurationSha256) ||
    typeof record.selectedCandidateConfigurationSha256 !== "string" ||
    !SHA256.test(record.selectedCandidateConfigurationSha256) ||
    record.targetStage !== "preview_shadow" ||
    record.targetEnvironment !== "preview_staging" ||
    record.targetCohort !== "shadow" ||
    record.exposure !== "none"
  ) {
    invalidBinding();
  }
  return deepFreeze({
    candidateGitSha: record.candidateGitSha,
    previewShadowConfigurationSha256: record.previewShadowConfigurationSha256,
    selectedCandidateConfigurationSha256:
      record.selectedCandidateConfigurationSha256,
    targetStage: "preview_shadow",
    targetEnvironment: "preview_staging",
    targetCohort: "shadow",
    exposure: "none",
  });
}

function parseArtifact(value: unknown): PreviewShadowOwnerDecisionArtifact {
  const record = exactRecord(value, ARTIFACT_KEYS, invalidArtifact);
  const payload = exactRecord(record.payload, PAYLOAD_KEYS, invalidArtifact);
  const signature = exactRecord(
    record.signature,
    SIGNATURE_KEYS,
    invalidArtifact
  );
  if (
    record.contract !== PREVIEW_SHADOW_OWNER_DECISION_CONTRACT ||
    typeof payload.authorization_id !== "string" ||
    !SHA256.test(payload.authorization_id) ||
    typeof payload.authorization_nonce !== "string" ||
    !SHA256.test(payload.authorization_nonce) ||
    typeof payload.candidate_git_sha !== "string" ||
    !GIT_SHA.test(payload.candidate_git_sha) ||
    typeof payload.preview_shadow_configuration_sha256 !== "string" ||
    !SHA256.test(payload.preview_shadow_configuration_sha256) ||
    typeof payload.selected_candidate_configuration_sha256 !== "string" ||
    !SHA256.test(payload.selected_candidate_configuration_sha256) ||
    payload.owner_id !== PREVIEW_SHADOW_OWNER_ID ||
    payload.owner_role !== PREVIEW_SHADOW_OWNER_ROLE ||
    payload.owner_decision !== PREVIEW_SHADOW_OWNER_APPROVAL ||
    typeof payload.owner_decision_reference !== "string" ||
    !DECISION_REFERENCE.test(payload.owner_decision_reference) ||
    typeof payload.owner_direction_reference !== "string" ||
    !DECISION_REFERENCE.test(payload.owner_direction_reference) ||
    payload.target_stage !== "preview_shadow" ||
    payload.target_environment !== "preview_staging" ||
    payload.target_cohort !== "shadow" ||
    payload.exposure !== "none" ||
    payload.preview_influence_authorized !== false ||
    payload.later_stage_authorized !== false ||
    payload.production_authorized !== false ||
    payload.default_on_authorized !== false ||
    payload.launch_go_no_go_authorized !== false ||
    typeof payload.signing_key_id !== "string" ||
    !KEY_ID.test(payload.signing_key_id) ||
    signature.algorithm !== "ed25519" ||
    signature.keyId !== payload.signing_key_id ||
    typeof signature.value !== "string" ||
    !BASE64.test(signature.value)
  ) {
    invalidArtifact();
  }
  const decidedAt = parseWholeSecond(payload.owner_decided_at, invalidArtifact);
  const expiresAt = parseWholeSecond(
    payload.authorization_expires_at,
    invalidArtifact
  );
  const signatureBytes = Buffer.from(signature.value, "base64");
  if (
    expiresAt.getTime() <= decidedAt.getTime() ||
    signatureBytes.length !== 64 ||
    signatureBytes.toString("base64") !== signature.value
  ) {
    invalidArtifact();
  }
  return deepFreeze({
    contract: PREVIEW_SHADOW_OWNER_DECISION_CONTRACT,
    payload: canonicalPayload(payload),
    signature: {
      algorithm: signature.algorithm as "ed25519",
      keyId: signature.keyId as string,
      value: signature.value as string,
    },
  });
}

function parseRegistry(value: unknown): PreviewShadowOwnerKeyRegistry {
  const record = exactRecord(value, REGISTRY_KEYS, invalidRegistry);
  if (
    record.contract !== PREVIEW_SHADOW_OWNER_KEY_REGISTRY_CONTRACT ||
    record.ownerId !== PREVIEW_SHADOW_OWNER_ID
  ) {
    invalidRegistry();
  }
  const entries = exactArray(record.keys, 8, invalidRegistry);
  const keyIds = new Set<string>();
  const keys = entries.map((entry) => {
    const key = exactRecord(entry, REGISTRY_ENTRY_KEYS, invalidRegistry);
    if (
      key.algorithm !== "ed25519" ||
      typeof key.keyId !== "string" ||
      !KEY_ID.test(key.keyId) ||
      keyIds.has(key.keyId) ||
      (key.status !== "active" && key.status !== "revoked") ||
      typeof key.notBefore !== "string" ||
      typeof key.notAfter !== "string" ||
      typeof key.publicKeyPem !== "string" ||
      key.publicKeyPem.length > 512
    ) {
      invalidRegistry();
    }
    const notBefore = parseWholeSecond(key.notBefore, invalidRegistry);
    const notAfter = parseWholeSecond(key.notAfter, invalidRegistry);
    if (notAfter.getTime() <= notBefore.getTime()) invalidRegistry();
    keyIds.add(key.keyId);
    return {
      algorithm: "ed25519" as const,
      keyId: key.keyId,
      notAfter: key.notAfter,
      notBefore: key.notBefore,
      publicKeyPem: key.publicKeyPem,
      status: key.status as "active" | "revoked",
    };
  });
  return deepFreeze({
    contract: PREVIEW_SHADOW_OWNER_KEY_REGISTRY_CONTRACT,
    ownerId: PREVIEW_SHADOW_OWNER_ID,
    keys,
  });
}

function canonicalPayload(
  record: Record<string, unknown>
): PreviewShadowOwnerDecisionPayload {
  return Object.fromEntries(
    PAYLOAD_KEYS.map((key) => [key, record[key]])
  ) as unknown as PreviewShadowOwnerDecisionPayload;
}

function canonicalPayloadJson(payload: PreviewShadowOwnerDecisionPayload) {
  return JSON.stringify(
    Object.fromEntries(PAYLOAD_KEYS.map((key) => [key, payload[key]]))
  );
}

function canonicalArtifactJson(artifact: PreviewShadowOwnerDecisionArtifact) {
  return JSON.stringify({
    contract: PREVIEW_SHADOW_OWNER_DECISION_CONTRACT,
    payload: Object.fromEntries(
      PAYLOAD_KEYS.map((key) => [key, artifact.payload[key]])
    ),
    signature: {
      algorithm: artifact.signature.algorithm,
      keyId: artifact.signature.keyId,
      value: artifact.signature.value,
    },
  });
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  invalid: () => never = invalidArtifact
): Record<string, unknown> {
  const record = snapshotDataRecord(value, invalid);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    invalid();
  }
  return record;
}

function snapshotDataRecord(
  value: unknown,
  invalid: () => never
): Record<string, unknown> {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      invalid();
    }
    const actual = Reflect.ownKeys(value);
    if (actual.some((key) => typeof key !== "string")) invalid();
    const snapshot: Record<string, unknown> = {};
    for (const key of actual as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !("value" in descriptor)
      ) {
        invalid();
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    invalid();
  }
}

function exactArray(
  value: unknown,
  maximumLength: number,
  invalid: () => never
): unknown[] {
  try {
    if (
      !Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Array.prototype
    ) {
      invalid();
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (
      lengthDescriptor === undefined ||
      lengthDescriptor.enumerable !== false ||
      !("value" in lengthDescriptor) ||
      !Number.isSafeInteger(lengthDescriptor.value) ||
      lengthDescriptor.value < 1 ||
      lengthDescriptor.value > maximumLength
    ) {
      invalid();
    }
    const length = lengthDescriptor.value as number;
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== length + 1 ||
      keys.some((key) => typeof key !== "string")
    ) {
      invalid();
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !("value" in descriptor)
      ) {
        invalid();
      }
      snapshot.push(descriptor.value);
    }
    return snapshot;
  } catch {
    invalid();
  }
}

function snapshotWholeSecondDate(value: unknown, invalid: () => never): Date {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Object.getPrototypeOf(value) !== Date.prototype ||
      Reflect.ownKeys(value).length !== 0
    ) {
      invalid();
    }
    const timestamp = Date.prototype.getTime.call(value);
    if (!Number.isFinite(timestamp) || timestamp % 1_000 !== 0) invalid();
    return new Date(timestamp);
  } catch {
    invalid();
  }
}

function parseWholeSecond(value: unknown, invalid: () => never): Date {
  if (typeof value !== "string") invalid();
  const parsed = new Date(value);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.getUTCMilliseconds() !== 0 ||
    parsed.toISOString() !== value
  ) {
    invalid();
  }
  return parsed;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function parseJsonRejectingDuplicateKeys(contents: string): unknown {
  let offset = 0;
  const whitespace = () => {
    while (/[ \t\r\n]/.test(contents[offset] ?? "")) offset += 1;
  };
  const value = (depth = 0): unknown => {
    if (depth > PREVIEW_SHADOW_OWNER_DECISION_MAX_DEPTH) {
      throw new Error("json_depth_invalid");
    }
    whitespace();
    const character = contents[offset];
    if (character === "{") return object(depth);
    if (character === "[") return array(depth);
    if (character === '"') return string();
    for (const [literal, parsed] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ] as const) {
      if (contents.startsWith(literal, offset)) {
        offset += literal.length;
        return parsed;
      }
    }
    const match = contents
      .slice(offset)
      .match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (!match) throw new Error("json_invalid");
    offset += match[0].length;
    return Number(match[0]);
  };
  const object = (depth: number): Record<string, unknown> => {
    offset += 1;
    whitespace();
    const entries: [string, unknown][] = [];
    const keys = new Set<string>();
    if (contents[offset] === "}") {
      offset += 1;
      return {};
    }
    while (true) {
      whitespace();
      if (contents[offset] !== '"') throw new Error("json_invalid");
      const key = string();
      if (keys.has(key)) throw new Error("json_duplicate_key");
      keys.add(key);
      whitespace();
      if (contents[offset] !== ":") throw new Error("json_invalid");
      offset += 1;
      entries.push([key, value(depth + 1)]);
      whitespace();
      if (contents[offset] === "}") {
        offset += 1;
        return Object.fromEntries(entries);
      }
      if (contents[offset] !== ",") throw new Error("json_invalid");
      offset += 1;
    }
  };
  const array = (depth: number): unknown[] => {
    offset += 1;
    whitespace();
    const values: unknown[] = [];
    if (contents[offset] === "]") {
      offset += 1;
      return values;
    }
    while (true) {
      values.push(value(depth + 1));
      whitespace();
      if (contents[offset] === "]") {
        offset += 1;
        return values;
      }
      if (contents[offset] !== ",") throw new Error("json_invalid");
      offset += 1;
    }
  };
  const string = (): string => {
    const start = offset;
    offset += 1;
    while (offset < contents.length) {
      const character = contents[offset];
      if (character === '"') {
        offset += 1;
        return JSON.parse(contents.slice(start, offset)) as string;
      }
      if (character === "\\") {
        offset += 1;
        const escape = contents[offset];
        if (escape === "u") {
          const hex = contents.slice(offset + 1, offset + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error("json_invalid");
          offset += 5;
          continue;
        }
        if (!escape || !'"\\/bfnrt'.includes(escape)) {
          throw new Error("json_invalid");
        }
        offset += 1;
        continue;
      }
      if (!character || character.charCodeAt(0) < 0x20) {
        throw new Error("json_invalid");
      }
      offset += 1;
    }
    throw new Error("json_invalid");
  };
  const result = value();
  whitespace();
  if (offset !== contents.length) throw new Error("json_invalid");
  return result;
}

function invalidArtifact(): never {
  throw new Error("preview_shadow_owner_decision_artifact_invalid");
}

function invalidAuthorization(): never {
  throw new Error("preview_shadow_authorization_invalid");
}

function invalidBinding(): never {
  throw new Error("preview_shadow_owner_decision_binding_mismatch");
}

function invalidClock(): never {
  throw new Error("preview_shadow_owner_decision_clock_invalid");
}

function invalidTime(): never {
  throw new Error("preview_shadow_owner_decision_time_invalid");
}

function invalidSignature(): never {
  throw new Error("preview_shadow_owner_decision_signature_invalid");
}

function invalidKey(): never {
  throw new Error("preview_shadow_owner_decision_key_untrusted");
}

function invalidRegistry(): never {
  throw new Error("preview_shadow_owner_key_registry_invalid");
}

import {
  FEEDBACK_DIMENSIONS,
  ROUND_DIMENSION_COVERAGE_CONFIG,
  type DimensionCoverageFeedbackMode,
} from "./feedback-dimension-coverage";
import type { FeedbackDimension } from "./evaluation";
import type { RoundType } from "./interview";
import {
  TRUSTED_ANSWER_BLOCK_IDENTITY_VERSION,
  type TrustedAnswerBlockIdentity,
} from "./trusted-answer-block-authority";

export const SHADOW_FEEDBACK_ARTIFACT_KEY_VERSION =
  "feedback.shadow-artifact-key.v1" as const;
export const SHADOW_FEEDBACK_ARTIFACT_VERSION =
  "feedback.shadow-artifact.v1" as const;
export const SHADOW_FEEDBACK_ARTIFACT_SET_VERSION =
  "feedback.shadow-artifact-set.v1" as const;

const MAX_ARTIFACTS_PER_SET = 1_000;
const MAX_VERSION_LENGTH = 96;
const MAX_ARTIFACT_SERIALIZED_BYTES = 64_000;
const MAX_DURATION_MS = 90_000;
const MAX_TOKEN_COUNT = 10_000_000;

export interface ShadowFeedbackArtifactKeyV1 {
  contractVersion: typeof SHADOW_FEEDBACK_ARTIFACT_KEY_VERSION;
  keyFingerprint: `shadow-feedback-artifact-key.v1:${string}`;
  sessionId: string;
  trustedBlockFingerprint: `trusted-answer-block.v1:${string}`;
  rubricVersion: string;
  promptVersion: string;
  selectionSchemaVersion: string;
  modelVersion: string;
}

export interface ShadowFeedbackArtifactDimensionResult {
  score: number | null;
  facetCodes: string[];
}

export interface ShadowFeedbackArtifactCompletedOutcome {
  state: "completed";
  roundType: RoundType;
  mode: DimensionCoverageFeedbackMode;
  dimensions: Record<FeedbackDimension, ShadowFeedbackArtifactDimensionResult>;
}

export type ShadowFeedbackArtifactFailureClass =
  | "deadline_exceeded"
  | "transport_timeout"
  | "transport_network"
  | "provider_rate_limited"
  | "provider_capacity"
  | "provider_authentication"
  | "provider_configuration"
  | "provider_refusal"
  | "provider_schema"
  | "provider_contract"
  | "evidence_integrity"
  | "fenced"
  | "persistence"
  | "internal";

export interface ShadowFeedbackArtifactFailedOutcome {
  state: "failed";
  failureClass: ShadowFeedbackArtifactFailureClass;
}

export interface ShadowFeedbackArtifactMetrics {
  durationMs: number;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface ShadowFeedbackArtifactV1 {
  contractVersion: typeof SHADOW_FEEDBACK_ARTIFACT_VERSION;
  key: ShadowFeedbackArtifactKeyV1;
  outcome:
    | ShadowFeedbackArtifactCompletedOutcome
    | ShadowFeedbackArtifactFailedOutcome;
  metrics: ShadowFeedbackArtifactMetrics;
  completedAt: string;
}

export interface ShadowFeedbackArtifactSetV1 {
  contractVersion: typeof SHADOW_FEEDBACK_ARTIFACT_SET_VERSION;
  sessionId: string;
  status: "complete" | "incomplete" | "invalid";
  expectedKeyFingerprints: string[];
  artifacts: ShadowFeedbackArtifactV1[];
  missingKeyFingerprints: string[];
  failedKeyFingerprints: string[];
}

export type ShadowFeedbackArtifactParseErrorCode =
  | "version_unsupported"
  | "invalid_shape"
  | "fingerprint_mismatch"
  | "artifact_too_large";

export class ShadowFeedbackArtifactParseError extends Error {
  constructor(readonly code: ShadowFeedbackArtifactParseErrorCode) {
    super(code);
    this.name = "ShadowFeedbackArtifactParseError";
  }
}

export function createShadowFeedbackArtifactKey(input: {
  sessionId: string;
  trustedBlockIdentity: TrustedAnswerBlockIdentity;
  rubricVersion: string;
  promptVersion: string;
  selectionSchemaVersion: string;
  modelVersion: string;
}): ShadowFeedbackArtifactKeyV1 {
  const sessionId = requireUuid(input.sessionId);
  if (
    input.trustedBlockIdentity.contractVersion !==
    TRUSTED_ANSWER_BLOCK_IDENTITY_VERSION
  ) {
    throw new ShadowFeedbackArtifactParseError("invalid_shape");
  }
  const trustedBlockFingerprint = requireTrustedBlockFingerprint(
    input.trustedBlockIdentity.identity
  );
  const rubricVersion = requireVersion(input.rubricVersion);
  const promptVersion = requireVersion(input.promptVersion);
  const selectionSchemaVersion = requireVersion(input.selectionSchemaVersion);
  const modelVersion = requireVersion(input.modelVersion);
  const material = keyMaterial({
    sessionId,
    trustedBlockFingerprint,
    rubricVersion,
    promptVersion,
    selectionSchemaVersion,
    modelVersion,
  });
  return {
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_KEY_VERSION,
    keyFingerprint: `shadow-feedback-artifact-key.v1:${sha256Hex(material)}`,
    sessionId,
    trustedBlockFingerprint,
    rubricVersion,
    promptVersion,
    selectionSchemaVersion,
    modelVersion,
  };
}

export function parseShadowFeedbackArtifactKey(
  value: unknown
): ShadowFeedbackArtifactKeyV1 {
  const root = requireRecord(value);
  if (root.contractVersion !== SHADOW_FEEDBACK_ARTIFACT_KEY_VERSION) {
    throw new ShadowFeedbackArtifactParseError("version_unsupported");
  }
  requireExactKeys(root, [
    "contractVersion",
    "keyFingerprint",
    "sessionId",
    "trustedBlockFingerprint",
    "rubricVersion",
    "promptVersion",
    "selectionSchemaVersion",
    "modelVersion",
  ]);
  const sessionId = requireUuid(root.sessionId);
  const trustedBlockFingerprint = requireTrustedBlockFingerprint(
    root.trustedBlockFingerprint
  );
  const rubricVersion = requireVersion(root.rubricVersion);
  const promptVersion = requireVersion(root.promptVersion);
  const selectionSchemaVersion = requireVersion(root.selectionSchemaVersion);
  const modelVersion = requireVersion(root.modelVersion);
  const keyFingerprint = `shadow-feedback-artifact-key.v1:${sha256Hex(
    keyMaterial({
      sessionId,
      trustedBlockFingerprint,
      rubricVersion,
      promptVersion,
      selectionSchemaVersion,
      modelVersion,
    })
  )}` as const;
  if (root.keyFingerprint !== keyFingerprint) {
    throw new ShadowFeedbackArtifactParseError("fingerprint_mismatch");
  }
  return {
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_KEY_VERSION,
    keyFingerprint,
    sessionId,
    trustedBlockFingerprint,
    rubricVersion,
    promptVersion,
    selectionSchemaVersion,
    modelVersion,
  };
}

export function parseShadowFeedbackArtifact(
  value: unknown
): ShadowFeedbackArtifactV1 {
  const root = requireRecord(value);
  if (root.contractVersion !== SHADOW_FEEDBACK_ARTIFACT_VERSION) {
    throw new ShadowFeedbackArtifactParseError("version_unsupported");
  }
  requireExactKeys(root, [
    "contractVersion",
    "key",
    "outcome",
    "metrics",
    "completedAt",
  ]);
  const artifact: ShadowFeedbackArtifactV1 = {
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_VERSION,
    key: parseShadowFeedbackArtifactKey(root.key),
    outcome: parseOutcome(root.outcome),
    metrics: parseMetrics(root.metrics),
    completedAt: requireIsoDate(root.completedAt),
  };
  if (
    new TextEncoder().encode(JSON.stringify(artifact)).byteLength >
    MAX_ARTIFACT_SERIALIZED_BYTES
  ) {
    throw new ShadowFeedbackArtifactParseError("artifact_too_large");
  }
  return artifact;
}

/**
 * Collect exact-current artifacts without deriving scores or feedback. Extra
 * keys belong to stale version tuples and are ignored. Any malformed or
 * conflicting row fails the whole set closed.
 */
export function aggregateShadowFeedbackArtifacts(input: {
  expectedKeys: readonly unknown[];
  artifacts: readonly unknown[];
}): ShadowFeedbackArtifactSetV1 {
  if (input.artifacts.length > MAX_ARTIFACTS_PER_SET) {
    return invalidSet([]);
  }
  let expectedKeys: ShadowFeedbackArtifactKeyV1[];
  try {
    expectedKeys = input.expectedKeys.map(parseShadowFeedbackArtifactKey);
  } catch {
    return invalidSet([]);
  }
  if (
    expectedKeys.length === 0 ||
    expectedKeys.length > MAX_ARTIFACTS_PER_SET
  ) {
    return invalidSet([]);
  }
  const sessionId = expectedKeys[0]!.sessionId;
  const expectedByFingerprint = new Map<string, ShadowFeedbackArtifactKeyV1>();
  for (const key of expectedKeys) {
    if (
      key.sessionId !== sessionId ||
      expectedByFingerprint.has(key.keyFingerprint)
    ) {
      return invalidSet([]);
    }
    expectedByFingerprint.set(key.keyFingerprint, key);
  }

  const current = new Map<string, ShadowFeedbackArtifactV1>();
  try {
    for (const value of input.artifacts) {
      const artifact = parseShadowFeedbackArtifact(value);
      if (!expectedByFingerprint.has(artifact.key.keyFingerprint)) continue;
      const existing = current.get(artifact.key.keyFingerprint);
      if (existing && JSON.stringify(existing) !== JSON.stringify(artifact)) {
        return invalidSet([...expectedByFingerprint.keys()]);
      }
      current.set(artifact.key.keyFingerprint, artifact);
    }
  } catch {
    return invalidSet([...expectedByFingerprint.keys()]);
  }

  const expectedKeyFingerprints = [...expectedByFingerprint.keys()];
  const artifacts = expectedKeyFingerprints.flatMap((fingerprint) => {
    const artifact = current.get(fingerprint);
    return artifact ? [artifact] : [];
  });
  const missingKeyFingerprints = expectedKeyFingerprints.filter(
    (fingerprint) => !current.has(fingerprint)
  );
  const failedKeyFingerprints = artifacts.flatMap((artifact) =>
    artifact.outcome.state === "failed" ? [artifact.key.keyFingerprint] : []
  );
  return {
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_SET_VERSION,
    sessionId,
    status:
      missingKeyFingerprints.length === 0 && failedKeyFingerprints.length === 0
        ? "complete"
        : "incomplete",
    expectedKeyFingerprints,
    artifacts,
    missingKeyFingerprints,
    failedKeyFingerprints,
  };
}

function invalidSet(
  expectedKeyFingerprints: string[]
): ShadowFeedbackArtifactSetV1 {
  return {
    contractVersion: SHADOW_FEEDBACK_ARTIFACT_SET_VERSION,
    sessionId: "",
    status: "invalid",
    expectedKeyFingerprints,
    artifacts: [],
    missingKeyFingerprints: expectedKeyFingerprints,
    failedKeyFingerprints: [],
  };
}

function parseOutcome(value: unknown): ShadowFeedbackArtifactV1["outcome"] {
  const root = requireRecord(value);
  if (root.state === "failed") {
    requireExactKeys(root, ["state", "failureClass"]);
    return {
      state: "failed",
      failureClass: requireFailureClass(root.failureClass),
    };
  }
  if (root.state !== "completed") {
    throw new ShadowFeedbackArtifactParseError("invalid_shape");
  }
  requireExactKeys(root, ["state", "roundType", "mode", "dimensions"]);
  const roundType = requireRoundType(root.roundType);
  const dimensionsRoot = requireRecord(root.dimensions);
  requireExactKeys(dimensionsRoot, FEEDBACK_DIMENSIONS);
  const dimensions = {} as Record<
    FeedbackDimension,
    ShadowFeedbackArtifactDimensionResult
  >;
  for (const dimension of FEEDBACK_DIMENSIONS) {
    const item = requireRecord(dimensionsRoot[dimension]);
    requireExactKeys(item, ["score", "facetCodes"]);
    if (!Array.isArray(item.facetCodes) || item.facetCodes.length > 2) {
      throw new ShadowFeedbackArtifactParseError("invalid_shape");
    }
    const allowed = new Set(
      ROUND_DIMENSION_COVERAGE_CONFIG[roundType][dimension].facets.map(
        ({ code }) => code
      )
    );
    const facetCodes = item.facetCodes.map((code) => {
      if (typeof code !== "string" || !allowed.has(code)) {
        throw new ShadowFeedbackArtifactParseError("invalid_shape");
      }
      return code;
    });
    if (new Set(facetCodes).size !== facetCodes.length) {
      throw new ShadowFeedbackArtifactParseError("invalid_shape");
    }
    facetCodes.sort();
    const score = requireNullableScore(item.score);
    if ((score !== null) !== (facetCodes.length === 2)) {
      throw new ShadowFeedbackArtifactParseError("invalid_shape");
    }
    dimensions[dimension] = { score, facetCodes };
  }
  const expectedMode = modeForDimensions(dimensions);
  if (root.mode !== expectedMode) {
    throw new ShadowFeedbackArtifactParseError("invalid_shape");
  }
  return {
    state: "completed",
    roundType,
    mode: expectedMode,
    dimensions,
  };
}

function parseMetrics(value: unknown): ShadowFeedbackArtifactMetrics {
  const root = requireRecord(value);
  requireExactKeys(root, [
    "durationMs",
    "inputTokens",
    "cachedInputTokens",
    "outputTokens",
    "totalTokens",
  ]);
  const durationMs = requireInteger(root.durationMs, 0, MAX_DURATION_MS);
  const tokens = [
    root.inputTokens,
    root.cachedInputTokens,
    root.outputTokens,
    root.totalTokens,
  ];
  const allNull = tokens.every((token) => token === null);
  const allIntegers = tokens.every(
    (token) =>
      Number.isSafeInteger(token) &&
      (token as number) >= 0 &&
      (token as number) <= MAX_TOKEN_COUNT
  );
  if (!allNull && !allIntegers) {
    throw new ShadowFeedbackArtifactParseError("invalid_shape");
  }
  if (
    allIntegers &&
    ((root.cachedInputTokens as number) > (root.inputTokens as number) ||
      (root.totalTokens as number) !==
        (root.inputTokens as number) + (root.outputTokens as number))
  ) {
    throw new ShadowFeedbackArtifactParseError("invalid_shape");
  }
  return {
    durationMs,
    inputTokens: root.inputTokens as number | null,
    cachedInputTokens: root.cachedInputTokens as number | null,
    outputTokens: root.outputTokens as number | null,
    totalTokens: root.totalTokens as number | null,
  };
}

function modeForDimensions(
  dimensions: Record<FeedbackDimension, ShadowFeedbackArtifactDimensionResult>
): DimensionCoverageFeedbackMode {
  const scored = FEEDBACK_DIMENSIONS.filter(
    (dimension) => dimensions[dimension].score !== null
  ).length;
  return scored === FEEDBACK_DIMENSIONS.length
    ? "full_scorecard"
    : scored > 0
      ? "partial_scorecard"
      : "coaching_review";
}

function keyMaterial(input: {
  sessionId: string;
  trustedBlockFingerprint: string;
  rubricVersion: string;
  promptVersion: string;
  selectionSchemaVersion: string;
  modelVersion: string;
}): string {
  return JSON.stringify([
    SHADOW_FEEDBACK_ARTIFACT_KEY_VERSION,
    input.sessionId,
    input.trustedBlockFingerprint,
    input.rubricVersion,
    input.promptVersion,
    input.selectionSchemaVersion,
    input.modelVersion,
  ]);
}

function requireTrustedBlockFingerprint(
  value: unknown
): `trusted-answer-block.v1:${string}` {
  if (
    typeof value !== "string" ||
    !/^trusted-answer-block\.v1:[a-f0-9]{64}$/u.test(value)
  ) {
    throw new ShadowFeedbackArtifactParseError("invalid_shape");
  }
  return value as `trusted-answer-block.v1:${string}`;
}

function requireFailureClass(
  value: unknown
): ShadowFeedbackArtifactFailureClass {
  const allowed: readonly ShadowFeedbackArtifactFailureClass[] = [
    "deadline_exceeded",
    "transport_timeout",
    "transport_network",
    "provider_rate_limited",
    "provider_capacity",
    "provider_authentication",
    "provider_configuration",
    "provider_refusal",
    "provider_schema",
    "provider_contract",
    "evidence_integrity",
    "fenced",
    "persistence",
    "internal",
  ];
  if (!allowed.includes(value as ShadowFeedbackArtifactFailureClass)) {
    throw new ShadowFeedbackArtifactParseError("invalid_shape");
  }
  return value as ShadowFeedbackArtifactFailureClass;
}

function requireRoundType(value: unknown): RoundType {
  if (
    value !== "product_sense" &&
    value !== "execution" &&
    value !== "behavioral" &&
    value !== "strategy"
  ) {
    throw new ShadowFeedbackArtifactParseError("invalid_shape");
  }
  return value;
}

function requireNullableScore(value: unknown): number | null {
  if (value === null) return null;
  return requireInteger(value, 0, 10);
}

function requireInteger(value: unknown, min: number, max: number): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  ) {
    throw new ShadowFeedbackArtifactParseError("invalid_shape");
  }
  return value as number;
}

function requireVersion(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_VERSION_LENGTH ||
    !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u.test(value)
  ) {
    throw new ShadowFeedbackArtifactParseError("invalid_shape");
  }
  return value;
}

function requireUuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(
      value
    )
  ) {
    throw new ShadowFeedbackArtifactParseError("invalid_shape");
  }
  return value;
}

function requireIsoDate(value: unknown): string {
  if (typeof value !== "string" || value.length > 32) {
    throw new ShadowFeedbackArtifactParseError("invalid_shape");
  }
  try {
    if (new Date(value).toISOString() !== value) {
      throw new ShadowFeedbackArtifactParseError("invalid_shape");
    }
  } catch {
    throw new ShadowFeedbackArtifactParseError("invalid_shape");
  }
  return value;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ShadowFeedbackArtifactParseError("invalid_shape");
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new ShadowFeedbackArtifactParseError("invalid_shape");
  }
}

const SHA256_INITIAL_STATE = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
] as const;

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function sha256Hex(value: string): string {
  const input = new TextEncoder().encode(value);
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const highLength = Math.floor(bitLength / 0x1_0000_0000);
  const lowLength = bitLength >>> 0;
  for (let index = 0; index < 4; index += 1) {
    bytes[paddedLength - 8 + index] = (highLength >>> ((3 - index) * 8)) & 0xff;
    bytes[paddedLength - 4 + index] = (lowLength >>> ((3 - index) * 8)) & 0xff;
  }

  const state: number[] = [...SHA256_INITIAL_STATE];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const cursor = offset + index * 4;
      words[index] =
        ((bytes[cursor]! << 24) |
          (bytes[cursor + 1]! << 16) |
          (bytes[cursor + 2]! << 8) |
          bytes[cursor + 3]!) >>>
        0;
    }
    for (let index = 16; index < 64; index += 1) {
      const word15 = words[index - 15]!;
      const word2 = words[index - 2]!;
      const sigma0 =
        rotateRight(word15, 7) ^ rotateRight(word15, 18) ^ (word15 >>> 3);
      const sigma1 =
        rotateRight(word2, 17) ^ rotateRight(word2, 19) ^ (word2 >>> 10);
      words[index] =
        (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 =
        rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25);
      const choice = (e! & f!) ^ (~e! & g!);
      const temporary1 =
        (h! +
          sum1 +
          choice +
          SHA256_ROUND_CONSTANTS[index]! +
          words[index]!) >>>
        0;
      const sum0 =
        rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d! + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (state[0]! + a!) >>> 0;
    state[1] = (state[1]! + b!) >>> 0;
    state[2] = (state[2]! + c!) >>> 0;
    state[3] = (state[3]! + d!) >>> 0;
    state[4] = (state[4]! + e!) >>> 0;
    state[5] = (state[5]! + f!) >>> 0;
    state[6] = (state[6]! + g!) >>> 0;
    state[7] = (state[7]! + h!) >>> 0;
  }
  return state.map((word) => word.toString(16).padStart(8, "0")).join("");
}

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

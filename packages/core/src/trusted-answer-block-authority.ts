import {
  deriveCandidateAnswerBlocks,
  type AnswerBlockBoundary,
  type AnswerBlockBoundaryKind,
  type AnswerBlockLedgerEvent,
  type CandidateAnswerBlock,
} from "./answer-blocks";

export const FROZEN_ANSWER_BLOCK_AUTHORITY_VERSION =
  "frozen-answer-block-authority.v1" as const;
export const TRUSTED_ANSWER_BLOCK_PROJECTION_VERSION =
  "trusted-answer-block-projection.v1" as const;
export const TRUSTED_ANSWER_BLOCK_IDENTITY_VERSION =
  "trusted-answer-block-identity.v1" as const;

const FROZEN_AUTHORITY_MAX_WRITER_ID_LENGTH = 256;

export interface FrozenAnswerBlockWriterAuthorityV1 {
  contractVersion: 1;
  writerId: string;
  writerGeneration: number;
  committedSequence: number;
  integrityState: "healthy" | "degraded";
  settlementState: "settled" | "missing" | "degraded";
}

/**
 * Provider-neutral facts copied from one validated frozen evidence snapshot.
 * Database and runtime command payloads must be normalized before this seam.
 */
export interface FrozenAnswerBlockAuthorityV1 {
  contractVersion: typeof FROZEN_ANSWER_BLOCK_AUTHORITY_VERSION;
  snapshotState: "complete" | "partial";
  cutoffAtMs: number;
  writers: readonly FrozenAnswerBlockWriterAuthorityV1[];
}

export type TrustedAnswerBlockAuthorityFailureReason =
  | "authority_contract_unsupported"
  | "authority_malformed"
  | "canonicalization_failure"
  | "cutoff_conflict"
  | "replay_conflict"
  | "sequence_gap"
  | "terminal_boundary_invalid"
  | "writer_degraded"
  | "writer_drift";

export type TrustedAnswerBlockExclusionReason =
  | "after_untrusted_boundary"
  | "logical_closure_unproven"
  | "prompt_unbound"
  | "unverified_terminal_tail";

export type TrustedAnswerBlockClosureKind =
  | "interviewer_follow_up"
  | "section_change"
  | "settled_terminal_boundary";

export interface TrustedAnswerBlockClosureAuthority {
  answerBlockId: string;
  kind: TrustedAnswerBlockClosureKind;
  boundary: AnswerBlockBoundary;
}

export interface ExcludedAnswerBlock {
  answerBlockId: string;
  reason: TrustedAnswerBlockExclusionReason;
}

export interface TrustedAnswerBlockIdentity {
  contractVersion: typeof TRUSTED_ANSWER_BLOCK_IDENTITY_VERSION;
  answerBlockId: string;
  identity: `trusted-answer-block.v1:${string}`;
}

export type TrustedAnswerBlockProjectionStatus =
  | "complete"
  | "verified_prefix"
  | "no_trusted_blocks"
  | "integrity_failure";

export interface TrustedAnswerBlockProjection {
  contractVersion: typeof TRUSTED_ANSWER_BLOCK_PROJECTION_VERSION;
  status: TrustedAnswerBlockProjectionStatus;
  numericalScoreAuthority: "allowed" | "withheld";
  trustedBlocks: CandidateAnswerBlock[];
  trustedBlockIdentities: TrustedAnswerBlockIdentity[];
  closureAuthorities: TrustedAnswerBlockClosureAuthority[];
  excludedBlocks: ExcludedAnswerBlock[];
  failureReason: TrustedAnswerBlockAuthorityFailureReason | null;
}

/**
 * Project independently trusted, logically closed answer blocks from one
 * frozen canonical ledger. This does not authorize scoring or persistence.
 */
export function projectTrustedClosedAnswerBlocks(
  events: readonly AnswerBlockLedgerEvent[],
  authorityInput: unknown
): TrustedAnswerBlockProjection {
  const authority = parseFrozenAnswerBlockAuthority(authorityInput);
  if (!authority.ok) return failedProjection(authority.reason);
  if (authority.value.writers.length !== 1) {
    return failedProjection("writer_drift");
  }

  const writer = authority.value.writers[0]!;
  if (
    writer.integrityState !== "healthy" ||
    writer.settlementState === "degraded"
  ) {
    return failedProjection("writer_degraded");
  }
  if (
    authority.value.snapshotState === "complete" &&
    writer.settlementState !== "settled"
  ) {
    return failedProjection("authority_malformed");
  }

  const sequencedEvents = events.filter(hasWriterSequence);
  if (
    sequencedEvents.some(
      (event) =>
        event.writerId !== writer.writerId ||
        event.writerGeneration !== writer.writerGeneration
    )
  ) {
    return failedProjection("writer_drift");
  }
  if (!hasExactCommittedSequence(sequencedEvents, writer.committedSequence)) {
    return failedProjection("sequence_gap");
  }
  if (!eventsAreCutoffSafe(events, authority.value.cutoffAtMs)) {
    return failedProjection("cutoff_conflict");
  }
  if (!hasExactTerminalBoundary(events, authority.value.cutoffAtMs)) {
    return failedProjection("terminal_boundary_invalid");
  }
  if (!integrityMarkersFollowPriorSpeech(sequencedEvents)) {
    return failedProjection("terminal_boundary_invalid");
  }

  const derived = deriveCandidateAnswerBlocks(events);
  if (!derived.eligible) {
    return failedProjection(classifyDerivationFailure(derived.issues));
  }

  const trustedBlocks: CandidateAnswerBlock[] = [];
  const trustedBlockIdentities: TrustedAnswerBlockIdentity[] = [];
  const closureAuthorities: TrustedAnswerBlockClosureAuthority[] = [];
  const excludedBlocks: ExcludedAnswerBlock[] = [];
  let prefixStopped = false;

  for (const block of derived.blocks) {
    if (prefixStopped) {
      excludedBlocks.push({
        answerBlockId: block.answerBlockId,
        reason: "after_untrusted_boundary",
      });
      continue;
    }
    const exclusionReason = classifyBlockExclusion(block, authority.value);
    if (exclusionReason) {
      excludedBlocks.push({
        answerBlockId: block.answerBlockId,
        reason: exclusionReason,
      });
      prefixStopped = true;
      continue;
    }

    const boundary = findClosingBoundary(block, derived.boundaries);
    if (!boundary) return failedProjection("terminal_boundary_invalid");
    trustedBlocks.push(block);
    trustedBlockIdentities.push(buildTrustedAnswerBlockIdentity(block));
    closureAuthorities.push({
      answerBlockId: block.answerBlockId,
      kind: toClosureKind(block.closedBy),
      boundary,
    });
  }

  if (trustedBlocks.length === 0) {
    return {
      contractVersion: TRUSTED_ANSWER_BLOCK_PROJECTION_VERSION,
      status: "no_trusted_blocks",
      numericalScoreAuthority: "withheld",
      trustedBlocks,
      trustedBlockIdentities,
      closureAuthorities,
      excludedBlocks,
      failureReason: null,
    };
  }

  const hasPreservingMarker = sequencedEvents.some(isPreservingMarker);
  const complete =
    authority.value.snapshotState === "complete" &&
    writer.settlementState === "settled" &&
    !hasPreservingMarker &&
    excludedBlocks.length === 0;
  return {
    contractVersion: TRUSTED_ANSWER_BLOCK_PROJECTION_VERSION,
    status: complete ? "complete" : "verified_prefix",
    numericalScoreAuthority:
      writer.settlementState === "settled" ? "allowed" : "withheld",
    trustedBlocks,
    trustedBlockIdentities,
    closureAuthorities,
    excludedBlocks,
    failureReason: null,
  };
}

type ParsedAuthority =
  | { ok: true; value: FrozenAnswerBlockAuthorityV1 }
  | {
      ok: false;
      reason: "authority_contract_unsupported" | "authority_malformed";
    };

function parseFrozenAnswerBlockAuthority(input: unknown): ParsedAuthority {
  if (!isRecord(input)) return { ok: false, reason: "authority_malformed" };
  if (input.contractVersion !== FROZEN_ANSWER_BLOCK_AUTHORITY_VERSION) {
    return { ok: false, reason: "authority_contract_unsupported" };
  }
  if (
    !hasExactKeys(input, [
      "contractVersion",
      "snapshotState",
      "cutoffAtMs",
      "writers",
    ]) ||
    (input.snapshotState !== "complete" && input.snapshotState !== "partial") ||
    !Number.isSafeInteger(input.cutoffAtMs) ||
    (input.cutoffAtMs as number) < 0 ||
    !Array.isArray(input.writers) ||
    input.writers.length === 0 ||
    !input.writers.every(isWriterAuthority)
  ) {
    return { ok: false, reason: "authority_malformed" };
  }
  return { ok: true, value: input as unknown as FrozenAnswerBlockAuthorityV1 };
}

function isWriterAuthority(
  input: unknown
): input is FrozenAnswerBlockWriterAuthorityV1 {
  return (
    isRecord(input) &&
    hasExactKeys(input, [
      "contractVersion",
      "writerId",
      "writerGeneration",
      "committedSequence",
      "integrityState",
      "settlementState",
    ]) &&
    input.contractVersion === 1 &&
    typeof input.writerId === "string" &&
    input.writerId.trim().length > 0 &&
    input.writerId.length <= FROZEN_AUTHORITY_MAX_WRITER_ID_LENGTH &&
    Number.isSafeInteger(input.writerGeneration) &&
    (input.writerGeneration as number) > 0 &&
    Number.isSafeInteger(input.committedSequence) &&
    (input.committedSequence as number) >= 0 &&
    (input.integrityState === "healthy" ||
      input.integrityState === "degraded") &&
    (input.settlementState === "settled" ||
      input.settlementState === "missing" ||
      input.settlementState === "degraded")
  );
}

function hasWriterSequence(
  event: AnswerBlockLedgerEvent
): event is Exclude<
  AnswerBlockLedgerEvent,
  { kind: "cutoff" } | { kind: "session_end" }
> {
  return "sequence" in event;
}

function hasExactCommittedSequence(
  events: readonly ReturnTypeEvent[],
  committedSequence: number
): boolean {
  if (events.length !== committedSequence) return false;
  return events.every((event, index) => event.sequence === index + 1);
}

type ReturnTypeEvent = Extract<AnswerBlockLedgerEvent, { sequence: number }>;

function eventsAreCutoffSafe(
  events: readonly AnswerBlockLedgerEvent[],
  cutoffAtMs: number
): boolean {
  return events.every((event) => {
    if (
      event.kind === "turn" ||
      event.kind === "semantic_replay" ||
      event.kind === "semantic_replay_boundary"
    ) {
      return event.endedAtMs <= cutoffAtMs;
    }
    return event.occurredAtMs <= cutoffAtMs;
  });
}

function hasExactTerminalBoundary(
  events: readonly AnswerBlockLedgerEvent[],
  cutoffAtMs: number
): boolean {
  const terminalIndexes = events.flatMap((event, index) =>
    event.kind === "session_end" || event.kind === "cutoff" ? [index] : []
  );
  if (
    terminalIndexes.length !== 1 ||
    terminalIndexes[0] !== events.length - 1
  ) {
    return false;
  }
  const terminal = events.at(-1)!;
  return terminal.kind === "session_end" || terminal.kind === "cutoff"
    ? terminal.occurredAtMs === cutoffAtMs
    : false;
}

function integrityMarkersFollowPriorSpeech(
  events: readonly ReturnTypeEvent[]
): boolean {
  let latestSpeechEndMs = 0;
  for (const event of events) {
    if (event.kind === "integrity_boundary") {
      if (event.occurredAtMs < latestSpeechEndMs) return false;
      continue;
    }
    latestSpeechEndMs = Math.max(latestSpeechEndMs, event.endedAtMs);
  }
  return true;
}

function isPreservingMarker(
  event: ReturnTypeEvent
): event is Extract<AnswerBlockLedgerEvent, { kind: "integrity_boundary" }> {
  return (
    event.kind === "integrity_boundary" &&
    event.speaker === "interviewer" &&
    event.reason === "no_provider_confirmed_prefix"
  );
}

function classifyDerivationFailure(
  issues: readonly { code: string }[]
): TrustedAnswerBlockAuthorityFailureReason {
  if (issues.some(({ code }) => code === "invalid_replay_continuity")) {
    return "replay_conflict";
  }
  if (issues.some(({ code }) => code === "invalid_ledger_order")) {
    return "sequence_gap";
  }
  return "canonicalization_failure";
}

function classifyBlockExclusion(
  block: CandidateAnswerBlock,
  authority: FrozenAnswerBlockAuthorityV1
): TrustedAnswerBlockExclusionReason | null {
  if (
    block.prompt.length === 0 ||
    block.prompt.some(({ speaker }) => speaker !== "interviewer") ||
    block.response.some(({ speaker }) => speaker !== "user")
  ) {
    return "prompt_unbound";
  }
  if (block.closedBy === "interruption_marker") {
    return "unverified_terminal_tail";
  }
  if (block.closedBy === "session_end" || block.closedBy === "session_cutoff") {
    const writer = authority.writers[0]!;
    return authority.snapshotState === "complete" &&
      writer.settlementState === "settled"
      ? null
      : "unverified_terminal_tail";
  }
  return block.closedBy === "interviewer_follow_up" ||
    block.closedBy === "section_change"
    ? null
    : "logical_closure_unproven";
}

function findClosingBoundary(
  block: CandidateAnswerBlock,
  boundaries: readonly AnswerBlockBoundary[]
): AnswerBlockBoundary | undefined {
  const lastResponseEventId = block.response.at(-1)?.eventId ?? null;
  return boundaries.find(
    (boundary) =>
      boundary.kind === block.closedBy &&
      boundary.afterEventId === lastResponseEventId
  );
}

function toClosureKind(
  kind: AnswerBlockBoundaryKind
): TrustedAnswerBlockClosureKind {
  if (kind === "interviewer_follow_up") return kind;
  if (kind === "section_change") return kind;
  return "settled_terminal_boundary";
}

function failedProjection(
  failureReason: TrustedAnswerBlockAuthorityFailureReason
): TrustedAnswerBlockProjection {
  return {
    contractVersion: TRUSTED_ANSWER_BLOCK_PROJECTION_VERSION,
    status: "integrity_failure",
    numericalScoreAuthority: "withheld",
    trustedBlocks: [],
    trustedBlockIdentities: [],
    closureAuthorities: [],
    excludedBlocks: [],
    failureReason,
  };
}

/**
 * A content-bound identifier for later idempotent consumers. Canonical event
 * IDs remain citation authority and are deliberately absent so equivalent
 * transcript segmentation cannot change this identity.
 */
function buildTrustedAnswerBlockIdentity(
  block: CandidateAnswerBlock
): TrustedAnswerBlockIdentity {
  const closureKind = toClosureKind(block.closedBy);
  const material = JSON.stringify([
    TRUSTED_ANSWER_BLOCK_IDENTITY_VERSION,
    block.ordinal,
    block.promptText,
    block.responseText,
    block.startedAtMs,
    block.endedAtMs,
    closureKind,
  ]);
  return {
    contractVersion: TRUSTED_ANSWER_BLOCK_IDENTITY_VERSION,
    answerBlockId: block.answerBlockId,
    identity: `trusted-answer-block.v1:${sha256Hex(material)}`,
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

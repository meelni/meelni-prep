import {
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG,
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
} from "@meelni/agent";

export const PRODUCTION_WEB_SHADOW_CONNECTION_VERSION =
  "adaptive-interviewer-preview-shadow-operator-cell-connection.v2" as const;
export const PRODUCTION_WEB_SHADOW_TOPOLOGY =
  "production_project_shadow" as const;
export const PRODUCTION_WEB_SHADOW_LIVEKIT_URL =
  "wss://meelni-ek4vaisp.livekit.cloud" as const;
export const PRODUCTION_WEB_SHADOW_CONNECTION_MAX_BYTES = 32 * 1_024;

const MAXIMUM_TOKEN_BYTES = 16 * 1_024;
const MAXIMUM_LEASE_TTL_MS = 60 * 60 * 1_000;
const MAXIMUM_JSON_DEPTH = 4;
const MAXIMUM_JSON_VALUES = 32;
const MAXIMUM_CONTAINER_ENTRIES = 16;
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{40}$/;
const ROOM_NAME = /^preview-shadow-([0-9a-f]{64})$/;
const TOKEN = /^[\x21-\x7e]+$/;
const ROUNDS = new Set<string>(
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.rehearsal_matrix.rounds
);
const VOICE_CONDITIONS = new Set<string>(
  ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_RUNTIME_CONFIG.rehearsal_matrix.voice_conditions
);

const CONNECTION_KEYS = [
  "contract_version",
  "topology",
  "run_id",
  "lease_id",
  "candidate_git_sha",
  "preview_shadow_configuration_sha256",
  "selected_candidate_configuration_sha256",
  "session_binding_sha256",
  "round",
  "voice_condition",
  "expires_at",
  "room",
] as const;

const ROOM_KEYS = ["roomName", "token", "url"] as const;

export interface ProductionWebShadowConnection {
  readonly contract_version: typeof PRODUCTION_WEB_SHADOW_CONNECTION_VERSION;
  readonly topology: typeof PRODUCTION_WEB_SHADOW_TOPOLOGY;
  readonly run_id: string;
  readonly lease_id: string;
  readonly candidate_git_sha: string;
  readonly preview_shadow_configuration_sha256: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256;
  readonly selected_candidate_configuration_sha256: typeof ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256;
  readonly session_binding_sha256: string;
  readonly round: string;
  readonly voice_condition: string;
  readonly expires_at: string;
  readonly room: Readonly<{
    roomName: string;
    token: string;
    url: typeof PRODUCTION_WEB_SHADOW_LIVEKIT_URL;
  }>;
}

export interface ProductionWebShadowConnectionExpectation {
  readonly runId: string;
  readonly candidateGitSha: string;
  readonly now?: Date;
}

export function parseProductionWebShadowConnectionJson(
  contents: string,
  expected: ProductionWebShadowConnectionExpectation
): ProductionWebShadowConnection {
  if (
    typeof contents !== "string" ||
    utf8Bytes(contents) === 0 ||
    utf8Bytes(contents) > PRODUCTION_WEB_SHADOW_CONNECTION_MAX_BYTES ||
    !SHA256.test(expected.runId) ||
    !GIT_SHA.test(expected.candidateGitSha)
  ) {
    invalid();
  }
  const now = exactDate(expected.now ?? new Date());
  let parsed: unknown;
  try {
    parsed = parseJsonRejectingDuplicateKeys(contents);
  } catch {
    invalid();
  }
  const connection = exactRecord(parsed, CONNECTION_KEYS);
  const room = exactRecord(connection.room, ROOM_KEYS);
  const expiresAt = wholeSecondTimestamp(connection.expires_at);
  const roomMatch =
    typeof room.roomName === "string" ? ROOM_NAME.exec(room.roomName) : null;

  if (
    connection.contract_version !== PRODUCTION_WEB_SHADOW_CONNECTION_VERSION ||
    connection.topology !== PRODUCTION_WEB_SHADOW_TOPOLOGY ||
    connection.run_id !== expected.runId ||
    typeof connection.lease_id !== "string" ||
    !SHA256.test(connection.lease_id) ||
    connection.candidate_git_sha !== expected.candidateGitSha ||
    connection.preview_shadow_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 ||
    connection.selected_candidate_configuration_sha256 !==
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256 ||
    typeof connection.session_binding_sha256 !== "string" ||
    !SHA256.test(connection.session_binding_sha256) ||
    typeof connection.round !== "string" ||
    !ROUNDS.has(connection.round) ||
    typeof connection.voice_condition !== "string" ||
    !VOICE_CONDITIONS.has(connection.voice_condition) ||
    expiresAt.getTime() <= now.getTime() ||
    expiresAt.getTime() - now.getTime() > MAXIMUM_LEASE_TTL_MS ||
    roomMatch?.[1] !== connection.session_binding_sha256 ||
    room.url !== PRODUCTION_WEB_SHADOW_LIVEKIT_URL ||
    typeof room.token !== "string" ||
    !TOKEN.test(room.token) ||
    utf8Bytes(room.token) > MAXIMUM_TOKEN_BYTES
  ) {
    invalid();
  }

  return Object.freeze({
    contract_version: PRODUCTION_WEB_SHADOW_CONNECTION_VERSION,
    topology: PRODUCTION_WEB_SHADOW_TOPOLOGY,
    run_id: connection.run_id,
    lease_id: connection.lease_id,
    candidate_git_sha: connection.candidate_git_sha,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    selected_candidate_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_SELECTED_CANDIDATE_SHA256,
    session_binding_sha256: connection.session_binding_sha256,
    round: connection.round,
    voice_condition: connection.voice_condition,
    expires_at: expiresAt.toISOString(),
    room: Object.freeze({
      roomName: room.roomName as string,
      token: room.token,
      url: PRODUCTION_WEB_SHADOW_LIVEKIT_URL,
    }),
  });
}

function exactRecord<const TKeys extends readonly string[]>(
  value: unknown,
  keys: TKeys
): Record<TKeys[number], unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Reflect.ownKeys(value).length !== keys.length
  ) {
    invalid();
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      !descriptor ||
      !("value" in descriptor) ||
      !descriptor.enumerable ||
      !descriptor.configurable ||
      !descriptor.writable
    ) {
      invalid();
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot as Record<TKeys[number], unknown>;
}

function exactDate(value: Date): Date {
  if (
    value === null ||
    typeof value !== "object" ||
    Object.getPrototypeOf(value) !== Date.prototype ||
    Reflect.ownKeys(value).length !== 0
  ) {
    invalid();
  }
  const timestamp = Date.prototype.getTime.call(value);
  if (!Number.isFinite(timestamp)) invalid();
  return new Date(timestamp);
}

function wholeSecondTimestamp(value: unknown): Date {
  if (typeof value !== "string" || value.length !== 24) invalid();
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

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseJsonRejectingDuplicateKeys(contents: string): unknown {
  let offset = 0;
  let parsedValues = 0;
  const whitespace = () => {
    while (/[ \t\r\n]/.test(contents[offset] ?? "")) offset += 1;
  };
  const value = (depth = 0): unknown => {
    parsedValues += 1;
    if (parsedValues > MAXIMUM_JSON_VALUES || depth > MAXIMUM_JSON_DEPTH) {
      throw new Error("json_limit_invalid");
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
    const parsed = Number(match[0]);
    if (!Number.isFinite(parsed)) throw new Error("json_invalid");
    return parsed;
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
      if (entries.length >= MAXIMUM_CONTAINER_ENTRIES) {
        throw new Error("json_entry_count_invalid");
      }
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
      if (values.length >= MAXIMUM_CONTAINER_ENTRIES) {
        throw new Error("json_entry_count_invalid");
      }
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
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            throw new Error("json_invalid");
          }
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

function invalid(): never {
  throw new Error("production_web_shadow_connection_invalid");
}

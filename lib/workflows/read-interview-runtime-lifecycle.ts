import {
  INTERVIEW_LIFECYCLE_STATES,
  type InterviewLifecycleState,
} from "@meelni/core";

export const RUNTIME_LIFECYCLE_READ_CONTRACT_VERSION = 1 as const;
export const RUNTIME_LIFECYCLE_READ_EVENT_TYPE =
  "runtime_lifecycle_read" as const;
export const TRUSTED_LIFECYCLE_SNAPSHOT_CONTRACT_VERSION =
  "trusted-interview-lifecycle-snapshot.v1" as const;

export interface RuntimeLifecycleRead {
  contract_version: typeof RUNTIME_LIFECYCLE_READ_CONTRACT_VERSION;
  event_type: typeof RUNTIME_LIFECYCLE_READ_EVENT_TYPE;
  session_id: string;
  room_name: string;
  writer_id: string;
  writer_generation: number;
}

export interface TrustedRuntimeLifecycleSnapshot {
  contract_version: typeof TRUSTED_LIFECYCLE_SNAPSHOT_CONTRACT_VERSION;
  session_id: string;
  room_name: string;
  writer_id: string;
  writer_generation: number;
  state: InterviewLifecycleState;
  version: number;
}

export type ReadInterviewRuntimeLifecycleResult =
  | { ok: true; snapshot: TrustedRuntimeLifecycleSnapshot }
  | {
      ok: false;
      reason:
        | "invalid_request"
        | "session_mismatch"
        | "not_found"
        | "room_mismatch"
        | "writer_fenced";
    };

export interface InterviewRuntimeLifecycleStore {
  read(
    input: RuntimeLifecycleRead
  ): Promise<ReadInterviewRuntimeLifecycleResult>;
}

export async function readInterviewRuntimeLifecycle(input: {
  requestSessionId: string;
  request: unknown;
  store: InterviewRuntimeLifecycleStore;
}): Promise<ReadInterviewRuntimeLifecycleResult> {
  if (!isRuntimeLifecycleRead(input.request)) {
    return { ok: false, reason: "invalid_request" };
  }
  if (input.request.session_id !== input.requestSessionId) {
    return { ok: false, reason: "session_mismatch" };
  }
  return input.store.read(input.request);
}

export function isRuntimeLifecycleRead(
  value: unknown
): value is RuntimeLifecycleRead {
  if (!isRecord(value)) return false;
  return (
    hasExactKeys(value, [
      "contract_version",
      "event_type",
      "session_id",
      "room_name",
      "writer_id",
      "writer_generation",
    ]) &&
    value.contract_version === RUNTIME_LIFECYCLE_READ_CONTRACT_VERSION &&
    value.event_type === RUNTIME_LIFECYCLE_READ_EVENT_TYPE &&
    isBoundedString(value.session_id, 256) &&
    isBoundedString(value.room_name, 255) &&
    isBoundedString(value.writer_id, 256) &&
    Number.isSafeInteger(value.writer_generation) &&
    Number(value.writer_generation) > 0
  );
}

export function createTrustedRuntimeLifecycleSnapshot(input: {
  request: RuntimeLifecycleRead;
  state: string;
  version: number;
}): TrustedRuntimeLifecycleSnapshot | null {
  if (
    !INTERVIEW_LIFECYCLE_STATES.includes(
      input.state as InterviewLifecycleState
    ) ||
    !Number.isSafeInteger(input.version) ||
    input.version <= 0
  ) {
    return null;
  }
  return {
    contract_version: TRUSTED_LIFECYCLE_SNAPSHOT_CONTRACT_VERSION,
    session_id: input.request.session_id,
    room_name: input.request.room_name,
    writer_id: input.request.writer_id,
    writer_generation: input.request.writer_generation,
    state: input.state as InterviewLifecycleState,
    version: input.version,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    value === value.trim()
  );
}

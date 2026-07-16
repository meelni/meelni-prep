import type { AgentState, Speaker } from "@meelni/core";

export const TRANSCRIPT_DATA_TOPIC = "transcript";
export const TRANSCRIPT_CONTRACT_VERSION = 2 as const;
export const TRANSCRIPT_INTERRUPTION_MARKER_CONTRACT_VERSION = 1 as const;
export const TRANSCRIPT_RUNTIME_SETTLEMENT_CONTRACT_VERSION = 1 as const;
export const TRANSCRIPT_RUNTIME_WRITER_REGISTRATION_CONTRACT_VERSION =
  1 as const;
export const TRANSCRIPT_RUNTIME_SETTLEMENT_REQUEST_CONTRACT_VERSION =
  1 as const;
export const TRANSCRIPT_RUNTIME_SETTLEMENT_REQUEST_TOPIC =
  "meelni.transcript.settlement.request";

export type TranscriptDeliveryState = "delivered" | "partially_delivered";

export interface TranscriptEvent {
  contract_version: typeof TRANSCRIPT_CONTRACT_VERSION;
  event_id: string;
  row_id?: string;
  writer_id: string;
  writer_generation: number;
  sequence: number;
  session_id: string;
  room_name: string;
  speaker: Speaker;
  text: string;
  is_final: true;
  started_at: string;
  ended_at: string;
  audio_duration_ms: number;
  section: string;
  delivery_state: TranscriptDeliveryState;
}

export interface TranscriptInterruptionMarker {
  contract_version: typeof TRANSCRIPT_INTERRUPTION_MARKER_CONTRACT_VERSION;
  event_type: "integrity_unavailable";
  event_id: string;
  writer_id: string;
  writer_generation: number;
  sequence: number;
  session_id: string;
  room_name: string;
  speaker: Speaker;
  occurred_at: string;
  reason: "no_provider_confirmed_prefix" | "canonicalization_failed";
}

export interface TranscriptRuntimeSettlement {
  contract_version: typeof TRANSCRIPT_RUNTIME_SETTLEMENT_CONTRACT_VERSION;
  event_type: "runtime_settlement";
  session_id: string;
  room_name: string;
  writer_id: string;
  writer_generation: number;
  state: "settled" | "degraded";
  settled_at: string;
}

export interface TranscriptRuntimeWriterRegistration {
  contract_version: typeof TRANSCRIPT_RUNTIME_WRITER_REGISTRATION_CONTRACT_VERSION;
  event_type: "runtime_writer_registration";
  session_id: string;
  room_name: string;
  writer_id: string;
  registered_at: string;
}

export interface TranscriptRuntimeSettlementRequest {
  contract_version: typeof TRANSCRIPT_RUNTIME_SETTLEMENT_REQUEST_CONTRACT_VERSION;
  event_type: "runtime_settlement_request";
  request_id: string;
  session_id: string;
  room_name: string;
  writer_generation: number;
  cutoff_at: string;
}

export interface LegacyTranscriptEvent {
  speaker: Speaker;
  text: string;
  timestamp: number;
  is_final: true;
}

export type ParsedTranscriptEvent = TranscriptEvent | LegacyTranscriptEvent;

type TranscriptEventInput = Omit<
  TranscriptEvent,
  "contract_version" | "is_final"
>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function parseTimestamp(value: unknown): number | null {
  if (!isNonEmptyString(value)) {
    return null;
  }

  if (!CANONICAL_TIMESTAMP.test(value)) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) &&
    timestamp > 0 &&
    new Date(timestamp).toISOString() === value
    ? timestamp
    : null;
}

export function createTranscriptEvent(
  input: TranscriptEventInput
): TranscriptEvent {
  const event: TranscriptEvent = {
    ...input,
    contract_version: TRANSCRIPT_CONTRACT_VERSION,
    is_final: true,
  };

  if (!isTranscriptEvent(event)) {
    throw new Error("Invalid transcript event");
  }

  return event;
}

export function isTranscriptEvent(value: unknown): value is TranscriptEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TranscriptEvent>;
  const startedAt = parseTimestamp(candidate.started_at);
  const endedAt = parseTimestamp(candidate.ended_at);

  return (
    candidate.contract_version === TRANSCRIPT_CONTRACT_VERSION &&
    isNonEmptyString(candidate.event_id) &&
    (candidate.row_id === undefined || isNonEmptyString(candidate.row_id)) &&
    isNonEmptyString(candidate.writer_id) &&
    Number.isSafeInteger(candidate.writer_generation) &&
    (candidate.writer_generation ?? 0) > 0 &&
    Number.isSafeInteger(candidate.sequence) &&
    (candidate.sequence ?? 0) > 0 &&
    isNonEmptyString(candidate.session_id) &&
    isNonEmptyString(candidate.room_name) &&
    (candidate.speaker === "user" || candidate.speaker === "interviewer") &&
    isNonEmptyString(candidate.text) &&
    candidate.is_final === true &&
    startedAt !== null &&
    endedAt !== null &&
    endedAt > startedAt &&
    Number.isSafeInteger(candidate.audio_duration_ms) &&
    (candidate.audio_duration_ms ?? 0) > 0 &&
    Math.abs((candidate.audio_duration_ms ?? 0) - (endedAt - startedAt)) <= 1 &&
    isNonEmptyString(candidate.section) &&
    (candidate.delivery_state === "delivered" ||
      candidate.delivery_state === "partially_delivered")
  );
}

export function isTranscriptInterruptionMarker(
  value: unknown
): value is TranscriptInterruptionMarker {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TranscriptInterruptionMarker>;
  const expectedKeys = new Set([
    "contract_version",
    "event_type",
    "event_id",
    "writer_id",
    "writer_generation",
    "sequence",
    "session_id",
    "room_name",
    "speaker",
    "occurred_at",
    "reason",
  ]);
  return (
    Object.keys(value).length === expectedKeys.size &&
    Object.keys(value).every((key) => expectedKeys.has(key)) &&
    candidate.contract_version ===
      TRANSCRIPT_INTERRUPTION_MARKER_CONTRACT_VERSION &&
    candidate.event_type === "integrity_unavailable" &&
    isNonEmptyString(candidate.event_id) &&
    isNonEmptyString(candidate.writer_id) &&
    Number.isSafeInteger(candidate.writer_generation) &&
    (candidate.writer_generation ?? 0) > 0 &&
    Number.isSafeInteger(candidate.sequence) &&
    (candidate.sequence ?? 0) > 0 &&
    isNonEmptyString(candidate.session_id) &&
    isNonEmptyString(candidate.room_name) &&
    (candidate.speaker === "user" || candidate.speaker === "interviewer") &&
    parseTimestamp(candidate.occurred_at) !== null &&
    (candidate.reason === "no_provider_confirmed_prefix" ||
      candidate.reason === "canonicalization_failed")
  );
}

export function isTranscriptRuntimeSettlement(
  value: unknown
): value is TranscriptRuntimeSettlement {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<TranscriptRuntimeSettlement>;
  const expectedKeys = new Set([
    "contract_version",
    "event_type",
    "session_id",
    "room_name",
    "writer_id",
    "writer_generation",
    "state",
    "settled_at",
  ]);
  return (
    Object.keys(value).length === expectedKeys.size &&
    Object.keys(value).every((key) => expectedKeys.has(key)) &&
    candidate.contract_version ===
      TRANSCRIPT_RUNTIME_SETTLEMENT_CONTRACT_VERSION &&
    candidate.event_type === "runtime_settlement" &&
    isNonEmptyString(candidate.session_id) &&
    isNonEmptyString(candidate.room_name) &&
    isNonEmptyString(candidate.writer_id) &&
    Number.isSafeInteger(candidate.writer_generation) &&
    (candidate.writer_generation ?? 0) > 0 &&
    (candidate.state === "settled" || candidate.state === "degraded") &&
    parseTimestamp(candidate.settled_at) !== null
  );
}

export function isTranscriptRuntimeWriterRegistration(
  value: unknown
): value is TranscriptRuntimeWriterRegistration {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<TranscriptRuntimeWriterRegistration>;
  const expectedKeys = new Set([
    "contract_version",
    "event_type",
    "session_id",
    "room_name",
    "writer_id",
    "registered_at",
  ]);
  return (
    Object.keys(value).length === expectedKeys.size &&
    Object.keys(value).every((key) => expectedKeys.has(key)) &&
    candidate.contract_version ===
      TRANSCRIPT_RUNTIME_WRITER_REGISTRATION_CONTRACT_VERSION &&
    candidate.event_type === "runtime_writer_registration" &&
    isNonEmptyString(candidate.session_id) &&
    isNonEmptyString(candidate.room_name) &&
    isNonEmptyString(candidate.writer_id) &&
    parseTimestamp(candidate.registered_at) !== null
  );
}

export function isLegacyTranscriptEvent(
  value: unknown
): value is LegacyTranscriptEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LegacyTranscriptEvent> & {
    contract_version?: unknown;
  };

  return (
    candidate.contract_version === undefined &&
    (candidate.speaker === "user" || candidate.speaker === "interviewer") &&
    isNonEmptyString(candidate.text) &&
    typeof candidate.timestamp === "number" &&
    Number.isFinite(candidate.timestamp) &&
    candidate.timestamp > 0 &&
    candidate.is_final === true
  );
}

export function parseTranscriptEvent(
  rawEvent: string
): ParsedTranscriptEvent | null {
  try {
    const parsed: unknown = JSON.parse(rawEvent);

    if (isTranscriptEvent(parsed)) {
      return parsed;
    }

    return isLegacyTranscriptEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getTranscriptEventDedupeKey(
  event: ParsedTranscriptEvent
): string {
  if ("contract_version" in event) {
    return `v2:${event.event_id}`;
  }

  return `v1:${event.speaker}:${event.timestamp}:${event.text}`;
}

export function acceptTranscriptEventOnce(
  acceptedKeys: Set<string>,
  event: ParsedTranscriptEvent
): boolean {
  const key = getTranscriptEventDedupeKey(event);
  if (acceptedKeys.has(key)) {
    return false;
  }

  acceptedKeys.add(key);
  return true;
}

export function getTranscriptEventTiming(event: ParsedTranscriptEvent): {
  timestampMs: number;
  startedAtMs?: number;
  endedAtMs?: number;
  audioDurationMs?: number;
} {
  if (!("contract_version" in event)) {
    return { timestampMs: event.timestamp * 1000 };
  }

  return {
    timestampMs: Date.parse(event.started_at),
    startedAtMs: Date.parse(event.started_at),
    endedAtMs: Date.parse(event.ended_at),
    audioDurationMs: event.audio_duration_ms,
  };
}

export function normalizeAgentState(state: string): AgentState {
  const normalized = state.toLowerCase();

  if (
    normalized === "idle" ||
    normalized === "listening" ||
    normalized === "thinking" ||
    normalized === "speaking"
  ) {
    return normalized;
  }

  return "idle";
}

import type { AgentState, Speaker } from "@meelni/core";

export const TRANSCRIPT_DATA_TOPIC = "transcript";
export const TRANSCRIPT_CONTRACT_VERSION = 2 as const;

export type TranscriptDeliveryState = "delivered" | "partially_delivered";

export interface TranscriptEvent {
  contract_version: typeof TRANSCRIPT_CONTRACT_VERSION;
  event_id: string;
  writer_id: string;
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
    isNonEmptyString(candidate.writer_id) &&
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

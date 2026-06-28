import type { AgentState, Speaker } from "@meelni/core";

export const TRANSCRIPT_DATA_TOPIC = "transcript";

export interface TranscriptEvent {
  speaker: Speaker;
  text: string;
  timestamp: number;
  is_final: boolean;
}

export function createTranscriptEvent({
  speaker,
  text,
  timestamp = Date.now() / 1000,
  is_final = true
}: {
  speaker: Speaker;
  text: string;
  timestamp?: number;
  is_final?: boolean;
}): TranscriptEvent {
  return {
    speaker,
    text,
    timestamp,
    is_final
  };
}

export function isTranscriptEvent(value: unknown): value is TranscriptEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<TranscriptEvent>;

  return (
    (candidate.speaker === "user" || candidate.speaker === "interviewer") &&
    typeof candidate.text === "string" &&
    typeof candidate.timestamp === "number" &&
    typeof candidate.is_final === "boolean"
  );
}

export function parseTranscriptEvent(rawEvent: string): TranscriptEvent | null {
  try {
    const parsed = JSON.parse(rawEvent);
    return isTranscriptEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
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

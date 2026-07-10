import { isTranscriptEvent, type TranscriptEvent } from "@meelni/agent";

export const TRANSCRIPT_PERSISTENCE_LIMITS = {
  eventId: 512,
  writerId: 256,
  roomName: 255,
  text: 10_000,
  section: 100,
  audioDurationMs: 600_000,
} as const;

export interface TranscriptOrderingKey {
  timestamp: Date;
  writerId?: string;
  sequence?: number;
  eventId?: string;
}

export function compareTranscriptOrdering(
  left: TranscriptOrderingKey,
  right: TranscriptOrderingKey
): number {
  return (
    left.timestamp.getTime() - right.timestamp.getTime() ||
    (left.writerId ?? "").localeCompare(right.writerId ?? "") ||
    (left.sequence ?? 0) - (right.sequence ?? 0) ||
    (left.eventId ?? "").localeCompare(right.eventId ?? "")
  );
}

export type PersistTranscriptEventResult<TTurn> =
  | {
      ok: true;
      disposition: "created" | "existing";
      turn: TTurn;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "room_mismatch"
        | "event_conflict"
        | "writer_sequence_conflict"
        | "writer_order_conflict"
        | "session_closed"
        | "session_capacity_exceeded";
    };

export interface TranscriptIngestStore<TTurn> {
  persist(input: {
    userId: string;
    event: TranscriptEvent;
  }): Promise<PersistTranscriptEventResult<TTurn>>;
}

export type IngestTranscriptEventResult<TTurn> =
  | PersistTranscriptEventResult<TTurn>
  | {
      ok: false;
      reason: "invalid_event" | "session_mismatch";
    };

export async function ingestTranscriptEvent<TTurn>(input: {
  requestSessionId: string;
  userId: string;
  event: unknown;
  store: TranscriptIngestStore<TTurn>;
}): Promise<IngestTranscriptEventResult<TTurn>> {
  if (!isPersistableTranscriptEvent(input.event)) {
    return { ok: false, reason: "invalid_event" };
  }

  if (input.event.session_id !== input.requestSessionId) {
    return { ok: false, reason: "session_mismatch" };
  }

  return input.store.persist({ userId: input.userId, event: input.event });
}

export function isPersistableTranscriptEvent(
  event: unknown
): event is TranscriptEvent {
  if (!isTranscriptEvent(event)) return false;

  return (
    event.event_id.length <= TRANSCRIPT_PERSISTENCE_LIMITS.eventId &&
    event.writer_id.length <= TRANSCRIPT_PERSISTENCE_LIMITS.writerId &&
    event.room_name.length <= TRANSCRIPT_PERSISTENCE_LIMITS.roomName &&
    event.text.length <= TRANSCRIPT_PERSISTENCE_LIMITS.text &&
    event.section.length <= TRANSCRIPT_PERSISTENCE_LIMITS.section &&
    event.audio_duration_ms <= TRANSCRIPT_PERSISTENCE_LIMITS.audioDurationMs
  );
}

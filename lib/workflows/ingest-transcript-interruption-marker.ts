import {
  isTranscriptInterruptionMarker,
  type TranscriptInterruptionMarker,
} from "@meelni/agent";

export type PersistTranscriptInterruptionMarkerResult<TMarker> =
  | {
      ok: true;
      disposition: "created" | "existing";
      marker: TMarker;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "room_mismatch"
        | "event_conflict"
        | "writer_sequence_conflict"
        | "runtime_settled"
        | "session_closed"
        | "session_capacity_exceeded";
    };

export interface TranscriptInterruptionMarkerStore<TMarker> {
  persist(
    marker: TranscriptInterruptionMarker
  ): Promise<PersistTranscriptInterruptionMarkerResult<TMarker>>;
}

export type IngestTranscriptInterruptionMarkerResult<TMarker> =
  | PersistTranscriptInterruptionMarkerResult<TMarker>
  | { ok: false; reason: "invalid_marker" | "session_mismatch" };

export async function ingestTranscriptInterruptionMarker<TMarker>(input: {
  requestSessionId: string;
  marker: unknown;
  store: TranscriptInterruptionMarkerStore<TMarker>;
}): Promise<IngestTranscriptInterruptionMarkerResult<TMarker>> {
  if (!isPersistableTranscriptInterruptionMarker(input.marker)) {
    return { ok: false, reason: "invalid_marker" };
  }
  if (input.marker.session_id !== input.requestSessionId) {
    return { ok: false, reason: "session_mismatch" };
  }
  return input.store.persist(input.marker);
}

function isPersistableTranscriptInterruptionMarker(
  value: unknown
): value is TranscriptInterruptionMarker {
  return (
    isTranscriptInterruptionMarker(value) &&
    value.event_id.length <= 512 &&
    value.writer_id.length <= 256 &&
    value.room_name.length <= 255
  );
}

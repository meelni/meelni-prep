import {
  isTranscriptRuntimeWriterRegistration,
  type TranscriptRuntimeWriterRegistration,
} from "@meelni/agent";

export type PersistTranscriptRuntimeWriterResult<TWriter> =
  | {
      ok: true;
      disposition: "created" | "existing";
      writer: TWriter;
      writerGeneration: number;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "room_mismatch"
        | "registration_conflict"
        | "event_time_out_of_bounds"
        | "session_closed"
        | "writer_fenced";
    };

export interface TranscriptRuntimeWriterStore<TWriter> {
  register(
    registration: TranscriptRuntimeWriterRegistration
  ): Promise<PersistTranscriptRuntimeWriterResult<TWriter>>;
}

export type IngestTranscriptRuntimeWriterResult<TWriter> =
  | PersistTranscriptRuntimeWriterResult<TWriter>
  | { ok: false; reason: "invalid_registration" | "session_mismatch" };

export async function ingestTranscriptRuntimeWriter<TWriter>(input: {
  requestSessionId: string;
  registration: unknown;
  store: TranscriptRuntimeWriterStore<TWriter>;
}): Promise<IngestTranscriptRuntimeWriterResult<TWriter>> {
  if (!isPersistableTranscriptRuntimeWriterRegistration(input.registration)) {
    return { ok: false, reason: "invalid_registration" };
  }
  if (input.registration.session_id !== input.requestSessionId) {
    return { ok: false, reason: "session_mismatch" };
  }
  return input.store.register(input.registration);
}

function isPersistableTranscriptRuntimeWriterRegistration(
  value: unknown
): value is TranscriptRuntimeWriterRegistration {
  return (
    isTranscriptRuntimeWriterRegistration(value) &&
    value.writer_id.length <= 256 &&
    value.room_name.length <= 255
  );
}

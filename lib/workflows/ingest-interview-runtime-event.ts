import {
  isInterviewRuntimeEvent,
  type InterviewRuntimeEvent,
} from "@meelni/agent";

export type PersistInterviewRuntimeFailureResult =
  | {
      ok: true;
      disposition: "created" | "existing";
      sessionId: string;
      creditDisposition: string;
    }
  | {
      ok: false;
      reason:
        | "not_found"
        | "room_mismatch"
        | "event_conflict"
        | "session_closed";
    };

export interface InterviewRuntimeFailureStore {
  persistProviderFailure(
    event: InterviewRuntimeEvent & { type: "provider_failed" }
  ): Promise<PersistInterviewRuntimeFailureResult>;
}
export type IngestInterviewRuntimeEventResult =
  | (PersistInterviewRuntimeFailureResult & {
      creditDisposition?: string;
    })
  | { ok: false; reason: "invalid_event" | "session_mismatch" };

export async function ingestInterviewRuntimeEvent(input: {
  requestSessionId: string;
  event: unknown;
  store: InterviewRuntimeFailureStore;
}): Promise<IngestInterviewRuntimeEventResult> {
  if (
    !isInterviewRuntimeEvent(input.event) ||
    input.event.type !== "provider_failed" ||
    !input.event.runtime_ref ||
    input.event.event_id.length > 256 ||
    input.event.runtime_ref.provider.length > 64 ||
    input.event.runtime_ref.id.length > 255
  ) {
    return { ok: false, reason: "invalid_event" };
  }
  if (input.event.session_id !== input.requestSessionId) {
    return { ok: false, reason: "session_mismatch" };
  }

  const persisted = await input.store.persistProviderFailure(
    input.event as InterviewRuntimeEvent & { type: "provider_failed" }
  );
  if (!persisted.ok) return persisted;

  return persisted;
}

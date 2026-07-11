import {
  isTranscriptRuntimeSettlement,
  type TranscriptRuntimeSettlement,
} from "@meelni/agent";

export type PersistTranscriptRuntimeSettlementResult<TSettlement> =
  | { ok: true; disposition: "created" | "existing"; settlement: TSettlement }
  | {
      ok: false;
      reason:
        | "not_found"
        | "room_mismatch"
        | "settlement_conflict"
        | "event_time_out_of_bounds"
        | "session_closed";
    };

export interface TranscriptRuntimeSettlementStore<TSettlement> {
  persist(
    settlement: TranscriptRuntimeSettlement
  ): Promise<PersistTranscriptRuntimeSettlementResult<TSettlement>>;
}

export type IngestTranscriptRuntimeSettlementResult<TSettlement> =
  | PersistTranscriptRuntimeSettlementResult<TSettlement>
  | { ok: false; reason: "invalid_settlement" | "session_mismatch" };

export async function ingestTranscriptRuntimeSettlement<TSettlement>(input: {
  requestSessionId: string;
  settlement: unknown;
  store: TranscriptRuntimeSettlementStore<TSettlement>;
}): Promise<IngestTranscriptRuntimeSettlementResult<TSettlement>> {
  if (!isPersistableTranscriptRuntimeSettlement(input.settlement)) {
    return { ok: false, reason: "invalid_settlement" };
  }
  if (input.settlement.session_id !== input.requestSessionId) {
    return { ok: false, reason: "session_mismatch" };
  }
  return input.store.persist(input.settlement);
}

function isPersistableTranscriptRuntimeSettlement(
  value: unknown
): value is TranscriptRuntimeSettlement {
  return (
    isTranscriptRuntimeSettlement(value) &&
    value.writer_id.length <= 256 &&
    value.room_name.length <= 255
  );
}

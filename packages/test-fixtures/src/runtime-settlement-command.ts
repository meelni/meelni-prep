import type {
  TranscriptRuntimeSettlementCommand,
  TranscriptRuntimeSettlementCommandAck,
  TranscriptRuntimeSettlementCommandPull,
} from "@meelni/agent";

const sessionId = "6c310000-0000-4000-8000-000000000442";
const roomName = "interview-fixture-runtime-settlement";
const writerId = "fixture-writer-generation-2";

export const RUNTIME_SETTLEMENT_COMMAND_FIXTURE = {
  command: {
    contract_version: 1,
    event_type: "runtime_settlement_command",
    command_id: `runtime-settlement:${sessionId}:4`,
    session_id: sessionId,
    lifecycle_version: 4,
    room_name: roomName,
    writer_id: writerId,
    writer_generation: 2,
    cutoff_at: "2026-08-14T05:00:00.000Z",
    expires_at: "2026-08-14T05:00:20.000Z",
  } satisfies TranscriptRuntimeSettlementCommand,
  pull: {
    contract_version: 1,
    event_type: "runtime_settlement_command_pull",
    session_id: sessionId,
    room_name: roomName,
    writer_id: writerId,
    writer_generation: 2,
  } satisfies TranscriptRuntimeSettlementCommandPull,
  acknowledgement: {
    contract_version: 1,
    event_type: "runtime_settlement_command_ack",
    command_id: `runtime-settlement:${sessionId}:4`,
    session_id: sessionId,
    room_name: roomName,
    writer_id: writerId,
    writer_generation: 2,
    outcome: "settled",
  } satisfies TranscriptRuntimeSettlementCommandAck,
} as const;

export const RUNTIME_SETTLEMENT_FAILURE_FIXTURES = [
  {
    name: "lost_packet",
    trigger: "shutdown_pull",
    expected: "acknowledged",
  },
  {
    name: "candidate_disconnect",
    trigger: "participant_disconnect_pull",
    expected: "acknowledged",
  },
  {
    name: "replacement_writer",
    trigger: "stale_generation_pull",
    expected: "fenced",
  },
  {
    name: "bounded_timeout",
    trigger: "finalizer_expiry",
    expected: "expired",
  },
  {
    name: "already_terminal",
    trigger: "idempotent_replay",
    expected: "terminal_noop",
  },
] as const;

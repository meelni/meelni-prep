import {
  isInterviewReconnectDeadlineReached,
  parseInterviewDeadlineAt,
  serializeInterviewDeadlineAt,
} from "@/lib/internal/core";
import {
  createDrizzleInterviewReconnectStore,
  type InterviewReconnectStore,
} from "@/lib/db/session-reconnects";
import {
  inspectInterviewParticipantPresence,
  sendReliableInterviewRoomData,
  terminateInterviewRoom,
  type InterviewParticipantPresence,
  type LiveKitEnvironment,
  type ProviderResult,
  type TerminatedInterviewRoom,
} from "@/lib/internal/integrations";
import {
  TRANSCRIPT_RUNTIME_SETTLEMENT_REQUEST_CONTRACT_VERSION,
  TRANSCRIPT_RUNTIME_SETTLEMENT_REQUEST_TOPIC,
  type TranscriptRuntimeSettlementRequest,
} from "@/lib/internal/agent";
import {
  getTranscriptRuntimeSettlementReadiness,
  type TranscriptRuntimeSettlementReadiness,
} from "@/lib/db/transcripts";
import {
  endInterviewSessionWorkflow,
  type EndInterviewSessionResult,
} from "./end-interview-session";

export interface EnforceInterviewReconnectInput {
  sessionId: string;
  expectedVersion: number;
  deadlineAt: unknown;
  env: LiveKitEnvironment;
}

export interface EnforceInterviewReconnectDeps {
  store: InterviewReconnectStore;
  endSession(sessionId: string): Promise<EndInterviewSessionResult>;
  terminateRoom(input: {
    roomName: string;
    participantIdentity: string;
    env: LiveKitEnvironment;
  }): Promise<ProviderResult<TerminatedInterviewRoom>>;
  inspectPresence(input: {
    roomName: string;
    participantIdentity: string;
    env: LiveKitEnvironment;
  }): Promise<ProviderResult<InterviewParticipantPresence>>;
  getSettlementReadiness(
    sessionId: string
  ): Promise<TranscriptRuntimeSettlementReadiness>;
  requestRuntimeSettlement(input: {
    roomName: string;
    agentIdentity: string;
    request: TranscriptRuntimeSettlementRequest;
    env: LiveKitEnvironment;
  }): Promise<ProviderResult<unknown>>;
  waitForRuntimeSettlement(input: {
    sessionId: string;
    writerGeneration: number;
    timeoutMs: number;
  }): Promise<TranscriptRuntimeSettlementReadiness>;
}

export const INTERVIEW_TRANSCRIPT_SETTLEMENT_TIMEOUT_MS = 20_000;

export type EnforceInterviewReconnectResult =
  | {
      ok: false;
      disposition: "invalid_event" | "not_found" | "stale_event" | "not_due";
    }
  | {
      ok: true;
      disposition: "enforced" | "already_terminal" | "presence_recovered";
      completion: Extract<EndInterviewSessionResult, { ok: true }> | null;
      room: TerminatedInterviewRoom | null;
    };

export async function enforceInterviewReconnectWorkflow(
  input: EnforceInterviewReconnectInput,
  deps: EnforceInterviewReconnectDeps = createEnforceInterviewReconnectDeps()
): Promise<EnforceInterviewReconnectResult> {
  const deadlineAt = parseInterviewDeadlineAt(input.deadlineAt);
  if (!deadlineAt || !Number.isInteger(input.expectedVersion)) {
    return { ok: false, disposition: "invalid_event" };
  }

  let current = await deps.store.getById(input.sessionId);
  if (!current) return { ok: false, disposition: "not_found" };

  if (["completed", "abandoned", "failed"].includes(current.state)) {
    const room = await requireRoomTermination(
      current.roomName,
      current.userId,
      input.env,
      deps
    );
    await deps.store.markRoomCleanupComplete({
      sessionId: input.sessionId,
    });
    return {
      ok: true,
      disposition: "already_terminal",
      completion: null,
      room,
    };
  }

  let observedAgentIdentity: string | null = null;
  const isClaimedRetry =
    current.state === "ending" &&
    (current.terminalReason === "disconnect_timeout" ||
      current.terminalReason === "insufficient_signal") &&
    current.version === input.expectedVersion + 1 &&
    current.reconnectDeadlineOwner === "reconnect_grace" &&
    sameInstant(current.reconnectDeadlineAt, deadlineAt);

  if (!isClaimedRetry) {
    if (
      current.state !== "reconnecting" ||
      current.version !== input.expectedVersion ||
      current.reconnectDeadlineOwner !== "reconnect_grace" ||
      !sameInstant(current.reconnectDeadlineAt, deadlineAt)
    ) {
      return { ok: false, disposition: "stale_event" };
    }
    const databaseNow = await deps.store.getDatabaseTime();
    if (
      !isInterviewReconnectDeadlineReached({ deadlineAt, now: databaseNow })
    ) {
      return { ok: false, disposition: "not_due" };
    }

    const presence = await deps.inspectPresence({
      roomName: current.roomName,
      participantIdentity: current.userId,
      env: input.env,
    });
    if (!presence.ok) {
      throw Object.assign(new Error("LiveKit presence inspection failed"), {
        code: presence.error.code,
      });
    }
    observedAgentIdentity = presence.data.agent?.identity ?? null;
    if (
      presence.data.present &&
      presence.data.joined &&
      presence.data.joinedAt &&
      Number.isFinite(presence.data.joinedAt.getTime()) &&
      presence.data.joinedAt.getTime() < deadlineAt.getTime()
    ) {
      const recovered = await deps.store.recoverFromDuePresence({
        sessionId: input.sessionId,
        expectedVersion: input.expectedVersion,
        deadlineAt,
        joinedAt: presence.data.joinedAt,
        transitionedAt: await deps.store.getDatabaseTime(),
      });
      if (!recovered.applied) {
        return {
          ok: false,
          disposition:
            recovered.reason === "not_found" ? "not_found" : "stale_event",
        };
      }
      return {
        ok: true,
        disposition: "presence_recovered",
        completion: null,
        room: null,
      };
    }

    const claim = await deps.store.claimTimeout({
      sessionId: input.sessionId,
      expectedVersion: input.expectedVersion,
      deadlineAt,
      terminalReason: "disconnect_timeout",
      transitionedAt: await deps.store.getDatabaseTime(),
    });
    if (!claim.applied) {
      return {
        ok: false,
        disposition: claim.reason === "not_found" ? "not_found" : "stale_event",
      };
    }
    current = claim.current;
  }

  if (!observedAgentIdentity) {
    const presence = await deps.inspectPresence({
      roomName: current.roomName,
      participantIdentity: current.userId,
      env: input.env,
    });
    if (presence.ok) {
      observedAgentIdentity = presence.data.agent?.identity ?? null;
    }
  }

  const beforeRequest = await deps.getSettlementReadiness(input.sessionId);
  const writerGeneration = beforeRequest.currentWriterGeneration;
  if (
    beforeRequest.currentWriterState === null &&
    writerGeneration !== null &&
    observedAgentIdentity
  ) {
    const request = buildRuntimeSettlementRequest({
      sessionId: input.sessionId,
      roomName: current.roomName,
      writerGeneration,
      claimedVersion: current.version,
      cutoffAt: deadlineAt,
    });
    const requested = await deps.requestRuntimeSettlement({
      roomName: current.roomName,
      agentIdentity: observedAgentIdentity,
      request,
      env: input.env,
    });
    if (requested.ok) {
      await deps.waitForRuntimeSettlement({
        sessionId: input.sessionId,
        writerGeneration,
        timeoutMs: INTERVIEW_TRANSCRIPT_SETTLEMENT_TIMEOUT_MS,
      });
    }
  }

  let room: TerminatedInterviewRoom | null = null;
  let roomError: string | null = null;
  const terminated = await deps.terminateRoom({
    roomName: current.roomName,
    participantIdentity: current.userId,
    env: input.env,
  });
  if (terminated.ok) room = terminated.data;
  else roomError = terminated.error.code;

  const completion = await deps.endSession(input.sessionId);
  if (!completion.ok) return { ok: false, disposition: "not_found" };
  if (roomError) {
    throw Object.assign(
      new Error("LiveKit reconnect room termination failed"),
      {
        code: roomError,
      }
    );
  }

  await deps.store.markRoomCleanupComplete({
    sessionId: input.sessionId,
  });

  return { ok: true, disposition: "enforced", completion, room };
}

async function requireRoomTermination(
  roomName: string,
  participantIdentity: string,
  env: LiveKitEnvironment,
  deps: EnforceInterviewReconnectDeps
): Promise<TerminatedInterviewRoom> {
  const terminated = await deps.terminateRoom({
    roomName,
    participantIdentity,
    env,
  });
  if (!terminated.ok) {
    throw Object.assign(
      new Error("LiveKit reconnect room termination failed"),
      { code: terminated.error.code }
    );
  }
  return terminated.data;
}

export function createEnforceInterviewReconnectDeps(): EnforceInterviewReconnectDeps {
  return {
    store: createDrizzleInterviewReconnectStore(),
    endSession: (sessionId) =>
      endInterviewSessionWorkflow({
        sessionId,
        actor: { type: "system", source: "reconnect_timeout" },
        requestedTerminalReason: "disconnect_timeout",
      }),
    terminateRoom: terminateInterviewRoom,
    inspectPresence: inspectInterviewParticipantPresence,
    getSettlementReadiness: getTranscriptRuntimeSettlementReadiness,
    requestRuntimeSettlement: ({
      roomName,
      agentIdentity,
      request,
      env,
    }) =>
      sendReliableInterviewRoomData({
        roomName,
        destinationIdentity: agentIdentity,
        topic: TRANSCRIPT_RUNTIME_SETTLEMENT_REQUEST_TOPIC,
        data: new TextEncoder().encode(JSON.stringify(request)),
        env,
      }),
    waitForRuntimeSettlement: waitForRuntimeSettlement,
  };
}

export function buildRuntimeSettlementRequest(input: {
  sessionId: string;
  roomName: string;
  writerGeneration: number;
  claimedVersion: number;
  cutoffAt: Date;
}): TranscriptRuntimeSettlementRequest {
  const cutoffAt = serializeInterviewDeadlineAt(input.cutoffAt);
  return {
    contract_version:
      TRANSCRIPT_RUNTIME_SETTLEMENT_REQUEST_CONTRACT_VERSION,
    event_type: "runtime_settlement_request",
    request_id: `reconnect-settlement:${input.sessionId}:${input.claimedVersion}:${cutoffAt}`,
    session_id: input.sessionId,
    room_name: input.roomName,
    writer_generation: input.writerGeneration,
    cutoff_at: cutoffAt,
  };
}

async function waitForRuntimeSettlement(input: {
  sessionId: string;
  writerGeneration: number;
  timeoutMs: number;
}): Promise<TranscriptRuntimeSettlementReadiness> {
  const deadline = Date.now() + input.timeoutMs;
  let readiness = await getTranscriptRuntimeSettlementReadiness(
    input.sessionId
  );
  while (
    readiness.currentWriterGeneration === input.writerGeneration &&
    readiness.currentWriterState === null &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    readiness = await getTranscriptRuntimeSettlementReadiness(input.sessionId);
  }
  return readiness;
}

function sameInstant(left: Date | null, right: Date): boolean {
  return (
    left !== null &&
    serializeInterviewDeadlineAt(left) === serializeInterviewDeadlineAt(right)
  );
}

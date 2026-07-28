import {
  deriveInterviewDeadlineAt,
  serializeInterviewDeadlineAt,
} from "@/lib/internal/core";
import { getSessionForUserEndSettlement } from "@/lib/db/sessions";
import {
  getTranscriptRuntimeSettlementReadiness,
  type TranscriptRuntimeSettlementReadiness,
} from "@/lib/db/transcripts";
import {
  inspectInterviewParticipantPresence,
  sendReliableInterviewRoomData,
  type InterviewParticipantPresence,
  type LiveKitEnvironment,
  type ProviderResult,
} from "@/lib/internal/integrations";
import {
  TRANSCRIPT_RUNTIME_SETTLEMENT_REQUEST_CONTRACT_VERSION,
  TRANSCRIPT_RUNTIME_SETTLEMENT_REQUEST_TOPIC,
  type TranscriptRuntimeSettlementRequest,
} from "@/lib/internal/agent";

export interface UserEndRuntimeSettlement {
  settled: boolean;
  pending: number;
  failed: number;
  overflowed: false;
  integrityUnavailable: boolean;
}

export interface UserEndSettlementSession {
  userId: string;
  roomName: string | null;
  lifecycleState: string;
  startedAt: Date | null;
  config: unknown;
  databaseNow: Date;
}

export interface RequestUserEndRuntimeSettlementDeps {
  getSession(
    sessionId: string,
    userId: string
  ): Promise<UserEndSettlementSession | undefined>;
  getSettlementReadiness(
    sessionId: string
  ): Promise<TranscriptRuntimeSettlementReadiness>;
  inspectPresence(input: {
    roomName: string;
    participantIdentity: string;
    env: LiveKitEnvironment;
  }): Promise<ProviderResult<InterviewParticipantPresence>>;
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

export type RequestUserEndRuntimeSettlementResult =
  | {
      ok: true;
      settlement: UserEndRuntimeSettlement;
    }
  | {
      ok: false;
      reason: "not_found" | "runtime_not_ready" | "provider_unavailable";
      retryable: boolean;
    };

export const USER_END_RUNTIME_SETTLEMENT_TIMEOUT_MS = 20_000;

export async function requestUserEndRuntimeSettlementWorkflow(
  input: {
    sessionId: string;
    userId: string;
    env: LiveKitEnvironment;
    timeoutMs?: number;
  },
  deps: RequestUserEndRuntimeSettlementDeps = createRequestUserEndRuntimeSettlementDeps()
): Promise<RequestUserEndRuntimeSettlementResult> {
  const session = await deps.getSession(input.sessionId, input.userId);
  if (!session) {
    return { ok: false, reason: "not_found", retryable: false };
  }

  if (isEndingOrTerminal(session.lifecycleState)) {
    return {
      ok: true,
      settlement: {
        settled: true,
        pending: 0,
        failed: 0,
        overflowed: false,
        integrityUnavailable: false,
      },
    };
  }

  if (
    !session.roomName?.trim() ||
    !(session.startedAt instanceof Date) ||
    !Number.isFinite(session.startedAt.getTime()) ||
    !(session.databaseNow instanceof Date) ||
    !Number.isFinite(session.databaseNow.getTime())
  ) {
    return { ok: false, reason: "runtime_not_ready", retryable: true };
  }

  const initial = await deps.getSettlementReadiness(input.sessionId);
  if (initial.currentWriterState !== null) {
    return {
      ok: true,
      settlement: settlementFromReadiness(initial),
    };
  }
  const writerGeneration = initial.currentWriterGeneration;
  if (writerGeneration === null) {
    return { ok: false, reason: "runtime_not_ready", retryable: true };
  }

  const presence = await deps.inspectPresence({
    roomName: session.roomName,
    participantIdentity: session.userId,
    env: input.env,
  });
  if (!presence.ok) {
    return { ok: false, reason: "provider_unavailable", retryable: true };
  }
  const agentIdentity = presence.data.agent?.identity;
  if (!agentIdentity) {
    return { ok: false, reason: "runtime_not_ready", retryable: true };
  }

  const config = isRecord(session.config) ? session.config : {};
  const hardDeadlineAt = deriveInterviewDeadlineAt({
    startedAt: session.startedAt,
    durationMinutes: config.duration,
  });
  const cutoffAt = new Date(
    Math.min(session.databaseNow.getTime(), hardDeadlineAt.getTime())
  );
  const request = buildUserEndRuntimeSettlementRequest({
    sessionId: input.sessionId,
    roomName: session.roomName,
    writerGeneration,
    cutoffAt,
  });
  const requested = await deps.requestRuntimeSettlement({
    roomName: session.roomName,
    agentIdentity,
    request,
    env: input.env,
  });
  if (!requested.ok) {
    return { ok: false, reason: "provider_unavailable", retryable: true };
  }

  const readiness = await deps.waitForRuntimeSettlement({
    sessionId: input.sessionId,
    writerGeneration,
    timeoutMs: normalizeSettlementTimeout(input.timeoutMs),
  });
  if (
    readiness.currentWriterGeneration !== writerGeneration ||
    readiness.currentWriterState === null
  ) {
    return { ok: false, reason: "runtime_not_ready", retryable: true };
  }

  return {
    ok: true,
    settlement: settlementFromReadiness(readiness),
  };
}

function normalizeSettlementTimeout(timeoutMs: number | undefined): number {
  if (
    timeoutMs === undefined ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1
  ) {
    return USER_END_RUNTIME_SETTLEMENT_TIMEOUT_MS;
  }
  return Math.min(timeoutMs, USER_END_RUNTIME_SETTLEMENT_TIMEOUT_MS);
}

export function buildUserEndRuntimeSettlementRequest(input: {
  sessionId: string;
  roomName: string;
  writerGeneration: number;
  cutoffAt: Date;
}): TranscriptRuntimeSettlementRequest {
  const cutoffAt = serializeInterviewDeadlineAt(input.cutoffAt);
  return {
    contract_version: TRANSCRIPT_RUNTIME_SETTLEMENT_REQUEST_CONTRACT_VERSION,
    event_type: "runtime_settlement_request",
    request_id: `user-end-settlement:${input.sessionId}:${input.writerGeneration}:${cutoffAt}`,
    session_id: input.sessionId,
    room_name: input.roomName,
    writer_generation: input.writerGeneration,
    cutoff_at: cutoffAt,
  };
}

export function createRequestUserEndRuntimeSettlementDeps(): RequestUserEndRuntimeSettlementDeps {
  return {
    getSession: async (sessionId, userId) => {
      const session = await getSessionForUserEndSettlement(sessionId, userId);
      if (!session) return undefined;
      return {
        userId: session.userId,
        roomName: session.livekitRoomName,
        lifecycleState: session.lifecycleState,
        startedAt: session.startedAt,
        config: session.config,
        databaseNow: session.databaseNow,
      };
    },
    getSettlementReadiness: getTranscriptRuntimeSettlementReadiness,
    inspectPresence: inspectInterviewParticipantPresence,
    requestRuntimeSettlement: ({ roomName, agentIdentity, request, env }) =>
      sendReliableInterviewRoomData({
        roomName,
        destinationIdentity: agentIdentity,
        topic: TRANSCRIPT_RUNTIME_SETTLEMENT_REQUEST_TOPIC,
        data: new TextEncoder().encode(JSON.stringify(request)),
        env,
      }),
    waitForRuntimeSettlement,
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

function settlementFromReadiness(
  readiness: TranscriptRuntimeSettlementReadiness
): UserEndRuntimeSettlement {
  return {
    settled: readiness.currentWriterState !== null,
    pending: readiness.currentWriterState === null ? 1 : 0,
    failed: readiness.degradedCount + readiness.missingCount,
    overflowed: false,
    integrityUnavailable: !readiness.ready,
  };
}

function isEndingOrTerminal(state: string): boolean {
  return ["ending", "completed", "abandoned", "failed"].includes(state);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

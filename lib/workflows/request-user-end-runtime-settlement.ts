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
  terminalReason: string | null;
  endingAt: Date | null;
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

  if (isTerminal(session.lifecycleState)) {
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

  const timeoutMs = normalizeSettlementTimeout(input.timeoutMs);
  const deadline = Date.now() + timeoutMs;
  const initial = await withinDeadline(
    deps.getSettlementReadiness(input.sessionId),
    deadline
  );
  if (!initial) {
    return { ok: false, reason: "runtime_not_ready", retryable: true };
  }
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

  const presence = await withinDeadline(
    deps.inspectPresence({
      roomName: session.roomName,
      participantIdentity: session.userId,
      env: input.env,
    }),
    deadline
  );
  if (!presence) {
    return { ok: false, reason: "provider_unavailable", retryable: true };
  }
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
  const cutoffAt =
    session.lifecycleState === "ending" &&
    session.terminalReason === "user_end" &&
    session.endingAt
      ? session.endingAt
      : new Date(
          Math.min(session.databaseNow.getTime(), hardDeadlineAt.getTime())
        );
  const request = buildUserEndRuntimeSettlementRequest({
    sessionId: input.sessionId,
    roomName: session.roomName,
    writerGeneration,
    cutoffAt,
  });
  const requested = await withinDeadline(
    deps.requestRuntimeSettlement({
      roomName: session.roomName,
      agentIdentity,
      request,
      env: input.env,
    }),
    deadline
  );
  if (!requested) {
    return { ok: false, reason: "provider_unavailable", retryable: true };
  }
  if (!requested.ok) {
    return { ok: false, reason: "provider_unavailable", retryable: true };
  }

  const readiness = await withinDeadline(
    deps.waitForRuntimeSettlement({
      sessionId: input.sessionId,
      writerGeneration,
      timeoutMs: Math.max(1, deadline - Date.now()),
    }),
    deadline
  );
  if (!readiness) {
    return { ok: false, reason: "runtime_not_ready", retryable: true };
  }
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
        terminalReason: session.terminalReason,
        endingAt: session.endingAt,
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

function isTerminal(state: string): boolean {
  return ["completed", "abandoned", "failed"].includes(state);
}

async function withinDeadline<T>(
  work: Promise<T>,
  deadline: number
): Promise<T | null> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), remaining);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

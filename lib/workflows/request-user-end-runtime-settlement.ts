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
  expireRuntimeSettlementCommand,
  getRuntimeSettlementCommandForUserEnd,
  type PersistedRuntimeSettlementCommand,
} from "@/lib/db/runtime-settlement-commands";
import {
  inspectInterviewParticipantPresence,
  sendReliableInterviewRoomData,
  type InterviewParticipantPresence,
  type LiveKitInterviewTargetSource,
  type LiveKitEnvironment,
  type ProviderResult,
} from "@/lib/internal/integrations";
import {
  TRANSCRIPT_RUNTIME_SETTLEMENT_REQUEST_CONTRACT_VERSION,
  TRANSCRIPT_RUNTIME_SETTLEMENT_REQUEST_TOPIC,
  type TranscriptRuntimeSettlementRequest,
} from "@/lib/internal/agent";
import {
  reportRuntimeSettlementStage,
  type RuntimeSettlementStage,
  type RuntimeSettlementStageOutcome,
  type RuntimeSettlementStageReason,
} from "@/lib/operations/runtime-settlement-stage";

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
  getCommand?(
    sessionId: string,
    userId: string
  ): Promise<PersistedRuntimeSettlementCommand | undefined>;
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
  waitForCommand?(input: {
    sessionId: string;
    userId: string;
    commandId: string;
    timeoutMs: number;
  }): Promise<PersistedRuntimeSettlementCommand | undefined>;
  expireCommand?(commandId: string): Promise<void>;
  now?(): number;
  onStage?(event: {
    stage: RuntimeSettlementStage;
    targetSource: LiveKitInterviewTargetSource;
    outcome: RuntimeSettlementStageOutcome;
    reason: RuntimeSettlementStageReason;
    durationMs: number;
  }): void;
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
    env: LiveKitEnvironment | null;
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

  const durableCommand = await deps.getCommand?.(input.sessionId, input.userId);
  if (durableCommand) {
    return settleFromDurableCommand(input, durableCommand, deps);
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

  const targetResolutionStartedAt = runtimeNow(deps);
  if (!input.env) {
    return { ok: false, reason: "provider_unavailable", retryable: true };
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
    observeStage(deps, {
      stage: "target_resolution",
      targetSource: "none",
      outcome: "failed",
      reason: "provider_unavailable",
      durationMs: elapsedRuntime(deps, targetResolutionStartedAt),
    });
    return { ok: false, reason: "provider_unavailable", retryable: true };
  }
  if (!presence.ok) {
    observeStage(deps, {
      stage: "target_resolution",
      targetSource: "none",
      outcome: "failed",
      reason: "provider_unavailable",
      durationMs: elapsedRuntime(deps, targetResolutionStartedAt),
    });
    return { ok: false, reason: "provider_unavailable", retryable: true };
  }
  const targetSource =
    presence.data.targetSource ??
    (presence.data.agent ? "participant" : "none");
  const targetReason =
    presence.data.targetReason ??
    (presence.data.agent ? "participant_exact" : "agent_absent");
  const agentIdentity = presence.data.agent?.identity;
  if (!agentIdentity) {
    observeStage(deps, {
      stage: "target_resolution",
      targetSource,
      outcome: "deferred",
      reason: targetReason,
      durationMs: elapsedRuntime(deps, targetResolutionStartedAt),
    });
    return { ok: false, reason: "runtime_not_ready", retryable: true };
  }
  observeStage(deps, {
    stage: "target_resolution",
    targetSource,
    outcome: "succeeded",
    reason: targetReason,
    durationMs: elapsedRuntime(deps, targetResolutionStartedAt),
  });

  const generationRecheckStartedAt = runtimeNow(deps);
  const rechecked = await withinDeadline(
    deps.getSettlementReadiness(input.sessionId),
    deadline
  );
  if (!rechecked || rechecked.currentWriterGeneration !== writerGeneration) {
    observeStage(deps, {
      stage: "generation_recheck",
      targetSource,
      outcome: "deferred",
      reason: "generation_replaced",
      durationMs: elapsedRuntime(deps, generationRecheckStartedAt),
    });
    return { ok: false, reason: "runtime_not_ready", retryable: true };
  }
  if (rechecked.currentWriterState !== null) {
    observeStage(deps, {
      stage: "generation_recheck",
      targetSource,
      outcome: "succeeded",
      reason: "generation_already_settled",
      durationMs: elapsedRuntime(deps, generationRecheckStartedAt),
    });
    return {
      ok: true,
      settlement: settlementFromReadiness(rechecked),
    };
  }
  observeStage(deps, {
    stage: "generation_recheck",
    targetSource,
    outcome: "succeeded",
    reason: "generation_current",
    durationMs: elapsedRuntime(deps, generationRecheckStartedAt),
  });

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
  const packetSendStartedAt = runtimeNow(deps);
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
    observeStage(deps, {
      stage: "packet_send",
      targetSource,
      outcome: "failed",
      reason: "packet_send_failed",
      durationMs: elapsedRuntime(deps, packetSendStartedAt),
    });
    return { ok: false, reason: "provider_unavailable", retryable: true };
  }
  if (!requested.ok) {
    observeStage(deps, {
      stage: "packet_send",
      targetSource,
      outcome: "failed",
      reason: "packet_send_failed",
      durationMs: elapsedRuntime(deps, packetSendStartedAt),
    });
    return { ok: false, reason: "provider_unavailable", retryable: true };
  }
  observeStage(deps, {
    stage: "packet_send",
    targetSource,
    outcome: "succeeded",
    reason: "packet_sent",
    durationMs: elapsedRuntime(deps, packetSendStartedAt),
  });

  const durableAckStartedAt = runtimeNow(deps);
  const readiness = await withinDeadline(
    deps.waitForRuntimeSettlement({
      sessionId: input.sessionId,
      writerGeneration,
      timeoutMs: Math.max(1, deadline - Date.now()),
    }),
    deadline
  );
  if (!readiness) {
    observeStage(deps, {
      stage: "durable_ack",
      targetSource,
      outcome: "deferred",
      reason: "ack_missing",
      durationMs: elapsedRuntime(deps, durableAckStartedAt),
    });
    return { ok: false, reason: "runtime_not_ready", retryable: true };
  }
  if (
    readiness.currentWriterGeneration !== writerGeneration ||
    readiness.currentWriterState === null
  ) {
    observeStage(deps, {
      stage: "durable_ack",
      targetSource,
      outcome: "deferred",
      reason: "ack_missing",
      durationMs: elapsedRuntime(deps, durableAckStartedAt),
    });
    return { ok: false, reason: "runtime_not_ready", retryable: true };
  }
  observeStage(deps, {
    stage: "durable_ack",
    targetSource,
    outcome: "succeeded",
    reason:
      readiness.currentWriterState === "settled"
        ? "ack_settled"
        : "ack_degraded",
    durationMs: elapsedRuntime(deps, durableAckStartedAt),
  });

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
    getCommand: (sessionId, userId) =>
      getRuntimeSettlementCommandForUserEnd({ sessionId, userId }),
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
    waitForCommand: waitForRuntimeSettlementCommand,
    expireCommand: expireRuntimeSettlementCommand,
    now: () => performance.now(),
  };
}

async function settleFromDurableCommand(
  input: {
    sessionId: string;
    userId: string;
    env: LiveKitEnvironment | null;
    timeoutMs?: number;
  },
  initial: PersistedRuntimeSettlementCommand,
  deps: RequestUserEndRuntimeSettlementDeps
): Promise<RequestUserEndRuntimeSettlementResult> {
  if (initial.state === "acknowledged") {
    return {
      ok: true,
      settlement: settlementFromCommandReason(initial.terminalReason),
    };
  }
  if (initial.state === "terminal") {
    return { ok: false, reason: "runtime_not_ready", retryable: false };
  }

  const timeoutMs = normalizeSettlementTimeout(input.timeoutMs);
  const deadline = Math.min(
    Date.now() + timeoutMs,
    initial.expiresAt.getTime()
  );
  let targetSource: LiveKitInterviewTargetSource = "none";
  let agentIdentity: string | null = null;

  if (input.env) {
    const resolutionStartedAt = runtimeNow(deps);
    const hintDeadline = Math.min(deadline, Date.now() + 2_000);
    const presence = await withinDeadline(
      deps.inspectPresence({
        roomName: initial.roomName,
        participantIdentity: input.userId,
        env: input.env,
      }),
      hintDeadline
    );
    if (presence?.ok) {
      targetSource =
        presence.data.targetSource ??
        (presence.data.agent ? "participant" : "none");
      agentIdentity = presence.data.agent?.identity ?? null;
      observeStage(deps, {
        stage: "target_resolution",
        targetSource,
        outcome: agentIdentity ? "succeeded" : "deferred",
        reason:
          presence.data.targetReason ??
          (agentIdentity ? "participant_exact" : "agent_absent"),
        durationMs: elapsedRuntime(deps, resolutionStartedAt),
      });
    } else {
      observeStage(deps, {
        stage: "target_resolution",
        targetSource: "none",
        outcome: "failed",
        reason: "provider_unavailable",
        durationMs: elapsedRuntime(deps, resolutionStartedAt),
      });
    }
  } else {
    observeStage(deps, {
      stage: "target_resolution",
      targetSource: "none",
      outcome: "deferred",
      reason: "provider_unavailable",
      durationMs: 0,
    });
  }

  observeStage(deps, {
    stage: "generation_recheck",
    targetSource,
    outcome: "succeeded",
    reason: "generation_current",
    durationMs: 0,
  });

  if (agentIdentity && input.env && Date.now() < deadline) {
    const packetStartedAt = runtimeNow(deps);
    const requested = await withinDeadline(
      deps.requestRuntimeSettlement({
        roomName: initial.roomName,
        agentIdentity,
        request: buildRuntimeSettlementRequestFromCommand(initial),
        env: input.env,
      }),
      Math.min(deadline, Date.now() + 2_000)
    );
    observeStage(deps, {
      stage: "packet_send",
      targetSource,
      outcome: requested?.ok ? "succeeded" : "failed",
      reason: requested?.ok ? "packet_sent" : "packet_send_failed",
      durationMs: elapsedRuntime(deps, packetStartedAt),
    });
  }

  const ackStartedAt = runtimeNow(deps);
  const waited = await deps.waitForCommand?.({
    sessionId: input.sessionId,
    userId: input.userId,
    commandId: initial.commandId,
    timeoutMs: Math.max(1, deadline - Date.now()),
  });
  if (waited?.state === "acknowledged") {
    observeStage(deps, {
      stage: "durable_ack",
      targetSource,
      outcome: "succeeded",
      reason:
        waited.terminalReason === "settled" ? "ack_settled" : "ack_degraded",
      durationMs: elapsedRuntime(deps, ackStartedAt),
    });
    return {
      ok: true,
      settlement: settlementFromCommandReason(waited.terminalReason),
    };
  }

  await deps.expireCommand?.(initial.commandId);
  observeStage(deps, {
    stage: "durable_ack",
    targetSource,
    outcome: "deferred",
    reason: "ack_missing",
    durationMs: elapsedRuntime(deps, ackStartedAt),
  });
  return { ok: false, reason: "runtime_not_ready", retryable: false };
}

function buildRuntimeSettlementRequestFromCommand(
  command: PersistedRuntimeSettlementCommand
): TranscriptRuntimeSettlementRequest {
  return {
    contract_version: TRANSCRIPT_RUNTIME_SETTLEMENT_REQUEST_CONTRACT_VERSION,
    event_type: "runtime_settlement_request",
    request_id: command.commandId,
    session_id: command.sessionId,
    room_name: command.roomName,
    writer_generation: command.writerGeneration,
    cutoff_at: serializeInterviewDeadlineAt(command.cutoffAt),
  };
}

function settlementFromCommandReason(
  reason: PersistedRuntimeSettlementCommand["terminalReason"]
): UserEndRuntimeSettlement {
  const degraded = reason === "degraded";
  return {
    settled: reason === "settled" || degraded,
    pending: 0,
    failed: degraded ? 1 : 0,
    overflowed: false,
    integrityUnavailable: degraded,
  };
}

async function waitForRuntimeSettlementCommand(input: {
  sessionId: string;
  userId: string;
  commandId: string;
  timeoutMs: number;
}): Promise<PersistedRuntimeSettlementCommand | undefined> {
  const deadline = Date.now() + input.timeoutMs;
  let command = await getRuntimeSettlementCommandForUserEnd(input);
  while (
    command?.commandId === input.commandId &&
    command.state === "pending" &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    command = await getRuntimeSettlementCommandForUserEnd(input);
  }
  return command;
}

function observeStage(
  deps: RequestUserEndRuntimeSettlementDeps,
  event: Parameters<typeof reportRuntimeSettlementStage>[0]
): void {
  reportRuntimeSettlementStage(event);
  try {
    deps.onStage?.(event);
  } catch {
    // Observability never changes settlement behavior.
  }
}

function runtimeNow(deps: RequestUserEndRuntimeSettlementDeps): number {
  const value = deps.now?.() ?? performance.now();
  return Number.isFinite(value) ? value : 0;
}

function elapsedRuntime(
  deps: RequestUserEndRuntimeSettlementDeps,
  startedAt: number
): number {
  return Math.max(0, runtimeNow(deps) - startedAt);
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

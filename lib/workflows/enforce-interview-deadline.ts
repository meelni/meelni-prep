import {
  deriveInterviewDeadlineAt,
  normalizeInterviewDurationMinutes,
  parseInterviewDeadlineAt,
  serializeInterviewDeadlineAt,
} from "@/lib/internal/core";
import {
  terminateInterviewRoom,
  type LiveKitEnvironment,
  type ProviderResult,
  type TerminatedInterviewRoom,
} from "@/lib/internal/integrations";
import {
  acknowledgeInterviewDeadlineRoomCleanup,
  claimInterviewDeadline,
  getInterviewDeadlineSession,
  type ClaimInterviewDeadlineInput,
  type InterviewDeadlineSession,
} from "@/lib/db/session-deadlines";
import {
  dispatchInterviewSessionSettlement,
  settleInterviewSessionWorkflow,
  type EndInterviewSessionResult,
  type InterviewSessionSettlement,
  type SettleInterviewSessionResult,
} from "./end-interview-session";
import { createDrizzleInterviewReconnectStore } from "@/lib/db/session-reconnects";
import { scheduleInterviewDeadline } from "./schedule-interview-deadline";
import { isFeedbackDispatchReadyForVisibility } from "@/lib/db/feedback-dispatch";

export interface EnforceInterviewDeadlineInput {
  sessionId: string;
  deadlineAt: unknown;
  env: LiveKitEnvironment;
}

export interface QuarantineInvalidInterviewSessionInput {
  sessionId: string;
  recoveryReason: unknown;
  env: LiveKitEnvironment;
}

export interface EnforceInterviewDeadlineDeps {
  getSession(sessionId: string): Promise<InterviewDeadlineSession | undefined>;
  claimDue(input: ClaimInterviewDeadlineInput): Promise<boolean>;
  scheduleDeadline(input: {
    sessionId: string;
    deadlineAt: Date;
    deliveryId: string;
  }): Promise<unknown>;
  settleSession(sessionId: string): Promise<SettleInterviewSessionResult>;
  settleInvalidSession(
    sessionId: string
  ): Promise<SettleInterviewSessionResult>;
  dispatchSettlement(
    settlement: InterviewSessionSettlement
  ): Promise<Extract<EndInterviewSessionResult, { ok: true }>>;
  terminateRoom(input: {
    roomName: string;
    participantIdentity: string;
    env: LiveKitEnvironment;
  }): Promise<ProviderResult<TerminatedInterviewRoom>>;
  acknowledgeRoomCleanup(
    sessionId: string,
    disposition: "deleted" | "already_absent"
  ): Promise<void>;
  markRoomCleanupComplete(sessionId: string): Promise<void>;
}

export type EnforceInterviewDeadlineResult =
  | {
      ok: false;
      disposition: "invalid_event" | "not_found" | "stale_event" | "not_due";
    }
  | {
      ok: true;
      disposition: "enforced";
      completion: Extract<EndInterviewSessionResult, { ok: true }>;
      room: TerminatedInterviewRoom | null;
    };

export type QuarantineInvalidInterviewSessionResult =
  | {
      ok: false;
      disposition: "invalid_event" | "not_found" | "stale_event";
    }
  | {
      ok: true;
      disposition: "quarantined";
      completion: Extract<EndInterviewSessionResult, { ok: true }>;
      room: TerminatedInterviewRoom | null;
    };

export async function enforceInterviewDeadlineWorkflow(
  input: EnforceInterviewDeadlineInput,
  deps: EnforceInterviewDeadlineDeps = createEnforceInterviewDeadlineDeps()
): Promise<EnforceInterviewDeadlineResult> {
  const requestedDeadline = parseInterviewDeadlineAt(input.deadlineAt);
  if (!requestedDeadline) {
    return { ok: false, disposition: "invalid_event" };
  }

  let session = await deps.getSession(input.sessionId);
  if (!session?.startedAt) {
    return { ok: false, disposition: "not_found" };
  }

  const config = isRecord(session.config) ? session.config : {};
  const storedDeadline = deriveInterviewDeadlineAt({
    startedAt: session.startedAt,
    durationMinutes: normalizeInterviewDurationMinutes(config.duration),
  });
  if (
    serializeInterviewDeadlineAt(requestedDeadline) !==
    serializeInterviewDeadlineAt(storedDeadline)
  ) {
    return { ok: false, disposition: "stale_event" };
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (session.databaseNow.getTime() < storedDeadline.getTime()) {
      await rescheduleCanonicalDeadline(
        input.sessionId,
        storedDeadline,
        session,
        deps
      );
      return { ok: false, disposition: "not_due" };
    }

    if (session.state === "ending" || isTerminalState(session.state)) {
      if (
        !isHardDeadlineReason(session.terminalReason) ||
        session.deadlineRoomCleanupStatus === null
      ) {
        return { ok: false, disposition: "stale_event" };
      }
      break;
    }

    if (!isDeadlineClaimableState(session.state)) {
      return { ok: false, disposition: "stale_event" };
    }

    const claimed = await deps.claimDue({
      sessionId: input.sessionId,
      expectedState: session.state,
      expectedVersion: session.version,
      deadlineAt: storedDeadline,
      terminalReason: "time_limit",
    });
    if (claimed) break;

    const current = await deps.getSession(input.sessionId);
    if (!current?.startedAt) {
      return { ok: false, disposition: "not_found" };
    }
    const currentDeadline = deriveStoredDeadline(current);
    if (
      serializeInterviewDeadlineAt(currentDeadline) !==
      serializeInterviewDeadlineAt(storedDeadline)
    ) {
      return { ok: false, disposition: "stale_event" };
    }
    session = current;

    if (attempt === 3) {
      throw new Error("Interview deadline claim did not converge");
    }
  }

  const settlement = await deps.settleSession(input.sessionId);
  if (!settlement.ok) {
    return { ok: false, disposition: "not_found" };
  }

  let room: TerminatedInterviewRoom | null = null;
  let completionForDispatch = settlement.completion;
  if (settlement.completion.deadlineRoomCleanupStatus === "pending") {
    if (session.roomName) {
      const terminated = await deps.terminateRoom({
        roomName: session.roomName,
        participantIdentity: session.userId,
        env: input.env,
      });
      if (!terminated.ok) {
        throw createRoomTerminationError(terminated.error.code);
      }
      room = terminated.data;
    }

    const disposition = room?.disposition ?? "already_absent";
    await deps.acknowledgeRoomCleanup(input.sessionId, disposition);
    completionForDispatch = {
      ...settlement.completion,
      deadlineRoomCleanupStatus: disposition,
    };
  }

  await deps.markRoomCleanupComplete(input.sessionId);
  const completion = await deps.dispatchSettlement(completionForDispatch);
  requireFeedbackDispatchReady(completion);

  return { ok: true, disposition: "enforced", completion, room };
}

export async function quarantineInvalidInterviewSessionWorkflow(
  input: QuarantineInvalidInterviewSessionInput,
  deps: EnforceInterviewDeadlineDeps = createEnforceInterviewDeadlineDeps()
): Promise<QuarantineInvalidInterviewSessionResult> {
  if (input.recoveryReason !== "missing_started_at") {
    return { ok: false, disposition: "invalid_event" };
  }

  const session = await deps.getSession(input.sessionId);
  if (!session) {
    return { ok: false, disposition: "not_found" };
  }
  if (session.startedAt) {
    return { ok: false, disposition: "stale_event" };
  }

  let room: TerminatedInterviewRoom | null = null;
  let roomTerminationError: { code: string } | null = null;
  if (session.roomName) {
    const terminated = await deps.terminateRoom({
      roomName: session.roomName,
      participantIdentity: session.userId,
      env: input.env,
    });
    if (terminated.ok) {
      room = terminated.data;
    } else {
      roomTerminationError = { code: terminated.error.code };
    }
  }

  const settlement = await deps.settleInvalidSession(input.sessionId);
  if (!settlement.ok) {
    if (roomTerminationError) {
      throw createRoomTerminationError(roomTerminationError.code);
    }
    return { ok: false, disposition: "not_found" };
  }

  if (roomTerminationError) {
    throw createRoomTerminationError(roomTerminationError.code);
  }

  if (settlement.completion.deadlineRoomCleanupStatus === "pending") {
    await deps.acknowledgeRoomCleanup(
      input.sessionId,
      room?.disposition ?? "already_absent"
    );
  }

  await deps.markRoomCleanupComplete(input.sessionId);
  const completion = await deps.dispatchSettlement(settlement.completion);
  requireFeedbackDispatchReady(completion);

  return { ok: true, disposition: "quarantined", completion, room };
}

export function createEnforceInterviewDeadlineDeps(): EnforceInterviewDeadlineDeps {
  const reconnectStore = createDrizzleInterviewReconnectStore();
  return {
    getSession: getInterviewDeadlineSession,
    claimDue: claimInterviewDeadline,
    scheduleDeadline: scheduleInterviewDeadline,
    settleSession: (sessionId) =>
      settleInterviewSessionWorkflow({
        sessionId,
        actor: { type: "system", source: "hard_deadline" },
        requestedTerminalReason: "time_limit",
      }),
    settleInvalidSession: (sessionId) =>
      settleInterviewSessionWorkflow({
        sessionId,
        actor: { type: "system", source: "invalid_session_recovery" },
        requestedTerminalReason: "provider_failure",
      }),
    dispatchSettlement: dispatchInterviewSessionSettlement,
    terminateRoom: terminateInterviewRoom,
    acknowledgeRoomCleanup: acknowledgeInterviewDeadlineRoomCleanup,
    markRoomCleanupComplete: (sessionId) =>
      reconnectStore.markRoomCleanupComplete({ sessionId }),
  };
}

async function rescheduleCanonicalDeadline(
  sessionId: string,
  deadlineAt: Date,
  session: InterviewDeadlineSession,
  deps: EnforceInterviewDeadlineDeps
): Promise<void> {
  await deps.scheduleDeadline({
    sessionId,
    deadlineAt,
    deliveryId: `db-not-due:${session.version}:${session.databaseNow.toISOString()}`,
  });
}

function deriveStoredDeadline(session: InterviewDeadlineSession): Date {
  const config = isRecord(session.config) ? session.config : {};
  return deriveInterviewDeadlineAt({
    startedAt: session.startedAt!,
    durationMinutes: normalizeInterviewDurationMinutes(config.duration),
  });
}

function isDeadlineClaimableState(
  state: InterviewDeadlineSession["state"]
): state is ClaimInterviewDeadlineInput["expectedState"] {
  return ["created", "connecting", "active", "reconnecting"].includes(state);
}

function isTerminalState(state: InterviewDeadlineSession["state"]): boolean {
  return ["completed", "abandoned", "failed"].includes(state);
}

function isHardDeadlineReason(
  reason: InterviewDeadlineSession["terminalReason"]
): reason is "time_limit" | "insufficient_signal" {
  return reason === "time_limit" || reason === "insufficient_signal";
}

function requireFeedbackDispatchReady(
  result: Extract<EndInterviewSessionResult, { ok: true }>
): void {
  const status =
    result.dispatch?.dispatch?.status ??
    result.completion.feedback.dispatchStatus;
  if (!isFeedbackDispatchReadyForVisibility({ status })) {
    throw Object.assign(new Error("Deadline feedback dispatch is not ready"), {
      code: "feedback_dispatch_not_ready",
    });
  }
}

function createRoomTerminationError(code: string): Error {
  return Object.assign(new Error("LiveKit deadline room termination failed"), {
    code,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

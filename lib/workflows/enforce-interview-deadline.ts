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
  claimInterviewDeadline,
  getInterviewDeadlineSession,
  type ClaimInterviewDeadlineInput,
  type InterviewDeadlineSession,
} from "@/lib/db/session-deadlines";
import {
  endInterviewSessionWorkflow,
  endInterviewSessionWithValidationWorkflow,
  type EndInterviewSessionResult,
} from "./end-interview-session";
import { createDrizzleInterviewReconnectStore } from "@/lib/db/session-reconnects";
import { scheduleInterviewDeadline } from "./schedule-interview-deadline";
import {
  validateSessionCompleteness,
  type SessionValidation,
} from "@/lib/evaluation/session-validator";

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
  validateSession(sessionId: string): Promise<SessionValidation>;
  endSession(
    sessionId: string,
    validation: SessionValidation
  ): Promise<EndInterviewSessionResult>;
  endInvalidSession(sessionId: string): Promise<EndInterviewSessionResult>;
  terminateRoom(input: {
    roomName: string;
    participantIdentity: string;
    env: LiveKitEnvironment;
  }): Promise<ProviderResult<TerminatedInterviewRoom>>;
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
  let validation: SessionValidation | null = null;
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
      if (!isHardDeadlineReason(session.terminalReason)) {
        return { ok: false, disposition: "stale_event" };
      }
      break;
    }

    if (!isDeadlineClaimableState(session.state)) {
      return { ok: false, disposition: "stale_event" };
    }

    validation ??= await deps.validateSession(input.sessionId);
    const claimed = await deps.claimDue({
      sessionId: input.sessionId,
      expectedState: session.state,
      expectedVersion: session.version,
      deadlineAt: storedDeadline,
      terminalReason: validation.isValid ? "time_limit" : "insufficient_signal",
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

  validation ??= await deps.validateSession(input.sessionId);

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

  const completion = await deps.endSession(input.sessionId, validation);
  if (!completion.ok) {
    if (roomTerminationError) {
      throw Object.assign(
        new Error("LiveKit deadline room termination failed"),
        { code: roomTerminationError.code }
      );
    }
    return { ok: false, disposition: "not_found" };
  }

  if (roomTerminationError) {
    throw Object.assign(new Error("LiveKit deadline room termination failed"), {
      code: roomTerminationError.code,
    });
  }

  await deps.markRoomCleanupComplete(input.sessionId);

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

  const completion = await deps.endInvalidSession(input.sessionId);
  if (!completion.ok) {
    if (roomTerminationError) {
      throw createRoomTerminationError(roomTerminationError.code);
    }
    return { ok: false, disposition: "not_found" };
  }

  if (roomTerminationError) {
    throw createRoomTerminationError(roomTerminationError.code);
  }

  return { ok: true, disposition: "quarantined", completion, room };
}

export function createEnforceInterviewDeadlineDeps(): EnforceInterviewDeadlineDeps {
  const reconnectStore = createDrizzleInterviewReconnectStore();
  return {
    getSession: getInterviewDeadlineSession,
    claimDue: claimInterviewDeadline,
    scheduleDeadline: scheduleInterviewDeadline,
    validateSession: validateSessionCompleteness,
    endSession: (sessionId, validation) =>
      endInterviewSessionWithValidationWorkflow(
        {
          sessionId,
          actor: { type: "system", source: "hard_deadline" },
          requestedTerminalReason: "time_limit",
        },
        validation
      ),
    endInvalidSession: (sessionId) =>
      endInterviewSessionWorkflow({
        sessionId,
        actor: { type: "system", source: "invalid_session_recovery" },
        requestedTerminalReason: "provider_failure",
      }),
    terminateRoom: terminateInterviewRoom,
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

function createRoomTerminationError(code: string): Error {
  return Object.assign(new Error("LiveKit deadline room termination failed"), {
    code,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

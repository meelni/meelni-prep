import {
  deriveInterviewDeadlineAt,
  isInterviewDeadlineReached,
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
  getInterviewDeadlineSession,
  type InterviewDeadlineSession,
} from "@/lib/db/session-deadlines";
import {
  endInterviewSessionWorkflow,
  type EndInterviewSessionResult,
} from "./end-interview-session";
import { createDrizzleInterviewReconnectStore } from "@/lib/db/session-reconnects";

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
  endSession(sessionId: string): Promise<EndInterviewSessionResult>;
  endInvalidSession(sessionId: string): Promise<EndInterviewSessionResult>;
  terminateRoom(input: {
    roomName: string;
    participantIdentity: string;
    env: LiveKitEnvironment;
  }): Promise<ProviderResult<TerminatedInterviewRoom>>;
  markRoomCleanupComplete(sessionId: string): Promise<void>;
  now(): Date;
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

  const session = await deps.getSession(input.sessionId);
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
  if (
    !isInterviewDeadlineReached({ deadlineAt: storedDeadline, now: deps.now() })
  ) {
    return { ok: false, disposition: "not_due" };
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

  const completion = await deps.endSession(input.sessionId);
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
    endSession: (sessionId) =>
      endInterviewSessionWorkflow({
        sessionId,
        actor: { type: "system", source: "hard_deadline" },
        requestedTerminalReason: "time_limit",
      }),
    endInvalidSession: (sessionId) =>
      endInterviewSessionWorkflow({
        sessionId,
        actor: { type: "system", source: "invalid_session_recovery" },
        requestedTerminalReason: "provider_failure",
      }),
    terminateRoom: terminateInterviewRoom,
    markRoomCleanupComplete: (sessionId) =>
      reconnectStore.markRoomCleanupComplete({ sessionId }),
    now: () => new Date(),
  };
}

function createRoomTerminationError(code: string): Error {
  return Object.assign(new Error("LiveKit deadline room termination failed"), {
    code,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

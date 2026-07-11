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
  terminateInterviewRoom,
  type LiveKitEnvironment,
  type ProviderResult,
  type TerminatedInterviewRoom,
} from "@/lib/internal/integrations";
import {
  endInterviewSessionWorkflow,
  type EndInterviewSessionResult,
} from "./end-interview-session";
import {
  validateSessionCompleteness,
  type SessionValidation,
} from "@/lib/evaluation/session-validator";

export interface EnforceInterviewReconnectInput {
  sessionId: string;
  expectedVersion: number;
  deadlineAt: unknown;
  env: LiveKitEnvironment;
}

export interface EnforceInterviewReconnectDeps {
  store: InterviewReconnectStore;
  validate(sessionId: string): Promise<SessionValidation>;
  endSession(sessionId: string): Promise<EndInterviewSessionResult>;
  terminateRoom(input: {
    roomName: string;
    env: LiveKitEnvironment;
  }): Promise<ProviderResult<TerminatedInterviewRoom>>;
  now(): Date;
}

export type EnforceInterviewReconnectResult =
  | {
      ok: false;
      disposition: "invalid_event" | "not_found" | "stale_event" | "not_due";
    }
  | {
      ok: true;
      disposition: "enforced" | "already_terminal";
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

  const isClaimedRetry =
    current.state === "ending" &&
    (current.terminalReason === "disconnect_timeout" ||
      current.terminalReason === "insufficient_signal") &&
    current.version === input.expectedVersion + 1 &&
    sameInstant(current.reconnectDeadlineAt, deadlineAt);

  if (!isClaimedRetry) {
    if (
      current.state !== "reconnecting" ||
      current.version !== input.expectedVersion ||
      !sameInstant(current.reconnectDeadlineAt, deadlineAt)
    ) {
      return { ok: false, disposition: "stale_event" };
    }
    if (!isInterviewReconnectDeadlineReached({ deadlineAt, now: deps.now() })) {
      return { ok: false, disposition: "not_due" };
    }

    const claim = await deps.store.claimTimeout({
      sessionId: input.sessionId,
      expectedVersion: input.expectedVersion,
      deadlineAt,
      terminalReason: "disconnect_timeout",
      transitionedAt: deps.now(),
    });
    if (!claim.applied) {
      return {
        ok: false,
        disposition: claim.reason === "not_found" ? "not_found" : "stale_event",
      };
    }
    current = claim.current;
  }

  const validation = await deps.validate(input.sessionId);
  const terminalReason = validation.isValid
    ? "disconnect_timeout"
    : "insufficient_signal";
  if (current.terminalReason !== terminalReason) {
    const refined = await deps.store.refineTimeoutClaim({
      sessionId: input.sessionId,
      expectedVersion: input.expectedVersion + 1,
      deadlineAt,
      terminalReason,
    });
    if (!refined.applied) {
      return {
        ok: false,
        disposition:
          refined.reason === "not_found" ? "not_found" : "stale_event",
      };
    }
    current = refined.current;
  }

  let room: TerminatedInterviewRoom | null = null;
  let roomError: string | null = null;
  const terminated = await deps.terminateRoom({
    roomName: current.roomName,
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
  env: LiveKitEnvironment,
  deps: EnforceInterviewReconnectDeps
): Promise<TerminatedInterviewRoom> {
  const terminated = await deps.terminateRoom({ roomName, env });
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
    validate: validateSessionCompleteness,
    endSession: (sessionId) =>
      endInterviewSessionWorkflow({
        sessionId,
        actor: { type: "system", source: "reconnect_timeout" },
        requestedTerminalReason: "disconnect_timeout",
      }),
    terminateRoom: terminateInterviewRoom,
    now: () => new Date(),
  };
}

function sameInstant(left: Date | null, right: Date): boolean {
  return (
    left !== null &&
    serializeInterviewDeadlineAt(left) === serializeInterviewDeadlineAt(right)
  );
}

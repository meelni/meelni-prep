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
  terminateInterviewRoom,
  type InterviewParticipantPresence,
  type LiveKitEnvironment,
  type ProviderResult,
  type TerminatedInterviewRoom,
} from "@/lib/internal/integrations";
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
  waitUntil(deadlineAt: Date): Promise<void>;
}

export const INTERVIEW_TRANSCRIPT_DRAIN_MS = 2_000;

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
    if (
      (await deps.store.getDatabaseTime()).getTime() < deadlineAt.getTime() &&
      presence.data.present &&
      presence.data.joined &&
      presence.data.joinedAt &&
      Number.isFinite(presence.data.joinedAt.getTime()) &&
      presence.data.joinedAt.getTime() < deadlineAt.getTime()
    ) {
      const recovered = await deps.store.recoverFromPresence({
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

  let room: TerminatedInterviewRoom | null = null;
  let roomError: string | null = null;
  const terminated = await deps.terminateRoom({
    roomName: current.roomName,
    participantIdentity: current.userId,
    env: input.env,
  });
  if (terminated.ok) room = terminated.data;
  else roomError = terminated.error.code;

  await deps.waitUntil(
    new Date(current.lastTransitionAt.getTime() + INTERVIEW_TRANSCRIPT_DRAIN_MS)
  );

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
    waitUntil: async (deadlineAt) => {
      const remainingMs = deadlineAt.getTime() - Date.now();
      if (remainingMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingMs));
      }
    },
  };
}

function sameInstant(left: Date | null, right: Date): boolean {
  return (
    left !== null &&
    serializeInterviewDeadlineAt(left) === serializeInterviewDeadlineAt(right)
  );
}

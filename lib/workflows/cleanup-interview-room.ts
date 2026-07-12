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

export interface CleanupInterviewRoomInput {
  sessionId: string;
  env: LiveKitEnvironment;
}

export interface CleanupInterviewRoomDeps {
  store: InterviewReconnectStore;
  terminateRoom(input: {
    roomName: string;
    participantIdentity: string;
    env: LiveKitEnvironment;
  }): Promise<ProviderResult<TerminatedInterviewRoom>>;
  now(): Date;
}

export type CleanupInterviewRoomResult =
  | { ok: false; disposition: "not_found" | "not_terminal" }
  | {
      ok: true;
      disposition: "cleaned" | "already_clean";
      room: TerminatedInterviewRoom | null;
    };

export async function cleanupInterviewRoomWorkflow(
  input: CleanupInterviewRoomInput,
  deps: CleanupInterviewRoomDeps = createCleanupInterviewRoomDeps()
): Promise<CleanupInterviewRoomResult> {
  const session = await deps.store.getById(input.sessionId);
  if (!session) return { ok: false, disposition: "not_found" };
  if (!isTerminal(session.state)) {
    return { ok: false, disposition: "not_terminal" };
  }
  if (!session.roomCleanupPending) {
    return { ok: true, disposition: "already_clean", room: null };
  }

  await deps.store.markRoomCleanupAttempted({
    sessionId: session.sessionId,
    attemptedAt: deps.now(),
  });

  const terminated = await deps.terminateRoom({
    roomName: session.roomName,
    participantIdentity: session.userId,
    env: input.env,
  });
  if (!terminated.ok) {
    throw Object.assign(new Error("LiveKit terminal room cleanup failed"), {
      code: terminated.error.code,
    });
  }

  await deps.store.markRoomCleanupComplete({ sessionId: input.sessionId });
  return { ok: true, disposition: "cleaned", room: terminated.data };
}

export function createCleanupInterviewRoomDeps(): CleanupInterviewRoomDeps {
  return {
    store: createDrizzleInterviewReconnectStore(),
    terminateRoom: terminateInterviewRoom,
    now: () => new Date(),
  };
}

function isTerminal(state: string): boolean {
  return state === "completed" || state === "abandoned" || state === "failed";
}

import {
  createDrizzleInterviewReconnectStore,
  INTERVIEW_ROOM_PROVISIONING_LEASE_MS,
  type InterviewReconnectStore,
} from "@/lib/db/session-reconnects";
import {
  terminateInterviewRoom,
  type LiveKitEnvironment,
  type ProviderResult,
  type TerminatedInterviewRoom,
} from "@/lib/internal/integrations";
import { createFailedInterviewStartSettler } from "@/lib/billing/failed-interview-start";

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
  settleProvisioningCredit(reservationKey: string): Promise<void>;
}

export type CleanupInterviewRoomResult =
  | {
      ok: false;
      disposition: "not_found" | "not_terminal" | "not_due" | "stale_event";
    }
  | {
      ok: true;
      disposition: "cleaned" | "already_clean";
      room: TerminatedInterviewRoom | null;
    };

export async function cleanupInterviewRoomWorkflow(
  input: CleanupInterviewRoomInput,
  deps: CleanupInterviewRoomDeps = createCleanupInterviewRoomDeps()
): Promise<CleanupInterviewRoomResult> {
  let session = await deps.store.getById(input.sessionId);
  if (!session) return { ok: false, disposition: "not_found" };
  if (session.state === "connecting") {
    if (
      !session.roomProvisioningPending ||
      !session.roomProvisioningStartedAt
    ) {
      return { ok: false, disposition: "not_terminal" };
    }
    const staleBefore = new Date(
      deps.now().getTime() - INTERVIEW_ROOM_PROVISIONING_LEASE_MS
    );
    if (session.roomProvisioningStartedAt.getTime() > staleBefore.getTime()) {
      return { ok: false, disposition: "not_due" };
    }
    const claim = await deps.store.claimStaleProvisioning({
      sessionId: session.sessionId,
      expectedVersion: session.version,
      provisioningStartedAt: session.roomProvisioningStartedAt,
      staleBefore,
      transitionedAt: deps.now(),
    });
    if (!claim.applied) {
      return {
        ok: false,
        disposition: claim.reason === "not_found" ? "not_found" : "stale_event",
      };
    }
    session = claim.current;
  }
  if (!isTerminal(session.state)) {
    return { ok: false, disposition: "not_terminal" };
  }
  if (!session.roomCleanupPending && !session.roomProvisioningPending) {
    return { ok: true, disposition: "already_clean", room: null };
  }

  let room: TerminatedInterviewRoom | null = null;
  if (session.roomCleanupPending) {
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
    room = terminated.data;
  }

  if (session.roomProvisioningPending) {
    await deps.settleProvisioningCredit(
      `interview-start:${session.userId}:${session.roomName}`
    );
    await deps.store.markRoomProvisioningSettled({
      sessionId: input.sessionId,
    });
  }
  if (session.roomCleanupPending) {
    await deps.store.markRoomCleanupComplete({ sessionId: input.sessionId });
  }
  return { ok: true, disposition: "cleaned", room };
}

export function createCleanupInterviewRoomDeps(): CleanupInterviewRoomDeps {
  const settleProvisioningCredit = createFailedInterviewStartSettler();
  return {
    store: createDrizzleInterviewReconnectStore(),
    terminateRoom: terminateInterviewRoom,
    now: () => new Date(),
    settleProvisioningCredit,
  };
}

function isTerminal(state: string): boolean {
  return state === "completed" || state === "abandoned" || state === "failed";
}

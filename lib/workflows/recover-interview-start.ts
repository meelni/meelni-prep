import {
  createDrizzleInterviewStartRecoveryStore,
  type InterviewStartRecoveryStore,
} from "@/lib/db/interview-start-recovery";
import { convergeDrizzleInterviewCreditSettlement } from "@/lib/db/interview-credit-settlement";
import type { LiveKitEnvironment } from "@/lib/internal/integrations";
import { cleanupInterviewRoomWorkflow } from "./cleanup-interview-room";

export interface RecoverInterviewStartDeps {
  store: InterviewStartRecoveryStore;
  convergeCredit(sessionId: string): Promise<{
    disposition: string;
  }>;
  cleanupRoom(input: {
    sessionId: string;
    env: LiveKitEnvironment;
  }): Promise<{ ok: boolean; disposition: string }>;
  now(): Date;
}

export type RecoverInterviewStartResult =
  | { disposition: "no_longer_recoverable" }
  | {
      disposition: "recovered" | "settlement_recovered";
      creditDisposition: string;
      cleanupDisposition: string;
    };

export async function recoverInterviewStartWorkflow(
  input: { sessionId: string; env: LiveKitEnvironment | null },
  deps: RecoverInterviewStartDeps = createRecoverInterviewStartDeps()
): Promise<RecoverInterviewStartResult> {
  const claim = await deps.store.claim({
    sessionId: input.sessionId,
    now: deps.now(),
  });
  if (claim.disposition === "no_longer_recoverable") {
    return { disposition: "no_longer_recoverable" };
  }

  // The terminal row is committed before entering the ledger's user-first lock
  // order. A crash after this point leaves a terminal-v1-active reservation,
  // which remains discoverable by the next recovery pass.
  const credit = await deps.convergeCredit(input.sessionId);
  let cleanupDisposition = "cleanup_pending";
  if (input.env) {
    try {
      const cleanup = await deps.cleanupRoom({
        sessionId: input.sessionId,
        env: input.env,
      });
      cleanupDisposition = cleanup.disposition;
    } catch {
      // The terminal claim persisted room_cleanup_pending, so the independent
      // cleanup recovery worker can retry without delaying credit release.
      cleanupDisposition = "provider_retry_pending";
    }
  }

  return {
    disposition:
      claim.disposition === "claimed" ? "recovered" : "settlement_recovered",
    creditDisposition: credit.disposition,
    cleanupDisposition,
  };
}

export function createRecoverInterviewStartDeps(): RecoverInterviewStartDeps {
  return {
    store: createDrizzleInterviewStartRecoveryStore(),
    convergeCredit: convergeDrizzleInterviewCreditSettlement,
    cleanupRoom: cleanupInterviewRoomWorkflow,
    now: () => new Date(),
  };
}

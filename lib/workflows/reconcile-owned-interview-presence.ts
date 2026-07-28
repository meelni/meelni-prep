import { isSessionOwnedByUser } from "@/lib/db/sessions";
import type { LiveKitEnvironment } from "@/lib/internal/integrations";
import {
  reconcileInterviewPresenceWorkflow,
  type ReconcileInterviewPresenceResult,
} from "./reconcile-interview-presence";

export interface ReconcileOwnedInterviewPresenceDeps {
  isOwner(sessionId: string, userId: string): Promise<boolean>;
  reconcile(input: {
    sessionId: string;
    deliveryId: string;
    env: LiveKitEnvironment;
  }): Promise<ReconcileInterviewPresenceResult>;
}

export type ReconcileOwnedInterviewPresenceResult =
  | { ok: false; disposition: "not_found" }
  | ReconcileInterviewPresenceResult;

export async function reconcileOwnedInterviewPresenceWorkflow(
  input: {
    sessionId: string;
    userId: string;
    deliveryId: string;
    env: LiveKitEnvironment;
  },
  deps: ReconcileOwnedInterviewPresenceDeps = createDeps()
): Promise<ReconcileOwnedInterviewPresenceResult> {
  if (!(await deps.isOwner(input.sessionId, input.userId))) {
    return { ok: false, disposition: "not_found" };
  }
  return deps.reconcile({
    sessionId: input.sessionId,
    deliveryId: input.deliveryId,
    env: input.env,
  });
}

function createDeps(): ReconcileOwnedInterviewPresenceDeps {
  return {
    isOwner: isSessionOwnedByUser,
    reconcile: reconcileInterviewPresenceWorkflow,
  };
}

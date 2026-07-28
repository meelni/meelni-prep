import type { LiveKitEnvironment } from "@/lib/internal/integrations";
import {
  endInterviewSessionWorkflow,
  type EndInterviewSessionResult,
} from "./end-interview-session";
import {
  requestUserEndRuntimeSettlementWorkflow,
  type RequestUserEndRuntimeSettlementResult,
} from "./request-user-end-runtime-settlement";

export const EXPLICIT_END_RUNTIME_SETTLEMENT_TIMEOUT_MS = 5_000;

export type ExplicitEndRuntimeSettlementDisposition =
  | "settled"
  | "degraded"
  | "runtime_not_ready"
  | "provider_unavailable"
  | "not_found"
  | "failed";

export interface EndUserInterviewSessionDeps {
  requestRuntimeSettlement(input: {
    sessionId: string;
    userId: string;
    env: LiveKitEnvironment;
    timeoutMs: number;
  }): Promise<RequestUserEndRuntimeSettlementResult>;
  endSession(input: {
    sessionId: string;
    actor: { type: "user"; userId: string };
    requestedTerminalReason: "user_end";
  }): Promise<EndInterviewSessionResult>;
}

export type EndUserInterviewSessionResult = EndInterviewSessionResult & {
  runtimeSettlement: ExplicitEndRuntimeSettlementDisposition;
};

/**
 * Owns the complete explicit-user-end command.
 *
 * Runtime settlement improves transcript evidence, but it can never veto the
 * user's terminal intent. The database finalizer classifies missing or
 * degraded writer evidence and skips feedback when integrity is unavailable.
 */
export async function endUserInterviewSessionWorkflow(
  input: {
    sessionId: string;
    userId: string;
    env: LiveKitEnvironment | null;
  },
  deps: EndUserInterviewSessionDeps = createEndUserInterviewSessionDeps()
): Promise<EndUserInterviewSessionResult> {
  let runtimeSettlement: ExplicitEndRuntimeSettlementDisposition =
    "provider_unavailable";

  if (input.env) {
    try {
      const settlement = await deps.requestRuntimeSettlement({
        sessionId: input.sessionId,
        userId: input.userId,
        env: input.env,
        timeoutMs: EXPLICIT_END_RUNTIME_SETTLEMENT_TIMEOUT_MS,
      });
      runtimeSettlement = classifyRuntimeSettlement(settlement);
    } catch {
      runtimeSettlement = "failed";
    }
  }

  const completion = await deps.endSession({
    sessionId: input.sessionId,
    actor: { type: "user", userId: input.userId },
    requestedTerminalReason: "user_end",
  });
  return { ...completion, runtimeSettlement };
}

export function classifyRuntimeSettlement(
  result: RequestUserEndRuntimeSettlementResult
): ExplicitEndRuntimeSettlementDisposition {
  if (!result.ok) return result.reason;
  return result.settlement.settled &&
    !result.settlement.integrityUnavailable &&
    result.settlement.failed === 0
    ? "settled"
    : "degraded";
}

function createEndUserInterviewSessionDeps(): EndUserInterviewSessionDeps {
  return {
    requestRuntimeSettlement: requestUserEndRuntimeSettlementWorkflow,
    endSession: endInterviewSessionWorkflow,
  };
}

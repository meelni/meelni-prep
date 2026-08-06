const TERMINAL_SESSION_STATES = new Set(["completed", "abandoned", "failed"]);
const JOINABLE_SESSION_STATES = new Set([
  "created",
  "connecting",
  "active",
  "reconnecting",
]);

export type InterviewEndReconciliationResult =
  | {
      status: "resolved";
      nextHref: string;
      retryAttempted: boolean;
    }
  | {
      status: "waiting";
      retryAttempted: boolean;
      reason:
        | "truth_unavailable"
        | "terminalizing"
        | "end_retry_pending"
        | "state_unresolved";
    };

export async function reconcileAmbiguousInterviewEnd(input: {
  sessionId: string;
  retryEnd: boolean;
  request?: typeof fetch;
}): Promise<InterviewEndReconciliationResult> {
  const request = input.request ?? fetch;
  let lifecycle: unknown;

  try {
    const response = await request(`/api/session/${input.sessionId}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        status: "waiting",
        retryAttempted: false,
        reason: "truth_unavailable",
      };
    }
    const payload = (await response.json().catch(() => null)) as unknown;
    lifecycle = isRecord(payload) ? payload.session : null;
  } catch {
    return {
      status: "waiting",
      retryAttempted: false,
      reason: "truth_unavailable",
    };
  }

  if (!isRecord(lifecycle)) {
    return {
      status: "waiting",
      retryAttempted: false,
      reason: "state_unresolved",
    };
  }

  const lifecycleState = lifecycle.lifecycleState;
  // Terminal lifecycle truth proves the end command committed. The feedback
  // route owns settling, dispatch, generation, and recovery states.
  if (
    typeof lifecycleState === "string" &&
    TERMINAL_SESSION_STATES.has(lifecycleState)
  ) {
    return {
      status: "resolved",
      nextHref: `/feedback/${input.sessionId}/loading`,
      retryAttempted: false,
    };
  }

  if (lifecycleState === "ending") {
    return {
      status: "resolved",
      nextHref: `/feedback/${input.sessionId}/loading`,
      retryAttempted: false,
    };
  }

  if (
    !input.retryEnd ||
    typeof lifecycleState !== "string" ||
    !JOINABLE_SESSION_STATES.has(lifecycleState)
  ) {
    return {
      status: "waiting",
      retryAttempted: false,
      reason: "state_unresolved",
    };
  }

  try {
    const response = await request("/api/interview/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: input.sessionId }),
    });
    const payload = (await response.json().catch(() => null)) as unknown;
    if (response.ok) {
      return {
        status: "resolved",
        nextHref: readSafeFeedbackHref(payload, input.sessionId),
        retryAttempted: true,
      };
    }
  } catch {
    // The retry is also ambiguous. Durable truth remains authoritative and the
    // caller keeps the interview frozen before polling again.
  }

  return {
    status: "waiting",
    retryAttempted: true,
    reason: "end_retry_pending",
  };
}

function readSafeFeedbackHref(value: unknown, sessionId: string): string {
  const fallback = `/feedback/${sessionId}/loading`;
  if (!isRecord(value) || typeof value.nextHref !== "string") return fallback;
  return value.nextHref.startsWith(`/feedback/${sessionId}`)
    ? value.nextHref
    : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

import {
  isInterviewTerminalState,
  validateInterviewLifecycleTransition,
  type InterviewLifecycleState,
  type InterviewLifecycleTransitionErrorCode,
  type InterviewTerminalReason,
} from "@/lib/internal/core";
import {
  createDrizzleInterviewSessionLifecycleStore,
  type InterviewSessionLifecycleStore,
  type PersistedInterviewLifecycle,
} from "@/lib/db/session-lifecycle";

export interface TransitionInterviewSessionInput {
  sessionId: string;
  to: InterviewLifecycleState;
  terminalReason?: InterviewTerminalReason | null;
}

export interface TransitionInterviewSessionDeps {
  lifecycleStore: InterviewSessionLifecycleStore;
  now(): Date;
}

export type TransitionInterviewSessionResult =
  | {
      ok: true;
      disposition: "applied" | "idempotent";
      lifecycle: PersistedInterviewLifecycle;
    }
  | {
      ok: false;
      disposition: "conflict" | "not_found";
      lifecycle: PersistedInterviewLifecycle | null;
    }
  | {
      ok: false;
      disposition: "rejected";
      code: InterviewLifecycleTransitionErrorCode;
      lifecycle: PersistedInterviewLifecycle;
    };

export async function transitionInterviewSessionWorkflow(
  input: TransitionInterviewSessionInput,
  deps: TransitionInterviewSessionDeps = createTransitionInterviewSessionDeps()
): Promise<TransitionInterviewSessionResult> {
  const current = await deps.lifecycleStore.get(input.sessionId);
  if (!current) {
    return { ok: false, disposition: "not_found", lifecycle: null };
  }

  if (matchesRequestedState(current, input)) {
    return { ok: true, disposition: "idempotent", lifecycle: current };
  }
  if (isInterviewTerminalState(current.state)) {
    return { ok: false, disposition: "conflict", lifecycle: current };
  }

  const finalizingStoredClaim =
    current.state === "ending" && isInterviewTerminalState(input.to);
  const atomicProviderStartFailure =
    current.activatedAt === null &&
    (current.state === "created" || current.state === "connecting") &&
    input.to === "failed" &&
    input.terminalReason === "provider_failure";
  if (current.state === "ending" && !finalizingStoredClaim) {
    return { ok: false, disposition: "conflict", lifecycle: current };
  }
  if (
    finalizingStoredClaim &&
    input.terminalReason !== undefined &&
    input.terminalReason !== current.terminalReason
  ) {
    return { ok: false, disposition: "conflict", lifecycle: current };
  }

  const terminalReason = finalizingStoredClaim
    ? current.terminalReason
    : (input.terminalReason ?? null);

  const validation = atomicProviderStartFailure
    ? validateAtomicProviderStartFailure(current.state, terminalReason)
    : validateInterviewLifecycleTransition({
        from: current.state,
        to: input.to,
        terminalReason,
        activated: current.activatedAt !== null,
      });
  if (!validation.ok) {
    return {
      ok: false,
      disposition: "rejected",
      code: validation.code,
      lifecycle: current,
    };
  }

  const base = {
    sessionId: input.sessionId,
    expectedState: current.state,
    expectedVersion: current.version,
    transitionedAt: deps.now(),
  };
  let result;
  if (input.to === "ending" || isInterviewTerminalState(input.to)) {
    if (terminalReason === null) {
      return {
        ok: false,
        disposition: "rejected",
        code: "terminal_reason_required",
        lifecycle: current,
      };
    }
    result = await deps.lifecycleStore.compareAndSet({
      ...base,
      nextState: input.to,
      terminalReason,
    });
  } else {
    result = await deps.lifecycleStore.compareAndSet({
      ...base,
      nextState: input.to,
      terminalReason: null,
    });
  }

  if (result.applied) {
    return { ok: true, disposition: "applied", lifecycle: result.current };
  }
  if (result.reason === "not_found") {
    return { ok: false, disposition: "not_found", lifecycle: null };
  }
  if (result.current && matchesRequestedState(result.current, input)) {
    return {
      ok: true,
      disposition: "idempotent",
      lifecycle: result.current,
    };
  }

  return {
    ok: false,
    disposition: "conflict",
    lifecycle: result.current,
  };
}

function validateAtomicProviderStartFailure(
  from: InterviewLifecycleState,
  terminalReason: InterviewTerminalReason | null
): ReturnType<typeof validateInterviewLifecycleTransition> {
  const claim = validateInterviewLifecycleTransition({
    from,
    to: "ending",
    terminalReason,
    activated: false,
  });
  if (!claim.ok) return claim;

  return validateInterviewLifecycleTransition({
    from: "ending",
    to: "failed",
    terminalReason,
    activated: false,
  });
}

export function createTransitionInterviewSessionDeps(): TransitionInterviewSessionDeps {
  return {
    lifecycleStore: createDrizzleInterviewSessionLifecycleStore(),
    now: () => new Date(),
  };
}

function matchesRequestedState(
  current: PersistedInterviewLifecycle,
  input: TransitionInterviewSessionInput
): boolean {
  return (
    current.state === input.to &&
    (input.terminalReason === undefined ||
      current.terminalReason === input.terminalReason)
  );
}

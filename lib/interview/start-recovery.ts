import {
  isDefinitiveInterviewStartFailure,
  parseInterviewStartSessionId,
} from "./start-attempt";

export const INTERVIEW_START_RECOVERY_DEADLINE_MS = 60_000;
export const INTERVIEW_START_RECOVERY_RETRY_MS = 1_000;

export type InterviewStartRecoveryReason =
  | "request_failed"
  | "retryable_response"
  | "invalid_success_response";

export type InterviewStartRecoveryResult =
  | {
      disposition: "ready";
      response: Response;
      body: unknown;
      sessionId: string;
      requestCount: number;
      recovered: boolean;
    }
  | {
      disposition: "terminal";
      response: Response;
      body: unknown;
      requestCount: number;
      recovered: boolean;
    }
  | {
      disposition: "timed_out";
      requestCount: number;
      recovered: boolean;
    }
  | {
      disposition: "aborted";
      requestCount: number;
      recovered: boolean;
    };

interface RecoverInterviewStartInput {
  request(signal: AbortSignal): Promise<Response>;
  signal: AbortSignal;
  recoveryDeadlineMs?: number;
  defaultRetryMs?: number;
  now?: () => number;
  sleep?: (delayMs: number, signal: AbortSignal) => Promise<void>;
  onRecoveryStarted?: (reason: InterviewStartRecoveryReason) => void;
}

export interface InterviewStartSingleFlight {
  run<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T>;
  cancel(reason?: unknown): void;
  isActive(): boolean;
}

export function createInterviewStartSingleFlight(): InterviewStartSingleFlight {
  let active:
    | { controller: AbortController; promise: Promise<unknown> }
    | undefined;

  return {
    run<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
      if (active) return active.promise as Promise<T>;
      const controller = new AbortController();
      const promise = Promise.resolve()
        .then(() => work(controller.signal))
        .finally(() => {
          if (active?.promise === promise) active = undefined;
        });
      active = { controller, promise };
      return promise;
    },
    cancel(reason?: unknown) {
      active?.controller.abort(reason);
    },
    isActive() {
      return active !== undefined;
    },
  };
}

/**
 * Replays one durable start attempt until it returns joinable credentials or a
 * definitive failure. POST replay is intentional: the server owns the attempt
 * and already guarantees idempotent session, credit, room, and dispatch state.
 */
export async function recoverInterviewStart({
  request,
  signal,
  recoveryDeadlineMs = INTERVIEW_START_RECOVERY_DEADLINE_MS,
  defaultRetryMs = INTERVIEW_START_RECOVERY_RETRY_MS,
  now = Date.now,
  sleep = abortableSleep,
  onRecoveryStarted,
}: RecoverInterviewStartInput): Promise<InterviewStartRecoveryResult> {
  const startedAt = now();
  const deadlineAt = startedAt + recoveryDeadlineMs;
  let requestCount = 0;
  let recovered = false;

  const beginRecovery = (reason: InterviewStartRecoveryReason) => {
    if (recovered) return;
    recovered = true;
    onRecoveryStarted?.(reason);
  };

  while (!signal.aborted) {
    const requestBudgetMs = deadlineAt - now();
    if (requestBudgetMs <= 0) {
      return { disposition: "timed_out", requestCount, recovered };
    }
    requestCount += 1;
    let response: Response;
    let body: unknown;
    const requestController = new AbortController();
    const abortFromParent = () => requestController.abort(signal.reason);
    signal.addEventListener("abort", abortFromParent, { once: true });
    const requestDeadline = setTimeout(
      () => requestController.abort("recovery_deadline"),
      requestBudgetMs
    );

    try {
      response = await request(requestController.signal);
      body = await response.json().catch(() => null);
    } catch {
      if (signal.aborted) {
        return { disposition: "aborted", requestCount, recovered };
      }
      if (
        requestController.signal.aborted &&
        requestController.signal.reason === "recovery_deadline"
      ) {
        return { disposition: "timed_out", requestCount, recovered };
      }
      beginRecovery("request_failed");
      if (!(await waitForRetry(defaultRetryMs))) {
        return terminalWaitResult();
      }
      continue;
    } finally {
      clearTimeout(requestDeadline);
      signal.removeEventListener("abort", abortFromParent);
    }

    if (now() >= deadlineAt) {
      return { disposition: "timed_out", requestCount, recovered };
    }
    if (response.ok) {
      const sessionId = parseInterviewStartSessionId(body);
      if (sessionId) {
        return {
          disposition: "ready",
          response,
          body,
          sessionId,
          requestCount,
          recovered,
        };
      }
      beginRecovery("invalid_success_response");
    } else if (isDefinitiveInterviewStartFailure(response.status, body)) {
      return {
        disposition: "terminal",
        response,
        body,
        requestCount,
        recovered,
      };
    } else if (isRetryableStartResponse(response.status, body)) {
      beginRecovery("retryable_response");
    } else {
      return {
        disposition: "terminal",
        response,
        body,
        requestCount,
        recovered,
      };
    }

    const retryAfterMs = readRetryAfterMs(response, body, now());
    if (!(await waitForRetry(retryAfterMs ?? defaultRetryMs))) {
      return terminalWaitResult();
    }
  }

  return { disposition: "aborted", requestCount, recovered };

  async function waitForRetry(delayMs: number): Promise<boolean> {
    const remainingMs = deadlineAt - now();
    if (remainingMs <= 0 || delayMs >= remainingMs) return false;
    try {
      await sleep(Math.max(0, delayMs), signal);
      return !signal.aborted;
    } catch {
      return false;
    }
  }

  function terminalWaitResult(): InterviewStartRecoveryResult {
    return {
      disposition: signal.aborted ? "aborted" : "timed_out",
      requestCount,
      recovered,
    };
  }
}

export function readRetryAfterMs(
  response: Pick<Response, "headers">,
  body: unknown,
  nowMs = Date.now()
): number | null {
  const bodyDelay =
    isRecord(body) &&
    typeof body.retryAfterMs === "number" &&
    Number.isFinite(body.retryAfterMs) &&
    body.retryAfterMs > 0
      ? body.retryAfterMs
      : null;
  const header = response.headers.get("Retry-After");
  let headerDelay: number | null = null;

  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      headerDelay = seconds * 1_000;
    } else {
      const retryAt = Date.parse(header);
      if (Number.isFinite(retryAt)) headerDelay = Math.max(0, retryAt - nowMs);
    }
  }

  if (bodyDelay === null) return headerDelay;
  if (headerDelay === null) return bodyDelay;
  return Math.max(bodyDelay, headerDelay);
}

function isRetryableStartResponse(status: number, body: unknown): boolean {
  if (isRecord(body) && body.retryable === true) return true;
  return status >= 500 || [408, 425, 429].includes(status);
}

function abortableSleep(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

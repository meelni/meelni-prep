export const INTERVIEW_START_RECOVERY_UPPER_BOUND_MS = 45_000;
export const INTERVIEW_START_RECOVERY_RETRY_MS = 1_000;

export interface InterviewStartHttpResult {
  ok: boolean;
  status: number;
  body: unknown;
  retryAfter: string | null;
}

export interface InterviewStartRecoveryResult extends InterviewStartHttpResult {
  recovered: boolean;
  requestCount: number;
}

export class InterviewStartRecoveryDeadlineError extends Error {
  constructor() {
    super(
      "The interview is still starting. Your start attempt is safe; try again in a moment."
    );
    this.name = "InterviewStartRecoveryDeadlineError";
  }
}

export async function startInterviewWithRecovery({
  request,
  signal,
  recoveryUpperBoundMs = INTERVIEW_START_RECOVERY_UPPER_BOUND_MS,
  defaultRetryMs = INTERVIEW_START_RECOVERY_RETRY_MS,
  now = () => Date.now(),
  wait = waitForRetry,
  onRecoveryStarted,
}: {
  request(signal: AbortSignal): Promise<InterviewStartHttpResult>;
  signal: AbortSignal;
  recoveryUpperBoundMs?: number;
  defaultRetryMs?: number;
  now?: () => number;
  wait?: (durationMs: number, signal: AbortSignal) => Promise<void>;
  onRecoveryStarted?: () => void;
}): Promise<InterviewStartRecoveryResult> {
  let recoveryStartedAt: number | null = null;
  let requestCount = 0;
  let nextRetryMs = 0;

  while (true) {
    throwIfAborted(signal);

    if (recoveryStartedAt !== null) {
      const remainingMs = recoveryUpperBoundMs - (now() - recoveryStartedAt);
      if (remainingMs <= 0 || nextRetryMs > remainingMs) {
        throw new InterviewStartRecoveryDeadlineError();
      }
      if (nextRetryMs > 0) {
        await wait(nextRetryMs, signal);
      }
      throwIfAborted(signal);
    }

    requestCount += 1;
    const requestDeadline =
      recoveryStartedAt === null
        ? null
        : recoveryUpperBoundMs - (now() - recoveryStartedAt);
    const requestSignal = createBoundedSignal(signal, requestDeadline);
    try {
      const result = await request(requestSignal.signal);
      requestSignal.clear();
      if (
        recoveryStartedAt !== null &&
        now() - recoveryStartedAt >= recoveryUpperBoundMs
      ) {
        throw new InterviewStartRecoveryDeadlineError();
      }
      if (result.ok || !isRetryableInterviewStartResponse(result)) {
        return {
          ...result,
          recovered: recoveryStartedAt !== null,
          requestCount,
        };
      }

      if (recoveryStartedAt === null) {
        recoveryStartedAt = now();
        onRecoveryStarted?.();
      }
      nextRetryMs =
        readInterviewStartRetryAfterMs(result, now()) ?? defaultRetryMs;
    } catch (error) {
      requestSignal.clear();
      if (signal.aborted) throw error;
      if (error instanceof InterviewStartRecoveryDeadlineError) throw error;

      if (recoveryStartedAt === null) {
        recoveryStartedAt = now();
        onRecoveryStarted?.();
        nextRetryMs = 0;
      } else {
        nextRetryMs = defaultRetryMs;
      }
    }
  }
}

function createBoundedSignal(
  parentSignal: AbortSignal,
  timeoutMs: number | null
): { signal: AbortSignal; clear(): void } {
  if (timeoutMs === null) {
    return { signal: parentSignal, clear: () => undefined };
  }

  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal.reason);
  if (parentSignal.aborted) abortFromParent();
  else parentSignal.addEventListener("abort", abortFromParent, { once: true });
  const timeout = setTimeout(
    () => controller.abort(createAbortError()),
    Math.max(0, timeoutMs)
  );

  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timeout);
      parentSignal.removeEventListener("abort", abortFromParent);
    },
  };
}

export function isRetryableInterviewStartResponse(
  result: InterviewStartHttpResult
): boolean {
  if (result.ok) return false;
  if (isRecord(result.body) && result.body.retryable === false) return false;
  if (isRecord(result.body) && result.body.retryable === true) return true;
  return [408, 425, 429].includes(result.status) || result.status >= 500;
}

export function readInterviewStartRetryAfterMs(
  result: InterviewStartHttpResult,
  nowMs = Date.now()
): number | null {
  const bodyRetryAfterMs =
    isRecord(result.body) &&
    typeof result.body.retryAfterMs === "number" &&
    Number.isFinite(result.body.retryAfterMs) &&
    result.body.retryAfterMs > 0
      ? Math.ceil(result.body.retryAfterMs)
      : null;
  const headerRetryAfterMs = parseRetryAfterHeader(result.retryAfter, nowMs);

  if (bodyRetryAfterMs === null) return headerRetryAfterMs;
  if (headerRetryAfterMs === null) return bodyRetryAfterMs;
  return Math.max(bodyRetryAfterMs, headerRetryAfterMs);
}

function parseRetryAfterHeader(
  value: string | null,
  nowMs: number
): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }

  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return null;
  return Math.max(0, retryAt - nowMs);
}

function waitForRetry(durationMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(finish, durationMs);
    signal.addEventListener("abort", abort, { once: true });

    function finish() {
      signal.removeEventListener("abort", abort);
      resolve();
    }

    function abort() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      reject(signal.reason ?? createAbortError());
    }
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? createAbortError();
  }
}

function createAbortError(): Error {
  const error = new Error("Interview start was cancelled");
  error.name = "AbortError";
  return error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

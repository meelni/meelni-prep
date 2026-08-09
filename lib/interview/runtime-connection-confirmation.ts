import { INTERVIEW_START_SLOS } from "@/lib/operations/interview-start-slo";

export type InterviewRuntimeConfirmation =
  | {
      status: "ready";
      attempts: number;
      durationMs: number;
    }
  | {
      status: "terminal";
      reason: "authorization_lost";
      attempts: number;
      durationMs: number;
    }
  | {
      status: "delayed";
      reason: "readiness_deadline_exceeded" | "reconciliation_unavailable";
      attempts: number;
      durationMs: number;
    }
  | {
      status: "aborted";
      attempts: number;
      durationMs: number;
    };

export interface ConfirmInterviewRuntimeReadyOptions {
  sessionId: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  retryDelaysMs?: readonly number[];
  requestDeadlineMs?: number;
  readinessDeadlineMs?: number;
  now?: () => number;
}

const DEFAULT_RETRY_DELAYS_MS = [
  0, 500, 1_000, 2_000, 3_000, 4_000, 5_000, 5_000, 4_500,
] as const;

export async function confirmInterviewRuntimeReady({
  sessionId,
  signal,
  fetcher = fetch,
  wait = waitForDelay,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  requestDeadlineMs = INTERVIEW_START_SLOS.presence_reconciliation.upperBoundMs,
  readinessDeadlineMs = INTERVIEW_START_SLOS.canonical_readiness.upperBoundMs,
  now = Date.now,
}: ConfirmInterviewRuntimeReadyOptions): Promise<InterviewRuntimeConfirmation> {
  const startedAt = now();
  let attempts = 0;

  for (const delayMs of retryDelaysMs) {
    if (signal?.aborted) return abortedResult(attempts, startedAt, now);
    const elapsedBeforeWait = elapsedMs(startedAt, now);
    const remainingBeforeWait = readinessDeadlineMs - elapsedBeforeWait;
    if (remainingBeforeWait <= 0) {
      return delayedResult(
        "readiness_deadline_exceeded",
        attempts,
        startedAt,
        now
      );
    }
    if (delayMs > 0) {
      await wait(Math.min(delayMs, remainingBeforeWait), signal);
    }
    if (signal?.aborted) return abortedResult(attempts, startedAt, now);

    const elapsedBeforeRequest = elapsedMs(startedAt, now);
    const remainingBeforeRequest = readinessDeadlineMs - elapsedBeforeRequest;
    if (remainingBeforeRequest <= 0) {
      return delayedResult(
        "readiness_deadline_exceeded",
        attempts,
        startedAt,
        now
      );
    }

    attempts += 1;
    const result = await fetchPresenceWithDeadline({
      sessionId,
      signal,
      fetcher,
      timeoutMs: Math.min(requestDeadlineMs, remainingBeforeRequest),
    });
    if (result.type === "aborted") {
      return abortedResult(attempts, startedAt, now);
    }
    if (result.type !== "response") continue;

    const body = (await result.response.json().catch(() => null)) as {
      ready?: unknown;
      error?: unknown;
    } | null;
    if (result.response.ok && body?.ready === true) {
      return {
        status: "ready",
        attempts,
        durationMs: elapsedMs(startedAt, now),
      };
    }
    if (
      result.response.status === 401 ||
      result.response.status === 404 ||
      (result.response.status === 409 && body?.error === "session_not_joinable")
    ) {
      return {
        status: "terminal",
        reason: "authorization_lost",
        attempts,
        durationMs: elapsedMs(startedAt, now),
      };
    }
  }

  return delayedResult(
    elapsedMs(startedAt, now) >= readinessDeadlineMs
      ? "readiness_deadline_exceeded"
      : "reconciliation_unavailable",
    attempts,
    startedAt,
    now
  );
}

type PresenceFetchResult =
  | { type: "response"; response: Response }
  | { type: "timeout" }
  | { type: "aborted" }
  | { type: "error" };

async function fetchPresenceWithDeadline(input: {
  sessionId: string;
  signal?: AbortSignal;
  fetcher: typeof fetch;
  timeoutMs: number;
}): Promise<PresenceFetchResult> {
  if (input.signal?.aborted) return { type: "aborted" };
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let removeAbortListener: () => void = () => undefined;

  const fetchResult = Promise.resolve()
    .then(() =>
      input.fetcher("/api/interview/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: input.sessionId }),
        signal: controller.signal,
      })
    )
    .then((response): PresenceFetchResult => ({ type: "response", response }))
    .catch(
      (): PresenceFetchResult =>
        input.signal?.aborted ? { type: "aborted" } : { type: "error" }
    );

  const timeoutResult = new Promise<PresenceFetchResult>((resolve) => {
    timeout = setTimeout(
      () => {
        controller.abort();
        resolve({ type: "timeout" });
      },
      Math.max(1, input.timeoutMs)
    );
  });
  const abortResult = new Promise<PresenceFetchResult>((resolve) => {
    if (!input.signal) return;
    const abort = () => {
      controller.abort(input.signal?.reason);
      resolve({ type: "aborted" });
    };
    input.signal.addEventListener("abort", abort, { once: true });
    removeAbortListener = () =>
      input.signal?.removeEventListener("abort", abort);
  });

  try {
    return await Promise.race([fetchResult, timeoutResult, abortResult]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    removeAbortListener();
  }
}

function elapsedMs(startedAt: number, now: () => number): number {
  return Math.max(0, now() - startedAt);
}

function delayedResult(
  reason: Extract<
    InterviewRuntimeConfirmation,
    { status: "delayed" }
  >["reason"],
  attempts: number,
  startedAt: number,
  now: () => number
): InterviewRuntimeConfirmation {
  return {
    status: "delayed",
    reason,
    attempts,
    durationMs: elapsedMs(startedAt, now),
  };
}

function abortedResult(
  attempts: number,
  startedAt: number,
  now: () => number
): InterviewRuntimeConfirmation {
  return { status: "aborted", attempts, durationMs: elapsedMs(startedAt, now) };
}

function waitForDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timeout = setTimeout(resolve, delayMs);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true }
    );
  });
}

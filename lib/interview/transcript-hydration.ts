export type DurableTranscriptHydrationState =
  | "loading"
  | "ready"
  | "empty"
  | "retrying"
  | "degraded";

export type TranscriptHydrationResponseDisposition =
  | "success"
  | "retryable"
  | "authorization_lost"
  | "failed";

export const TRANSCRIPT_HYDRATION_MAX_ATTEMPTS = 3;

const DEFAULT_RETRY_DELAYS_MS = [250, 750] as const;
const MAX_RETRY_DELAY_MS = 3_000;

export function classifyTranscriptHydrationResponse(
  status: number
): TranscriptHydrationResponseDisposition {
  if (status >= 200 && status < 300) return "success";
  if (status === 401 || status === 403 || status === 404) {
    return "authorization_lost";
  }
  if (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status >= 500 && status <= 599)
  ) {
    return "retryable";
  }
  return "failed";
}

export function getTranscriptHydrationRetryDelayMs(
  response: Response | null,
  failedAttemptIndex: number
): number {
  const retryAfterSeconds = Number(response?.headers.get("Retry-After"));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1_000, MAX_RETRY_DELAY_MS);
  }
  return (
    DEFAULT_RETRY_DELAYS_MS[
      Math.min(failedAttemptIndex, DEFAULT_RETRY_DELAYS_MS.length - 1)
    ] ?? MAX_RETRY_DELAY_MS
  );
}

export function waitForTranscriptHydrationRetry(
  delayMs: number,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    const handleAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function abortError(): Error {
  const error = new Error("Transcript hydration retry aborted");
  error.name = "AbortError";
  return error;
}

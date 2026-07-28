export type InterviewRuntimeConfirmation = "ready" | "unavailable";

export interface ConfirmInterviewRuntimeReadyOptions {
  sessionId: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  retryDelaysMs?: readonly number[];
}

const DEFAULT_RETRY_DELAYS_MS = [0, 500, 1_000, 2_000, 4_000, 7_500] as const;

export async function confirmInterviewRuntimeReady({
  sessionId,
  signal,
  fetcher = fetch,
  wait = waitForDelay,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
}: ConfirmInterviewRuntimeReadyOptions): Promise<InterviewRuntimeConfirmation> {
  for (const delayMs of retryDelaysMs) {
    if (signal?.aborted) return "unavailable";
    if (delayMs > 0) await wait(delayMs, signal);
    if (signal?.aborted) return "unavailable";

    try {
      const response = await fetcher("/api/interview/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
        signal,
      });
      const body = (await response.json().catch(() => null)) as {
        ready?: unknown;
      } | null;
      if (response.ok && body?.ready === true) return "ready";
      if (response.status === 401 || response.status === 404) {
        return "unavailable";
      }
    } catch {
      if (signal?.aborted) return "unavailable";
    }
  }
  return "unavailable";
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

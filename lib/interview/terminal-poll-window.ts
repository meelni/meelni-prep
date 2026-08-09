import { INTERVIEW_LIFECYCLE_SLOS } from "@/lib/operations/interview-lifecycle-slo";

export const TERMINAL_POLL_INTERVAL_MS = 1_000;
export const TERMINAL_POLL_WINDOW_MS =
  INTERVIEW_LIFECYCLE_SLOS.terminalization.upperBoundMs;
export const TERMINAL_POLL_MAX_ATTEMPTS = Math.ceil(
  TERMINAL_POLL_WINDOW_MS / TERMINAL_POLL_INTERVAL_MS
);

export type TerminalPollWindowResult = {
  status: "resolved" | "paused" | "cancelled";
  attempts: number;
};

type TerminalPollAttempt = (input: {
  attempt: number;
  signal: AbortSignal;
}) => Promise<boolean>;

export async function runBoundedSequentialTerminalPoll(input: {
  poll: TerminalPollAttempt;
  signal: AbortSignal;
  intervalMs?: number;
  windowMs?: number;
  maxAttempts?: number;
}): Promise<TerminalPollWindowResult> {
  const intervalMs = input.intervalMs ?? TERMINAL_POLL_INTERVAL_MS;
  const windowMs = input.windowMs ?? TERMINAL_POLL_WINDOW_MS;
  const maxAttempts = input.maxAttempts ?? TERMINAL_POLL_MAX_ATTEMPTS;
  const windowController = new AbortController();
  const abortFromParent = () =>
    windowController.abort(input.signal.reason ?? "poll_cancelled");

  if (input.signal.aborted) {
    abortFromParent();
  } else {
    input.signal.addEventListener("abort", abortFromParent, { once: true });
  }

  const windowTimer = setTimeout(
    () => windowController.abort("poll_window_elapsed"),
    windowMs
  );
  let attempts = 0;

  try {
    while (
      attempts < maxAttempts &&
      !input.signal.aborted &&
      !windowController.signal.aborted
    ) {
      attempts += 1;
      const resolved = await input.poll({
        attempt: attempts,
        signal: windowController.signal,
      });
      if (resolved) return { status: "resolved", attempts };
      if (input.signal.aborted) return { status: "cancelled", attempts };
      if (attempts >= maxAttempts || windowController.signal.aborted) {
        return { status: "paused", attempts };
      }

      const waitResult = await waitForNextTerminalPoll(
        intervalMs,
        windowController.signal
      );
      if (waitResult === "aborted") {
        return {
          status: input.signal.aborted ? "cancelled" : "paused",
          attempts,
        };
      }
    }

    return {
      status: input.signal.aborted ? "cancelled" : "paused",
      attempts,
    };
  } finally {
    clearTimeout(windowTimer);
    input.signal.removeEventListener("abort", abortFromParent);
  }
}

function waitForNextTerminalPoll(
  delayMs: number,
  signal: AbortSignal
): Promise<"elapsed" | "aborted"> {
  if (signal.aborted) return Promise.resolve("aborted");

  return new Promise((resolve) => {
    const handleAbort = () => {
      clearTimeout(timer);
      resolve("aborted");
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve("elapsed");
    }, delayMs);
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export const SUPABASE_SERVER_FETCH_DEADLINE_MS = 4_000;
export const CUSTOMER_READ_ROUTE_DEADLINE_MS = 7_500;
export const CUSTOMER_CLIENT_FETCH_DEADLINE_MS = 6_500;
export const INTERACTIVE_READ_STATEMENT_TIMEOUT_MS = 7_000;
export const DEPENDENCY_RETRY_AFTER_SECONDS = 3;

export class DeadlineExceededError extends Error {
  constructor(readonly operation: string) {
    super(`${operation} exceeded its deadline`);
    this.name = "DeadlineExceededError";
  }
}

export function isDeadlineExceededError(
  error: unknown
): error is DeadlineExceededError {
  return error instanceof DeadlineExceededError;
}

export async function withDeadline<T>(
  operation: string,
  work: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new DeadlineExceededError(operation)),
      timeoutMs
    );
  });

  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export async function fetchWithDeadline(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = CUSTOMER_CLIENT_FETCH_DEADLINE_MS
): Promise<Response> {
  const controller = new AbortController();
  const parentSignal = init.signal;
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

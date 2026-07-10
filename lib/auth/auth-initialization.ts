export const AUTH_INITIALIZATION_TIMEOUT_MS = 10_000;

export type AuthInitializationResult<T> =
  | { status: "ready"; value: T }
  | { status: "timed_out" };

export function resolveAuthInitializationWithin<T>(
  operation: Promise<T>,
  timeoutMs = AUTH_INITIALIZATION_TIMEOUT_MS
): Promise<AuthInitializationResult<T>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ status: "timed_out" });
    }, timeoutMs);

    operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve({ status: "ready", value });
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

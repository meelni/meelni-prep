export function isRetryableDatabaseContentionError(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 3 && isRecord(current); depth += 1) {
    if (current.code === "55P03" || current.code === "57014") return true;
    current = current.cause;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type BoundedBodyResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "invalid" | "too_large" | "aborted" };

const ABORTED_READ = Symbol("aborted_read");

export async function readBoundedBody(
  request: Request,
  maxBytes: number
): Promise<BoundedBodyResult<Uint8Array>> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    return { ok: false, reason: "too_large" };
  }
  if (!request.body) return { ok: false, reason: "invalid" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const read = await readChunkOrAbort(reader, request.signal);
      if (read === ABORTED_READ) return { ok: false, reason: "aborted" };
      const { done, value } = read;
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: bytes };
  } catch {
    return {
      ok: false,
      reason: request.signal.aborted ? "aborted" : "invalid",
    };
  } finally {
    reader.releaseLock();
  }
}

export async function readBoundedJson(
  request: Request,
  maxBytes: number
): Promise<BoundedBodyResult<unknown>> {
  const body = await readBoundedBody(request, maxBytes);
  if (!body.ok) return body;
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(body.value)) };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export async function readBoundedJsonObject(
  request: Request,
  maxBytes: number
): Promise<BoundedBodyResult<Record<string, unknown>>> {
  const parsed = await readBoundedJson(request, maxBytes);
  if (!parsed.ok) return parsed;
  if (
    parsed.value === null ||
    typeof parsed.value !== "object" ||
    Array.isArray(parsed.value)
  ) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, value: parsed.value as Record<string, unknown> };
}

async function readChunkOrAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal
) {
  if (signal.aborted) {
    await reader.cancel(signal.reason).catch(() => undefined);
    return ABORTED_READ;
  }

  let cancellation: Promise<void> | null = null;
  let onAbort: (() => void) | null = null;
  let abortObserved = false;
  const aborted = new Promise<typeof ABORTED_READ>((resolve) => {
    onAbort = () => {
      abortObserved = true;
      cancellation = reader.cancel(signal.reason).catch(() => undefined);
      resolve(ABORTED_READ);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    let result;
    try {
      result = await Promise.race([reader.read(), aborted]);
    } catch (error) {
      if (abortObserved || signal.aborted) return ABORTED_READ;
      throw error;
    }
    if (result === ABORTED_READ && cancellation) await cancellation;
    if (signal.aborted) {
      await reader.cancel(signal.reason).catch(() => undefined);
      return ABORTED_READ;
    }
    return result;
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export async function readBoundedJson(
  request: Request,
  maxBytes: number
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; reason: "invalid" | "too_large" | "aborted" }
> {
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
      if (request.signal.aborted) return { ok: false, reason: "aborted" };
      const { done, value } = await reader.read();
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
    try {
      return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
    } catch {
      return { ok: false, reason: "invalid" };
    }
  } catch {
    return {
      ok: false,
      reason: request.signal.aborted ? "aborted" : "invalid",
    };
  } finally {
    reader.releaseLock();
  }
}

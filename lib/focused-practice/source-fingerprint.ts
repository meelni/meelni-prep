import { createHash } from "node:crypto";

import { FOCUSED_PRACTICE_SOURCE_FINGERPRINT_VERSION } from "@meelni/core";

/** Server-only content binding. Never log or return the hashed source input. */
export function createFocusedPracticeSourceFingerprint(value: unknown): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: FOCUSED_PRACTICE_SOURCE_FINGERPRINT_VERSION,
        source: canonicalize(value),
      }),
      "utf8"
    )
    .digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return [...value];
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") {
    return value === undefined ? null : value;
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalize(record[key])])
  );
}

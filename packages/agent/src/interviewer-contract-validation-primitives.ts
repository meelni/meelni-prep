import { hasOnlyUnicodeScalarStrings } from "./interview-brief-canonicalization";

export function isCanonicalUtcTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) {
    return false;
  }
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

export function isIdentifier(value: unknown): value is string {
  return (
    isBoundedString(value, 1, 128) &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)
  );
}

export function isContractToken(value: unknown): value is string {
  return (
    isBoundedString(value, 1, 96) &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)
  );
}

export function isShortToken(value: unknown): value is string {
  return isBoundedString(value, 1, 96) && /^[a-z0-9][a-z0-9_-]*$/.test(value);
}

export function isGuidance(value: unknown): value is string {
  return isBoundedString(value, 1, 240);
}

export function isBoundedString(
  value: unknown,
  minimum: number,
  maximum: number
): value is string {
  if (
    typeof value !== "string" ||
    !hasOnlyUnicodeScalarStrings(value) ||
    value.trim() !== value
  ) {
    return false;
  }
  const scalarLength = [...value].length;
  return scalarLength >= minimum && scalarLength <= maximum;
}

export function hasNonIntegerJsonNumberToken(raw: string): boolean {
  let inString = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "-" || /[0-9]/.test(character)) {
      const match = raw
        .slice(index)
        .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match) {
        if (/[.eE]/.test(match[0])) return true;
        index += match[0].length - 1;
      }
    }
  }
  return false;
}

const INTEGER_WIRE_KEYS = new Set([
  "duration_minutes",
  "remaining_ms",
  "writer_generation",
  "sequence",
  "state_revision",
  "version",
  "based_on_state_revision",
  "based_on_lifecycle_version",
  "expected_state_revision",
  "expected_lifecycle_version",
  "observed_state_revision",
  "observed_lifecycle_version",
]);

export function hasNonCanonicalIntegerWireToken(raw: string): boolean {
  let rejected = false;
  const reviveIntegerTokens = (
    key: string,
    value: unknown,
    context?: unknown
  ): unknown => {
    if (typeof value !== "number" || !INTEGER_WIRE_KEYS.has(key)) return value;
    const source =
      isRecord(context) && typeof context.source === "string"
        ? context.source
        : null;
    if (source === null || !/^-?(?:0|[1-9]\d*)$/.test(source)) {
      rejected = true;
    }
    return value;
  };
  JSON.parse(raw, reviveIntegerTokens);
  return rejected;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

export function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

export function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function hasExactKeys<K extends string>(
  value: unknown,
  keys: readonly K[]
): value is Record<K, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    actual.every((key) => keys.includes(key as K))
  );
}

export function isBoundedArray<T>(
  value: unknown,
  minimum: number,
  maximum: number,
  guard: (item: unknown) => item is T
): value is T[] {
  return (
    Array.isArray(value) &&
    value.length >= minimum &&
    value.length <= maximum &&
    value.every(guard)
  );
}

export function isBoundedUniqueArray<T>(
  value: unknown,
  minimum: number,
  maximum: number,
  guard: (item: unknown) => item is T
): value is T[] {
  return (
    isBoundedArray(value, minimum, maximum, guard) &&
    new Set(value).size === value.length
  );
}

export function includes<T extends string>(
  values: readonly T[],
  value: unknown
): value is T {
  return (
    typeof value === "string" && values.some((candidate) => candidate === value)
  );
}

export function isSha256Digest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

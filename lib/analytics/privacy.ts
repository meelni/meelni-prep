const SENSITIVE_KEY =
  /(?:^|_)(?:answer|audio|email|idempotency|prompt|question_text|recording|room|session_id|token|transcript|user_id)(?:$|_)/i;
const PII_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  /\d{3}-\d{2}-\d{4}/g,
  /\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}/g,
];

export function sanitizeAnalyticsProperties(
  properties: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (SENSITIVE_KEY.test(key)) continue;
    sanitized[key] = sanitizeValue(value);
  }
  return sanitized;
}

export function sanitizeAnalyticsPath(path?: string): string | undefined {
  if (!path) return undefined;
  try {
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(path);
    const url = new URL(path, "https://meelni.invalid");
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    if (absolute) return url.origin;
    return url.pathname || "/";
  } catch {
    return undefined;
  }
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return PII_PATTERNS.reduce(
      (current, pattern) => current.replace(pattern, "[REDACTED]"),
      value.slice(0, 500)
    );
  }
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object")
    return sanitizeAnalyticsProperties(value as Record<string, unknown>);
  return value;
}

const CHECKOUT_SESSION_ID_PATTERN = /cs_(?:test|live)_[A-Za-z0-9_]+/gi;
const CHECKOUT_RETURN_HANDLE_PATTERN = /cr_[A-Za-z0-9]{32}/g;

const SENSITIVE_QUERY_VALUE_PATTERN =
  /([?&](?:checkout_return|code|key|session|session_id|checkout_session_id|token)=)[^&#]*/gi;

export function sanitizeAnalyticsString(value: string): string {
  return value
    .replace(CHECKOUT_SESSION_ID_PATTERN, "[CHECKOUT_SESSION_REDACTED]")
    .replace(CHECKOUT_RETURN_HANDLE_PATTERN, "[CHECKOUT_RETURN_REDACTED]")
    .replace(SENSITIVE_QUERY_VALUE_PATTERN, "$1[REDACTED]");
}

export function sanitizeAnalyticsValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeAnalyticsString(value);
  if (Array.isArray(value)) return value.map(sanitizeAnalyticsValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      sanitizeAnalyticsValue(nested),
    ])
  );
}

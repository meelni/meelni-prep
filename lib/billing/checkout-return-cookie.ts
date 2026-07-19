export const CHECKOUT_RETURN_STORAGE_KEY = "meelni_checkout_return";
export const CHECKOUT_RETURN_COOKIE_PREFIX = "__Host-meelni_checkout_return_";
export const CHECKOUT_RETURN_COOKIE_LIMIT = 8;
export const CHECKOUT_RETURN_COOKIE_NAMES = Array.from(
  { length: CHECKOUT_RETURN_COOKIE_LIMIT },
  (_, slot) => `${CHECKOUT_RETURN_COOKIE_PREFIX}${slot}`
);

// Delayed Checkout methods can settle several business days after return. Keep
// correlation bounded but available for a later manual status check.
export const CHECKOUT_RETURN_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export interface CheckoutCreateResponse {
  url: string;
  returnHandle: string;
  reused: boolean;
}

export interface CheckoutReturnStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function isCheckoutReturnHandle(value: unknown): value is string {
  return typeof value === "string" && /^cr_[A-Za-z0-9]{32}$/.test(value);
}

export function checkoutReturnCookieSlot(handle: string): number | null {
  if (!isCheckoutReturnHandle(handle)) return null;
  let hash = 2166136261;
  for (const character of handle) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % CHECKOUT_RETURN_COOKIE_LIMIT;
}

export function checkoutReturnCookieName(handle: string): string | null {
  const slot = checkoutReturnCookieSlot(handle);
  return slot === null ? null : CHECKOUT_RETURN_COOKIE_NAMES[slot]!;
}

export interface CheckoutReturnCorrelation {
  handle: string;
  sessionId: string;
  createdAtMs: number;
}

export function encodeCheckoutReturnCookie(
  handle: string,
  sessionId: string,
  createdAtMs = Date.now()
): string | null {
  if (
    !isCheckoutReturnHandle(handle) ||
    !sessionId ||
    sessionId.includes(":") ||
    !Number.isSafeInteger(createdAtMs) ||
    createdAtMs <= 0
  ) {
    return null;
  }
  return `${handle}:${sessionId}:${createdAtMs}`;
}

export function checkoutReturnCorrelationFromCookie(
  value: string | null
): CheckoutReturnCorrelation | null {
  if (!value) return null;
  const [handle, sessionId, timestamp, ...extra] = value.split(":");
  if (
    extra.length > 0 ||
    !isCheckoutReturnHandle(handle) ||
    !sessionId ||
    !timestamp ||
    !/^\d+$/.test(timestamp)
  ) {
    return null;
  }
  const createdAtMs = Number(timestamp);
  if (!Number.isSafeInteger(createdAtMs) || createdAtMs <= 0) return null;
  return { handle, sessionId, createdAtMs };
}

export function checkoutSessionIdFromReturnCookie(
  value: string | null,
  expectedHandle: string
): string | null {
  if (!isCheckoutReturnHandle(expectedHandle)) return null;
  const correlation = checkoutReturnCorrelationFromCookie(value);
  return correlation?.handle === expectedHandle ? correlation.sessionId : null;
}

export function parseCheckoutCreateResponse(
  value: unknown
): CheckoutCreateResponse | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.url !== "string" ||
    !isCheckoutReturnHandle(candidate.returnHandle) ||
    (candidate.reused !== undefined && typeof candidate.reused !== "boolean")
  ) {
    return null;
  }
  try {
    const url = new URL(candidate.url);
    if (url.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return {
    url: candidate.url,
    returnHandle: candidate.returnHandle,
    reused: candidate.reused === true,
  };
}

export function storeCheckoutReturnHandle(
  storage: CheckoutReturnStorage,
  handle: string
): boolean {
  if (!isCheckoutReturnHandle(handle)) return false;
  try {
    storage.setItem(CHECKOUT_RETURN_STORAGE_KEY, handle);
    return true;
  } catch {
    return false;
  }
}

export function readCheckoutReturnHandle(
  storage: CheckoutReturnStorage
): string | null {
  try {
    const value = storage.getItem(CHECKOUT_RETURN_STORAGE_KEY);
    return isCheckoutReturnHandle(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearCheckoutReturnHandle(
  storage: CheckoutReturnStorage,
  expectedHandle: string
): void {
  try {
    if (storage.getItem(CHECKOUT_RETURN_STORAGE_KEY) === expectedHandle) {
      storage.removeItem(CHECKOUT_RETURN_STORAGE_KEY);
    }
  } catch {
    // Storage availability cannot affect settled billing truth.
  }
}

export const STATSIG_ANONYMOUS_ID_KEY = "meelni_statsig_anonymous_id";
const LEGACY_ANALYTICS_ID_KEYS = [
  "statsig.stable_id",
  "statsig_stable_id",
  "meelni_anonymous_id",
] as const;

export function getOrCreateStatsigAnonymousId(): string {
  if (typeof window === "undefined") {
    return "anonymous-server";
  }

  try {
    const existing = window.localStorage.getItem(STATSIG_ANONYMOUS_ID_KEY);
    if (existing) {
      return existing;
    }

    const next = createAnonymousId();
    window.localStorage.setItem(STATSIG_ANONYMOUS_ID_KEY, next);
    return next;
  } catch {
    return createAnonymousId();
  }
}

export function clearStatsigAnonymousIdentifiers(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STATSIG_ANONYMOUS_ID_KEY);
    for (const key of LEGACY_ANALYTICS_ID_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage can be unavailable; provider shutdown still fails closed.
  }
}

function createAnonymousId(): string {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return `anon-${window.crypto.randomUUID()}`;
  }

  return `anon-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

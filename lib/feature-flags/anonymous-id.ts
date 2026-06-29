const STATSIG_ANONYMOUS_ID_KEY = "meelni_statsig_anonymous_id";

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

function createAnonymousId(): string {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return `anon-${window.crypto.randomUUID()}`;
  }

  return `anon-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

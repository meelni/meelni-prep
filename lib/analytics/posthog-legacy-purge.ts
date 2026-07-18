import { ANALYTICS_CONSENT_COOKIE } from "./consent-contract";

export const POSTHOG_LEGACY_PURGE_MARKER =
  "meelni_posthog_legacy_identity_purged_v2";

interface StorageLike {
  getItem(key: string): string | null;
  key(index: number): string | null;
  readonly length: number;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface LegacyPurgeSurface {
  cookieNames: string[];
  expireCookie(name: string): boolean;
  localStorage: StorageLike;
  sessionStorage: StorageLike;
}

export function purgeLegacyPostHogIdentity(
  surface = browserSurface()
): boolean {
  if (!surface) return false;
  try {
    if (surface.localStorage.getItem(POSTHOG_LEGACY_PURGE_MARKER) === "1") {
      return false;
    }
  } catch {
    // Continue with best-effort session/cookie cleanup.
  }

  const localStoragePurged = purgeStorage(surface.localStorage);
  const sessionStoragePurged = purgeStorage(surface.sessionStorage);
  let cookiesPurged = true;
  for (const name of surface.cookieNames) {
    if (isLegacyPostHogKey(name)) {
      cookiesPurged = surface.expireCookie(name) && cookiesPurged;
    }
  }
  if (localStoragePurged && sessionStoragePurged && cookiesPurged) {
    try {
      surface.localStorage.setItem(POSTHOG_LEGACY_PURGE_MARKER, "1");
    } catch {
      // Repeating a safe purge is preferable to retaining a legacy identity.
    }
  }
  return true;
}

function purgeStorage(storage: StorageLike): boolean {
  try {
    const keys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index)
    ).filter((key): key is string => !!key);
    for (const key of keys) {
      if (isLegacyPostHogKey(key)) storage.removeItem(key);
    }
    return !storageContainsLegacyPostHogKey(storage);
  } catch {
    // Storage may be unavailable in hardened browsers.
    return false;
  }
}

function storageContainsLegacyPostHogKey(storage: StorageLike): boolean {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => !!key)
    .some(isLegacyPostHogKey);
}

function isLegacyPostHogKey(key: string): boolean {
  if (key === ANALYTICS_CONSENT_COOKIE || key === POSTHOG_LEGACY_PURGE_MARKER) {
    return false;
  }
  return (
    /^ph_.*posthog/i.test(key) ||
    /^__ph_opt_in_out_/i.test(key) ||
    /^posthog(?:[._-]|$)/i.test(key)
  );
}

function browserSurface(): LegacyPurgeSurface | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  return {
    cookieNames: document.cookie
      .split(";")
      .map((entry) => entry.split("=", 1)[0]?.trim())
      .filter((name): name is string => !!name),
    expireCookie(name) {
      document.cookie = `${encodeURIComponent(name)}=; Max-Age=0; Path=/; SameSite=Lax`;
      return !document.cookie
        .split(";")
        .map((entry) => entry.split("=", 1)[0]?.trim())
        .includes(name);
    },
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
  };
}

import { ANALYTICS_CONSENT_COOKIE } from "./consent-contract";

export const POSTHOG_LEGACY_PURGE_MARKER =
  "meelni_posthog_legacy_identity_purged_v1";

interface StorageLike {
  getItem(key: string): string | null;
  key(index: number): string | null;
  readonly length: number;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

interface LegacyPurgeSurface {
  cookieNames: string[];
  expireCookie(name: string): void;
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

  purgeStorage(surface.localStorage);
  purgeStorage(surface.sessionStorage);
  for (const name of surface.cookieNames) {
    if (isLegacyPostHogKey(name)) surface.expireCookie(name);
  }
  try {
    surface.localStorage.setItem(POSTHOG_LEGACY_PURGE_MARKER, "1");
  } catch {
    // Repeating a safe purge is preferable to retaining a legacy identity.
  }
  return true;
}

function purgeStorage(storage: StorageLike): void {
  try {
    const keys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index)
    ).filter((key): key is string => !!key);
    for (const key of keys) {
      if (isLegacyPostHogKey(key)) storage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable in hardened browsers.
  }
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
    },
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
  };
}

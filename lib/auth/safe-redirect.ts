const DEFAULT_AUTH_REDIRECT = "/dashboard";

export function getSafeInternalRedirect(
  candidate: string | null | undefined,
  fallback: string | null = DEFAULT_AUTH_REDIRECT
): string | null {
  const value = candidate?.trim();

  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return fallback;
  }

  return value;
}

export function buildSafeInternalRedirectUrl(
  origin: string,
  candidate: string | null | undefined,
  fallback = DEFAULT_AUTH_REDIRECT
): URL {
  const path = getSafeInternalRedirect(candidate, fallback) ?? fallback;
  return new URL(path, origin);
}

export function buildInternalRequestDestination(
  pathname: string,
  search: string
): string {
  const query = search && !search.startsWith("?") ? `?${search}` : search;
  return (
    getSafeInternalRedirect(`${pathname}${query}`) ?? DEFAULT_AUTH_REDIRECT
  );
}

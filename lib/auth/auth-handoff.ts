import { getSafeInternalRedirect } from "@/lib/auth/safe-redirect";

export const AUTH_SIGNIN_PATH = "/auth/signin";
export const AUTH_SIGNUP_PATH = "/auth/signup";
export const AUTH_CALLBACK_PATH = "/auth/callback";
export const DEFAULT_AUTH_CANCEL_DESTINATION = "/";

type AuthPagePath = typeof AUTH_SIGNIN_PATH | typeof AUTH_SIGNUP_PATH;
type SearchParamsReader = Pick<URLSearchParams, "get">;

export interface AuthHandoffContext {
  redirectTo: string;
  cancelTo: string;
}

export function parseAuthHandoffContext(
  searchParams: SearchParamsReader
): AuthHandoffContext {
  return normalizeAuthHandoff({
    redirectTo: searchParams.get("redirectTo"),
    cancelTo: searchParams.get("cancelTo"),
  });
}

export function normalizeAuthHandoff({
  redirectTo,
  cancelTo,
}: {
  redirectTo?: string | null;
  cancelTo?: string | null;
}): AuthHandoffContext {
  return {
    redirectTo: getSafeInternalRedirect(redirectTo) ?? "/dashboard",
    cancelTo:
      getSafeInternalRedirect(cancelTo, DEFAULT_AUTH_CANCEL_DESTINATION) ??
      DEFAULT_AUTH_CANCEL_DESTINATION,
  };
}

export function buildAuthPageHref(
  path: AuthPagePath,
  handoff: Partial<AuthHandoffContext>
): string {
  const context = normalizeAuthHandoff(handoff);
  const searchParams = new URLSearchParams({
    redirectTo: context.redirectTo,
    cancelTo: context.cancelTo,
  });

  return `${path}?${searchParams.toString()}`;
}

export function buildAuthCallbackHref(
  handoff: Partial<AuthHandoffContext>
): string {
  const context = normalizeAuthHandoff(handoff);
  const searchParams = new URLSearchParams({
    next: context.redirectTo,
    cancelTo: context.cancelTo,
  });

  return `${AUTH_CALLBACK_PATH}?${searchParams.toString()}`;
}

export function buildAuthFailureHref(
  handoff: Partial<AuthHandoffContext>
): string {
  const url = new URL(
    buildAuthPageHref(AUTH_SIGNIN_PATH, handoff),
    "https://meelni.local"
  );
  url.searchParams.set("error", "auth_failed");
  return `${url.pathname}${url.search}`;
}

export function resolveAuthCallbackDestination(
  searchParams: SearchParamsReader
): string {
  const hasAuthorizationCode = Boolean(searchParams.get("code"));

  return hasAuthorizationCode
    ? normalizeAuthHandoff({
        redirectTo: searchParams.get("next"),
      }).redirectTo
    : normalizeAuthHandoff({
        cancelTo: searchParams.get("cancelTo"),
      }).cancelTo;
}

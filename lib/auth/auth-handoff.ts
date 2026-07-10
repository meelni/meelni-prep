import { getSafeInternalRedirect } from "@/lib/auth/safe-redirect";

export const AUTH_SIGNIN_PATH = "/auth/signin";
export const AUTH_SIGNUP_PATH = "/auth/signup";
export const AUTH_FORGOT_PASSWORD_PATH = "/auth/forgot-password";
export const AUTH_RESET_PASSWORD_PATH = "/auth/reset-password";
export const AUTH_CALLBACK_PATH = "/auth/callback";
export const DEFAULT_AUTH_CANCEL_DESTINATION = "/";

export const AUTH_FAILURE_MESSAGES = {
  auth_failed: "We couldn't complete sign-in. Please try again.",
  auth_callback_failed:
    "The sign-in link could not be completed. Please start again.",
  account_deletion_pending:
    "This account is pending deletion and cannot be used to sign in.",
} as const;

type AuthPagePath =
  | typeof AUTH_SIGNIN_PATH
  | typeof AUTH_SIGNUP_PATH
  | typeof AUTH_FORGOT_PASSWORD_PATH
  | typeof AUTH_RESET_PASSWORD_PATH;
type SearchParamsReader = Pick<URLSearchParams, "get">;
export type AuthFailureCode = keyof typeof AUTH_FAILURE_MESSAGES;

export type AuthCallbackAction =
  | { type: "success"; destination: string }
  | { type: "cancel"; destination: string }
  | { type: "failure"; code: AuthFailureCode };

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

export function buildPasswordResetCallbackHref(
  handoff: Partial<AuthHandoffContext>
): string {
  return buildAuthPageHref(AUTH_RESET_PASSWORD_PATH, handoff);
}

export function buildAuthFailureHref(
  handoff: Partial<AuthHandoffContext>,
  code: AuthFailureCode = "auth_failed"
): string {
  const url = new URL(
    buildAuthPageHref(AUTH_SIGNIN_PATH, handoff),
    "https://meelni.local"
  );
  url.searchParams.set("error", code);
  return `${url.pathname}${url.search}`;
}

export function getAuthFailureMessage(
  searchParams: SearchParamsReader
): string | null {
  const code = searchParams.get("error");
  return code && code in AUTH_FAILURE_MESSAGES
    ? AUTH_FAILURE_MESSAGES[code as AuthFailureCode]
    : null;
}

export function resolveAuthCallbackAction(
  searchParams: SearchParamsReader
): AuthCallbackAction {
  const providerError = searchParams.get("error")?.trim();
  const providerErrorCode = searchParams.get("error_code")?.trim();

  // Supabase also uses access_denied for account and provider failures, with
  // a specific error_code. Only the bare OAuth denial shape means the user
  // canceled; all coded failures receive fixed first-party recovery copy.
  if (
    providerError === "access_denied" &&
    !providerErrorCode &&
    !searchParams.get("code")
  ) {
    return {
      type: "cancel",
      destination: normalizeAuthHandoff({
        cancelTo: searchParams.get("cancelTo"),
      }).cancelTo,
    };
  }

  if (providerError) {
    return { type: "failure", code: "auth_callback_failed" };
  }

  if (searchParams.get("code")) {
    return {
      type: "success",
      destination: normalizeAuthHandoff({
        redirectTo: searchParams.get("next"),
      }).redirectTo,
    };
  }

  return { type: "failure", code: "auth_callback_failed" };
}

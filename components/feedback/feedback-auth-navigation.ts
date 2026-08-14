import { AUTH_SIGNIN_PATH, buildAuthPageHref } from "@/lib/auth/auth-handoff";

export function buildFeedbackReauthenticationHref(
  sessionId: string,
  comparison = false
): string {
  const destination = `/feedback/${encodeURIComponent(sessionId)}${
    comparison ? "/compare" : ""
  }`;
  return buildAuthPageHref(AUTH_SIGNIN_PATH, {
    redirectTo: destination,
    cancelTo: "/",
  });
}

import { AUTH_SIGNIN_PATH, buildAuthPageHref } from "@/lib/auth/auth-handoff";

export function buildCheckoutSuccessDestination(): string {
  return "/pricing/success";
}

export function buildCheckoutSuccessSigninHref(): string {
  return buildAuthPageHref(AUTH_SIGNIN_PATH, {
    redirectTo: buildCheckoutSuccessDestination(),
    cancelTo: "/pricing",
  });
}

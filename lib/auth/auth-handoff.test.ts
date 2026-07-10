import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_SIGNIN_PATH,
  AUTH_SIGNUP_PATH,
  buildAuthCallbackHref,
  buildAuthFailureHref,
  buildAuthPageHref,
  parseAuthHandoffContext,
  resolveAuthCallbackDestination,
} from "./auth-handoff";

test("auth pages preserve independent success and cancellation destinations", () => {
  const handoff = {
    redirectTo:
      "/dashboard/new-interview?questionId=question-1&returnTo=%2Fexplore%3Fcompany%3DStripe",
    cancelTo: "/explore?company=Stripe",
  };

  for (const path of [AUTH_SIGNIN_PATH, AUTH_SIGNUP_PATH] as const) {
    const href = buildAuthPageHref(path, handoff);
    const url = new URL(href, "https://meelni.com");

    assert.equal(url.pathname, path);
    assert.deepEqual(parseAuthHandoffContext(url.searchParams), handoff);
  }

  const callback = new URL(
    buildAuthCallbackHref(handoff),
    "https://meelni.com"
  );
  assert.equal(callback.searchParams.get("next"), handoff.redirectTo);
  assert.equal(callback.searchParams.get("cancelTo"), handoff.cancelTo);
});

test("auth handoff rejects open redirects independently", () => {
  const context = parseAuthHandoffContext(
    new URLSearchParams(
      "redirectTo=https%3A%2F%2Fevil.example&cancelTo=%2F%2Fevil.example"
    )
  );

  assert.deepEqual(context, {
    redirectTo: "/dashboard",
    cancelTo: "/",
  });
});

test("auth handoff handles direct, empty, and repeated query values", () => {
  assert.deepEqual(parseAuthHandoffContext(new URLSearchParams()), {
    redirectTo: "/dashboard",
    cancelTo: "/",
  });

  assert.deepEqual(
    parseAuthHandoffContext(
      new URLSearchParams(
        "redirectTo=&redirectTo=%2Fdashboard%2Fnew-interview&cancelTo=%2Fexplore&cancelTo=%2F"
      )
    ),
    {
      redirectTo: "/dashboard",
      cancelTo: "/explore",
    }
  );
});

test("OAuth callback success and cancellation resolve independently", () => {
  assert.equal(
    resolveAuthCallbackDestination(
      new URLSearchParams(
        "code=oauth-code&next=%2Fdashboard%2Fnew-interview%3FquestionId%3Dquestion-1&cancelTo=%2Fexplore"
      )
    ),
    "/dashboard/new-interview?questionId=question-1"
  );
  assert.equal(
    resolveAuthCallbackDestination(
      new URLSearchParams("error=access_denied&cancelTo=%2Fexplore%3Fpage%3D2")
    ),
    "/explore?page=2"
  );
  assert.equal(
    resolveAuthCallbackDestination(
      new URLSearchParams(
        "error=access_denied&cancelTo=https%3A%2F%2Fevil.example"
      )
    ),
    "/"
  );
  assert.equal(
    resolveAuthCallbackDestination(
      new URLSearchParams(
        "code=oauth-code&next=https%3A%2F%2Fevil.example&cancelTo=%2Fexplore"
      )
    ),
    "/dashboard"
  );
});

test("OAuth exchange failure retries without losing safe handoff", () => {
  const retry = new URL(
    buildAuthFailureHref({
      redirectTo: "/dashboard/new-interview?questionId=question-1",
      cancelTo: "/explore",
    }),
    "https://meelni.com"
  );

  assert.equal(retry.pathname, "/auth/signin");
  assert.equal(
    retry.searchParams.get("redirectTo"),
    "/dashboard/new-interview?questionId=question-1"
  );
  assert.equal(retry.searchParams.get("cancelTo"), "/explore");
  assert.equal(retry.searchParams.get("error"), "auth_failed");
});

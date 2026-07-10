import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_FORGOT_PASSWORD_PATH,
  AUTH_RESET_PASSWORD_PATH,
  AUTH_SIGNIN_PATH,
  AUTH_SIGNUP_PATH,
  buildAuthCallbackHref,
  buildAuthFailureHref,
  buildAuthPageHref,
  buildPasswordResetCallbackHref,
  getAuthFailureMessage,
  parseAuthHandoffContext,
  resolveAuthCallbackAction,
} from "./auth-handoff";

test("auth pages preserve independent success and cancellation destinations", () => {
  const handoff = {
    redirectTo:
      "/dashboard/new-interview?questionId=question-1&returnTo=%2Fexplore%3Fcompany%3DStripe",
    cancelTo: "/explore?company=Stripe",
  };

  for (const path of [
    AUTH_SIGNIN_PATH,
    AUTH_SIGNUP_PATH,
    AUTH_FORGOT_PASSWORD_PATH,
    AUTH_RESET_PASSWORD_PATH,
  ] as const) {
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

  const passwordReset = new URL(
    buildPasswordResetCallbackHref(handoff),
    "https://meelni.com"
  );
  assert.equal(passwordReset.pathname, AUTH_RESET_PASSWORD_PATH);
  assert.deepEqual(
    parseAuthHandoffContext(passwordReset.searchParams),
    handoff
  );
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

test("OAuth callback success and explicit cancellation resolve independently", () => {
  assert.deepEqual(
    resolveAuthCallbackAction(
      new URLSearchParams(
        "code=oauth-code&next=%2Fdashboard%2Fnew-interview%3FquestionId%3Dquestion-1&cancelTo=%2Fexplore"
      )
    ),
    {
      type: "success",
      destination: "/dashboard/new-interview?questionId=question-1",
    }
  );
  assert.deepEqual(
    resolveAuthCallbackAction(
      new URLSearchParams("error=access_denied&cancelTo=%2Fexplore%3Fpage%3D2")
    ),
    { type: "cancel", destination: "/explore?page=2" }
  );
  assert.deepEqual(
    resolveAuthCallbackAction(
      new URLSearchParams(
        "error=access_denied&cancelTo=https%3A%2F%2Fevil.example"
      )
    ),
    { type: "cancel", destination: "/" }
  );
  assert.deepEqual(
    resolveAuthCallbackAction(
      new URLSearchParams(
        "code=oauth-code&next=https%3A%2F%2Fevil.example&cancelTo=%2Fexplore"
      )
    ),
    { type: "success", destination: "/dashboard" }
  );
});

test("callback failures and missing codes use safe first-party recovery", () => {
  for (const query of [
    "",
    "error=server_error&error_description=untrusted+provider+detail",
  ]) {
    const action = resolveAuthCallbackAction(new URLSearchParams(query));
    assert.deepEqual(action, {
      type: "failure",
      code: "auth_callback_failed",
    });
  }

  assert.deepEqual(
    resolveAuthCallbackAction(
      new URLSearchParams("error=access_denied&code=ambiguous-code")
    ),
    { type: "failure", code: "auth_callback_failed" }
  );

  assert.equal(
    getAuthFailureMessage(new URLSearchParams("error=auth_callback_failed")),
    "The sign-in link could not be completed. Please start again."
  );
  assert.equal(
    getAuthFailureMessage(
      new URLSearchParams(
        "error=server_error&error_description=untrusted+provider+detail"
      )
    ),
    null
  );

  for (const errorCode of [
    "signup_disabled",
    "user_banned",
    "provider_email_needs_verification",
  ]) {
    assert.deepEqual(
      resolveAuthCallbackAction(
        new URLSearchParams(
          `error=access_denied&error_code=${errorCode}&cancelTo=%2Fexplore`
        )
      ),
      { type: "failure", code: "auth_callback_failed" }
    );
  }
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

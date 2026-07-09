import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInternalRequestDestination,
  buildSafeInternalRedirectUrl,
  getSafeInternalRedirect,
} from "./safe-redirect";

test("protected-route auth handoff preserves the complete request query", () => {
  assert.equal(
    buildInternalRequestDestination(
      "/dashboard/new-interview",
      "?questionId=question-1&tag=first&tag=second"
    ),
    "/dashboard/new-interview?questionId=question-1&tag=first&tag=second"
  );
});

test("safe auth redirects preserve local paths and launch context", () => {
  const destination =
    "/dashboard/new-interview?questionId=question-1&focus=prioritization";

  assert.equal(getSafeInternalRedirect(destination), destination);
});

test("auth callback destinations stay on the request origin", () => {
  assert.equal(
    buildSafeInternalRedirectUrl(
      "https://meelni.com",
      "/dashboard/new-interview?questionId=question-1"
    ).toString(),
    "https://meelni.com/dashboard/new-interview?questionId=question-1"
  );
  assert.equal(
    buildSafeInternalRedirectUrl(
      "https://meelni.com",
      "//evil.example/question-1"
    ).toString(),
    "https://meelni.com/dashboard"
  );
});

test("safe auth redirects reject external and protocol-relative targets", () => {
  for (const candidate of [
    "https://evil.example",
    "//evil.example/path",
    "/\\evil.example/path",
    "javascript:alert(1)",
  ]) {
    assert.equal(getSafeInternalRedirect(candidate), "/dashboard");
    assert.equal(getSafeInternalRedirect(candidate, null), null);
  }
});

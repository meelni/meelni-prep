import assert from "node:assert/strict";
import test from "node:test";

import {
  sanitizeAnalyticsString,
  sanitizeAnalyticsValue,
} from "./privacy-sanitizer";

test("redacts Checkout Session IDs from URLs, nested properties, and auth handoffs", () => {
  const raw = "cs_test_sensitive_checkout_123";
  const sanitized = sanitizeAnalyticsValue({
    $current_url: `https://meelni.com/pricing/success?session_id=${raw}`,
    nested: {
      redirectTo: `/pricing/success?session_id=${raw}`,
      encoded: encodeURIComponent(`/pricing/success?session_id=${raw}`),
    },
  });
  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(serialized, /cs_test_sensitive_checkout_123/);
  assert.match(serialized, /CHECKOUT_SESSION_REDACTED|REDACTED/);
});

test("redacts generic sensitive query values without changing clean paths", () => {
  assert.equal(sanitizeAnalyticsString("/pricing/success"), "/pricing/success");
  assert.equal(
    sanitizeAnalyticsString("/auth/callback?code=secret&key=also-secret"),
    "/auth/callback?code=[REDACTED]&key=[REDACTED]"
  );
});

test("redacts opaque Checkout return handles in URLs and standalone values", () => {
  const handle = "cr_0123456789abcdef0123456789abcdef";
  const sanitized = sanitizeAnalyticsValue({
    $current_url: `https://meelni.com/pricing/success?checkout_return=${handle}`,
    redirectTo: `/pricing/success?checkout_return=${handle}`,
    handle,
  });
  assert.doesNotMatch(JSON.stringify(sanitized), /cr_0123456789abcdef/);
  assert.match(JSON.stringify(sanitized), /CHECKOUT_RETURN_REDACTED|REDACTED/);
});

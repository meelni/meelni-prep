import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeAnalyticsPath, sanitizeAnalyticsProperties } from "./privacy";

test("analytics privacy drops interview content and direct identifiers", () => {
  assert.deepEqual(
    sanitizeAnalyticsProperties({
      session_id: "session-private",
      user_id: "user-private",
      transcript: "private answer",
      question_text: "private question",
      email_domain: "example.com",
      interview_type: "product_sense",
      nested: { token: "secret", allowed: "safe" },
    }),
    {
      interview_type: "product_sense",
      nested: { allowed: "safe" },
    }
  );
});

test("analytics pageviews never include query strings or fragments", () => {
  assert.equal(
    sanitizeAnalyticsPath("/auth/callback?token=secret#private"),
    "/auth/callback"
  );
  assert.equal(
    sanitizeAnalyticsPath("https://partner.example/path?token=secret"),
    "https://partner.example"
  );
  assert.equal(sanitizeAnalyticsPath("javascript:alert(1)"), undefined);
});

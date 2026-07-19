import assert from "node:assert/strict";
import test from "node:test";

import {
  buildServerCapturePayload,
  buildServerIdentifyPayload,
} from "./posthog-server";

test("server capture payloads redact Checkout IDs in billing and nested properties", () => {
  const testCheckoutId = "cs_test_server_billing_secret_123";
  const liveCheckoutId = "cs_live_server_billing_secret_456";
  const payload = buildServerCapturePayload(
    `billing_credit_granted:${testCheckoutId}`,
    {
      source_id: testCheckoutId,
      idempotency_key: `stripe:checkout:${testCheckoutId}:interview_pass`,
      nested: {
        values: [
          liveCheckoutId,
          `prefix:${liveCheckoutId}:suffix`,
          { checkout: testCheckoutId },
        ],
      },
    },
    `user:${liveCheckoutId}`
  );

  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /cs_(?:test|live)_/i);
  assert.doesNotMatch(serialized, /server_billing_secret/);
  assert.match(serialized, /CHECKOUT_SESSION_REDACTED/);
  assert.equal(
    payload.properties.idempotency_key,
    "stripe:checkout:[CHECKOUT_SESSION_REDACTED]:interview_pass"
  );
});

test("server identify payloads use the same recursive privacy boundary", () => {
  const checkoutId = "cs_live_server_identity_secret_789";
  const payload = buildServerIdentifyPayload(`owner:${checkoutId}`, {
    nested: { checkout_session_id: checkoutId },
  });

  assert.doesNotMatch(
    JSON.stringify(payload),
    /cs_live_|server_identity_secret/
  );
  assert.match(JSON.stringify(payload), /CHECKOUT_SESSION_REDACTED/);
});

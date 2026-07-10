import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStripeDeletionSubjects,
  fingerprintStripeSubject,
  payloadContainsProviderIdentifier,
  REDACTED_STRIPE_EVENT_PAYLOAD,
  STRIPE_WEBHOOK_PROCESSING_FAILURE_CODE,
} from "./stripe-privacy";

test("deletion subjects include pass-only and multiple mapped customers", () => {
  const subjects = buildStripeDeletionSubjects({
    subscriptionId: null,
    subscriptionCustomerId: null,
    mappedCustomerIds: ["cus_pass", "cus_second", "cus_pass"],
  });
  assert.deepEqual(
    subjects.map(({ kind, providerId }) => ({ kind, providerId })),
    [
      { kind: "customer", providerId: "cus_pass" },
      { kind: "customer", providerId: "cus_second" },
    ]
  );
});

test("new Stripe observability persistence has no provider payload or raw error text", () => {
  assert.equal(REDACTED_STRIPE_EVENT_PAYLOAD, "{}");
  assert.equal(
    STRIPE_WEBHOOK_PROCESSING_FAILURE_CODE,
    "stripe_webhook_processing_failed"
  );
  assert.equal(REDACTED_STRIPE_EVENT_PAYLOAD.includes("cus_"), false);
  assert.match(STRIPE_WEBHOOK_PROCESSING_FAILURE_CODE, /^[a-z0-9_]+$/);
});

test("Stripe subject fingerprints are stable and do not retain provider IDs", () => {
  const fingerprint = fingerprintStripeSubject("cus_sensitive");
  assert.equal(fingerprint?.length, 64);
  assert.equal(fingerprint?.includes("cus_sensitive"), false);
  assert.equal(fingerprint, fingerprintStripeSubject("cus_sensitive"));
});

test("legacy Stripe payload matching finds exact nested provider identifiers", () => {
  const payload = JSON.stringify({
    data: { object: { customer: "cus_sensitive", email: "user@example.com" } },
  });
  assert.equal(
    payloadContainsProviderIdentifier(payload, ["cus_sensitive"]),
    true
  );
  assert.equal(
    payloadContainsProviderIdentifier(payload, ["cus_other"]),
    false
  );
  assert.equal(
    payloadContainsProviderIdentifier("not-json", ["cus_sensitive"]),
    false
  );
});

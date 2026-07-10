import assert from "node:assert/strict";
import test from "node:test";

import { resolveAuthoritativeStripeUserId } from "./stripe-customer-ownership";

test("Stripe ownership accepts one consistent provider subject owner", () => {
  assert.equal(
    resolveAuthoritativeStripeUserId({
      checkoutCorrelation: "valid",
      eventUserId: "user-a",
      mappedUserId: "user-a",
      tombstoneUserId: "user-a",
    }),
    "user-a"
  );
  assert.equal(
    resolveAuthoritativeStripeUserId({
      checkoutCorrelation: "not_applicable",
      eventUserId: null,
      mappedUserId: null,
      tombstoneUserId: "user-a",
    }),
    "user-a"
  );
  assert.equal(
    resolveAuthoritativeStripeUserId({
      checkoutCorrelation: "not_applicable",
      eventUserId: "metadata-only-user",
      mappedUserId: null,
      tombstoneUserId: null,
    }),
    null
  );
});

test("Stripe ownership fails closed on correlation or owner disagreement", () => {
  assert.throws(
    () =>
      resolveAuthoritativeStripeUserId({
        checkoutCorrelation: "invalid",
        eventUserId: null,
        mappedUserId: null,
        tombstoneUserId: "user-a",
      }),
    hasOwnerMismatchCode
  );
  assert.throws(
    () =>
      resolveAuthoritativeStripeUserId({
        checkoutCorrelation: "valid",
        eventUserId: "user-a",
        mappedUserId: "user-b",
        tombstoneUserId: null,
      }),
    hasOwnerMismatchCode
  );
  assert.throws(
    () =>
      resolveAuthoritativeStripeUserId({
        checkoutCorrelation: "not_applicable",
        eventUserId: "user-a",
        mappedUserId: null,
        tombstoneUserId: "user-b",
      }),
    hasOwnerMismatchCode
  );
});

function hasOwnerMismatchCode(error: unknown) {
  return (
    error instanceof Error &&
    (error as Error & { code?: string }).code ===
      "stripe_subject_owner_mismatch"
  );
}

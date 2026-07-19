import assert from "node:assert/strict";
import test from "node:test";

import { parseAuthHandoffContext } from "../auth/auth-handoff";
import {
  buildCheckoutSuccessDestination,
  buildCheckoutSuccessSigninHref,
} from "./checkout-success-navigation";
import {
  isCheckoutSessionId,
  isCheckoutSuccessPublicState,
  resolveCheckoutSettlement,
  type CheckoutSettlementEvidence,
} from "./checkout-success-state";

const SESSION_ID = "cs_test_checkout_return_123";
const USER_ID = "11111111-1111-4111-8111-111111111111";

test("accepts only bounded Checkout Session identifiers", () => {
  assert.equal(isCheckoutSessionId(SESSION_ID), true);
  assert.equal(isCheckoutSessionId("cs_live_checkout123"), true);
  assert.equal(isCheckoutSessionId(null), false);
  assert.equal(isCheckoutSessionId(""), false);
  assert.equal(isCheckoutSessionId("{CHECKOUT_SESSION_ID}"), false);
  assert.equal(isCheckoutSessionId("pi_test_not_a_checkout_session"), false);
  assert.equal(isCheckoutSessionId(`cs_test_${"a".repeat(300)}`), false);
});

test("auth handoff uses a clean destination without provider identifiers", () => {
  assert.equal(buildCheckoutSuccessDestination(), "/pricing/success");

  const signin = new URL(
    buildCheckoutSuccessSigninHref(),
    "https://meelni.com"
  );
  assert.deepEqual(parseAuthHandoffContext(signin.searchParams), {
    redirectTo: "/pricing/success",
    cancelTo: "/pricing",
  });
  assert.doesNotMatch(signin.href, /cs_(?:test|live)_|cr_[A-Za-z0-9]{32}/);
});

test("no webhook settlement evidence remains pending", () => {
  assert.deepEqual(resolve([]), { status: "pending", retryable: true });
});

test("one-time confirmation requires exact payment and grant ownership", () => {
  assert.deepEqual(resolve([interviewPassEvidence()]), {
    status: "confirmed",
    purchase: "interview_pass",
  });

  for (const invalid of [
    { creditGrantId: null },
    { grantId: "different-grant" },
    { grantUserId: "22222222-2222-4222-8222-222222222222" },
    { grantCatalogId: "starter" },
    { grantSource: "admin" },
    { grantSourceId: "cs_test_other" },
    { grantOriginalCredits: 2 },
  ] satisfies Array<Partial<CheckoutSettlementEvidence>>) {
    assert.deepEqual(resolve([interviewPassEvidence(invalid)]), {
      status: "error",
      reason: "invalid_purchase",
      retryable: true,
    });
  }
});

test("subscription confirmation requires invoice-correlated renewal grant", () => {
  assert.deepEqual(resolve([subscriptionEvidence()]), {
    status: "confirmed",
    purchase: "subscription",
  });
  assert.deepEqual(
    resolve([subscriptionEvidence({ grantSourceId: "in_other" })]),
    { status: "error", reason: "invalid_purchase", retryable: true }
  );
  assert.deepEqual(
    resolve([subscriptionEvidence({ grantOriginalCredits: 12 })]),
    { status: "error", reason: "invalid_purchase", retryable: true }
  );
});

test("one canonical row moves from failed to succeeded or reversal truth", () => {
  assert.deepEqual(
    resolve([interviewPassEvidence({ status: "failed", creditGrantId: null })]),
    { status: "error", reason: "payment_failed", retryable: true }
  );
  assert.deepEqual(resolve([interviewPassEvidence()]), {
    status: "confirmed",
    purchase: "interview_pass",
  });

  assert.deepEqual(resolve([interviewPassEvidence({ status: "disputed" })]), {
    status: "error",
    reason: "payment_reversed",
    retryable: false,
  });
});

test("foreign owner/session and ambiguous success evidence fail closed", () => {
  assert.deepEqual(
    resolve([interviewPassEvidence({ paymentUserId: "foreign-user" })]),
    { status: "error", reason: "not_found", retryable: false }
  );
  assert.deepEqual(
    resolve([interviewPassEvidence({ checkoutSessionId: "cs_test_other" })]),
    { status: "error", reason: "not_found", retryable: false }
  );
  assert.deepEqual(
    resolve([interviewPassEvidence(), interviewPassEvidence()]),
    {
      status: "error",
      reason: "invalid_purchase",
      retryable: true,
    }
  );
});

test("client response guard rejects forged confirmed payloads", () => {
  assert.equal(
    isCheckoutSuccessPublicState({ status: "confirmed", purchase: "credits" }),
    false
  );
  assert.equal(
    isCheckoutSuccessPublicState({
      status: "confirmed",
      purchase: "interview_pass",
    }),
    true
  );
});

function resolve(evidence: readonly CheckoutSettlementEvidence[]) {
  return resolveCheckoutSettlement({
    requestedSessionId: SESSION_ID,
    userId: USER_ID,
    evidence,
  });
}

function interviewPassEvidence(
  overrides: Partial<CheckoutSettlementEvidence> = {}
): CheckoutSettlementEvidence {
  return {
    checkoutSessionId: SESSION_ID,
    invoiceId: null,
    paymentUserId: USER_ID,
    status: "succeeded",
    creditGrantId: "grant-pass",
    catalogId: "interview_pass",
    grantId: "grant-pass",
    grantUserId: USER_ID,
    grantCatalogId: "interview_pass",
    grantSource: "checkout",
    grantSourceId: SESSION_ID,
    grantOriginalCredits: 1,
    ...overrides,
  };
}

function subscriptionEvidence(
  overrides: Partial<CheckoutSettlementEvidence> = {}
): CheckoutSettlementEvidence {
  return {
    checkoutSessionId: SESSION_ID,
    invoiceId: "in_test_checkout_return_123",
    paymentUserId: USER_ID,
    status: "succeeded",
    creditGrantId: "grant-starter",
    catalogId: "starter",
    grantId: "grant-starter",
    grantUserId: USER_ID,
    grantCatalogId: "starter",
    grantSource: "subscription_renewal",
    grantSourceId: "in_test_checkout_return_123",
    grantOriginalCredits: 4,
    ...overrides,
  };
}

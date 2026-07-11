import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStripeDeletionSubjects,
  fingerprintStripeSubject,
  normalizeStripeDeletionSubjects,
  getStripeEventSubject,
  payloadContainsProviderIdentifier,
} from "./stripe-privacy";

test("deletion subjects include pass-only and multiple mapped customers", () => {
  const subjects = buildStripeDeletionSubjects({
    subscriptionId: null,
    subscriptionCustomerId: null,
    mappedCustomerIds: ["cus_pass", "cus_second", "cus_pass"],
    paymentIntentIds: ["pi_pass"],
    chargeIds: ["ch_pass"],
  });
  assert.deepEqual(
    subjects.map(({ kind, providerId }) => ({ kind, providerId })),
    [
      { kind: "customer", providerId: "cus_pass" },
      { kind: "customer", providerId: "cus_second" },
      { kind: "payment_intent", providerId: "pi_pass" },
      { kind: "charge", providerId: "ch_pass" },
    ]
  );
});

test("refund and dispute events resolve durable payment subjects", () => {
  const refund = getStripeEventSubject({
    data: { object: { object: "refund", payment_intent: "pi_deleted" } },
  } as never);
  const dispute = getStripeEventSubject({
    data: { object: { object: "dispute", charge: "ch_deleted" } },
  } as never);
  assert.equal(refund.paymentIntentId, "pi_deleted");
  assert.equal(refund.fingerprint, fingerprintStripeSubject("pi_deleted"));
  assert.equal(dispute.chargeId, "ch_deleted");
  assert.equal(dispute.fingerprint, fingerprintStripeSubject("ch_deleted"));
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

test("deletion subject parsing preserves legacy and financial recovery kinds", () => {
  const legacyFingerprint = fingerprintStripeSubject("cus_legacy")!;
  const subscriptionFingerprint = fingerprintStripeSubject("sub_legacy")!;
  const invoiceFingerprint = fingerprintStripeSubject("in_recovery")!;
  const paymentFingerprint = fingerprintStripeSubject("pi_recovery")!;
  assert.deepEqual(
    normalizeStripeDeletionSubjects([
      {
        kind: "customer",
        providerId: "cus_legacy",
        fingerprint: legacyFingerprint,
      },
      {
        kind: "subscription",
        providerId: null,
        fingerprint: subscriptionFingerprint,
      },
      {
        kind: "invoice",
        providerId: "in_recovery",
        fingerprint: invoiceFingerprint,
      },
      {
        kind: "payment_intent",
        providerId: "pi_recovery",
        fingerprint: paymentFingerprint,
      },
    ]),
    [
      {
        kind: "customer",
        providerId: "cus_legacy",
        fingerprint: legacyFingerprint,
      },
      {
        kind: "subscription",
        providerId: null,
        fingerprint: subscriptionFingerprint,
      },
      {
        kind: "invoice",
        providerId: "in_recovery",
        fingerprint: invoiceFingerprint,
      },
      {
        kind: "payment_intent",
        providerId: "pi_recovery",
        fingerprint: paymentFingerprint,
      },
    ]
  );
  for (const corrupt of [
    null,
    [{ kind: "unknown", providerId: "bad", fingerprint: "bad" }],
    [{ kind: "charge", providerId: 42, fingerprint: "bad-type" }],
    [
      {
        kind: "customer",
        providerId: "cus_mismatch",
        fingerprint: fingerprintStripeSubject("cus_other"),
      },
    ],
    [
      {
        kind: "customer",
        providerId: "sub_wrong_kind",
        fingerprint: fingerprintStripeSubject("sub_wrong_kind"),
      },
    ],
  ]) {
    assert.throws(
      () => normalizeStripeDeletionSubjects(corrupt),
      (error: unknown) => {
        assert.equal(
          (error as { code?: string }).code,
          "account_deletion_subjects_invalid"
        );
        assert.equal(JSON.stringify(error).includes("bad"), false);
        return true;
      }
    );
  }
});

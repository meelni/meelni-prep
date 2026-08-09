import assert from "node:assert/strict";
import test from "node:test";

import {
  INTERVIEW_CREDIT_POLICY_VERSION,
  isSafeInterviewBillingFaultCode,
  resolveInterviewCreditPolicy,
} from "./interview-credit-policy";

test("active terminal reservations release regardless of fault", () => {
  for (const fault of ["user", "provider", "integrity"] as const) {
    assert.deepEqual(
      resolveInterviewCreditPolicy({ fault, reservationStatus: "active" }),
      {
        policyVersion: INTERVIEW_CREDIT_POLICY_VERSION,
        action: "release",
        reason: "terminal_before_usable",
        ledgerMutationRequired: true,
      }
    );
  }
});
test("consumed provider and integrity faults refund", () => {
  assert.equal(
    resolveInterviewCreditPolicy({
      fault: "provider",
      reservationStatus: "consumed",
    }).action,
    "refund"
  );
  assert.equal(
    resolveInterviewCreditPolicy({
      fault: "integrity",
      reservationStatus: "consumed",
    }).reason,
    "integrity_failure_after_usable"
  );
});

test("consumed user outcomes retain the charge", () => {
  assert.deepEqual(
    resolveInterviewCreditPolicy({
      fault: "user",
      reservationStatus: "consumed",
    }),
    {
      policyVersion: INTERVIEW_CREDIT_POLICY_VERSION,
      action: "retain",
      reason: "user_outcome_after_usable",
      ledgerMutationRequired: false,
    }
  );
});

test("replays validate already terminal reservation evidence", () => {
  assert.equal(
    resolveInterviewCreditPolicy({
      fault: "provider",
      reservationStatus: "refunded",
    }).ledgerMutationRequired,
    false
  );
  assert.equal(
    resolveInterviewCreditPolicy({
      fault: "user",
      reservationStatus: "released",
    }).ledgerMutationRequired,
    false
  );
  assert.throws(
    () =>
      resolveInterviewCreditPolicy({
        fault: "user",
        reservationStatus: "refunded",
      }),
    /evidence_conflict/
  );
});

test("billing fault codes are allowlisted machine identifiers", () => {
  assert.equal(
    isSafeInterviewBillingFaultCode("provider.session_failed"),
    true
  );
  assert.equal(isSafeInterviewBillingFaultCode("runtime-start_1"), true);
  assert.equal(
    isSafeInterviewBillingFaultCode("Provider failed: secret"),
    false
  );
  assert.equal(isSafeInterviewBillingFaultCode("stack\ntrace"), false);
  assert.equal(isSafeInterviewBillingFaultCode("a".repeat(65)), false);
});

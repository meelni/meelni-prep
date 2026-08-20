import assert from "node:assert/strict";
import test from "node:test";

import { ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256 } from "@meelni/agent";
import {
  createDurablePreviewShadowCohortStopEvent,
  createDurablePreviewShadowSessionReceipt,
  createDurablePreviewShadowStopIncompleteIncident,
  PreviewShadowControlPlaneError,
} from "./adaptive-interviewer-preview-shadow-control-plane";

const SHA = "a".repeat(64);
const RUN = "b".repeat(64);
const LEASE = "c".repeat(64);
const NOW = "2026-08-20T12:00:00.000Z";
// Frozen outputs from the accepted SAV-479 reference model. Keeping the oracle
// values here avoids making its non-authoritative module a runtime dependency.
const REFERENCE_RECEIPT_ID =
  "21f89e3f295910788e1a85c7337d4178cf639bf83695b9dfc9f5e87aac4f88ae";
const REFERENCE_INCIDENT_ID =
  "1a040d31ef39b24b33b94e7cbb47f9be5899ae25054f7baaef22867be9d59b94";
const REFERENCE_STOP_EVENT_ID =
  "d683e3799dbcc5dc1b070f16c5d732a5b316d7e485862228ea353220074a74d1";

test("durable receipt, incident, and stop evidence is canonical and deeply frozen", () => {
  const receiptPayload = {
    contract_version:
      "adaptive-interviewer-preview-shadow-session-receipt.v1" as const,
    run_id: RUN,
    lease_id: LEASE,
    session_ordinal: 1,
    allocation_ledger_revision: 1,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    outcome: "settled" as const,
    attempt_count: 1,
    reconciled_spend_nano_usd: 100_000_000,
    outstanding_attempt_reservations_nano_usd: 0 as const,
    attempt_receipts_sha256: SHA,
    settled_at: NOW,
  };
  const reordered = Object.fromEntries(
    Object.entries(receiptPayload).reverse()
  ) as typeof receiptPayload;
  const receipt = createDurablePreviewShadowSessionReceipt(receiptPayload);
  const reorderedReceipt = createDurablePreviewShadowSessionReceipt(reordered);
  assert.equal(receipt.receipt_id, reorderedReceipt.receipt_id);
  assert.equal(receipt.receipt_id, REFERENCE_RECEIPT_ID);
  assert.equal(receipt.integrity_sha256, receipt.receipt_id);
  assert.ok(Object.isFrozen(receipt));

  const incident = createDurablePreviewShadowStopIncompleteIncident({
    contract_version:
      "adaptive-interviewer-preview-shadow-stop-incomplete-incident.v1",
    run_id: RUN,
    lease_id: LEASE,
    session_ordinal: 1,
    allocation_ledger_revision: 1,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    reason: "cleanup_unconfirmed",
    attempt_count: 10,
    reconciled_spend_nano_usd: 1_000_000_000,
    retained_session_reservation_nano_usd: 1_000_000_000,
    attempt_receipts_sha256: SHA,
    observed_at: NOW,
    requires_allocation_stop: true,
    termination_acknowledgement_required: true,
  });
  assert.equal(incident.incident_id, REFERENCE_INCIDENT_ID);
  assert.equal(incident.integrity_sha256, incident.incident_id);
  assert.ok(Object.isFrozen(incident));

  const event = createDurablePreviewShadowCohortStopEvent({
    contract_version:
      "adaptive-interviewer-preview-shadow-cohort-stop-event.v1",
    run_id: RUN,
    reason: "kill_switch_failure",
    evidence_sha256: SHA,
    observed_at: NOW,
  });
  assert.equal(event.stop_event_id, REFERENCE_STOP_EVENT_ID);
  assert.equal(event.integrity_sha256, event.stop_event_id);
  assert.ok(Object.isFrozen(event));
});

test("public evidence builders reject undercounting and hostile object shapes", () => {
  const valid = {
    contract_version:
      "adaptive-interviewer-preview-shadow-session-receipt.v1" as const,
    run_id: RUN,
    lease_id: LEASE,
    session_ordinal: 1,
    allocation_ledger_revision: 1,
    preview_shadow_configuration_sha256:
      ADAPTIVE_INTERVIEWER_PREVIEW_SHADOW_CONFIGURATION_SHA256,
    outcome: "settled" as const,
    attempt_count: 10,
    reconciled_spend_nano_usd: 1_000_000_000,
    outstanding_attempt_reservations_nano_usd: 0 as const,
    attempt_receipts_sha256: SHA,
    settled_at: NOW,
  };
  assert.throws(
    () =>
      createDurablePreviewShadowSessionReceipt({
        ...valid,
        reconciled_spend_nano_usd: 999_999_999,
      }),
    closedInvalid
  );
  assert.throws(
    () =>
      createDurablePreviewShadowSessionReceipt({
        ...valid,
        extra: true,
      } as typeof valid),
    closedInvalid
  );
  const getter = { ...valid };
  Object.defineProperty(getter, "attempt_count", {
    enumerable: true,
    get() {
      throw new Error("raw-secret");
    },
  });
  assert.throws(
    () => createDurablePreviewShadowSessionReceipt(getter),
    closedInvalid
  );
  const withSymbol = { ...valid, [Symbol("hidden")]: true };
  assert.throws(
    () => createDurablePreviewShadowSessionReceipt(withSymbol),
    closedInvalid
  );
  const proxy = new Proxy(valid, {
    ownKeys() {
      throw new Error("raw-capability-secret");
    },
  });
  assert.throws(
    () => createDurablePreviewShadowSessionReceipt(proxy),
    closedInvalid
  );
  assert.throws(
    () =>
      createDurablePreviewShadowSessionReceipt(
        Object.assign(Object.create(null), valid)
      ),
    closedInvalid
  );
});

function closedInvalid(error: unknown): boolean {
  assert.ok(error instanceof PreviewShadowControlPlaneError);
  assert.equal(error.code, "preview_shadow_control_plane_invalid");
  assert.doesNotMatch(error.message, /secret/);
  return true;
}

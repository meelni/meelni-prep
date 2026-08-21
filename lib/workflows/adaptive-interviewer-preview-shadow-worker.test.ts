import assert from "node:assert/strict";
import test from "node:test";

import type {
  DurablePreviewShadowControlPlaneStore,
  DurablePreviewShadowSessionLease,
} from "@/lib/db/adaptive-interviewer-preview-shadow-control-plane";
import {
  createPreviewShadowWorkerWorkflow,
  PREVIEW_SHADOW_WORKER_REQUEST_VERSION,
} from "./adaptive-interviewer-preview-shadow-worker";

const lease = {
  run_id: "a".repeat(64),
  lease_id: "b".repeat(64),
  allocation_ledger_revision: 2,
} as DurablePreviewShadowSessionLease;

test("worker admission returns only content-free durable identity", async () => {
  const calls: unknown[] = [];
  const workflow = createPreviewShadowWorkerWorkflow({
    store: storeFixture(),
    verifyAdmission: async (input) => {
      calls.push(input);
      return lease;
    },
  });
  const result = await workflow.handle({
    contract_version: PREVIEW_SHADOW_WORKER_REQUEST_VERSION,
    action: "admit",
    payload: {
      lease: { secret: "must-not-return" },
      worker_evidence_capability: "c".repeat(43),
    },
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(result, {
    ok: true,
    action: "admit",
    admitted: true,
    run_id: lease.run_id,
    lease_id: lease.lease_id,
    revision: 2,
  });
  assert.doesNotMatch(JSON.stringify(result), /secret|cccc/);
});

test("terminal receipt and incident delegate to the exact capability mutation", async () => {
  const calls: unknown[] = [];
  const store = storeFixture({
    reconcileSessionReceipt: async (input) => {
      calls.push(["receipt", input]);
      return mutationResult(false);
    },
    recordStopIncompleteIncident: async (input) => {
      calls.push(["incident", input]);
      return mutationResult(true) as never;
    },
  });
  const workflow = createPreviewShadowWorkerWorkflow({
    store,
    verifyAdmission: async () => lease,
  });
  for (const kind of ["receipt", "stop_incomplete"] as const) {
    const result = await workflow.handle({
      contract_version: PREVIEW_SHADOW_WORKER_REQUEST_VERSION,
      action: "reconcile",
      payload: {
        kind,
        run_id: lease.run_id,
        expected_revision: 2,
        worker_evidence_capability: "d".repeat(43),
        evidence: { kind },
      },
    });
    assert.equal(result.action, "reconcile");
  }
  assert.equal(calls.length, 2);
});

function mutationResult(stopped: boolean) {
  return {
    outcome: "recorded" as const,
    run: { revision: 3, stopped },
    receipt: {},
  } as never;
}

function storeFixture(
  overrides: Partial<DurablePreviewShadowControlPlaneStore> = {}
): DurablePreviewShadowControlPlaneStore {
  const unavailable = async () => {
    throw new Error("unused");
  };
  return {
    activate: unavailable,
    allocateSessionLease: unavailable,
    reconcileSessionReceipt: unavailable,
    recordStopIncompleteIncident: unavailable,
    recordCohortStopEvent: unavailable,
    acknowledgeTermination: unavailable,
    ...overrides,
  } as DurablePreviewShadowControlPlaneStore;
}

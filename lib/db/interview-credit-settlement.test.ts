import assert from "node:assert/strict";
import test from "node:test";

import type { InterviewCreditSettlementEvidence } from "@/lib/workflows/converge-interview-credit-settlement";
import { withDeferredInterviewCreditSettlementTracking } from "./interview-credit-settlement";

const evidence: InterviewCreditSettlementEvidence = {
  transactionType: "refund",
  userId: "650e8400-e29b-41d4-a716-446655440000",
  credits: 1,
  idempotencyKey: "refund:interview-credit-recovery.v1:reservation",
  sessionId: "550e8400-e29b-41d4-a716-446655440000",
  reservationId: "reservation-1",
};

test("deferred settlement analytics run only after the outer transaction resolves", async () => {
  const order: string[] = [];
  const result = await withDeferredInterviewCreditSettlementTracking(
    async (defer) => {
      order.push("outer_transaction_started");
      defer(evidence);
      order.push("outer_transaction_committed");
      return "committed";
    },
    () => order.push("analytics")
  );

  assert.equal(result, "committed");
  assert.deepEqual(order, [
    "outer_transaction_started",
    "outer_transaction_committed",
    "analytics",
  ]);
});

test("an outer transaction rollback discards nested settlement analytics", async () => {
  const tracked: InterviewCreditSettlementEvidence[] = [];

  await assert.rejects(
    withDeferredInterviewCreditSettlementTracking(
      async (defer) => {
        defer(evidence);
        throw new Error("outer_commit_failed");
      },
      (completed) => tracked.push(completed)
    ),
    /outer_commit_failed/
  );

  assert.deepEqual(tracked, []);
});

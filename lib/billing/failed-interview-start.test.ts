import assert from "node:assert/strict";
import test from "node:test";

import type { LedgerCreditReservation } from "./credits";
import { settleFailedInterviewStartReservation } from "./failed-interview-start";

test("failed start releases an active reservation idempotently", async () => {
  const calls: string[] = [];
  await settleFailedInterviewStartReservation("reservation-1", {
    store: { findReservationByKey: async () => reservation("active") },
    release: async (input) => {
      calls.push(`${input.idempotencyKey}`);
    },
    refund: async () => {
      throw new Error("refund should not run");
    },
  });

  assert.deepEqual(calls, ["release:reservation-1"]);
});

test("failed start refunds an ambiguously consumed reservation", async () => {
  const calls: string[] = [];
  await settleFailedInterviewStartReservation("reservation-1", {
    store: { findReservationByKey: async () => reservation("consumed") },
    release: async () => {
      throw new Error("release should not run");
    },
    refund: async (input) => {
      calls.push(`${input.idempotencyKey}`);
    },
  });

  assert.deepEqual(calls, ["refund:reservation-1"]);
});

test("already terminal or missing failed-start reservations need no mutation", async () => {
  for (const status of ["released", "refunded", "expired"] as const) {
    let mutations = 0;
    await settleFailedInterviewStartReservation("reservation-1", {
      store: { findReservationByKey: async () => reservation(status) },
      release: async () => {
        mutations += 1;
      },
      refund: async () => {
        mutations += 1;
      },
    });
    assert.equal(mutations, 0);
  }
});

function reservation(
  status: LedgerCreditReservation["status"]
): LedgerCreditReservation {
  return {
    id: "reservation-id",
    userId: "user-id",
    reservationKey: "reservation-1",
    status,
    credits: 1,
    sessionId: null,
    expiresAt: new Date("2026-07-10T09:00:00.000Z"),
    metadata: null,
    createdAt: new Date("2026-07-10T08:00:00.000Z"),
    updatedAt: new Date("2026-07-10T08:00:00.000Z"),
  };
}

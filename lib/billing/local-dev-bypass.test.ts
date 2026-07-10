import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalDevCreditLedgerService,
  getLocalDevCreditBalanceResponse,
  isLocalDevCreditBypassEnabled,
} from "./local-dev-bypass";

test("local credit bypass is enabled for local Next.js development", () => {
  assert.equal(
    isLocalDevCreditBypassEnabled({
      NODE_ENV: "development",
    }),
    true
  );
  assert.equal(
    isLocalDevCreditBypassEnabled({
      NODE_ENV: "development",
      VERCEL: "1",
    }),
    true
  );
  assert.equal(
    isLocalDevCreditBypassEnabled({
      NODE_ENV: "production",
      MEELNI_LOCAL_CREDIT_BYPASS: "1",
    }),
    false
  );
});

test("local credit bypass can be explicitly disabled", () => {
  assert.equal(
    isLocalDevCreditBypassEnabled({
      NODE_ENV: "development",
      MEELNI_DISABLE_LOCAL_CREDIT_BYPASS: "1",
    }),
    false
  );
});

test("local dev credit response exposes a generous non-persistent balance", () => {
  assert.deepEqual(getLocalDevCreditBalanceResponse(), {
    availableCredits: 999,
    reservedCredits: 0,
    expiringCredits: 0,
    nextCreditExpiresAt: null,
    trialAvailable: false,
    grants: [],
    localDevBypass: true,
  });
});

test("local dev credit ledger reserves and completes credits without storage", async () => {
  const ledger = createLocalDevCreditLedgerService({
    now: () => new Date("2026-06-29T12:00:00.000Z"),
  });

  const result = await ledger.reserveCredit({
    userId: "user-1",
    reservationKey: "interview-start:user-1:room-1",
  });

  assert.equal(result.reservation.userId, "user-1");
  assert.equal(
    result.reservation.reservationKey,
    "interview-start:user-1:room-1"
  );
  assert.equal(result.reservation.status, "active");
  assert.deepEqual(result.allocations, []);

  const consumed = await ledger.consumeReservation({
    reservationKey: "interview-start:user-1:room-1",
    idempotencyKey: "consume:interview-start:user-1:room-1",
  });
  const replayed = await ledger.consumeReservation({
    reservationKey: "interview-start:user-1:room-1",
    idempotencyKey: "consume:interview-start:user-1:room-1",
  });

  assert.equal(consumed.reservation.status, "consumed");
  assert.equal(consumed.duplicate, false);
  assert.equal(replayed.duplicate, true);
});

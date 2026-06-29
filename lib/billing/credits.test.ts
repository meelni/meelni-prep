import assert from "node:assert/strict";
import test from "node:test";

import {
  createCreditLedgerService,
  createMemoryCreditLedgerStore,
} from "./credits";

test("grantCredits is idempotent and balance ignores expired grants", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({
    store,
    now: () => new Date("2026-06-29T00:00:00.000Z"),
  });

  const first = await ledger.grantCredits({
    userId: "user-1",
    catalogId: "trial",
    source: "trial",
    idempotencyKey: "trial:user-1",
  });
  const second = await ledger.grantCredits({
    userId: "user-1",
    catalogId: "trial",
    source: "trial",
    idempotencyKey: "trial:user-1",
  });

  assert.equal(first.grant.id, second.grant.id);
  assert.equal(first.grant.originalCredits, 2);
  assert.equal(first.grant.remainingCredits, 2);

  assert.deepEqual(await ledger.getCreditBalance("user-1"), {
    availableCredits: 2,
    reservedCredits: 0,
    expiringCredits: 2,
    nextCreditExpiresAt: new Date("2026-07-06T00:00:00.000Z"),
  });

  const later = createCreditLedgerService({
    store,
    now: () => new Date("2026-07-07T00:00:00.000Z"),
  });
  assert.equal((await later.expireCredits("user-1")).expiredCredits, 2);
  assert.equal((await later.getCreditBalance("user-1")).availableCredits, 0);
});

test("reserveCredit is idempotent and consumes oldest expiring grants first", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({
    store,
    now: () => new Date("2026-06-29T00:00:00.000Z"),
  });
  await ledger.grantCredits({
    userId: "user-1",
    catalogId: "trial",
    source: "trial",
    idempotencyKey: "trial:user-1",
  });

  const first = await ledger.reserveCredit({
    userId: "user-1",
    reservationKey: "session:1",
    sessionId: "session-1",
  });
  const second = await ledger.reserveCredit({
    userId: "user-1",
    reservationKey: "session:1",
    sessionId: "session-1",
  });

  assert.equal(first.reservation.id, second.reservation.id);
  assert.equal((await ledger.getCreditBalance("user-1")).availableCredits, 1);
  assert.equal((await ledger.getCreditBalance("user-1")).reservedCredits, 1);

  await ledger.consumeReservation({
    reservationKey: "session:1",
    idempotencyKey: "consume:session:1",
  });
  await ledger.consumeReservation({
    reservationKey: "session:1",
    idempotencyKey: "consume:session:1",
  });

  assert.equal((await ledger.getCreditBalance("user-1")).availableCredits, 1);
  assert.equal((await ledger.getCreditBalance("user-1")).reservedCredits, 0);
});

test("release and refund restore credits exactly once", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({
    store,
    now: () => new Date("2026-06-29T00:00:00.000Z"),
  });
  await ledger.grantCredits({
    userId: "user-1",
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: "checkout:pi_1",
  });

  await ledger.reserveCredit({
    userId: "user-1",
    reservationKey: "session:release",
    sessionId: "session-release",
  });
  await ledger.releaseReservation({
    reservationKey: "session:release",
    idempotencyKey: "release:session:release",
  });
  await ledger.releaseReservation({
    reservationKey: "session:release",
    idempotencyKey: "release:session:release",
  });
  assert.equal((await ledger.getCreditBalance("user-1")).availableCredits, 1);

  await ledger.reserveCredit({
    userId: "user-1",
    reservationKey: "session:refund",
    sessionId: "session-refund",
  });
  await ledger.consumeReservation({
    reservationKey: "session:refund",
    idempotencyKey: "consume:session:refund",
  });
  await ledger.refundReservation({
    reservationKey: "session:refund",
    idempotencyKey: "refund:session:refund",
  });
  await ledger.refundReservation({
    reservationKey: "session:refund",
    idempotencyKey: "refund:session:refund",
  });
  assert.equal((await ledger.getCreditBalance("user-1")).availableCredits, 1);
});

test("rolloverSubscriptionCredits respects plan cap and 60 day expiration", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({
    store,
    now: () => new Date("2026-06-29T00:00:00.000Z"),
  });

  await ledger.grantCredits({
    userId: "user-1",
    catalogId: "pro",
    source: "subscription_renewal",
    idempotencyKey: "renewal:1",
    includedCredits: 12,
  });
  await ledger.grantCredits({
    userId: "user-1",
    catalogId: "pro",
    source: "subscription_renewal",
    idempotencyKey: "renewal:2",
    includedCredits: 12,
  });

  const rollover = await ledger.rolloverSubscriptionCredits({
    userId: "user-1",
    catalogId: "pro",
    idempotencyKey: "rollover:2026-07",
  });

  assert.equal(rollover.rolledCredits, 12);
  assert.equal(
    rollover.grant?.expiresAt?.toISOString(),
    "2026-08-28T00:00:00.000Z"
  );

  const duplicate = await ledger.rolloverSubscriptionCredits({
    userId: "user-1",
    catalogId: "pro",
    idempotencyKey: "rollover:2026-07",
  });
  assert.equal(duplicate.grant?.id, rollover.grant?.id);
});

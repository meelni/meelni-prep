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

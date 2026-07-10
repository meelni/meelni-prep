import assert from "node:assert/strict";
import test from "node:test";

import { getCreditBalanceReadModel } from "./credit-balance-read-model";
import {
  createCreditLedgerService,
  createMemoryCreditLedgerStore,
  getTrialGrantIdempotencyKey,
  type CreditLedgerStore,
} from "./credits";
import { ensureCanonicalTrialGrant, isCanonicalTrialAvailable } from "./trial";

const USER_ID = "historical-user-1";
const TRIAL_KEY = getTrialGrantIdempotencyKey(USER_ID);
const STARTED_AT = new Date("2026-07-10T12:00:00.000Z");

test("concurrent trial activation creates one canonical grant and one grant transaction", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({
    store,
    now: () => STARTED_AT,
  });

  const results = await Promise.all(
    Array.from({ length: 12 }, () => ensureCanonicalTrialGrant(ledger, USER_ID))
  );

  assert.equal(new Set(results.map((result) => result.grant.id)).size, 1);
  assert.equal(
    results[0]?.grant.expiresAt?.toISOString(),
    "2026-07-17T12:00:00.000Z"
  );
  assert.equal((await store.listUserGrants(USER_ID)).length, 1);
  const transaction = await store.findTransactionByIdempotencyKey(
    `${TRIAL_KEY}:grant`
  );
  assert.equal(transaction?.grantId, results[0]?.grant.id);
  assert.equal(transaction?.credits, 2);

  const laterLedger = createCreditLedgerService({
    store,
    now: () => new Date("2026-07-12T12:00:00.000Z"),
  });
  const repeated = await ensureCanonicalTrialGrant(laterLedger, USER_ID);
  assert.equal(
    repeated.grant.expiresAt?.toISOString(),
    "2026-07-17T12:00:00.000Z"
  );
});

test("trial activation retry repairs a missing grant transaction", async () => {
  const store = createMemoryCreditLedgerStore();
  const grant = await store.createGrant({
    userId: USER_ID,
    catalogId: "trial",
    source: "trial",
    sourceId: null,
    idempotencyKey: TRIAL_KEY,
    originalCredits: 2,
    remainingCredits: 2,
    reservedCredits: 0,
    expiresAt: new Date("2026-07-17T12:00:00.000Z"),
    rolloverEligible: false,
    rolloverSourceGrantId: null,
    metadata: null,
  });
  const ledger = createCreditLedgerService({ store, now: () => STARTED_AT });

  assert.equal(
    await store.findTransactionByIdempotencyKey(`${TRIAL_KEY}:grant`),
    null
  );

  const repaired = await ensureCanonicalTrialGrant(ledger, USER_ID);
  const transaction = await store.findTransactionByIdempotencyKey(
    `${TRIAL_KEY}:grant`
  );

  assert.equal(repaired.grant.id, grant.id);
  assert.equal(transaction?.userId, USER_ID);
  assert.equal(transaction?.grantId, grant.id);
  assert.equal(transaction?.type, "grant");
  assert.equal(transaction?.credits, 2);
  assert.equal(transaction?.balanceAfter, 2);
});

test("trial activation can retry after the first grant transaction write fails", async () => {
  const baseStore = createMemoryCreditLedgerStore();
  let failTransactionOnce = true;
  const store: CreditLedgerStore = {
    ...baseStore,
    async createTransaction(input) {
      if (failTransactionOnce) {
        failTransactionOnce = false;
        throw new Error("transaction unavailable");
      }
      return baseStore.createTransaction(input);
    },
  };
  const ledger = createCreditLedgerService({ store, now: () => STARTED_AT });

  await assert.rejects(
    () => ensureCanonicalTrialGrant(ledger, USER_ID),
    /transaction unavailable/
  );
  assert.equal((await store.listUserGrants(USER_ID)).length, 1);

  const retried = await ensureCanonicalTrialGrant(ledger, USER_ID);
  assert.equal(retried.grant.idempotencyKey, TRIAL_KEY);
  assert.equal(
    (await store.findTransactionByIdempotencyKey(`${TRIAL_KEY}:grant`))
      ?.grantId,
    retried.grant.id
  );
});

test("trial activation fails closed when the grant transaction key collides", async () => {
  const store = createMemoryCreditLedgerStore();
  const grant = await store.createGrant({
    userId: USER_ID,
    catalogId: "trial",
    source: "trial",
    sourceId: null,
    idempotencyKey: TRIAL_KEY,
    originalCredits: 2,
    remainingCredits: 2,
    reservedCredits: 0,
    expiresAt: new Date("2026-07-17T12:00:00.000Z"),
    rolloverEligible: false,
    rolloverSourceGrantId: null,
    metadata: null,
  });
  await store.createTransaction({
    userId: "different-user",
    grantId: grant.id,
    reservationId: null,
    type: "grant",
    credits: 2,
    idempotencyKey: `${TRIAL_KEY}:grant`,
    sourceId: null,
    balanceAfter: 2,
    metadata: null,
  });
  const ledger = createCreditLedgerService({ store, now: () => STARTED_AT });

  await assert.rejects(
    () => ensureCanonicalTrialGrant(ledger, USER_ID),
    /credit_transaction_idempotency_conflict/
  );
});

test("trial activation fails closed on user, catalog, or source collisions", async (t) => {
  const collisions = [
    {
      name: "user",
      userId: "different-user",
      catalogId: "trial",
      source: "trial",
    },
    {
      name: "catalog",
      userId: USER_ID,
      catalogId: "interview_pass",
      source: "trial",
    },
    {
      name: "source",
      userId: USER_ID,
      catalogId: "trial",
      source: "admin",
    },
  ] as const;

  for (const collision of collisions) {
    await t.test(collision.name, async () => {
      const store = createMemoryCreditLedgerStore();
      await store.createGrant({
        userId: collision.userId,
        catalogId: collision.catalogId,
        source: collision.source,
        sourceId: null,
        idempotencyKey: TRIAL_KEY,
        originalCredits: 2,
        remainingCredits: 2,
        reservedCredits: 0,
        expiresAt: new Date("2026-07-17T12:00:00.000Z"),
        rolloverEligible: false,
        rolloverSourceGrantId: null,
        metadata: null,
      });
      const ledger = createCreditLedgerService({
        store,
        now: () => STARTED_AT,
      });

      await assert.rejects(
        () => ensureCanonicalTrialGrant(ledger, USER_ID),
        /credit_grant_idempotency_conflict/
      );
      assert.equal(
        await store.findTransactionByIdempotencyKey(`${TRIAL_KEY}:grant`),
        null
      );
    });
  }
});

test("credit reads preserve trial eligibility for historical accounts without mutating the ledger", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store, now: () => STARTED_AT });
  await ledger.grantCredits({
    userId: USER_ID,
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: "checkout:historical-user-1",
  });

  const first = await getCreditBalanceReadModel({
    store,
    userId: USER_ID,
    now: () => STARTED_AT,
  });
  const second = await getCreditBalanceReadModel({
    store,
    userId: USER_ID,
    now: () => STARTED_AT,
  });

  assert.equal(first.availableCredits, 1);
  assert.equal(first.trialAvailable, true);
  assert.equal(second.trialAvailable, true);
  assert.equal((await store.listUserGrants(USER_ID)).length, 1);
});

test("repeated empty-account credit reads create neither a trial grant nor transaction", async () => {
  const store = createMemoryCreditLedgerStore();

  for (let visit = 0; visit < 3; visit += 1) {
    const read = await getCreditBalanceReadModel({
      store,
      userId: USER_ID,
      now: () => STARTED_AT,
    });
    assert.equal(read.availableCredits, 0);
    assert.equal(read.trialAvailable, true);
  }

  assert.deepEqual(await store.listUserGrants(USER_ID), []);
  assert.equal(
    await store.findTransactionByIdempotencyKey(`${TRIAL_KEY}:grant`),
    null
  );
});

test("an expired or consumed canonical trial remains permanently unavailable", async () => {
  const expiredStore = createMemoryCreditLedgerStore();
  const expiredLedger = createCreditLedgerService({
    store: expiredStore,
    now: () => new Date("2026-07-01T12:00:00.000Z"),
  });
  await ensureCanonicalTrialGrant(expiredLedger, USER_ID);

  const expiredRead = await getCreditBalanceReadModel({
    store: expiredStore,
    userId: USER_ID,
    now: () => STARTED_AT,
  });
  assert.equal(expiredRead.availableCredits, 0);
  assert.equal(expiredRead.trialAvailable, false);

  const consumedStore = createMemoryCreditLedgerStore();
  const consumedLedger = createCreditLedgerService({
    store: consumedStore,
    now: () => STARTED_AT,
  });
  await ensureCanonicalTrialGrant(consumedLedger, USER_ID);
  for (const suffix of ["one", "two"]) {
    await consumedLedger.reserveCredit({
      userId: USER_ID,
      reservationKey: `session:${suffix}`,
    });
    await consumedLedger.consumeReservation({
      reservationKey: `session:${suffix}`,
      idempotencyKey: `consume:session:${suffix}`,
    });
  }

  assert.equal(await isCanonicalTrialAvailable(consumedStore, USER_ID), false);
  const consumedRead = await getCreditBalanceReadModel({
    store: consumedStore,
    userId: USER_ID,
    now: () => STARTED_AT,
  });
  assert.equal(consumedRead.availableCredits, 0);
  assert.equal(consumedRead.trialAvailable, false);
});

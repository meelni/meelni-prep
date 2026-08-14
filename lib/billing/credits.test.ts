import assert from "node:assert/strict";
import test from "node:test";
import { getCreditBalanceReadModel } from "./credit-balance-read-model";
import { createDrizzleCreditLedgerStore } from "./credit-ledger-store";
import {
  createCreditLedgerService,
  createMemoryCreditLedgerStore,
  type CreditLedgerTransaction,
  settleReservationInTransaction,
  type CreditLedgerStore,
} from "./credits";
import { resolveSubscriptionCreditPolicy } from "./subscription-credit-policy";

test("createDrizzleCreditLedgerStore exposes the credit ledger store contract", () => {
  const store = createDrizzleCreditLedgerStore();

  assert.equal("reserveCredit" in store, false);
  for (const mutation of [
    "createGrant",
    "updateGrantBalances",
    "createReservation",
    "updateReservationStatus",
    "createAllocation",
    "createTransaction",
  ]) {
    assert.equal(mutation in store, false, mutation);
  }
  assert.deepEqual(Object.keys(store).sort(), [
    "findGrantByIdempotencyKey",
    "findReservationByKey",
    "findTransactionByIdempotencyKey",
    "getCreditReadSnapshot",
    "getSubscriptionCreditPolicy",
    "listAllocations",
    "listSpendableGrants",
    "listUserGrants",
    "withUserTransaction",
  ]);
  assert.equal(typeof store.findReservationByKey, "function");
  assert.equal(typeof store.withUserTransaction, "function");
});

test("production transaction clock is read after the user lock and rejects invalid database time", async () => {
  function clockDatabase(value: unknown) {
    return {
      async transaction(
        work: (transaction: unknown) => Promise<unknown>
      ): Promise<unknown> {
        let selectIndex = 0;
        const transaction = {
          select() {
            const rows = selectIndex++ === 0 ? [{ id: "user-1" }] : [];
            return {
              from() {
                return {
                  where() {
                    return {
                      limit() {
                        return Object.assign(Promise.resolve(rows), {
                          for: async () => rows,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
          async execute() {
            assert.equal(selectIndex, 2);
            return [{ currentTime: value }];
          },
        };
        return work(transaction);
      },
    } as never;
  }

  const currentTime = await createDrizzleCreditLedgerStore(
    clockDatabase("2026-08-01T12:00:00.000Z")
  ).withUserTransaction("user-1", (transaction) =>
    transaction.getCurrentTime()
  );
  assert.equal(currentTime.toISOString(), "2026-08-01T12:00:00.000Z");

  await assert.rejects(
    createDrizzleCreditLedgerStore(
      clockDatabase("not-a-date")
    ).withUserTransaction("user-1", (transaction) =>
      transaction.getCurrentTime()
    ),
    /credit_ledger_clock_invalid/
  );
});

test("production balance read uses one user-fenced database-time snapshot", async () => {
  const order: string[] = [];
  const rowSets = [
    [{ id: "user-1" }],
    [
      {
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
      },
    ],
    [],
  ];
  const database = {
    async transaction(work: (transaction: unknown) => Promise<unknown>) {
      let selectIndex = 0;
      const transaction = {
        select() {
          const index = selectIndex++;
          const rows = rowSets[index] ?? [];
          order.push(`select:${index}`);
          const result = Promise.resolve(rows);
          const builder = {
            from() {
              return builder;
            },
            where() {
              return builder;
            },
            limit() {
              return builder;
            },
            async for(mode: string) {
              order.push(`lock:${mode}`);
              return rows;
            },
            then: result.then.bind(result),
            catch: result.catch.bind(result),
            finally: result.finally.bind(result),
          };
          return builder;
        },
        async execute() {
          order.push("clock");
          return [{ currentTime: "2026-08-01T12:00:00.000Z" }];
        },
      };
      return work(transaction);
    },
  } as never;

  const snapshot =
    await createDrizzleCreditLedgerStore(database).getCreditReadSnapshot(
      "user-1"
    );

  assert.equal(snapshot.currentTime.toISOString(), "2026-08-01T12:00:00.000Z");
  assert.deepEqual(order, [
    "select:0",
    "lock:share",
    "select:1",
    "lock:share",
    "clock",
    "select:2",
  ]);
});

test("production transaction mutations cannot escape the locked user scope", async () => {
  let attemptedWrites = 0;
  const database = {
    async transaction(
      work: (transaction: unknown) => Promise<unknown>
    ): Promise<unknown> {
      let selectIndex = 0;
      const transaction = {
        select() {
          const rows = selectIndex++ === 0 ? [{ id: "user-1" }] : [];
          return {
            from() {
              return {
                where() {
                  return {
                    limit() {
                      return Object.assign(Promise.resolve(rows), {
                        for: async () => rows,
                      });
                    },
                  };
                },
              };
            },
          };
        },
        insert() {
          attemptedWrites += 1;
          throw new Error("unexpected_insert");
        },
        update() {
          attemptedWrites += 1;
          throw new Error("unexpected_update");
        },
      };
      return work(transaction);
    },
  } as never;
  const store = createDrizzleCreditLedgerStore(database);

  await assert.rejects(
    store.withUserTransaction("user-1", (transaction) =>
      transaction.createGrant({
        userId: "user-2",
        catalogId: "trial",
        source: "trial",
        sourceId: null,
        idempotencyKey: "trial:user-2",
        originalCredits: 2,
        remainingCredits: 2,
        reservedCredits: 0,
        expiresAt: null,
        rolloverEligible: false,
        rolloverSourceGrantId: null,
        metadata: null,
      })
    ),
    /credit_ledger_user_scope_mismatch/
  );
  await assert.rejects(
    store.withUserTransaction("user-1", (transaction) =>
      transaction.updateGrantBalances("grant-owned-by-user-2", {
        remainingCredits: 0,
        reservedCredits: 0,
      })
    ),
    /credit_ledger_user_scope_mismatch/
  );
  await assert.rejects(
    store.withUserTransaction("user-1", (transaction) =>
      transaction.listUserGrantsForUpdate("user-2")
    ),
    /credit_ledger_user_scope_mismatch/
  );
  assert.equal(attemptedWrites, 0);
});

test("every inherited transaction read stays inside the locked user scope", async () => {
  const cases: Array<{
    selectRows: unknown[][];
    operation: (transaction: CreditLedgerTransaction) => Promise<unknown>;
  }> = [
    {
      selectRows: [[{ userId: "user-2" }]],
      operation: (transaction) =>
        transaction.findGrantByIdempotencyKey("grant:user-2"),
    },
    {
      selectRows: [[{ userId: "user-2" }]],
      operation: (transaction) =>
        transaction.findTransactionByIdempotencyKey("txn:user-2"),
    },
    {
      selectRows: [],
      operation: (transaction) =>
        transaction.listSpendableGrants("user-2", new Date()),
    },
    {
      selectRows: [],
      operation: (transaction) => transaction.listUserGrants("user-2"),
    },
    {
      selectRows: [[{ userId: "user-2" }]],
      operation: (transaction) =>
        transaction.findReservationByKey("reservation:user-2"),
    },
    {
      selectRows: [[]],
      operation: (transaction) =>
        transaction.listAllocations("reservation-owned-by-user-2"),
    },
  ];

  for (const { operation, selectRows } of cases) {
    const store = createDrizzleCreditLedgerStore(
      createScopedLedgerDatabase({ selectRows })
    );
    await assert.rejects(
      store.withUserTransaction("user-1", async (transaction) => {
        await assert.rejects(
          operation(transaction),
          /credit_ledger_user_scope_mismatch/
        );
      }),
      /credit_ledger_user_scope_mismatch/
    );
  }
});

test("unique-key conflict fallbacks cannot return another user's ledger rows", async () => {
  const operations: Array<
    (transaction: CreditLedgerTransaction) => Promise<unknown>
  > = [
    (transaction) =>
      transaction.createGrant({
        userId: "user-1",
        catalogId: "trial",
        source: "trial",
        sourceId: null,
        idempotencyKey: "grant-collision",
        originalCredits: 2,
        remainingCredits: 2,
        reservedCredits: 0,
        expiresAt: null,
        rolloverEligible: false,
        rolloverSourceGrantId: null,
        metadata: null,
      }),
    (transaction) =>
      transaction.createReservation({
        userId: "user-1",
        reservationKey: "reservation-collision",
        status: "active",
        credits: 1,
        sessionId: null,
        startContractVersion: 0,
        startAttemptId: null,
        expiresAt: new Date("2026-07-11T01:00:00.000Z"),
        metadata: null,
      }),
    (transaction) =>
      transaction.createTransaction({
        userId: "user-1",
        grantId: null,
        reservationId: null,
        type: "adjustment",
        credits: 1,
        idempotencyKey: "transaction-collision",
        sourceId: null,
        balanceAfter: null,
        metadata: null,
      }),
  ];

  for (const operation of operations) {
    const store = createDrizzleCreditLedgerStore(
      createScopedLedgerDatabase({
        selectRows: [[{ userId: "user-2" }]],
        insertRows: [[]],
      })
    );
    await assert.rejects(
      store.withUserTransaction("user-1", async (transaction) => {
        await assert.rejects(
          operation(transaction),
          /credit_ledger_user_scope_mismatch/
        );
      }),
      /credit_ledger_user_scope_mismatch/
    );
  }
});

test("corrupt cross-user terminal transactions roll back instead of appearing settled", async () => {
  let committed = false;
  let rolledBack = false;
  let attemptedWrites = 0;
  const store = createDrizzleCreditLedgerStore(
    createScopedLedgerDatabase({
      selectRows: [
        [{ id: "reservation-1" }],
        [{ userId: "user-2", reservationId: "reservation-1" }],
      ],
      onCommit: () => {
        committed = true;
      },
      onRollback: () => {
        rolledBack = true;
      },
      onWrite: () => {
        attemptedWrites += 1;
      },
    })
  );

  await assert.rejects(
    store.withUserTransaction("user-1", (transaction) =>
      transaction.listTerminalTransactionsByReservationForUpdate(
        "reservation-1"
      )
    ),
    /credit_ledger_user_scope_mismatch/
  );
  assert.equal(committed, false);
  assert.equal(rolledBack, true);
  assert.equal(attemptedWrites, 0);
});

test("corrupt cross-user allocation grants roll back every transaction read", async () => {
  const operations: Array<
    (transaction: CreditLedgerTransaction) => Promise<unknown>
  > = [
    (transaction) => transaction.listAllocations("reservation-1"),
    (transaction) => transaction.listAllocationsForUpdate("reservation-1"),
  ];

  for (const operation of operations) {
    let committed = false;
    let rolledBack = false;
    let attemptedWrites = 0;
    const store = createDrizzleCreditLedgerStore(
      createScopedLedgerDatabase({
        selectRows: [
          [{ id: "reservation-1" }],
          [
            {
              reservationId: "reservation-1",
              grantId: "grant-owned-by-user-2",
              credits: 1,
            },
          ],
          [],
        ],
        onCommit: () => {
          committed = true;
        },
        onRollback: () => {
          rolledBack = true;
        },
        onWrite: () => {
          attemptedWrites += 1;
        },
      })
    );

    await assert.rejects(
      store.withUserTransaction("user-1", operation),
      /credit_ledger_user_scope_mismatch/
    );
    assert.equal(committed, false);
    assert.equal(rolledBack, true);
    assert.equal(attemptedWrites, 0);
  }
});

test("a retained production transaction rejects every operation after callback closure", async () => {
  let queryCount = 0;
  let retainedTransaction: CreditLedgerTransaction | null = null;
  const database = createScopedLedgerDatabase({
    selectRows: [],
    onQuery: () => {
      queryCount += 1;
    },
  });
  const store = createDrizzleCreditLedgerStore(database);

  await store.withUserTransaction("user-1", async (transaction) => {
    retainedTransaction = transaction;
  });

  assert.ok(retainedTransaction);
  const queriesAfterCallback = queryCount;
  for (const operation of closedTransactionOperations(retainedTransaction)) {
    await assert.rejects(operation, /credit_ledger_transaction_closed/);
  }
  assert.equal(queryCount, queriesAfterCallback);
});

test("a returned production transaction closes after asynchronous callback settlement", async () => {
  let queryCount = 0;
  const database = createScopedLedgerDatabase({
    selectRows: [[]],
    onQuery: () => {
      queryCount += 1;
    },
  });
  const store = createDrizzleCreditLedgerStore(database);

  const returnedTransaction = await store.withUserTransaction(
    "user-1",
    async (transaction) => {
      await Promise.resolve();
      assert.deepEqual(await transaction.listUserGrants("user-1"), []);
      return transaction;
    }
  );

  const queriesAfterCallback = queryCount;
  for (const operation of closedTransactionOperations(returnedTransaction)) {
    await assert.rejects(operation, /credit_ledger_transaction_closed/);
  }
  assert.equal(queryCount, queriesAfterCallback);
});

test("an unawaited transaction operation is drained before callback commit", async () => {
  const deferredRows = deferred<unknown[]>();
  let committed = false;
  let queryCount = 0;
  let retainedTransaction!: CreditLedgerTransaction;
  const database = createScopedLedgerDatabase({
    selectRows: [deferredRows.promise],
    onQuery: () => {
      queryCount += 1;
    },
    onCommit: () => {
      committed = true;
    },
  });
  const store = createDrizzleCreditLedgerStore(database);
  let settled = false;

  const transactionResult = store
    .withUserTransaction("user-1", async (transaction) => {
      retainedTransaction = transaction;
      void transaction.listUserGrants("user-1");
      return "callback-settled";
    })
    .then((result) => {
      settled = true;
      return result;
    });

  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(committed, false);

  deferredRows.resolve([]);
  assert.equal(await transactionResult, "callback-settled");
  assert.equal(committed, true);
  assert.ok(retainedTransaction);

  const queriesAfterCommit = queryCount;
  await assert.rejects(
    retainedTransaction.listUserGrants("user-1"),
    /credit_ledger_transaction_closed/
  );
  assert.equal(queryCount, queriesAfterCommit);
});

test("a rejected unawaited transaction operation rolls back before closure", async () => {
  const deferredRows = deferred<unknown[]>();
  let committed = false;
  let rolledBack = false;
  let queryCount = 0;
  let retainedTransaction!: CreditLedgerTransaction;
  const database = createScopedLedgerDatabase({
    selectRows: [deferredRows.promise],
    onQuery: () => {
      queryCount += 1;
    },
    onCommit: () => {
      committed = true;
    },
    onRollback: () => {
      rolledBack = true;
    },
  });
  const store = createDrizzleCreditLedgerStore(database);

  const transactionResult = store.withUserTransaction(
    "user-1",
    async (transaction) => {
      retainedTransaction = transaction;
      void transaction.listUserGrants("user-1");
    }
  );

  await Promise.resolve();
  await Promise.resolve();
  deferredRows.reject(new Error("deferred_ledger_query_failed"));
  await assert.rejects(transactionResult, /deferred_ledger_query_failed/);
  assert.equal(committed, false);
  assert.equal(rolledBack, true);
  assert.ok(retainedTransaction);

  const queriesAfterRollback = queryCount;
  await assert.rejects(
    retainedTransaction.listUserGrants("user-1"),
    /credit_ledger_transaction_closed/
  );
  assert.equal(queryCount, queriesAfterRollback);
});

test("an early unawaited rejection is retained until callback settlement", async () => {
  const callbackDelay = deferred<void>();
  let committed = false;
  let rolledBack = false;
  let queryCount = 0;
  const database = createScopedLedgerDatabase({
    selectRows: [],
    onQuery: () => {
      queryCount += 1;
    },
    onCommit: () => {
      committed = true;
    },
    onRollback: () => {
      rolledBack = true;
    },
  });
  const store = createDrizzleCreditLedgerStore(database);

  const transactionResult = store.withUserTransaction(
    "user-1",
    async (transaction) => {
      void transaction.listUserGrants("user-2");
      await callbackDelay.promise;
    }
  );

  await Promise.resolve();
  await Promise.resolve();
  const queriesAfterEarlyRejection = queryCount;
  callbackDelay.resolve();

  await assert.rejects(transactionResult, /credit_ledger_user_scope_mismatch/);
  assert.equal(committed, false);
  assert.equal(rolledBack, true);
  assert.equal(queryCount, queriesAfterEarlyRejection);
});

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

test("public refund settlement uses one clock for expired-credit recovery", async () => {
  const store = createMemoryCreditLedgerStore();
  const issued = createCreditLedgerService({
    store,
    now: () => new Date("2026-06-29T00:00:00.000Z"),
  });
  await issued.grantCredits({
    userId: "user-expired-refund",
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: "checkout:public-expired-refund",
  });
  await issued.reserveCredit({
    userId: "user-expired-refund",
    reservationKey: "session:public-expired-refund",
    sessionId: "session-public-expired-refund",
  });
  await issued.consumeReservation({
    reservationKey: "session:public-expired-refund",
    idempotencyKey: "consume:session:public-expired-refund",
  });

  const expired = createCreditLedgerService({
    store,
    now: () => new Date("2026-08-01T00:00:00.000Z"),
  });
  const refund = () =>
    expired.refundReservation({
      reservationKey: "session:public-expired-refund",
      idempotencyKey: "refund:session:public-expired-refund",
    });
  await refund();
  await refund();

  const grants = await store.listUserGrants("user-expired-refund");
  assert.equal(grants.filter((grant) => grant.source === "refund").length, 1);
  assert.equal(
    (await expired.getCreditBalance("user-expired-refund")).availableCredits,
    1
  );
});

test("exact terminal replays do not emit duplicate settlement analytics", async () => {
  const store = createMemoryCreditLedgerStore();
  const terminalEvents: Array<{
    transactionType: "consume" | "release" | "refund";
    idempotencyKey: string;
  }> = [];
  const ledger = createCreditLedgerService({
    store,
    now: () => new Date("2026-06-29T00:00:00.000Z"),
    trackTerminalSettlement: ({ transactionType, idempotencyKey }) => {
      terminalEvents.push({ transactionType, idempotencyKey });
    },
  });
  await ledger.grantCredits({
    userId: "user-analytics",
    catalogId: "trial",
    source: "trial",
    idempotencyKey: "trial:user-analytics",
  });

  await ledger.reserveCredit({
    userId: "user-analytics",
    reservationKey: "session:consume-analytics",
  });
  const consumed = await ledger.consumeReservation({
    reservationKey: "session:consume-analytics",
    idempotencyKey: "consume:analytics",
  });
  const consumedReplay = await ledger.consumeReservation({
    reservationKey: "session:consume-analytics",
    idempotencyKey: "consume:analytics",
  });

  await ledger.reserveCredit({
    userId: "user-analytics",
    reservationKey: "session:release-analytics",
  });
  const released = await ledger.releaseReservation({
    reservationKey: "session:release-analytics",
    idempotencyKey: "release:analytics",
  });
  const releasedReplay = await ledger.releaseReservation({
    reservationKey: "session:release-analytics",
    idempotencyKey: "release:analytics",
  });

  await ledger.reserveCredit({
    userId: "user-analytics",
    reservationKey: "session:refund-analytics",
  });
  await ledger.consumeReservation({
    reservationKey: "session:refund-analytics",
    idempotencyKey: "consume:refund-analytics",
  });
  const refunded = await ledger.refundReservation({
    reservationKey: "session:refund-analytics",
    idempotencyKey: "refund:analytics",
  });
  const refundedReplay = await ledger.refundReservation({
    reservationKey: "session:refund-analytics",
    idempotencyKey: "refund:analytics",
  });

  assert.equal(consumed.duplicate, false);
  assert.equal(consumedReplay.duplicate, true);
  assert.equal(released.duplicate, false);
  assert.equal(releasedReplay.duplicate, true);
  assert.equal(refunded.duplicate, false);
  assert.equal(refundedReplay.duplicate, true);
  assert.deepEqual(terminalEvents, [
    {
      transactionType: "consume",
      idempotencyKey: "consume:analytics",
    },
    {
      transactionType: "release",
      idempotencyKey: "release:analytics",
    },
    {
      transactionType: "consume",
      idempotencyKey: "consume:refund-analytics",
    },
    {
      transactionType: "refund",
      idempotencyKey: "refund:analytics",
    },
  ]);
});

test("analytics failure cannot turn a committed settlement into a workflow failure", async () => {
  const log = console.error;
  console.error = () => {};
  try {
    const ledger = createCreditLedgerService({
      store: createMemoryCreditLedgerStore(),
      now: () => new Date("2026-06-29T00:00:00.000Z"),
      trackTerminalSettlement: () => {
        throw new Error("private analytics provider failure");
      },
    });
    await ledger.grantCredits({
      userId: "user-analytics-failure",
      catalogId: "trial",
      source: "trial",
      idempotencyKey: "trial:user-analytics-failure",
    });
    await ledger.reserveCredit({
      userId: "user-analytics-failure",
      reservationKey: "session:analytics-failure",
    });

    const settled = await ledger.consumeReservation({
      reservationKey: "session:analytics-failure",
      idempotencyKey: "consume:analytics-failure",
    });
    const replay = await ledger.consumeReservation({
      reservationKey: "session:analytics-failure",
      idempotencyKey: "consume:analytics-failure",
    });

    assert.equal(settled.reservation.status, "consumed");
    assert.equal(settled.duplicate, false);
    assert.equal(replay.duplicate, true);
  } finally {
    console.error = log;
  }
});

test("asynchronous analytics rejection is contained after settlement", async () => {
  const log = console.error;
  let failureLogs = 0;
  console.error = (message?: unknown) => {
    if (message === "billing_terminal_settlement_analytics_failed") {
      failureLogs += 1;
    }
  };
  try {
    const ledger = createCreditLedgerService({
      store: createMemoryCreditLedgerStore(),
      now: () => new Date("2026-06-29T00:00:00.000Z"),
      trackTerminalSettlement: async () => {
        throw new Error("private asynchronous analytics failure");
      },
    });
    await ledger.grantCredits({
      userId: "user-async-analytics-failure",
      catalogId: "trial",
      source: "trial",
      idempotencyKey: "trial:user-async-analytics-failure",
    });
    await ledger.reserveCredit({
      userId: "user-async-analytics-failure",
      reservationKey: "session:async-analytics-failure",
    });

    const settled = await ledger.consumeReservation({
      reservationKey: "session:async-analytics-failure",
      idempotencyKey: "consume:async-analytics-failure",
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(settled.reservation.status, "consumed");
    assert.equal(failureLogs, 1);
  } finally {
    console.error = log;
  }
});

test("settlement does not return before asynchronous analytics delivery finishes", async () => {
  let delivered = false;
  const ledger = createCreditLedgerService({
    store: createMemoryCreditLedgerStore(),
    now: () => new Date("2026-06-29T00:00:00.000Z"),
    trackTerminalSettlement: async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      delivered = true;
    },
  });
  await ledger.grantCredits({
    userId: "user-awaited-analytics",
    catalogId: "trial",
    source: "trial",
    idempotencyKey: "trial:user-awaited-analytics",
  });
  await ledger.reserveCredit({
    userId: "user-awaited-analytics",
    reservationKey: "session:awaited-analytics",
  });

  await ledger.consumeReservation({
    reservationKey: "session:awaited-analytics",
    idempotencyKey: "consume:awaited-analytics",
  });

  assert.equal(delivered, true);
});

test("payment reversal revokes only the correlated grant and replays exactly", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({
    store,
    now: () => new Date("2026-07-10T12:00:00.000Z"),
  });
  await ledger.grantCredits({
    userId: "user-refund",
    catalogId: "interview_pass",
    source: "checkout",
    sourceId: "cs_paid",
    idempotencyKey: "stripe:checkout:cs_paid:interview_pass",
  });
  await ledger.grantCredits({
    userId: "user-refund",
    catalogId: "interview_pass",
    source: "admin",
    sourceId: "support",
    idempotencyKey: "admin:unrelated",
  });

  const input = {
    userId: "user-refund",
    grantIdempotencyKey: "stripe:checkout:cs_paid:interview_pass",
    stripeEventId: "evt_refund",
    providerAdjustmentId: "re_refund",
    adjustmentType: "refund" as const,
    amountInCents: 900,
    sourcePaymentAmountInCents: 900,
    currency: "usd",
  };
  const first = await ledger.revokePaidGrant(input);
  const replay = await ledger.revokePaidGrant({
    ...input,
    stripeEventId: "evt_refund_updated",
  });

  assert.equal(first.adjustment.revokedCredits, 1);
  assert.equal(first.adjustment.unrecoverableCredits, 0);
  assert.equal(replay.adjustment.id, first.adjustment.id);
  assert.equal(replay.duplicate, true);
  assert.equal(
    (await ledger.getCreditBalance("user-refund")).availableCredits,
    1
  );
  const paidGrant = await store.findGrantByIdempotencyKey(
    input.grantIdempotencyKey
  );
  assert.equal(paidGrant?.remainingCredits, 0);
  assert.equal(paidGrant?.revocationKey, `payment:${paidGrant?.id}`);
});

test("cumulative partial refunds use floor rounding and never over-revoke", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  await ledger.grantCredits({
    userId: "user-partial",
    catalogId: "starter",
    source: "subscription_renewal",
    idempotencyKey: "stripe:invoice:in_partial:starter",
  });
  const base = {
    userId: "user-partial",
    paymentHistoryId: "payment-partial",
    grantIdempotencyKey: "stripe:invoice:in_partial:starter",
    adjustmentType: "refund" as const,
    sourcePaymentAmountInCents: 1900,
    currency: "usd",
  };

  const goodwill = await ledger.revokePaidGrant({
    ...base,
    stripeEventId: "evt_partial_1",
    providerAdjustmentId: "re_partial_1",
    amountInCents: 100,
  });
  assert.equal(goodwill.adjustment.revokedCredits, 0);
  assert.equal(goodwill.adjustment.unrecoverableCredits, 0);
  assert.equal(
    (await ledger.getCreditBalance("user-partial")).availableCredits,
    4
  );

  const first = await ledger.revokePaidGrant({
    ...base,
    stripeEventId: "evt_partial_2",
    providerAdjustmentId: "re_partial_2",
    amountInCents: 400,
  });
  assert.equal(first.adjustment.revokedCredits, 1);

  const second = await ledger.revokePaidGrant({
    ...base,
    stripeEventId: "evt_partial_3",
    providerAdjustmentId: "re_partial_3",
    amountInCents: 450,
  });
  assert.equal(second.adjustment.revokedCredits, 1);

  const capped = await ledger.revokePaidGrant({
    ...base,
    stripeEventId: "evt_partial_4",
    providerAdjustmentId: "re_partial_4",
    amountInCents: 5000,
  });
  assert.equal(capped.adjustment.revokedCredits, 2);
  assert.equal(
    (await ledger.getCreditBalance("user-partial")).availableCredits,
    0
  );
});

test("reinstating one full withdrawal transfers the freeze to another active withdrawal", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  const grantKey = "stripe:invoice:in_two_full:starter";
  await ledger.grantCredits({
    userId: "user-two-full",
    catalogId: "starter",
    source: "subscription_renewal",
    idempotencyKey: grantKey,
  });
  const base = {
    userId: "user-two-full",
    paymentHistoryId: "payment-two-full",
    grantIdempotencyKey: grantKey,
    adjustmentType: "refund" as const,
    amountInCents: 1900,
    sourcePaymentAmountInCents: 1900,
    currency: "usd",
  };
  await ledger.revokePaidGrant({
    ...base,
    stripeEventId: "evt_full_a",
    providerAdjustmentId: "re_full_a",
  });
  const second = await ledger.revokePaidGrant({
    ...base,
    stripeEventId: "evt_full_b",
    providerAdjustmentId: "re_full_b",
  });
  assert.equal(second.adjustment.revokedCredits, 0);
  assert.equal(
    (await ledger.getCreditBalance("user-two-full")).availableCredits,
    0
  );

  const firstRestored = await ledger.reinstatePaidGrant({
    ...base,
    stripeEventId: "evt_full_a_failed",
    providerAdjustmentId: "re_full_a",
  });
  assert.equal(firstRestored.adjustment.revokedCredits, 0);
  assert.equal(firstRestored.adjustment.unrecoverableCredits, 0);
  assert.equal(
    (await ledger.getCreditBalance("user-two-full")).availableCredits,
    0
  );
  await assert.rejects(
    () =>
      ledger.reserveCredit({
        userId: "user-two-full",
        reservationKey: "session:still-frozen",
      }),
    /insufficient_credits/
  );

  const secondRestored = await ledger.reinstatePaidGrant({
    ...base,
    stripeEventId: "evt_full_b_failed",
    providerAdjustmentId: "re_full_b",
  });
  assert.equal(secondRestored.adjustment.revokedCredits, 4);
  assert.equal(
    (await ledger.getCreditBalance("user-two-full")).availableCredits,
    4
  );
});

test("aggregate full-to-partial downgrade clears the global source marker in either order", async (t) => {
  for (const firstProvider of ["re_half_a", "re_half_b"] as const) {
    await t.test(firstProvider, async () => {
      const store = createMemoryCreditLedgerStore();
      const ledger = createCreditLedgerService({ store });
      const userId = `user-half-${firstProvider}`;
      const grantKey = `stripe:invoice:${firstProvider}:starter`;
      await ledger.grantCredits({
        userId,
        catalogId: "starter",
        source: "subscription_renewal",
        idempotencyKey: grantKey,
      });
      const base = {
        userId,
        paymentHistoryId: `payment-${firstProvider}`,
        grantIdempotencyKey: grantKey,
        adjustmentType: "refund" as const,
        amountInCents: 950,
        sourcePaymentAmountInCents: 1900,
      };
      for (const providerAdjustmentId of ["re_half_a", "re_half_b"]) {
        await ledger.revokePaidGrant({
          ...base,
          stripeEventId: `evt-${firstProvider}-${providerAdjustmentId}`,
          providerAdjustmentId,
        });
      }
      assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 0);

      await ledger.reinstatePaidGrant({
        ...base,
        stripeEventId: `evt-${firstProvider}-reinstated`,
        providerAdjustmentId: firstProvider,
      });
      assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 2);
      assert.equal(
        (await store.findGrantByIdempotencyKey(grantKey))?.revokedAt,
        null
      );

      const secondProvider =
        firstProvider === "re_half_a" ? "re_half_b" : "re_half_a";
      await ledger.reinstatePaidGrant({
        ...base,
        stripeEventId: `evt-${secondProvider}-reinstated`,
        providerAdjustmentId: secondProvider,
      });
      assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 4);
    });
  }
});

test("aggregate downgrade counts consumed credits as already accounted", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  const userId = "user-half-consumed";
  const grantKey = "stripe:invoice:half-consumed:starter";
  await ledger.grantCredits({
    userId,
    catalogId: "starter",
    source: "subscription_renewal",
    idempotencyKey: grantKey,
  });
  await ledger.reserveCredit({
    userId,
    reservationKey: "session:half-consumed",
  });
  await ledger.consumeReservation({
    reservationKey: "session:half-consumed",
    idempotencyKey: "consume:half-consumed",
  });
  const base = {
    userId,
    paymentHistoryId: "payment-half-consumed",
    grantIdempotencyKey: grantKey,
    adjustmentType: "refund" as const,
    amountInCents: 950,
    sourcePaymentAmountInCents: 1900,
  };
  await ledger.revokePaidGrant({
    ...base,
    stripeEventId: "evt-half-consumed-a",
    providerAdjustmentId: "re_half_consumed_a",
  });
  await ledger.revokePaidGrant({
    ...base,
    stripeEventId: "evt-half-consumed-b",
    providerAdjustmentId: "re_half_consumed_b",
  });
  await ledger.reinstatePaidGrant({
    ...base,
    stripeEventId: "evt-half-consumed-a-failed",
    providerAdjustmentId: "re_half_consumed_a",
  });
  assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 2);
  assert.equal(
    (await store.findGrantByIdempotencyKey(grantKey))?.revokedAt,
    null
  );

  await ledger.reinstatePaidGrant({
    ...base,
    stripeEventId: "evt-half-consumed-b-failed",
    providerAdjustmentId: "re_half_consumed_b",
  });
  assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 3);
});

test("aggregate state converges after overlapping partial reversals change owners", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  const userId = "user-overlapping-partials";
  const grantKey = "stripe:invoice:overlapping-partials:starter";
  const paymentHistoryId = "payment-overlapping-partials";
  await ledger.grantCredits({
    userId,
    catalogId: "starter",
    source: "subscription_renewal",
    idempotencyKey: grantKey,
  });
  await ledger.reserveCredit({
    userId,
    reservationKey: "session:overlapping-partials",
    credits: 3,
  });
  await ledger.consumeReservation({
    reservationKey: "session:overlapping-partials",
    idempotencyKey: "consume:overlapping-partials",
  });
  const base = {
    userId,
    paymentHistoryId,
    grantIdempotencyKey: grantKey,
    adjustmentType: "refund" as const,
    amountInCents: 950,
    sourcePaymentAmountInCents: 1900,
  };
  for (const providerAdjustmentId of ["re_overlap_a", "re_overlap_b"]) {
    await ledger.revokePaidGrant({
      ...base,
      stripeEventId: `evt-${providerAdjustmentId}`,
      providerAdjustmentId,
    });
  }
  await ledger.reinstatePaidGrant({
    ...base,
    stripeEventId: "evt-re_overlap_a-failed",
    providerAdjustmentId: "re_overlap_a",
  });
  await ledger.revokePaidGrant({
    ...base,
    stripeEventId: "evt-re_overlap_c",
    providerAdjustmentId: "re_overlap_c",
  });
  await ledger.reinstatePaidGrant({
    ...base,
    stripeEventId: "evt-re_overlap_b-failed",
    providerAdjustmentId: "re_overlap_b",
  });

  assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 1);
  const grant = await store.findGrantByIdempotencyKey(grantKey);
  assert.ok(grant);
  assert.equal(grant.revokedAt, null);
  const state = await store.withUserTransaction(userId, (transaction) =>
    transaction.findBillingPaymentStateForUpdate(grant.id)
  );
  assert.deepEqual(
    state && {
      targetCredits: state.targetCredits,
      revokedCredits: state.revokedCredits,
      unrecoverableCredits: state.unrecoverableCredits,
      consumedCredits: state.consumedCredits,
      grantRevocations: state.grantRevocations,
      allocationRevocations: state.allocationRevocations,
    },
    {
      targetCredits: 2,
      revokedCredits: 0,
      unrecoverableCredits: 2,
      consumedCredits: 2,
      grantRevocations: [],
      allocationRevocations: [],
    }
  );

  await ledger.reinstatePaidGrant({
    ...base,
    stripeEventId: "evt-re_overlap_c-failed",
    providerAdjustmentId: "re_overlap_c",
  });
  assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 1);
});

test("aggregate downgrade preserves active and released frozen allocations", async (t) => {
  for (const releaseBeforeReinstate of [false, true]) {
    await t.test(releaseBeforeReinstate ? "released" : "active", async () => {
      const store = createMemoryCreditLedgerStore();
      const ledger = createCreditLedgerService({ store });
      const userId = `user-half-${releaseBeforeReinstate ? "released" : "active"}`;
      const grantKey = `stripe:invoice:${userId}:starter`;
      const reservationKey = `session:${userId}`;
      await ledger.grantCredits({
        userId,
        catalogId: "starter",
        source: "subscription_renewal",
        idempotencyKey: grantKey,
      });
      await ledger.reserveCredit({
        userId,
        reservationKey,
        credits: 2,
      });
      const base = {
        userId,
        paymentHistoryId: `payment-${userId}`,
        grantIdempotencyKey: grantKey,
        adjustmentType: "refund" as const,
        amountInCents: 950,
        sourcePaymentAmountInCents: 1900,
      };
      await ledger.revokePaidGrant({
        ...base,
        stripeEventId: `evt-${userId}-a`,
        providerAdjustmentId: `re-${userId}-a`,
      });
      await ledger.revokePaidGrant({
        ...base,
        stripeEventId: `evt-${userId}-b`,
        providerAdjustmentId: `re-${userId}-b`,
      });
      if (releaseBeforeReinstate) {
        await ledger.releaseReservation({
          reservationKey,
          idempotencyKey: `release:${userId}`,
        });
      }
      await ledger.reinstatePaidGrant({
        ...base,
        stripeEventId: `evt-${userId}-a-failed`,
        providerAdjustmentId: `re-${userId}-a`,
      });
      assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 2);
      assert.equal(
        (await store.findGrantByIdempotencyKey(grantKey))?.revokedAt,
        null
      );

      await ledger.reinstatePaidGrant({
        ...base,
        stripeEventId: `evt-${userId}-b-failed`,
        providerAdjustmentId: `re-${userId}-b`,
      });
      if (!releaseBeforeReinstate) {
        await ledger.releaseReservation({
          reservationKey,
          idempotencyKey: `release:${userId}`,
        });
      }
      assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 4);
    });
  }
});

test("failed refund reinstates a released frozen allocation exactly once", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  const grantKey = "stripe:checkout:cs_reinstate:interview_pass";
  await ledger.grantCredits({
    userId: "user-reinstate",
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: grantKey,
  });
  await ledger.reserveCredit({
    userId: "user-reinstate",
    reservationKey: "session:reinstate",
  });
  const base = {
    userId: "user-reinstate",
    grantIdempotencyKey: grantKey,
    providerAdjustmentId: "re_reinstate",
    adjustmentType: "refund" as const,
    amountInCents: 900,
    sourcePaymentAmountInCents: 900,
    currency: "usd",
  };
  await ledger.revokePaidGrant({ ...base, stripeEventId: "evt_withdraw" });
  await ledger.releaseReservation({
    reservationKey: "session:reinstate",
    idempotencyKey: "release:session:reinstate",
  });
  assert.equal(
    (await ledger.getCreditBalance("user-reinstate")).availableCredits,
    0
  );

  const reinstated = await ledger.reinstatePaidGrant({
    ...base,
    stripeEventId: "evt_reinstate",
  });
  const replay = await ledger.reinstatePaidGrant({
    ...base,
    stripeEventId: "evt_reinstate_updated",
  });
  assert.equal(reinstated.adjustment.revokedCredits, 1);
  assert.equal(replay.duplicate, true);
  assert.equal(
    (await ledger.getCreditBalance("user-reinstate")).availableCredits,
    1
  );
});

test("reinstatement never restores a frozen allocation consumed in flight", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  const grantKey = "stripe:checkout:cs_frozen_consume:interview_pass";
  await ledger.grantCredits({
    userId: "user-frozen-consume",
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: grantKey,
  });
  await ledger.reserveCredit({
    userId: "user-frozen-consume",
    reservationKey: "session:frozen-consume",
  });
  const base = {
    userId: "user-frozen-consume",
    grantIdempotencyKey: grantKey,
    providerAdjustmentId: "dp_frozen_consume",
    adjustmentType: "dispute" as const,
    amountInCents: 900,
    sourcePaymentAmountInCents: 900,
  };
  await ledger.revokePaidGrant({ ...base, stripeEventId: "evt_frozen" });
  await ledger.consumeReservation({
    reservationKey: "session:frozen-consume",
    idempotencyKey: "consume:session:frozen-consume",
  });
  const restored = await ledger.reinstatePaidGrant({
    ...base,
    stripeEventId: "evt_funds_reinstated",
  });
  assert.equal(restored.adjustment.revokedCredits, 0);
  assert.equal(restored.adjustment.unrecoverableCredits, 1);
  assert.equal(
    (await ledger.getCreditBalance("user-frozen-consume")).availableCredits,
    0
  );
});

test("refunding a consumed frozen allocation preserves unrecoverable provenance across overlapping withdrawals", async (t) => {
  for (const firstReinstated of ["re_frozen_a", "re_frozen_b"] as const) {
    await t.test(firstReinstated, async () => {
      const store = createMemoryCreditLedgerStore();
      const ledger = createCreditLedgerService({ store });
      const userId = `user-refunded-frozen-${firstReinstated}`;
      const grantKey = `stripe:checkout:${userId}:interview_pass`;
      const paymentHistoryId = `payment-${userId}`;
      await ledger.grantCredits({
        userId,
        catalogId: "interview_pass",
        source: "checkout",
        idempotencyKey: grantKey,
      });
      await ledger.reserveCredit({
        userId,
        reservationKey: `session:${userId}`,
      });
      const base = {
        userId,
        paymentHistoryId,
        grantIdempotencyKey: grantKey,
        adjustmentType: "refund" as const,
        amountInCents: 900,
        sourcePaymentAmountInCents: 900,
      };
      await ledger.revokePaidGrant({
        ...base,
        stripeEventId: `evt-${userId}-a`,
        providerAdjustmentId: "re_frozen_a",
      });
      await ledger.consumeReservation({
        reservationKey: `session:${userId}`,
        idempotencyKey: `consume:${userId}`,
      });
      await ledger.revokePaidGrant({
        ...base,
        stripeEventId: `evt-${userId}-b`,
        providerAdjustmentId: "re_frozen_b",
      });
      await ledger.refundReservation({
        reservationKey: `session:${userId}`,
        idempotencyKey: `refund:${userId}`,
      });

      const secondReinstated =
        firstReinstated === "re_frozen_a" ? "re_frozen_b" : "re_frozen_a";
      await ledger.reinstatePaidGrant({
        ...base,
        stripeEventId: `evt-${userId}-${firstReinstated}-reinstate`,
        providerAdjustmentId: firstReinstated,
      });
      assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 0);
      const grant = await store.findGrantByIdempotencyKey(grantKey);
      assert.ok(grant);
      const intermediate = await store.withUserTransaction(
        userId,
        (transaction) => transaction.findBillingPaymentStateForUpdate(grant.id)
      );
      assert.deepEqual(
        intermediate && {
          targetCredits: intermediate.targetCredits,
          revokedCredits: intermediate.revokedCredits,
          unrecoverableCredits: intermediate.unrecoverableCredits,
          consumedCredits: intermediate.consumedCredits,
        },
        {
          targetCredits: 1,
          revokedCredits: 0,
          unrecoverableCredits: 1,
          consumedCredits: 1,
        }
      );

      await ledger.reinstatePaidGrant({
        ...base,
        stripeEventId: `evt-${userId}-${secondReinstated}-reinstate`,
        providerAdjustmentId: secondReinstated,
      });
      assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 0);
      const finalState = await store.withUserTransaction(
        userId,
        (transaction) => transaction.findBillingPaymentStateForUpdate(grant.id)
      );
      assert.deepEqual(
        finalState && {
          targetCredits: finalState.targetCredits,
          revokedCredits: finalState.revokedCredits,
          unrecoverableCredits: finalState.unrecoverableCredits,
          consumedCredits: finalState.consumedCredits,
        },
        {
          targetCredits: 0,
          revokedCredits: 0,
          unrecoverableCredits: 0,
          consumedCredits: 0,
        }
      );
    });
  }
});

test("out-of-order reinstatement prevents a later withdrawal from freezing credits", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  const grantKey = "stripe:checkout:cs_reordered:interview_pass";
  await ledger.grantCredits({
    userId: "user-reordered",
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: grantKey,
  });
  const base = {
    userId: "user-reordered",
    grantIdempotencyKey: grantKey,
    providerAdjustmentId: "dp_reordered",
    adjustmentType: "dispute" as const,
    amountInCents: 900,
    sourcePaymentAmountInCents: 900,
  };
  await ledger.reinstatePaidGrant({
    ...base,
    stripeEventId: "evt_reinstate_first",
  });
  const withdrawal = await ledger.revokePaidGrant({
    ...base,
    stripeEventId: "evt_withdraw_late",
  });
  assert.equal(withdrawal.adjustment.revokedCredits, 0);
  assert.equal(
    (await ledger.getCreditBalance("user-reordered")).availableCredits,
    1
  );
});

test("dispute withdrawal followed by reinstatement restores available credits", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  const userId = "user-dispute-normal-order";
  const grantKey = "stripe:checkout:cs_dispute_normal:interview_pass";
  await ledger.grantCredits({
    userId,
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: grantKey,
  });
  const base = {
    userId,
    grantIdempotencyKey: grantKey,
    providerAdjustmentId: "dp_normal_order",
    adjustmentType: "dispute" as const,
    amountInCents: 900,
    sourcePaymentAmountInCents: 900,
  };
  await ledger.revokePaidGrant({ ...base, stripeEventId: "evt_withdraw" });
  assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 0);
  await ledger.reinstatePaidGrant({
    ...base,
    stripeEventId: "evt_reinstate",
  });
  assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 1);
});

test("payment status reflects all active refund and dispute adjustments", async () => {
  const store = createMemoryCreditLedgerStore();
  const statuses: string[] = [];
  store.updatePaymentHistoryStatus = async (_paymentId, status) => {
    statuses.push(status);
  };
  const ledger = createCreditLedgerService({ store });
  const grantKey = "stripe:invoice:in_aggregate:starter";
  await ledger.grantCredits({
    userId: "user-aggregate",
    catalogId: "starter",
    source: "subscription_renewal",
    idempotencyKey: grantKey,
  });
  const base = {
    userId: "user-aggregate",
    paymentHistoryId: "payment-aggregate",
    grantIdempotencyKey: grantKey,
    sourcePaymentAmountInCents: 1900,
    currency: "usd",
  };
  await ledger.revokePaidGrant({
    ...base,
    stripeEventId: "evt_refund_a",
    providerAdjustmentId: "re_a",
    adjustmentType: "refund",
    amountInCents: 500,
  });
  await ledger.revokePaidGrant({
    ...base,
    stripeEventId: "evt_refund_b",
    providerAdjustmentId: "re_b",
    adjustmentType: "refund",
    amountInCents: 500,
  });
  await ledger.reinstatePaidGrant({
    ...base,
    stripeEventId: "evt_refund_a_failed",
    providerAdjustmentId: "re_a",
    adjustmentType: "refund",
    amountInCents: 500,
  });
  assert.equal(statuses.at(-1), "partially_refunded");

  await ledger.revokePaidGrant({
    ...base,
    stripeEventId: "evt_dispute",
    providerAdjustmentId: "dp_aggregate",
    adjustmentType: "dispute",
    amountInCents: 1400,
  });
  assert.equal(statuses.at(-1), "disputed");
  await ledger.reinstatePaidGrant({
    ...base,
    stripeEventId: "evt_dispute_won",
    providerAdjustmentId: "dp_aggregate",
    adjustmentType: "dispute",
    amountInCents: 1400,
  });
  assert.equal(statuses.at(-1), "partially_refunded");
});

test("releasing an active allocation after payment reversal cannot resurrect credits", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({
    store,
    now: () => new Date("2026-07-10T12:00:00.000Z"),
  });
  await ledger.grantCredits({
    userId: "user-reserved",
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: "stripe:checkout:cs_reserved:interview_pass",
  });
  await ledger.reserveCredit({
    userId: "user-reserved",
    reservationKey: "session:reserved",
  });

  const result = await ledger.revokePaidGrant({
    userId: "user-reserved",
    grantIdempotencyKey: "stripe:checkout:cs_reserved:interview_pass",
    stripeEventId: "evt_reserved_refund",
    providerAdjustmentId: "re_reserved",
    adjustmentType: "refund",
  });
  assert.equal(result.adjustment.remainingCredits, 0);
  assert.equal(result.adjustment.reservedCredits, 1);
  assert.equal(result.adjustment.revokedCredits, 1);

  await ledger.releaseReservation({
    reservationKey: "session:reserved",
    idempotencyKey: "release:session:reserved",
  });
  assert.deepEqual(await ledger.getCreditBalance("user-reserved"), {
    availableCredits: 0,
    reservedCredits: 0,
    expiringCredits: 0,
    nextCreditExpiresAt: null,
  });
});

test("payment reversal records consumed credits without debt or unrelated clawback", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  await ledger.grantCredits({
    userId: "user-consumed",
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: "stripe:checkout:cs_consumed:interview_pass",
  });
  await ledger.grantCredits({
    userId: "user-consumed",
    catalogId: "interview_pass",
    source: "admin",
    idempotencyKey: "admin:make-good",
  });
  await ledger.reserveCredit({
    userId: "user-consumed",
    reservationKey: "session:consumed",
  });
  await ledger.consumeReservation({
    reservationKey: "session:consumed",
    idempotencyKey: "consume:session:consumed",
  });

  const result = await ledger.revokePaidGrant({
    userId: "user-consumed",
    grantIdempotencyKey: "stripe:checkout:cs_consumed:interview_pass",
    stripeEventId: "evt_dispute",
    providerAdjustmentId: "dp_consumed",
    adjustmentType: "dispute",
  });
  assert.equal(result.adjustment.consumedCredits, 1);
  assert.equal(result.adjustment.revokedCredits, 0);
  assert.equal(result.adjustment.unrecoverableCredits, 1);
  assert.equal(
    (await ledger.getCreditBalance("user-consumed")).availableCredits,
    1
  );
});

test("payment reversal follows the paid source into rollover without touching renewal credits", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({
    store,
    now: () => new Date("2026-07-10T12:00:00.000Z"),
  });
  await ledger.grantCredits({
    userId: "user-rollover-refund",
    catalogId: "starter",
    source: "subscription_renewal",
    sourceId: "in_old",
    idempotencyKey: "stripe:invoice:in_old:starter",
  });
  await ledger.renewSubscriptionCredits({
    userId: "user-rollover-refund",
    catalogId: "starter",
    sourceId: "in_new",
    renewalIdempotencyKey: "stripe:invoice:in_new:starter",
    rolloverIdempotencyKey: "stripe:rollover:in_new:starter",
  });
  assert.equal(
    (await ledger.getCreditBalance("user-rollover-refund")).availableCredits,
    8
  );

  const result = await ledger.revokePaidGrant({
    userId: "user-rollover-refund",
    grantIdempotencyKey: "stripe:invoice:in_old:starter",
    stripeEventId: "evt_old_refund",
    providerAdjustmentId: "re_old",
    adjustmentType: "refund",
  });
  assert.equal(result.adjustment.revokedCredits, 4);
  assert.equal(
    (await ledger.getCreditBalance("user-rollover-refund")).availableCredits,
    4
  );
});

test("pooled rollover consumption belongs to exactly one payment source", async (t) => {
  for (const mode of ["a-then-b", "b-then-a", "concurrent"] as const) {
    await t.test(mode, async () => {
      const store = createMemoryCreditLedgerStore();
      const userId = `user-pooled-${mode}`;
      const ledger = createCreditLedgerService({
        store,
        now: () => new Date("2026-07-10T12:00:00.000Z"),
      });
      const grantAKey = `stripe:invoice:${userId}:a:starter`;
      const grantBKey = `stripe:invoice:${userId}:b:starter`;
      const paymentA = `payment-${userId}-a`;
      const paymentB = `payment-${userId}-b`;
      const grantA = await ledger.grantCredits({
        userId,
        catalogId: "starter",
        source: "subscription_renewal",
        sourceId: "in_a",
        idempotencyKey: grantAKey,
      });
      await ledger.reserveCredit({
        userId,
        reservationKey: `${userId}:consume-a`,
        credits: 3,
      });
      await ledger.consumeReservation({
        reservationKey: `${userId}:consume-a`,
        idempotencyKey: `${userId}:consume-a:terminal`,
      });

      const temporaryDispute = {
        userId,
        paymentHistoryId: paymentA,
        grantIdempotencyKey: grantAKey,
        providerAdjustmentId: `dp-${userId}-temporary`,
        adjustmentType: "dispute" as const,
        amountInCents: 1900,
        sourcePaymentAmountInCents: 1900,
        currency: "usd",
      };
      await ledger.revokePaidGrant({
        ...temporaryDispute,
        stripeEventId: `evt-${userId}-temporary-withdraw`,
      });

      const grantB = await ledger.grantCredits({
        userId,
        catalogId: "starter",
        source: "subscription_renewal",
        sourceId: "in_b",
        idempotencyKey: grantBKey,
      });
      await ledger.reserveCredit({
        userId,
        reservationKey: `${userId}:consume-b`,
        credits: 3,
      });
      await ledger.consumeReservation({
        reservationKey: `${userId}:consume-b`,
        idempotencyKey: `${userId}:consume-b:terminal`,
      });
      await ledger.reinstatePaidGrant({
        ...temporaryDispute,
        stripeEventId: `evt-${userId}-temporary-reinstate`,
      });

      const renewal = await ledger.renewSubscriptionCredits({
        userId,
        catalogId: "starter",
        sourceId: "in_c",
        renewalIdempotencyKey: `stripe:invoice:${userId}:c:starter`,
        rolloverIdempotencyKey: `stripe:rollover:${userId}:c:starter`,
      });
      assert.equal(renewal.rolledCredits, 2);
      await ledger.reserveCredit({
        userId,
        reservationKey: `${userId}:consume-rollover`,
      });
      await ledger.consumeReservation({
        reservationKey: `${userId}:consume-rollover`,
        idempotencyKey: `${userId}:consume-rollover:terminal`,
      });
      assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 5);

      const refundA = {
        userId,
        paymentHistoryId: paymentA,
        grantIdempotencyKey: grantAKey,
        stripeEventId: `evt-${userId}-refund-a`,
        providerAdjustmentId: `re-${userId}-a`,
        adjustmentType: "refund" as const,
        amountInCents: 1900,
        sourcePaymentAmountInCents: 1900,
        currency: "usd",
      };
      const refundB = {
        ...refundA,
        paymentHistoryId: paymentB,
        grantIdempotencyKey: grantBKey,
        stripeEventId: `evt-${userId}-refund-b`,
        providerAdjustmentId: `re-${userId}-b`,
      };
      if (mode === "a-then-b") {
        await ledger.revokePaidGrant(refundA);
        await ledger.revokePaidGrant(refundB);
      } else if (mode === "b-then-a") {
        await ledger.revokePaidGrant(refundB);
        await ledger.revokePaidGrant(refundA);
      } else {
        await Promise.all([
          ledger.revokePaidGrant(refundA),
          ledger.revokePaidGrant(refundB),
        ]);
      }
      await ledger.revokePaidGrant(refundA);
      await ledger.revokePaidGrant(refundB);

      assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 4);
      const [stateA, stateB] = await store.withUserTransaction(
        userId,
        async (transaction) => [
          await transaction.findBillingPaymentStateForUpdate(grantA.grant.id),
          await transaction.findBillingPaymentStateForUpdate(grantB.grant.id),
        ]
      );
      assert.ok(stateA);
      assert.ok(stateB);
      assert.equal(
        stateA.unrecoverableCredits + stateB.unrecoverableCredits,
        7
      );
      assert.equal(stateA.revokedCredits + stateB.revokedCredits, 1);
      assert.deepEqual(
        [
          [stateA.unrecoverableCredits, stateA.revokedCredits],
          [stateB.unrecoverableCredits, stateB.revokedCredits],
        ].sort((left, right) => left[0] - right[0]),
        [
          [3, 1],
          [4, 0],
        ]
      );
    });
  }
});

test("rollover lot allocation release and reinstatement preserve source ownership", async () => {
  const store = createMemoryCreditLedgerStore();
  const userId = "user-rollover-reserved";
  const ledger = createCreditLedgerService({
    store,
    now: () => new Date("2026-07-10T12:00:00.000Z"),
  });
  const sourceKey = "stripe:invoice:rollover-reserved:old:starter";
  await ledger.grantCredits({
    userId,
    catalogId: "starter",
    source: "subscription_renewal",
    idempotencyKey: sourceKey,
  });
  await ledger.renewSubscriptionCredits({
    userId,
    catalogId: "starter",
    sourceId: "in_rollover_reserved_new",
    renewalIdempotencyKey: "stripe:invoice:rollover-reserved:new:starter",
    rolloverIdempotencyKey: "stripe:rollover:rollover-reserved:new:starter",
  });
  await ledger.reserveCredit({
    userId,
    reservationKey: "session:rollover-reserved",
  });
  const reversal = {
    userId,
    grantIdempotencyKey: sourceKey,
    providerAdjustmentId: "re_rollover_reserved",
    adjustmentType: "refund" as const,
    amountInCents: 1900,
    sourcePaymentAmountInCents: 1900,
  };
  const withdrawn = await ledger.revokePaidGrant({
    ...reversal,
    stripeEventId: "evt_rollover_reserved_withdraw",
  });
  assert.equal(withdrawn.adjustment.remainingCredits, 3);
  assert.equal(withdrawn.adjustment.reservedCredits, 1);
  await ledger.releaseReservation({
    reservationKey: "session:rollover-reserved",
    idempotencyKey: "release:session:rollover-reserved",
  });
  assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 4);

  const reinstated = await ledger.reinstatePaidGrant({
    ...reversal,
    stripeEventId: "evt_rollover_reserved_reinstate",
  });
  assert.equal(reinstated.adjustment.remainingCredits, 3);
  assert.equal(reinstated.adjustment.reservedCredits, 1);
  assert.equal((await ledger.getCreditBalance(userId)).availableCredits, 8);
});

test("expired rollover lots remain attributed without a second clawback", async () => {
  const store = createMemoryCreditLedgerStore();
  const userId = "user-rollover-expired";
  const issued = createCreditLedgerService({
    store,
    now: () => new Date("2026-07-10T12:00:00.000Z"),
  });
  const sourceKey = "stripe:invoice:rollover-expired:old:starter";
  await issued.grantCredits({
    userId,
    catalogId: "starter",
    source: "subscription_renewal",
    idempotencyKey: sourceKey,
  });
  await issued.renewSubscriptionCredits({
    userId,
    catalogId: "starter",
    sourceId: "in_rollover_expired_new",
    renewalIdempotencyKey: "stripe:invoice:rollover-expired:new:starter",
    rolloverIdempotencyKey: "stripe:rollover:rollover-expired:new:starter",
  });
  const expired = createCreditLedgerService({
    store,
    now: () => new Date("2026-09-10T12:00:00.000Z"),
  });
  assert.equal((await expired.expireCredits(userId)).expiredCredits, 4);
  const reversal = await expired.revokePaidGrant({
    userId,
    grantIdempotencyKey: sourceKey,
    stripeEventId: "evt_rollover_expired_refund",
    providerAdjustmentId: "re_rollover_expired",
    adjustmentType: "refund",
    amountInCents: 1900,
    sourcePaymentAmountInCents: 1900,
  });
  assert.equal(reversal.adjustment.revokedCredits, 0);
  assert.equal(reversal.adjustment.unrecoverableCredits, 4);
  assert.equal((await expired.getCreditBalance(userId)).availableCredits, 4);
});

test("provider refund creates one usable make-good when the source grant expired", async () => {
  const store = createMemoryCreditLedgerStore();
  const issued = createCreditLedgerService({
    store,
    now: () => new Date("2026-06-29T00:00:00.000Z"),
  });
  await issued.grantCredits({
    userId: "user-1",
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: "checkout:expired-refund",
  });
  await issued.reserveCredit({
    userId: "user-1",
    reservationKey: "session:expired-refund",
    sessionId: "550e8400-e29b-41d4-a716-446655440000",
  });
  await issued.consumeReservation({
    reservationKey: "session:expired-refund",
    idempotencyKey: "consume:session:expired-refund",
  });

  const refund = () =>
    store.withUserTransaction("user-1", (transaction) =>
      settleReservationInTransaction({
        store: transaction,
        expectedUserId: "user-1",
        reservationKey: "session:expired-refund",
        idempotencyKey:
          "refund:interview-credit-recovery.v1:session:expired-refund",
        action: "refund",
        currentTime: new Date("2026-08-01T00:00:00.000Z"),
      })
    );
  const first = await refund();
  const replay = await refund();

  assert.equal(first.makeGoodGrant?.id, replay.makeGoodGrant?.id);
  assert.equal(first.makeGoodGrant?.source, "refund");
  assert.equal(first.makeGoodGrant?.expiresAt, null);
  const grants = await store.listUserGrants("user-1");
  assert.equal(grants.filter((grant) => grant.source === "refund").length, 1);
  assert.equal(
    (await createCreditLedgerService({ store }).getCreditBalance("user-1"))
      .availableCredits,
    1
  );

  await assert.rejects(
    store.withUserTransaction("user-1", async (transaction) => {
      const corrupted = Object.create(transaction) as CreditLedgerTransaction;
      corrupted.findGrantByIdempotencyKeyForUpdate = async (key) => {
        const grant = await transaction.findGrantByIdempotencyKeyForUpdate(key);
        return grant?.source === "refund"
          ? { ...grant, remainingCredits: grant.remainingCredits + 1 }
          : grant;
      };
      return settleReservationInTransaction({
        store: corrupted,
        expectedUserId: "user-1",
        reservationKey: "session:expired-refund",
        idempotencyKey:
          "refund:interview-credit-recovery.v1:session:expired-refund",
        action: "refund",
        currentTime: new Date("2026-08-01T00:00:00.000Z"),
      });
    }),
    /credit_grant_idempotency_conflict/
  );

  await assert.rejects(
    store.withUserTransaction("user-1", async (transaction) => {
      const corrupted = Object.create(transaction) as CreditLedgerTransaction;
      corrupted.findTransactionByIdempotencyKeyForUpdate = async (key) =>
        key.endsWith(":grant")
          ? null
          : transaction.findTransactionByIdempotencyKeyForUpdate(key);
      return settleReservationInTransaction({
        store: corrupted,
        expectedUserId: "user-1",
        reservationKey: "session:expired-refund",
        idempotencyKey:
          "refund:interview-credit-recovery.v1:session:expired-refund",
        action: "refund",
        currentTime: new Date("2026-08-01T00:00:00.000Z"),
      });
    }),
    /credit_ledger_reconciliation_required/
  );
});

test("subscription renewal respects the rollover cap and 60 day expiration", async () => {
  const store = createMemoryCreditLedgerStore();
  // Keep the domain clock independent from wall time so replay validation never
  // relies on storage timestamps created by a different clock.
  const renewedAt = new Date("2026-07-10T12:00:00.000Z");
  const ledger = createCreditLedgerService({
    store,
    now: () => renewedAt,
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

  const rollover = await ledger.renewSubscriptionCredits({
    userId: "user-1",
    catalogId: "pro",
    sourceId: "renewal:3",
    renewalIdempotencyKey: "renewal:3",
    rolloverIdempotencyKey: "rollover:2026-07",
  });

  assert.equal(rollover.rolledCredits, 12);
  assert.equal(
    rollover.rolloverGrant?.expiresAt?.toISOString(),
    new Date(renewedAt.getTime() + 60 * 86_400_000).toISOString()
  );

  const duplicate = await ledger.renewSubscriptionCredits({
    userId: "user-1",
    catalogId: "pro",
    sourceId: "renewal:3",
    renewalIdempotencyKey: "renewal:3",
    rolloverIdempotencyKey: "rollover:2026-07",
  });
  assert.equal(duplicate.rolloverGrant?.id, rollover.rolloverGrant?.id);
});

test("period-end policy bounds only subscription-derived credits and reactivation preserves expiry", async () => {
  let currentTime = new Date("2026-08-01T11:59:59.999Z");
  const periodEnd = new Date("2026-08-01T12:00:00.000Z");
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({
    store,
    now: () => currentTime,
  });

  await ledger.grantCredits({
    userId: "user-1",
    catalogId: "starter",
    source: "subscription_renewal",
    includedCredits: 1,
    expiresAt: null,
    idempotencyKey: "renewal:period-boundary:prior",
  });
  const renewal = await ledger.renewSubscriptionCredits({
    userId: "user-1",
    catalogId: "starter",
    sourceId: "renewal:period-boundary:current",
    renewalIdempotencyKey: "renewal:period-boundary:current",
    rolloverIdempotencyKey: "rollover:period-boundary",
  });
  for (const [source, catalogId] of [
    ["trial", "trial"],
    ["checkout", "interview_pass"],
    ["admin", "starter"],
    ["refund", "starter"],
    ["migration", "starter"],
  ] as const) {
    await ledger.grantCredits({
      userId: "user-1",
      catalogId,
      source,
      includedCredits: 1,
      expiresAt: null,
      idempotencyKey: `${source}:period-boundary`,
    });
  }

  store.setSubscriptionCreditPolicy("user-1", {
    restricted: true,
    availableThrough: periodEnd,
  });
  assert.equal((await ledger.getCreditBalance("user-1")).availableCredits, 10);

  currentTime = periodEnd;
  store.setCurrentTime(periodEnd);
  assert.equal((await ledger.getCreditBalance("user-1")).availableCredits, 5);
  const reservation = await ledger.reserveCredit({
    userId: "user-1",
    reservationKey: "session:after-period",
    credits: 5,
  });
  const reservedSources = new Set(
    await Promise.all(
      reservation.allocations.map(
        async ({ grantId }) =>
          (await store.listUserGrants("user-1")).find(
            (grant) => grant.id === grantId
          )?.source
      )
    )
  );
  assert.deepEqual([...reservedSources].sort(), [
    "admin",
    "checkout",
    "migration",
    "refund",
    "trial",
  ]);

  store.setSubscriptionCreditPolicy("user-1", {
    restricted: false,
    availableThrough: null,
  });
  assert.equal((await ledger.getCreditBalance("user-1")).availableCredits, 5);
  const grants = await store.listUserGrants("user-1");
  assert.deepEqual(
    grants.find(({ id }) => id === renewal.grant.id)?.expiresAt,
    renewal.grant.expiresAt
  );
  assert.equal(
    grants
      .find(({ id }) => id === renewal.rolloverGrant?.id)
      ?.expiresAt?.toISOString(),
    renewal.rolloverGrant?.expiresAt?.toISOString()
  );
});

test("past-due subscription credits stop authorizing at the grace-period cutoff", async () => {
  const gracePeriodEnd = new Date("2026-08-13T12:00:00.000Z");
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });

  await ledger.grantCredits({
    userId: "user-past-due-grace",
    catalogId: "starter",
    source: "subscription_renewal",
    includedCredits: 1,
    expiresAt: null,
    idempotencyKey: "renewal:past-due-grace",
  });
  store.setSubscriptionCreditPolicy(
    "user-past-due-grace",
    resolveSubscriptionCreditPolicy({
      status: "past_due",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
      gracePeriodEnd,
    })
  );

  store.setCurrentTime(new Date("2026-08-13T11:59:59.999Z"));
  assert.equal(
    (await ledger.getCreditBalance("user-past-due-grace")).availableCredits,
    1
  );

  store.setCurrentTime(gracePeriodEnd);
  assert.equal(
    (await ledger.getCreditBalance("user-past-due-grace")).availableCredits,
    0
  );
  await assert.rejects(
    () =>
      ledger.reserveCredit({
        userId: "user-past-due-grace",
        reservationKey: "session:past-due-grace-ended",
      }),
    /insufficient_credits/
  );
});

test("credit read model uses authoritative snapshot time at cutoff and ignores app rollback", async () => {
  const cutoff = new Date("2026-08-01T12:00:00.000Z");
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({
    store,
    now: () => new Date("2026-07-01T00:00:00.000Z"),
  });
  await ledger.grantCredits({
    userId: "user-read-cutoff",
    catalogId: "starter",
    source: "subscription_renewal",
    includedCredits: 1,
    expiresAt: null,
    idempotencyKey: "renewal:read-cutoff",
  });
  await ledger.grantCredits({
    userId: "user-read-cutoff",
    catalogId: "interview_pass",
    source: "checkout",
    includedCredits: 1,
    expiresAt: null,
    idempotencyKey: "checkout:read-cutoff",
  });
  store.setSubscriptionCreditPolicy("user-read-cutoff", {
    restricted: true,
    availableThrough: cutoff,
  });
  store.setCurrentTime(cutoff);

  const read = await getCreditBalanceReadModel({
    store,
    userId: "user-read-cutoff",
  });

  assert.equal(read.availableCredits, 1);
  assert.deepEqual(
    read.grants.map(({ source }) => source),
    ["checkout"]
  );
});

test("reservation uses locked database time and denies subscription credits after waiting across equality", async () => {
  const appTime = new Date("2026-08-01T11:59:59.999Z");
  const periodEnd = new Date("2026-08-01T12:00:00.000Z");
  const store = createMemoryCreditLedgerStore();
  store.setCurrentTime(appTime);
  const ledger = createCreditLedgerService({
    store,
    // A rolled-back application clock must not re-enable entitlement.
    now: () => new Date("2026-07-01T00:00:00.000Z"),
  });

  await ledger.grantCredits({
    userId: "user-1",
    catalogId: "starter",
    source: "subscription_renewal",
    includedCredits: 1,
    expiresAt: null,
    idempotencyKey: "renewal:locked-clock",
  });
  await ledger.grantCredits({
    userId: "user-1",
    catalogId: "interview_pass",
    source: "checkout",
    includedCredits: 1,
    expiresAt: null,
    idempotencyKey: "checkout:locked-clock",
  });
  store.setSubscriptionCreditPolicy("user-1", {
    restricted: true,
    availableThrough: periodEnd,
  });

  const getPolicy = store.getSubscriptionCreditPolicyForUpdate.bind(store);
  store.getSubscriptionCreditPolicyForUpdate = async (userId) => {
    const policy = await getPolicy(userId);
    // Model a transaction that acquired its locks just before the boundary but
    // resumed authorization exactly at the cutoff.
    store.setCurrentTime(periodEnd);
    return policy;
  };

  const result = await ledger.reserveCredit({
    userId: "user-1",
    reservationKey: "session:locked-clock",
  });
  const [allocation] = result.allocations;
  const allocatedGrant = (await store.listUserGrants("user-1")).find(
    (grant) => grant.id === allocation?.grantId
  );
  assert.equal(allocatedGrant?.source, "checkout");
  await assert.rejects(
    () =>
      ledger.reserveCredit({
        userId: "user-1",
        reservationKey: "session:subscription-only-after-cutoff",
      }),
    /insufficient_credits/
  );
});

test("subscription renewal replay preserves a committed zero-rollover outcome", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({
    store,
    now: () => new Date("2026-07-01T00:00:00.000Z"),
  });
  const input = {
    userId: "user-1",
    catalogId: "starter" as const,
    sourceId: "in_zero",
    renewalIdempotencyKey: "stripe:invoice:in_zero:starter",
    rolloverIdempotencyKey: "stripe:rollover:in_zero:starter",
  };

  const first = await ledger.renewSubscriptionCredits(input);
  assert.equal(first.grant.originalCredits, 4);
  assert.equal(first.rolledCredits, 0);
  assert.equal(first.rolloverGrant, null);
  const completion = await store.findTransactionByIdempotencyKey(
    `${input.renewalIdempotencyKey}:grant`
  );
  assert.deepEqual(
    completion?.metadata?.["__meelni_subscription_renewal_completion"],
    {
      version: 1,
      rolloverIdempotencyKey: input.rolloverIdempotencyKey,
      rolledCredits: 0,
      rolloverGrantId: null,
      rolloverExpiresAt: null,
      rolloverSourceGrantId: null,
      sourceAllocations: [],
    }
  );

  const laterLedger = createCreditLedgerService({
    store,
    now: () => new Date("2026-07-15T00:00:00.000Z"),
  });
  const replay = await laterLedger.renewSubscriptionCredits(input);
  assert.equal(replay.grant.id, first.grant.id);
  assert.equal(replay.rolledCredits, 0);
  assert.equal(replay.rolloverGrant, null);
  assert.equal((await store.listUserGrants("user-1")).length, 1);
  assert.equal(
    (await laterLedger.getCreditBalance("user-1")).availableCredits,
    4
  );
});

test("independent renewal grant without composite evidence fails closed", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  await ledger.grantCredits({
    userId: "user-1",
    catalogId: "starter",
    source: "subscription_renewal",
    sourceId: "in_ambiguous",
    idempotencyKey: "stripe:invoice:in_ambiguous:starter",
  });

  await assert.rejects(
    () =>
      ledger.renewSubscriptionCredits({
        userId: "user-1",
        catalogId: "starter",
        sourceId: "in_ambiguous",
        renewalIdempotencyKey: "stripe:invoice:in_ambiguous:starter",
        rolloverIdempotencyKey: "stripe:rollover:in_ambiguous:starter",
      }),
    /credit_ledger_reconciliation_required/
  );
  assert.equal((await store.listUserGrants("user-1")).length, 1);
});

test("subscription renewal atomically rolls prior credits and replays one result", async () => {
  const store = createMemoryCreditLedgerStore();
  const renewedAt = new Date();
  const ledger = createCreditLedgerService({
    store,
    now: () => renewedAt,
  });
  await ledger.grantCredits({
    userId: "user-1",
    catalogId: "starter",
    source: "subscription_renewal",
    sourceId: "in_prior",
    idempotencyKey: "stripe:invoice:in_prior:starter",
  });
  await ledger.reserveCredit({
    userId: "user-1",
    reservationKey: "session:prior-credit",
  });
  await ledger.consumeReservation({
    reservationKey: "session:prior-credit",
    idempotencyKey: "consume:session:prior-credit",
  });
  const input = {
    userId: "user-1",
    catalogId: "starter" as const,
    sourceId: "in_current",
    renewalIdempotencyKey: "stripe:invoice:in_current:starter",
    rolloverIdempotencyKey: "stripe:rollover:in_current:starter",
  };

  const first = await ledger.renewSubscriptionCredits(input);
  const replay = await ledger.renewSubscriptionCredits(input);

  assert.equal(first.rolledCredits, 3);
  assert.equal(first.rolloverGrant?.originalCredits, 3);
  assert.equal(replay.grant.id, first.grant.id);
  assert.equal(replay.rolloverGrant?.id, first.rolloverGrant?.id);
  assert.equal(replay.rolledCredits, 3);
  assert.equal((await ledger.getCreditBalance("user-1")).availableCredits, 7);
  assert.equal((await store.listUserGrants("user-1")).length, 3);
});

test("subscription renewal rejects legacy rollover without durable source lots", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({
    store,
    now: () => new Date("2026-08-01T00:00:00.000Z"),
  });
  const source = await ledger.grantCredits({
    userId: "user-1",
    catalogId: "starter",
    source: "subscription_renewal",
    sourceId: "in_prior",
    idempotencyKey: "stripe:invoice:prior:starter",
  });
  const rollover = await store.createGrant({
    userId: "user-1",
    catalogId: "starter",
    source: "rollover",
    sourceId: "in_current",
    idempotencyKey: "stripe:rollover:current:starter",
    originalCredits: 4,
    remainingCredits: 4,
    reservedCredits: 0,
    expiresAt: new Date(Date.now() + 60 * 86_400_000),
    rolloverEligible: false,
    rolloverSourceGrantId: source.grant.id,
    metadata: null,
  });
  await store.updateGrantBalances(source.grant.id, {
    remainingCredits: 0,
    reservedCredits: 0,
  });
  await store.createTransaction({
    userId: "user-1",
    grantId: source.grant.id,
    reservationId: null,
    type: "rollover",
    credits: 4,
    idempotencyKey: `stripe:rollover:current:starter:source:${source.grant.id}`,
    sourceId: "in_current",
    balanceAfter: 0,
    metadata: { rolloverGrantId: rollover.id },
  });
  await store.createTransaction({
    userId: "user-1",
    grantId: rollover.id,
    reservationId: null,
    type: "rollover",
    credits: 4,
    idempotencyKey: "stripe:rollover:current:starter:grant",
    sourceId: "in_current",
    balanceAfter: 4,
    metadata: null,
  });

  await assert.rejects(
    () =>
      ledger.renewSubscriptionCredits({
        userId: "user-1",
        catalogId: "starter",
        sourceId: "in_current",
        renewalIdempotencyKey: "stripe:invoice:current:starter",
        rolloverIdempotencyKey: "stripe:rollover:current:starter",
      }),
    /credit_rollover_incomplete/
  );
  assert.equal(
    await store.findGrantByIdempotencyKey("stripe:invoice:current:starter"),
    null
  );
});

test("subscription renewal rejects orphan rollover with an invalid durable expiry contract", async () => {
  const issuedAt = new Date("2026-08-01T00:00:00.000Z");
  const invalidExpiry = new Date("2099-01-01T00:00:00.000Z");
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store, now: () => issuedAt });
  const source = await ledger.grantCredits({
    userId: "user-invalid-orphan-expiry",
    catalogId: "starter",
    source: "subscription_renewal",
    sourceId: "in_prior_invalid_expiry",
    idempotencyKey: "stripe:invoice:prior-invalid-expiry:starter",
  });
  const rollover = await store.createGrant({
    userId: "user-invalid-orphan-expiry",
    catalogId: "starter",
    source: "rollover",
    sourceId: "in_invalid_expiry",
    idempotencyKey: "stripe:rollover:invalid-expiry:starter",
    originalCredits: 4,
    remainingCredits: 4,
    reservedCredits: 0,
    expiresAt: invalidExpiry,
    rolloverEligible: false,
    rolloverSourceGrantId: source.grant.id,
    metadata: null,
  });
  await store.updateGrantBalances(source.grant.id, {
    remainingCredits: 0,
    reservedCredits: 0,
  });
  await store.createRolloverLot({
    userId: "user-invalid-orphan-expiry",
    rolloverGrantId: rollover.id,
    sourceGrantId: source.grant.id,
    originalCredits: 4,
    remainingCredits: 4,
    reservedCredits: 0,
    consumedCredits: 0,
    revokedCredits: 0,
  });
  await store.createTransaction({
    userId: "user-invalid-orphan-expiry",
    grantId: source.grant.id,
    reservationId: null,
    type: "rollover",
    credits: 4,
    idempotencyKey: `stripe:rollover:invalid-expiry:starter:source:${source.grant.id}`,
    sourceId: "in_invalid_expiry",
    balanceAfter: 0,
    metadata: {
      version: 1,
      rolloverGrantId: rollover.id,
      issuedAt: issuedAt.toISOString(),
      expiresAt: invalidExpiry.toISOString(),
    },
  });
  await store.createTransaction({
    userId: "user-invalid-orphan-expiry",
    grantId: rollover.id,
    reservationId: null,
    type: "rollover",
    credits: 4,
    idempotencyKey: "stripe:rollover:invalid-expiry:starter:grant",
    sourceId: "in_invalid_expiry",
    balanceAfter: 4,
    metadata: null,
  });

  await assert.rejects(
    () =>
      ledger.renewSubscriptionCredits({
        userId: "user-invalid-orphan-expiry",
        catalogId: "starter",
        sourceId: "in_invalid_expiry",
        renewalIdempotencyKey: "stripe:invoice:invalid-expiry:starter",
        rolloverIdempotencyKey: "stripe:rollover:invalid-expiry:starter",
      }),
    /credit_rollover_incomplete/
  );
  assert.equal(
    await store.findGrantByIdempotencyKey(
      "stripe:invoice:invalid-expiry:starter"
    ),
    null
  );
});

test("subscription renewal rejects corrupt legacy rollover expiry, source, and debit evidence", async (t) => {
  for (const scenario of [
    "expiry",
    "source_transaction",
    "missing_debit",
  ] as const) {
    await t.test(scenario, async () => {
      const store = createMemoryCreditLedgerStore();
      const ledger = createCreditLedgerService({ store });
      const source = await ledger.grantCredits({
        userId: "user-1",
        catalogId: "starter",
        source: "subscription_renewal",
        sourceId: "in_prior",
        idempotencyKey: "stripe:invoice:corrupt-prior:starter",
      });
      const rollover = await store.createGrant({
        userId: "user-1",
        catalogId: "starter",
        source: "rollover",
        sourceId: "in_corrupt",
        idempotencyKey: "stripe:rollover:corrupt:starter",
        originalCredits: 4,
        remainingCredits: 4,
        reservedCredits: 0,
        expiresAt:
          scenario === "expiry" ? null : new Date(Date.now() + 60 * 86_400_000),
        rolloverEligible: false,
        rolloverSourceGrantId: source.grant.id,
        metadata: null,
      });
      if (scenario !== "missing_debit") {
        await store.updateGrantBalances(source.grant.id, {
          remainingCredits: 0,
          reservedCredits: 0,
        });
      }
      await store.createTransaction({
        userId: "user-1",
        grantId: source.grant.id,
        reservationId: null,
        type: "rollover",
        credits: 4,
        idempotencyKey: `stripe:rollover:corrupt:starter:source:${source.grant.id}`,
        sourceId: "in_corrupt",
        balanceAfter: scenario === "source_transaction" ? 4 : 0,
        metadata: { rolloverGrantId: rollover.id },
      });
      await store.createTransaction({
        userId: "user-1",
        grantId: rollover.id,
        reservationId: null,
        type: "rollover",
        credits: 4,
        idempotencyKey: "stripe:rollover:corrupt:starter:grant",
        sourceId: "in_corrupt",
        balanceAfter: 4,
        metadata: null,
      });

      await assert.rejects(
        () =>
          ledger.renewSubscriptionCredits({
            userId: "user-1",
            catalogId: "starter",
            sourceId: "in_corrupt",
            renewalIdempotencyKey: "stripe:invoice:corrupt:starter",
            rolloverIdempotencyKey: "stripe:rollover:corrupt:starter",
          }),
        /credit_rollover_incomplete/
      );
      assert.equal(
        await store.findGrantByIdempotencyKey("stripe:invoice:corrupt:starter"),
        null
      );
    });
  }
});

test("subscription renewal failure rolls back rollover and renewal together", async () => {
  const baseStore = createMemoryCreditLedgerStore();
  const seedLedger = createCreditLedgerService({
    store: baseStore,
    now: () => new Date("2026-07-01T00:00:00.000Z"),
  });
  await seedLedger.grantCredits({
    userId: "user-1",
    catalogId: "starter",
    source: "subscription_renewal",
    sourceId: "in_prior",
    idempotencyKey: "stripe:invoice:prior:starter",
  });

  let failRenewalTransaction = true;
  const failingStore: CreditLedgerStore = {
    ...baseStore,
    async withUserTransaction(userId, work) {
      return baseStore.withUserTransaction(userId, async (transaction) =>
        work({
          ...transaction,
          async createTransaction(input) {
            if (
              input.type === "grant" &&
              input.idempotencyKey === "stripe:invoice:current:starter:grant" &&
              failRenewalTransaction
            ) {
              failRenewalTransaction = false;
              throw new Error("simulated_renewal_crash");
            }
            return transaction.createTransaction(input);
          },
        })
      );
    },
  };
  const ledger = createCreditLedgerService({
    store: failingStore,
    now: () => new Date(),
  });

  await assert.rejects(
    () =>
      ledger.renewSubscriptionCredits({
        userId: "user-1",
        catalogId: "starter",
        sourceId: "in_current",
        renewalIdempotencyKey: "stripe:invoice:current:starter",
        rolloverIdempotencyKey: "stripe:rollover:current:starter",
      }),
    /simulated_renewal_crash/
  );
  assert.equal(
    await baseStore.findGrantByIdempotencyKey("stripe:invoice:current:starter"),
    null
  );
  assert.equal(
    await baseStore.findGrantByIdempotencyKey(
      "stripe:rollover:current:starter"
    ),
    null
  );
  assert.equal(
    (await seedLedger.getCreditBalance("user-1")).availableCredits,
    4
  );
});

test("concurrent distinct reservations cannot spend the same last credit", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({
    store,
    now: () => new Date("2026-06-29T00:00:00.000Z"),
  });
  await ledger.grantCredits({
    userId: "user-1",
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: "checkout:last-credit",
  });

  const results = await Promise.allSettled(
    Array.from({ length: 12 }, (_, index) =>
      ledger.reserveCredit({
        userId: "user-1",
        reservationKey: `session:concurrent:${index}`,
      })
    )
  );

  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1
  );
  assert.equal(
    results.filter(
      (result) =>
        result.status === "rejected" &&
        result.reason instanceof Error &&
        result.reason.message === "insufficient_credits"
    ).length,
    11
  );
  assert.deepEqual(await ledger.getCreditBalance("user-1"), {
    availableCredits: 0,
    reservedCredits: 1,
    expiringCredits: 0,
    nextCreditExpiresAt: null,
  });
});

test("a write failure rolls back the complete reservation mutation", async () => {
  const baseStore = createMemoryCreditLedgerStore();
  const baseLedger = createCreditLedgerService({
    store: baseStore,
    now: () => new Date("2026-06-29T00:00:00.000Z"),
  });
  await baseLedger.grantCredits({
    userId: "user-1",
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: "checkout:rollback",
  });

  let failReserveTransaction = true;
  const failingStore: CreditLedgerStore = {
    ...baseStore,
    async withUserTransaction(userId, work) {
      return baseStore.withUserTransaction(userId, async (transaction) =>
        work({
          ...transaction,
          async createTransaction(input) {
            if (input.type === "reserve" && failReserveTransaction) {
              failReserveTransaction = false;
              throw new Error("simulated_crash");
            }
            return transaction.createTransaction(input);
          },
        })
      );
    },
  };
  const failingLedger = createCreditLedgerService({
    store: failingStore,
    now: () => new Date("2026-06-29T00:00:00.000Z"),
  });

  await assert.rejects(
    () =>
      failingLedger.reserveCredit({
        userId: "user-1",
        reservationKey: "session:rollback",
      }),
    /simulated_crash/
  );
  assert.equal(await baseStore.findReservationByKey("session:rollback"), null);
  assert.equal(
    (await baseLedger.getCreditBalance("user-1")).availableCredits,
    1
  );
  assert.equal(
    (await baseLedger.getCreditBalance("user-1")).reservedCredits,
    0
  );

  const retried = await baseLedger.reserveCredit({
    userId: "user-1",
    reservationKey: "session:rollback",
  });
  assert.equal(retried.reservation.status, "active");
});

test("reservation replays validate owner, session, and amount", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  await ledger.grantCredits({
    userId: "user-1",
    catalogId: "trial",
    source: "trial",
    idempotencyKey: "trial:user-1",
  });
  await ledger.reserveCredit({
    userId: "user-1",
    reservationKey: "session:identity",
    sessionId: "session-1",
    credits: 1,
  });

  await assert.rejects(
    () =>
      ledger.reserveCredit({
        userId: "user-1",
        reservationKey: "session:identity",
        sessionId: "session-2",
        credits: 1,
      }),
    /credit_reservation_idempotency_conflict/
  );
  await assert.rejects(
    () =>
      ledger.reserveCredit({
        userId: "user-1",
        reservationKey: "session:identity",
        sessionId: "session-1",
        credits: 2,
      }),
    /credit_reservation_idempotency_conflict/
  );
  await assert.rejects(
    () =>
      ledger.reserveCredit({
        userId: "user-2",
        reservationKey: "session:identity",
        sessionId: "session-1",
      }),
    /credit_reservation_idempotency_conflict/
  );
});

test("completion transaction collisions fail closed without changing balances", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  const grant = await ledger.grantCredits({
    userId: "user-1",
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: "checkout:completion-collision",
  });
  const reserved = await ledger.reserveCredit({
    userId: "user-1",
    reservationKey: "session:completion-collision",
  });
  await store.createTransaction({
    userId: "user-1",
    grantId: grant.grant.id,
    reservationId: reserved.reservation.id,
    type: "adjustment",
    credits: 1,
    idempotencyKey: "consume:collision",
    sourceId: null,
    balanceAfter: 0,
    metadata: null,
  });

  await assert.rejects(
    () =>
      ledger.consumeReservation({
        reservationKey: "session:completion-collision",
        idempotencyKey: "consume:collision",
      }),
    /credit_transaction_idempotency_conflict/
  );
  assert.equal(
    (await store.findReservationByKey("session:completion-collision"))?.status,
    "active"
  );
  assert.equal((await ledger.getCreditBalance("user-1")).reservedCredits, 1);
});

test("terminal status without audit evidence fails closed instead of inventing credit", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  await ledger.grantCredits({
    userId: "user-1",
    catalogId: "trial",
    source: "trial",
    idempotencyKey: "trial:terminal-missing",
  });
  const reserved = await ledger.reserveCredit({
    userId: "user-1",
    reservationKey: "session:terminal-repair",
  });
  const allocation = reserved.allocations[0];
  assert.ok(allocation);
  const grant = (await store.listUserGrants("user-1")).find(
    (candidate) => candidate.id === allocation.grantId
  );
  assert.ok(grant);
  await store.updateGrantBalances(grant.id, {
    remainingCredits: 2,
    reservedCredits: 0,
  });
  await store.updateReservationStatus(reserved.reservation.id, "consumed");

  await assert.rejects(
    () =>
      ledger.consumeReservation({
        reservationKey: "session:terminal-repair",
        idempotencyKey: "consume:terminal-repair",
      }),
    /credit_ledger_reconciliation_required/
  );
  assert.equal(
    await store.findTransactionByIdempotencyKey("consume:terminal-repair"),
    null
  );
});

test("malformed consume evidence cannot authorize a refund", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  await ledger.grantCredits({
    userId: "user-1",
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: "checkout:malformed-consume",
  });
  const reserved = await ledger.reserveCredit({
    userId: "user-1",
    reservationKey: "session:malformed-consume",
    sessionId: "00000000-0000-4000-8000-000000000001",
  });
  const allocation = reserved.allocations[0];
  assert.ok(allocation);
  const grant = (await store.listUserGrants("user-1")).find(
    (candidate) => candidate.id === allocation.grantId
  );
  assert.ok(grant);
  await store.updateGrantBalances(grant.id, {
    remainingCredits: grant.remainingCredits,
    reservedCredits: 0,
  });
  await store.updateReservationStatus(reserved.reservation.id, "consumed");
  await store.createTransaction({
    userId: "user-1",
    grantId: grant.id,
    reservationId: reserved.reservation.id,
    type: "consume",
    credits: 1,
    idempotencyKey: "consume:malformed",
    sourceId: reserved.reservation.sessionId,
    balanceAfter: null,
    metadata: null,
  });

  await assert.rejects(
    () =>
      ledger.refundReservation({
        reservationKey: "session:malformed-consume",
        idempotencyKey: "refund:malformed-consume",
      }),
    /credit_ledger_reconciliation_required/
  );
  assert.equal(
    await store.findTransactionByIdempotencyKey("refund:malformed-consume"),
    null
  );
});

test("settled reservation rejects an alternate terminal idempotency key", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  await ledger.grantCredits({
    userId: "user-1",
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: "checkout:terminal-key",
  });
  await ledger.reserveCredit({
    userId: "user-1",
    reservationKey: "session:terminal-key",
  });
  await ledger.consumeReservation({
    reservationKey: "session:terminal-key",
    idempotencyKey: "consume:terminal-key:first",
  });

  await assert.rejects(
    () =>
      ledger.consumeReservation({
        reservationKey: "session:terminal-key",
        idempotencyKey: "consume:terminal-key:second",
      }),
    /credit_transaction_idempotency_conflict/
  );
  assert.equal(
    await store.findTransactionByIdempotencyKey("consume:terminal-key:second"),
    null
  );
  assert.equal((await ledger.getCreditBalance("user-1")).availableCredits, 0);

  const persisted = await store.findReservationByKey("session:terminal-key");
  assert.ok(persisted);
  await store.createTransaction({
    userId: "user-1",
    grantId: null,
    reservationId: persisted.id,
    type: "release",
    credits: 1,
    idempotencyKey: "release:terminal-key:corrupt",
    sourceId: null,
    balanceAfter: null,
    metadata: null,
  });
  await assert.rejects(
    () =>
      ledger.consumeReservation({
        reservationKey: "session:terminal-key",
        idempotencyKey: "consume:terminal-key:first",
      }),
    /credit_ledger_reconciliation_required/
  );
});

test("partial legacy reservations fail closed instead of guessing balances", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  await ledger.grantCredits({
    userId: "user-1",
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: "checkout:partial",
  });
  await store.createReservation({
    userId: "user-1",
    reservationKey: "session:partial",
    status: "active",
    credits: 1,
    sessionId: null,
    startContractVersion: 0,
    startAttemptId: null,
    expiresAt: new Date("2026-07-01T00:00:00.000Z"),
    metadata: null,
  });

  await assert.rejects(
    () =>
      ledger.reserveCredit({
        userId: "user-1",
        reservationKey: "session:partial",
      }),
    /credit_reservation_incomplete/
  );
  assert.equal((await ledger.getCreditBalance("user-1")).availableCredits, 1);
});

test("impossible reserve balance evidence fails closed", async () => {
  const store = createMemoryCreditLedgerStore();
  const ledger = createCreditLedgerService({ store });
  const granted = await ledger.grantCredits({
    userId: "user-1",
    catalogId: "interview_pass",
    source: "checkout",
    idempotencyKey: "checkout:corrupt-reserve",
  });
  const reservation = await store.createReservation({
    userId: "user-1",
    reservationKey: "session:corrupt-reserve",
    status: "active",
    credits: 1,
    sessionId: null,
    startContractVersion: 0,
    startAttemptId: null,
    expiresAt: new Date(Date.now() + 30 * 60_000),
    metadata: null,
  });
  await store.updateGrantBalances(granted.grant.id, {
    remainingCredits: 0,
    reservedCredits: 1,
  });
  await store.createAllocation({
    reservationId: reservation.id,
    grantId: granted.grant.id,
    credits: 1,
  });
  await store.createTransaction({
    userId: "user-1",
    grantId: granted.grant.id,
    reservationId: reservation.id,
    type: "reserve",
    credits: 1,
    idempotencyKey: `reserve:session:corrupt-reserve:${granted.grant.id}`,
    sourceId: null,
    balanceAfter: 1,
    metadata: null,
  });

  await assert.rejects(
    () =>
      ledger.reserveCredit({
        userId: "user-1",
        reservationKey: "session:corrupt-reserve",
      }),
    /credit_ledger_reconciliation_required/
  );
});

function createScopedLedgerDatabase({
  selectRows,
  insertRows = [],
  onQuery = () => {},
  onCommit = () => {},
  onRollback = () => {},
  onWrite = () => {},
}: {
  selectRows: Array<unknown[] | Promise<unknown[]>>;
  insertRows?: unknown[][];
  onQuery?: () => void;
  onCommit?: () => void;
  onRollback?: () => void;
  onWrite?: () => void;
}) {
  return {
    async transaction(
      work: (transaction: unknown) => Promise<unknown>
    ): Promise<unknown> {
      const pendingSelectRows = [[{ id: "user-1" }], [], ...selectRows];
      const pendingInsertRows = [...insertRows];
      const transaction = {
        select() {
          onQuery();
          const rows = pendingSelectRows.shift() ?? [];
          const result = Promise.resolve(rows);
          const builder = {
            from() {
              return builder;
            },
            where() {
              return builder;
            },
            limit() {
              return builder;
            },
            orderBy() {
              return builder;
            },
            async for() {
              return rows;
            },
            then: result.then.bind(result),
            catch: result.catch.bind(result),
            finally: result.finally.bind(result),
          };
          return builder;
        },
        insert() {
          onQuery();
          onWrite();
          const rows = pendingInsertRows.shift() ?? [];
          const builder = {
            values() {
              return builder;
            },
            onConflictDoNothing() {
              return builder;
            },
            async returning() {
              return rows;
            },
          };
          return builder;
        },
        update() {
          onQuery();
          onWrite();
          throw new Error("unexpected_update");
        },
      };
      try {
        const result = await work(transaction);
        onCommit();
        return result;
      } catch (error) {
        onRollback();
        throw error;
      }
    },
  } as never;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function closedTransactionOperations(transaction: CreditLedgerTransaction) {
  const grantInput = {
    userId: "user-1",
    catalogId: "trial" as const,
    source: "trial" as const,
    sourceId: null,
    idempotencyKey: "closed:grant",
    originalCredits: 2,
    remainingCredits: 2,
    reservedCredits: 0,
    expiresAt: null,
    rolloverEligible: false,
    rolloverSourceGrantId: null,
    metadata: null,
  };
  const reservationInput = {
    userId: "user-1",
    reservationKey: "closed:reservation",
    status: "active" as const,
    credits: 1,
    sessionId: null,
    startContractVersion: 0,
    startAttemptId: null,
    expiresAt: new Date("2026-07-12T00:00:00.000Z"),
    metadata: null,
  };

  return [
    () => transaction.createGrant(grantInput),
    () => transaction.findGrantByIdempotencyKey("closed:grant"),
    () => transaction.findGrantByIdempotencyKeyForUpdate("closed:grant"),
    () => transaction.findTransactionByIdempotencyKey("closed:transaction"),
    () =>
      transaction.findTransactionByIdempotencyKeyForUpdate(
        "closed:transaction"
      ),
    () => transaction.listSpendableGrants("user-1", new Date()),
    () => transaction.listSpendableGrantsForUpdate("user-1", new Date()),
    () => transaction.listUserGrants("user-1"),
    () => transaction.listUserGrantsForUpdate("user-1"),
    () => transaction.listUserReservationsForUpdate("user-1"),
    () =>
      transaction.updateGrantBalances("closed-grant-id", {
        remainingCredits: 0,
        reservedCredits: 0,
      }),
    () => transaction.createReservation(reservationInput),
    () => transaction.findReservationByKey("closed:reservation"),
    () => transaction.findReservationByKeyForUpdate("closed:reservation"),
    () =>
      transaction.updateReservationStatus("closed-reservation-id", "released"),
    () =>
      transaction.createAllocation({
        reservationId: "closed-reservation-id",
        grantId: "closed-grant-id",
        credits: 1,
      }),
    () => transaction.listAllocations("closed-reservation-id"),
    () => transaction.listAllocationsForUpdate("closed-reservation-id"),
    () =>
      transaction.listTerminalTransactionsByReservationForUpdate(
        "closed-reservation-id"
      ),
    () =>
      transaction.createTransaction({
        userId: "user-1",
        grantId: null,
        reservationId: null,
        type: "adjustment",
        credits: 1,
        idempotencyKey: "closed:transaction",
        sourceId: null,
        balanceAfter: null,
        metadata: null,
      }),
  ];
}

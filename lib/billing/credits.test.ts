import assert from "node:assert/strict";
import test from "node:test";
import { createDrizzleCreditLedgerStore } from "./credit-ledger-store";
import {
  createCreditLedgerService,
  createMemoryCreditLedgerStore,
  type CreditLedgerTransaction,
  settleReservationInTransaction,
  type CreditLedgerTransaction,
  type CreditLedgerStore,
} from "./credits";

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
    "listAllocations",
    "listSpendableGrants",
    "listUserGrants",
    "withUserTransaction",
  ]);
  assert.equal(typeof store.findReservationByKey, "function");
  assert.equal(typeof store.withUserTransaction, "function");
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
  const renewedAt = new Date();
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

test("subscription renewal repairs a complete legacy rollover missing its renewal grant", async () => {
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

  const repaired = await ledger.renewSubscriptionCredits({
    userId: "user-1",
    catalogId: "starter",
    sourceId: "in_current",
    renewalIdempotencyKey: "stripe:invoice:current:starter",
    rolloverIdempotencyKey: "stripe:rollover:current:starter",
  });

  assert.equal(repaired.rolloverGrant?.id, rollover.id);
  assert.equal(repaired.rolledCredits, 4);
  assert.equal(repaired.grant.source, "subscription_renewal");
  assert.equal((await ledger.getCreditBalance("user-1")).availableCredits, 8);
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
        scenario === "missing_debit"
          ? /credit_ledger_reconciliation_required/
          : /credit_rollover_incomplete/
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

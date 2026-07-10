import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  appUser,
  accountDeletionRequest,
  billingAdjustment,
  billingPaymentState,
  creditGrant,
  creditRolloverLot,
  creditRolloverLotAllocation,
  creditReservation,
  creditReservationGrant,
  creditTransaction,
  paymentHistory,
} from "@/lib/db/schema";
import type { BillingCatalogId } from "@meelni/core";

import type {
  CreditGrantSource,
  LedgerBillingAdjustment,
  LedgerBillingPaymentState,
  CreditLedgerTransaction,
  CreditLedgerStore,
  CreditReservationStatus,
  CreditTransactionType,
  LedgerCreditGrant,
  LedgerRolloverLot,
  LedgerRolloverLotAllocation,
  LedgerCreditReservation,
  LedgerCreditTransaction,
  LedgerReservationAllocation,
} from "./credits";

export type CreditLedgerDatabase = typeof db;
export type CreditLedgerTransactionDatabase = Parameters<
  Parameters<CreditLedgerDatabase["transaction"]>[0]
>[0];
type CreditLedgerExecutor =
  | CreditLedgerDatabase
  | CreditLedgerTransactionDatabase;

type CreditGrantRow = typeof creditGrant.$inferSelect;
type CreditReservationRow = typeof creditReservation.$inferSelect;
type CreditReservationGrantRow = typeof creditReservationGrant.$inferSelect;
type CreditTransactionRow = typeof creditTransaction.$inferSelect;
type BillingAdjustmentRow = typeof billingAdjustment.$inferSelect;
type BillingPaymentStateRow = typeof billingPaymentState.$inferSelect;
type CreditRolloverLotRow = typeof creditRolloverLot.$inferSelect;
type CreditRolloverLotAllocationRow =
  typeof creditRolloverLotAllocation.$inferSelect;

interface CreditLedgerTransactionLease {
  active: boolean;
  accepting: boolean;
  inFlight: Set<Promise<unknown>>;
}

export function createDrizzleCreditLedgerStore(
  database: CreditLedgerDatabase = db
): CreditLedgerStore {
  const operations = createDrizzleCreditLedgerTransaction(database);

  return {
    findGrantByIdempotencyKey: operations.findGrantByIdempotencyKey,
    findTransactionByIdempotencyKey: operations.findTransactionByIdempotencyKey,
    listSpendableGrants: operations.listSpendableGrants,
    listUserGrants: operations.listUserGrants,
    findReservationByKey: operations.findReservationByKey,
    listAllocations: operations.listAllocations,
    async withUserTransaction<T>(
      userId: string,
      work: (transaction: CreditLedgerTransaction) => Promise<T>
    ): Promise<T> {
      return withDrizzleCreditLedgerUserTransaction(
        userId,
        ({ ledger }) => work(ledger),
        database
      );
    },
  };
}

/**
 * Runs a cross-domain mutation behind the ledger's per-user lock. Domain rows
 * must be acquired only after this helper has locked app_user.
 */
export async function withDrizzleCreditLedgerUserTransaction<T>(
  userId: string,
  work: (context: {
    database: CreditLedgerTransactionDatabase;
    ledger: CreditLedgerTransaction;
  }) => Promise<T>,
  database: CreditLedgerDatabase = db
): Promise<T> {
  return database.transaction(async (transaction) => {
    const users = await transaction
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.id, userId))
      .limit(1)
      .for("update");
    if (!users[0]) throw new Error("credit_ledger_user_not_found");

    const tombstones = await transaction
      .select({ userId: accountDeletionRequest.userId })
      .from(accountDeletionRequest)
      .where(eq(accountDeletionRequest.userId, userId))
      .limit(1);
    if (tombstones[0]) throw new Error("account_deletion_pending");

    const lease: CreditLedgerTransactionLease = {
      active: true,
      accepting: true,
      inFlight: new Set(),
    };
    const operations = createDrizzleCreditLedgerTransaction(
      transaction,
      userId,
      lease
    );
    const ledger = createCallbackScopedTransaction(operations, lease);
    let callbackResult: T | undefined;
    let callbackError: unknown;
    let callbackFailed = false;
    try {
      callbackResult = await work({ database: transaction, ledger });
    } catch (error) {
      callbackFailed = true;
      callbackError = error;
    } finally {
      lease.accepting = false;
      const operationResults = await Promise.allSettled([...lease.inFlight]);
      lease.active = false;
      if (callbackFailed) throw callbackError;

      const failedOperation = operationResults.find(
        (result) => result.status === "rejected"
      );
      if (failedOperation?.status === "rejected") {
        throw failedOperation.reason;
      }
    }
    return callbackResult as T;
  });
}

function createCallbackScopedTransaction(
  transaction: CreditLedgerTransaction,
  lease: CreditLedgerTransactionLease
): CreditLedgerTransaction {
  return new Proxy(transaction, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;

      return (...args: unknown[]) => {
        if (!lease.accepting) {
          return Promise.reject(new Error("credit_ledger_transaction_closed"));
        }

        const operation = Promise.resolve().then(() =>
          Reflect.apply(value, target, args)
        );
        lease.inFlight.add(operation);
        void operation.catch(() => {});
        return operation;
      };
    },
  });
}

function createDrizzleCreditLedgerTransaction(
  database: CreditLedgerExecutor,
  lockedUserId?: string,
  lease?: CreditLedgerTransactionLease
): CreditLedgerTransaction {
  function requireActiveTransaction(): void {
    if (lease && !lease.active) {
      throw new Error("credit_ledger_transaction_closed");
    }
  }

  function requireLockedUser(candidateUserId?: string): string {
    requireActiveTransaction();
    if (
      !lockedUserId ||
      (candidateUserId !== undefined && candidateUserId !== lockedUserId)
    ) {
      throw new Error("credit_ledger_user_scope_mismatch");
    }
    return lockedUserId;
  }

  async function assertGrantOwnership(grantId: string): Promise<void> {
    const userId = requireLockedUser();
    const rows = await database
      .select({ id: creditGrant.id })
      .from(creditGrant)
      .where(and(eq(creditGrant.id, grantId), eq(creditGrant.userId, userId)))
      .limit(1)
      .for("update");
    if (!rows[0]) throw new Error("credit_ledger_user_scope_mismatch");
  }

  async function assertReservationOwnership(
    reservationId: string
  ): Promise<void> {
    const userId = requireLockedUser();
    const rows = await database
      .select({ id: creditReservation.id })
      .from(creditReservation)
      .where(
        and(
          eq(creditReservation.id, reservationId),
          eq(creditReservation.userId, userId)
        )
      )
      .limit(1)
      .for("update");
    if (!rows[0]) throw new Error("credit_ledger_user_scope_mismatch");
  }

  function assertOwnedGrantRows(rows: CreditGrantRow[]): void {
    if (lockedUserId && rows.some((row) => row.userId !== lockedUserId)) {
      throw new Error("credit_ledger_user_scope_mismatch");
    }
  }

  function assertOwnedReservationRows(rows: CreditReservationRow[]): void {
    if (lockedUserId && rows.some((row) => row.userId !== lockedUserId)) {
      throw new Error("credit_ledger_user_scope_mismatch");
    }
  }

  function assertOwnedTransactionRows(rows: CreditTransactionRow[]): void {
    if (lockedUserId && rows.some((row) => row.userId !== lockedUserId)) {
      throw new Error("credit_ledger_user_scope_mismatch");
    }
  }

  async function assertAllocationGrantOwnership(
    rows: CreditReservationGrantRow[]
  ): Promise<void> {
    const userId = requireLockedUser();
    const grantIds = [...new Set(rows.map((row) => row.grantId))].sort();
    if (grantIds.length === 0) return;

    const grants = await database
      .select()
      .from(creditGrant)
      .where(
        and(inArray(creditGrant.id, grantIds), eq(creditGrant.userId, userId))
      )
      .orderBy(asc(creditGrant.id));

    assertOwnedGrantRows(grants);
    const ownedGrantIds = new Set(grants.map((grant) => grant.id));
    if (grantIds.some((grantId) => !ownedGrantIds.has(grantId))) {
      throw new Error("credit_ledger_user_scope_mismatch");
    }
  }

  const store: CreditLedgerTransaction = {
    async createGrant(input) {
      requireActiveTransaction();
      requireLockedUser(input.userId);
      const inserted = await database
        .insert(creditGrant)
        .values(input)
        .onConflictDoNothing({ target: creditGrant.idempotencyKey })
        .returning();

      if (inserted[0]) {
        return mapGrant(inserted[0]);
      }

      return requireRow(
        await store.findGrantByIdempotencyKey(input.idempotencyKey),
        "Credit grant",
        input.idempotencyKey
      );
    },

    async findGrantByIdempotencyKey(idempotencyKey) {
      requireActiveTransaction();
      const userId = lockedUserId;
      const rows = await database
        .select()
        .from(creditGrant)
        .where(
          userId
            ? and(
                eq(creditGrant.idempotencyKey, idempotencyKey),
                eq(creditGrant.userId, userId)
              )
            : eq(creditGrant.idempotencyKey, idempotencyKey)
        )
        .limit(1);

      assertOwnedGrantRows(rows);
      return rows[0] ? mapGrant(rows[0]) : null;
    },

    async findGrantByIdempotencyKeyForUpdate(idempotencyKey) {
      requireActiveTransaction();
      const userId = requireLockedUser();
      const rows = await database
        .select()
        .from(creditGrant)
        .where(
          and(
            eq(creditGrant.idempotencyKey, idempotencyKey),
            eq(creditGrant.userId, userId)
          )
        )
        .limit(1)
        .for("update");

      return rows[0] ? mapGrant(rows[0]) : null;
    },

    async findTransactionByIdempotencyKey(idempotencyKey) {
      requireActiveTransaction();
      const userId = lockedUserId;
      const rows = await database
        .select()
        .from(creditTransaction)
        .where(
          userId
            ? and(
                eq(creditTransaction.idempotencyKey, idempotencyKey),
                eq(creditTransaction.userId, userId)
              )
            : eq(creditTransaction.idempotencyKey, idempotencyKey)
        )
        .limit(1);

      assertOwnedTransactionRows(rows);
      return rows[0] ? mapTransaction(rows[0]) : null;
    },

    async findTransactionByIdempotencyKeyForUpdate(idempotencyKey) {
      requireActiveTransaction();
      const userId = requireLockedUser();
      const rows = await database
        .select()
        .from(creditTransaction)
        .where(
          and(
            eq(creditTransaction.idempotencyKey, idempotencyKey),
            eq(creditTransaction.userId, userId)
          )
        )
        .limit(1)
        .for("update");

      return rows[0] ? mapTransaction(rows[0]) : null;
    },

    async listSpendableGrants(userId, now) {
      requireActiveTransaction();
      if (lockedUserId) requireLockedUser(userId);
      const rows = await database
        .select()
        .from(creditGrant)
        .where(
          and(
            eq(creditGrant.userId, userId),
            isNull(creditGrant.revokedAt),
            gt(creditGrant.remainingCredits, 0),
            or(isNull(creditGrant.expiresAt), gt(creditGrant.expiresAt, now))
          )
        )
        .orderBy(
          asc(creditGrant.expiresAt),
          asc(creditGrant.createdAt),
          asc(creditGrant.id)
        );

      assertOwnedGrantRows(rows);
      return rows.map(mapGrant);
    },

    async listSpendableGrantsForUpdate(userId, now) {
      requireActiveTransaction();
      requireLockedUser(userId);
      const rows = await database
        .select()
        .from(creditGrant)
        .where(
          and(
            eq(creditGrant.userId, userId),
            isNull(creditGrant.revokedAt),
            gt(creditGrant.remainingCredits, 0),
            or(isNull(creditGrant.expiresAt), gt(creditGrant.expiresAt, now))
          )
        )
        .orderBy(
          asc(creditGrant.expiresAt),
          asc(creditGrant.createdAt),
          asc(creditGrant.id)
        )
        .for("update");

      return rows.map(mapGrant);
    },

    async listUserGrants(userId) {
      requireActiveTransaction();
      if (lockedUserId) requireLockedUser(userId);
      const rows = await database
        .select()
        .from(creditGrant)
        .where(eq(creditGrant.userId, userId));

      assertOwnedGrantRows(rows);
      return rows.map(mapGrant);
    },

    async listUserGrantsForUpdate(userId) {
      requireActiveTransaction();
      requireLockedUser(userId);
      const rows = await database
        .select()
        .from(creditGrant)
        .where(eq(creditGrant.userId, userId))
        .orderBy(asc(creditGrant.id))
        .for("update");

      return rows.map(mapGrant);
    },

    async listUserReservationsForUpdate(userId) {
      requireActiveTransaction();
      requireLockedUser(userId);
      const rows = await database
        .select()
        .from(creditReservation)
        .where(eq(creditReservation.userId, userId))
        .orderBy(asc(creditReservation.id))
        .for("update");

      return rows.map(mapReservation);
    },

    async updateGrantBalances(grantId, balances) {
      requireActiveTransaction();
      await assertGrantOwnership(grantId);
      const rows = await database
        .update(creditGrant)
        .set({ ...balances, updatedAt: new Date() })
        .where(eq(creditGrant.id, grantId))
        .returning();

      return requireRow(
        rows[0] ? mapGrant(rows[0]) : null,
        "Credit grant",
        grantId
      );
    },

    async revokeGrant(grantId, input) {
      const rows = await database
        .update(creditGrant)
        .set({
          remainingCredits: input.remainingCredits,
          revokedAt: input.revokedAt,
          revocationKey: input.revocationKey,
          updatedAt: new Date(),
        })
        .where(eq(creditGrant.id, grantId))
        .returning();
      return requireRow(
        rows[0] ? mapGrant(rows[0]) : null,
        "Credit grant",
        grantId
      );
    },

    async restoreGrant(grantId, input) {
      const rows = await database
        .update(creditGrant)
        .set({
          remainingCredits: input.remainingCredits,
          ...(input.clearRevocation
            ? { revokedAt: null, revocationKey: null }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(creditGrant.id, grantId))
        .returning();
      return requireRow(
        rows[0] ? mapGrant(rows[0]) : null,
        "Credit grant",
        grantId
      );
    },

    async createReservation(input) {
      requireActiveTransaction();
      requireLockedUser(input.userId);
      const inserted = await database
        .insert(creditReservation)
        .values(input)
        .onConflictDoNothing({ target: creditReservation.reservationKey })
        .returning();

      if (inserted[0]) {
        return mapReservation(inserted[0]);
      }

      return requireRow(
        await store.findReservationByKey(input.reservationKey),
        "Credit reservation",
        input.reservationKey
      );
    },

    async findReservationByKey(reservationKey) {
      requireActiveTransaction();
      const userId = lockedUserId;
      const rows = await database
        .select()
        .from(creditReservation)
        .where(
          userId
            ? and(
                eq(creditReservation.reservationKey, reservationKey),
                eq(creditReservation.userId, userId)
              )
            : eq(creditReservation.reservationKey, reservationKey)
        )
        .limit(1);

      assertOwnedReservationRows(rows);
      return rows[0] ? mapReservation(rows[0]) : null;
    },

    async findReservationByKeyForUpdate(reservationKey) {
      requireActiveTransaction();
      const userId = requireLockedUser();
      const rows = await database
        .select()
        .from(creditReservation)
        .where(
          and(
            eq(creditReservation.reservationKey, reservationKey),
            eq(creditReservation.userId, userId)
          )
        )
        .limit(1)
        .for("update");

      return rows[0] ? mapReservation(rows[0]) : null;
    },

    async updateReservationStatus(reservationId, status) {
      requireActiveTransaction();
      await assertReservationOwnership(reservationId);
      const rows = await database
        .update(creditReservation)
        .set({ status, updatedAt: new Date() })
        .where(eq(creditReservation.id, reservationId))
        .returning();

      return requireRow(
        rows[0] ? mapReservation(rows[0]) : null,
        "Credit reservation",
        reservationId
      );
    },

    async createAllocation(input) {
      requireActiveTransaction();
      await assertReservationOwnership(input.reservationId);
      await assertGrantOwnership(input.grantId);
      const rows = await database
        .insert(creditReservationGrant)
        .values({ ...input, revokedCredits: input.revokedCredits ?? 0 })
        .returning();

      return requireRow(
        rows[0] ? mapAllocation(rows[0]) : null,
        "Credit reservation allocation",
        `${input.reservationId}:${input.grantId}`
      );
    },

    async updateAllocationRevokedCredits(allocationId, revokedCredits) {
      const rows = await database
        .update(creditReservationGrant)
        .set({ revokedCredits })
        .where(eq(creditReservationGrant.id, allocationId))
        .returning();
      return requireRow(
        rows[0] ? mapAllocation(rows[0]) : null,
        "Credit allocation",
        allocationId
      );
    },

    async createRolloverLot(input) {
      const inserted = await database
        .insert(creditRolloverLot)
        .values(input)
        .onConflictDoNothing({
          target: [
            creditRolloverLot.rolloverGrantId,
            creditRolloverLot.sourceGrantId,
          ],
        })
        .returning();
      if (inserted[0]) return mapRolloverLot(inserted[0]);
      const rows = await database
        .select()
        .from(creditRolloverLot)
        .where(
          and(
            eq(creditRolloverLot.rolloverGrantId, input.rolloverGrantId),
            eq(creditRolloverLot.sourceGrantId, input.sourceGrantId)
          )
        )
        .limit(1);
      return requireRow(
        rows[0] ? mapRolloverLot(rows[0]) : null,
        "Credit rollover lot",
        `${input.rolloverGrantId}:${input.sourceGrantId}`
      );
    },

    async updateRolloverLotBalances(lotId, balances) {
      const rows = await database
        .update(creditRolloverLot)
        .set({ ...balances, updatedAt: new Date() })
        .where(eq(creditRolloverLot.id, lotId))
        .returning();
      return requireRow(
        rows[0] ? mapRolloverLot(rows[0]) : null,
        "Credit rollover lot",
        lotId
      );
    },

    async createRolloverLotAllocation(input) {
      const inserted = await database
        .insert(creditRolloverLotAllocation)
        .values(input)
        .onConflictDoNothing({
          target: [
            creditRolloverLotAllocation.reservationGrantId,
            creditRolloverLotAllocation.rolloverLotId,
          ],
        })
        .returning();
      if (inserted[0]) return mapRolloverLotAllocation(inserted[0]);
      const rows = await database
        .select()
        .from(creditRolloverLotAllocation)
        .where(
          and(
            eq(
              creditRolloverLotAllocation.reservationGrantId,
              input.reservationGrantId
            ),
            eq(creditRolloverLotAllocation.rolloverLotId, input.rolloverLotId)
          )
        )
        .limit(1);
      return requireRow(
        rows[0] ? mapRolloverLotAllocation(rows[0]) : null,
        "Credit rollover lot allocation",
        `${input.reservationGrantId}:${input.rolloverLotId}`
      );
    },

    async updateRolloverLotAllocationRevokedCredits(
      allocationId,
      revokedCredits
    ) {
      const rows = await database
        .update(creditRolloverLotAllocation)
        .set({ revokedCredits })
        .where(eq(creditRolloverLotAllocation.id, allocationId))
        .returning();
      return requireRow(
        rows[0] ? mapRolloverLotAllocation(rows[0]) : null,
        "Credit rollover lot allocation",
        allocationId
      );
    },

    async listAllocations(reservationId) {
      requireActiveTransaction();
      if (lockedUserId) await assertReservationOwnership(reservationId);
      const rows = await database
        .select()
        .from(creditReservationGrant)
        .where(eq(creditReservationGrant.reservationId, reservationId))
        .orderBy(asc(creditReservationGrant.grantId));

      if (lockedUserId) await assertAllocationGrantOwnership(rows);
      return rows.map(mapAllocation);
    },

    async listAllocationsForUpdate(reservationId) {
      requireActiveTransaction();
      await assertReservationOwnership(reservationId);
      const rows = await database
        .select()
        .from(creditReservationGrant)
        .where(eq(creditReservationGrant.reservationId, reservationId))
        .orderBy(asc(creditReservationGrant.grantId))
        .for("update");

      await assertAllocationGrantOwnership(rows);
      return rows.map(mapAllocation);
    },

    async listTerminalTransactionsByReservationForUpdate(reservationId) {
      requireActiveTransaction();
      await assertReservationOwnership(reservationId);
      const rows = await database
        .select()
        .from(creditTransaction)
        .where(
          and(
            eq(creditTransaction.reservationId, reservationId),
            inArray(creditTransaction.type, ["consume", "release", "refund"])
          )
        )
        .orderBy(asc(creditTransaction.id))
        .for("update");

      assertOwnedTransactionRows(rows);
      return rows.map(mapTransaction);
    },

    async listTransactionsByGrantForUpdate(grantId) {
      const rows = await database
        .select()
        .from(creditTransaction)
        .where(eq(creditTransaction.grantId, grantId))
        .orderBy(asc(creditTransaction.id))
        .for("update");
      return rows.map(mapTransaction);
    },

    async listRolloverLotsForGrantForUpdate(rolloverGrantId) {
      const rows = await database
        .select()
        .from(creditRolloverLot)
        .where(eq(creditRolloverLot.rolloverGrantId, rolloverGrantId))
        .orderBy(asc(creditRolloverLot.createdAt), asc(creditRolloverLot.id))
        .for("update");
      return rows.map(mapRolloverLot);
    },

    async listRolloverLotsForSourceForUpdate(sourceGrantId) {
      const rows = await database
        .select()
        .from(creditRolloverLot)
        .where(eq(creditRolloverLot.sourceGrantId, sourceGrantId))
        .orderBy(asc(creditRolloverLot.createdAt), asc(creditRolloverLot.id))
        .for("update");
      return rows.map(mapRolloverLot);
    },

    async listRolloverLotAllocationsForReservationGrantForUpdate(
      reservationGrantId
    ) {
      const rows = await database
        .select()
        .from(creditRolloverLotAllocation)
        .where(
          eq(creditRolloverLotAllocation.reservationGrantId, reservationGrantId)
        )
        .orderBy(asc(creditRolloverLotAllocation.createdAt))
        .for("update");
      return rows.map(mapRolloverLotAllocation);
    },

    async createTransaction(input) {
      requireActiveTransaction();
      requireLockedUser(input.userId);
      if (input.grantId) await assertGrantOwnership(input.grantId);
      if (input.reservationId) {
        await assertReservationOwnership(input.reservationId);
      }
      const inserted = await database
        .insert(creditTransaction)
        .values(input)
        .onConflictDoNothing({ target: creditTransaction.idempotencyKey })
        .returning();

      if (inserted[0]) {
        return mapTransaction(inserted[0]);
      }

      return requireRow(
        await store.findTransactionByIdempotencyKey(input.idempotencyKey),
        "Credit transaction",
        input.idempotencyKey
      );
    },

    async createBillingAdjustment(input) {
      const inserted = await database
        .insert(billingAdjustment)
        .values(input)
        .onConflictDoNothing({
          target: [
            billingAdjustment.providerAdjustmentId,
            billingAdjustment.direction,
          ],
        })
        .returning();
      if (inserted[0]) return mapBillingAdjustment(inserted[0]);
      return requireRow(
        await store.findBillingAdjustment(
          input.providerAdjustmentId,
          input.direction
        ),
        "Billing adjustment",
        input.providerAdjustmentId
      );
    },

    async findBillingAdjustment(providerAdjustmentId, direction) {
      const rows = await database
        .select()
        .from(billingAdjustment)
        .where(
          and(
            eq(billingAdjustment.providerAdjustmentId, providerAdjustmentId),
            eq(billingAdjustment.direction, direction)
          )
        )
        .limit(1);
      return rows[0] ? mapBillingAdjustment(rows[0]) : null;
    },

    async createBillingPaymentState(input) {
      const inserted = await database
        .insert(billingPaymentState)
        .values(input)
        .onConflictDoNothing({ target: billingPaymentState.creditGrantId })
        .returning();
      if (inserted[0]) return mapBillingPaymentState(inserted[0]);
      return requireRow(
        await store.findBillingPaymentStateForUpdate(input.creditGrantId),
        "Billing payment state",
        input.creditGrantId
      );
    },

    async findBillingAdjustmentForUpdate(providerAdjustmentId, direction) {
      const rows = await database
        .select()
        .from(billingAdjustment)
        .where(
          and(
            eq(billingAdjustment.providerAdjustmentId, providerAdjustmentId),
            eq(billingAdjustment.direction, direction)
          )
        )
        .limit(1)
        .for("update");
      return rows[0] ? mapBillingAdjustment(rows[0]) : null;
    },

    async listBillingAdjustmentsForPaymentForUpdate(paymentHistoryId) {
      const rows = await database
        .select()
        .from(billingAdjustment)
        .where(eq(billingAdjustment.paymentHistoryId, paymentHistoryId))
        .orderBy(asc(billingAdjustment.createdAt), asc(billingAdjustment.id))
        .for("update");
      return rows.map(mapBillingAdjustment);
    },

    async listBillingAdjustmentsForGrantForUpdate(creditGrantId) {
      const rows = await database
        .select()
        .from(billingAdjustment)
        .where(eq(billingAdjustment.creditGrantId, creditGrantId))
        .orderBy(asc(billingAdjustment.createdAt), asc(billingAdjustment.id))
        .for("update");
      return rows.map(mapBillingAdjustment);
    },

    async findBillingPaymentStateForUpdate(creditGrantId) {
      const rows = await database
        .select()
        .from(billingPaymentState)
        .where(eq(billingPaymentState.creditGrantId, creditGrantId))
        .limit(1)
        .for("update");
      return rows[0] ? mapBillingPaymentState(rows[0]) : null;
    },

    async updateBillingPaymentState(stateId, input) {
      const rows = await database
        .update(billingPaymentState)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(billingPaymentState.id, stateId))
        .returning();
      return requireRow(
        rows[0] ? mapBillingPaymentState(rows[0]) : null,
        "Billing payment state",
        stateId
      );
    },

    async updatePaymentHistoryStatus(paymentHistoryId, status) {
      await database
        .update(paymentHistory)
        .set({ status })
        .where(eq(paymentHistory.id, paymentHistoryId));
    },
  };

  return store;
}

function mapGrant(row: CreditGrantRow): LedgerCreditGrant {
  return {
    id: row.id,
    userId: row.userId,
    catalogId: row.catalogId as BillingCatalogId,
    source: row.source as CreditGrantSource,
    sourceId: row.sourceId,
    idempotencyKey: row.idempotencyKey,
    originalCredits: row.originalCredits,
    remainingCredits: row.remainingCredits,
    reservedCredits: row.reservedCredits,
    expiresAt: row.expiresAt,
    rolloverEligible: row.rolloverEligible,
    rolloverSourceGrantId: row.rolloverSourceGrantId,
    revokedAt: row.revokedAt,
    revocationKey: row.revocationKey,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapReservation(row: CreditReservationRow): LedgerCreditReservation {
  return {
    id: row.id,
    userId: row.userId,
    reservationKey: row.reservationKey,
    status: row.status as CreditReservationStatus,
    credits: row.credits,
    sessionId: row.sessionId,
    startContractVersion: row.startContractVersion,
    startAttemptId: row.startAttemptId,
    expiresAt: row.expiresAt,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapBillingAdjustment(
  row: BillingAdjustmentRow
): LedgerBillingAdjustment {
  return {
    id: row.id,
    userId: row.userId,
    paymentHistoryId: row.paymentHistoryId,
    creditGrantId: row.creditGrantId,
    stripeEventId: row.stripeEventId,
    providerAdjustmentId: row.providerAdjustmentId,
    adjustmentType:
      row.adjustmentType as LedgerBillingAdjustment["adjustmentType"],
    direction: row.direction as LedgerBillingAdjustment["direction"],
    amountInCents: row.amountInCents,
    currency: row.currency,
    sourceCredits: row.sourceCredits,
    remainingCredits: row.remainingCredits,
    reservedCredits: row.reservedCredits,
    consumedCredits: row.consumedCredits,
    revokedCredits: row.revokedCredits,
    unrecoverableCredits: row.unrecoverableCredits,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
  };
}

function mapBillingPaymentState(
  row: BillingPaymentStateRow
): LedgerBillingPaymentState {
  return {
    id: row.id,
    userId: row.userId,
    paymentHistoryId: row.paymentHistoryId,
    creditGrantId: row.creditGrantId,
    sourceCredits: row.sourceCredits,
    targetCredits: row.targetCredits,
    revokedCredits: row.revokedCredits,
    unrecoverableCredits: row.unrecoverableCredits,
    consumedCredits: row.consumedCredits,
    grantRevocations: row.grantRevocations,
    allocationRevocations: row.allocationRevocations,
    lastProviderAdjustmentId: row.lastProviderAdjustmentId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAllocation(
  row: CreditReservationGrantRow
): LedgerReservationAllocation {
  return {
    id: row.id,
    reservationId: row.reservationId,
    grantId: row.grantId,
    credits: row.credits,
    revokedCredits: row.revokedCredits,
    createdAt: row.createdAt,
  };
}

function mapRolloverLot(row: CreditRolloverLotRow): LedgerRolloverLot {
  return {
    id: row.id,
    userId: row.userId,
    rolloverGrantId: row.rolloverGrantId,
    sourceGrantId: row.sourceGrantId,
    originalCredits: row.originalCredits,
    remainingCredits: row.remainingCredits,
    reservedCredits: row.reservedCredits,
    consumedCredits: row.consumedCredits,
    revokedCredits: row.revokedCredits,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRolloverLotAllocation(
  row: CreditRolloverLotAllocationRow
): LedgerRolloverLotAllocation {
  return {
    id: row.id,
    reservationGrantId: row.reservationGrantId,
    rolloverLotId: row.rolloverLotId,
    credits: row.credits,
    revokedCredits: row.revokedCredits,
    createdAt: row.createdAt,
  };
}

function mapTransaction(row: CreditTransactionRow): LedgerCreditTransaction {
  return {
    id: row.id,
    userId: row.userId,
    grantId: row.grantId,
    reservationId: row.reservationId,
    type: row.type as CreditTransactionType,
    credits: row.credits,
    idempotencyKey: row.idempotencyKey,
    sourceId: row.sourceId,
    balanceAfter: row.balanceAfter,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt,
  };
}

function requireRow<T>(row: T | null, entity: string, key: string): T {
  if (!row) {
    throw new Error(`${entity} ${key} was not found after write`);
  }

  return row;
}

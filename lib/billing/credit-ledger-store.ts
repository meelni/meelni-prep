import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  appUser,
  accountDeletionRequest,
  creditGrant,
  creditReservation,
  creditReservationGrant,
  creditTransaction,
} from "@/lib/db/schema";
import type { BillingCatalogId } from "@meelni/core";

import type {
  CreditGrantSource,
  CreditLedgerTransaction,
  CreditLedgerStore,
  CreditReservationStatus,
  CreditTransactionType,
  LedgerCreditGrant,
  LedgerCreditReservation,
  LedgerCreditTransaction,
  LedgerReservationAllocation,
} from "./credits";

type CreditLedgerDatabase = typeof db;
type CreditLedgerTransactionDatabase = Parameters<
  Parameters<CreditLedgerDatabase["transaction"]>[0]
>[0];
type CreditLedgerExecutor =
  | CreditLedgerDatabase
  | CreditLedgerTransactionDatabase;

type CreditGrantRow = typeof creditGrant.$inferSelect;
type CreditReservationRow = typeof creditReservation.$inferSelect;
type CreditReservationGrantRow = typeof creditReservationGrant.$inferSelect;
type CreditTransactionRow = typeof creditTransaction.$inferSelect;

interface CreditLedgerTransactionLease {
  active: boolean;
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
    async withUserTransaction(userId, work) {
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

        const lease: CreditLedgerTransactionLease = { active: true };
        const scopedTransaction = createDrizzleCreditLedgerTransaction(
          transaction,
          userId,
          lease
        );
        try {
          return await work(scopedTransaction);
        } finally {
          lease.active = false;
        }
      });
    },
  };
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
        .values(input)
        .returning();

      return requireRow(
        rows[0] ? mapAllocation(rows[0]) : null,
        "Credit reservation allocation",
        `${input.reservationId}:${input.grantId}`
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

      return rows.map(mapTransaction);
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
    expiresAt: row.expiresAt,
    metadata: row.metadata ?? null,
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

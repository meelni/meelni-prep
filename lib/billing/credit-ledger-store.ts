import { and, asc, eq, gt, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  appUser,
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

export function createDrizzleCreditLedgerStore(
  database: CreditLedgerDatabase = db
): CreditLedgerStore {
  const operations = createDrizzleCreditLedgerTransaction(database);

  return {
    findGrantByIdempotencyKey: operations.findGrantByIdempotencyKey,
    findTransactionByIdempotencyKey:
      operations.findTransactionByIdempotencyKey,
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

        return work(createDrizzleCreditLedgerTransaction(transaction));
      });
    },
  };
}

function createDrizzleCreditLedgerTransaction(
  database: CreditLedgerExecutor
): CreditLedgerTransaction {
  const store: CreditLedgerTransaction = {
    async createGrant(input) {
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
      const rows = await database
        .select()
        .from(creditGrant)
        .where(eq(creditGrant.idempotencyKey, idempotencyKey))
        .limit(1);

      return rows[0] ? mapGrant(rows[0]) : null;
    },

    async findGrantByIdempotencyKeyForUpdate(idempotencyKey) {
      const rows = await database
        .select()
        .from(creditGrant)
        .where(eq(creditGrant.idempotencyKey, idempotencyKey))
        .limit(1)
        .for("update");

      return rows[0] ? mapGrant(rows[0]) : null;
    },

    async findTransactionByIdempotencyKey(idempotencyKey) {
      const rows = await database
        .select()
        .from(creditTransaction)
        .where(eq(creditTransaction.idempotencyKey, idempotencyKey))
        .limit(1);

      return rows[0] ? mapTransaction(rows[0]) : null;
    },

    async findTransactionByIdempotencyKeyForUpdate(idempotencyKey) {
      const rows = await database
        .select()
        .from(creditTransaction)
        .where(eq(creditTransaction.idempotencyKey, idempotencyKey))
        .limit(1)
        .for("update");

      return rows[0] ? mapTransaction(rows[0]) : null;
    },

    async listSpendableGrants(userId, now) {
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

      return rows.map(mapGrant);
    },

    async listSpendableGrantsForUpdate(userId, now) {
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
      const rows = await database
        .select()
        .from(creditGrant)
        .where(eq(creditGrant.userId, userId));

      return rows.map(mapGrant);
    },

    async listUserGrantsForUpdate(userId) {
      const rows = await database
        .select()
        .from(creditGrant)
        .where(eq(creditGrant.userId, userId))
        .orderBy(asc(creditGrant.id))
        .for("update");

      return rows.map(mapGrant);
    },

    async listUserReservationsForUpdate(userId) {
      const rows = await database
        .select()
        .from(creditReservation)
        .where(eq(creditReservation.userId, userId))
        .orderBy(asc(creditReservation.id))
        .for("update");

      return rows.map(mapReservation);
    },

    async updateGrantBalances(grantId, balances) {
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
      const rows = await database
        .select()
        .from(creditReservation)
        .where(eq(creditReservation.reservationKey, reservationKey))
        .limit(1);

      return rows[0] ? mapReservation(rows[0]) : null;
    },

    async findReservationByKeyForUpdate(reservationKey) {
      const rows = await database
        .select()
        .from(creditReservation)
        .where(eq(creditReservation.reservationKey, reservationKey))
        .limit(1)
        .for("update");

      return rows[0] ? mapReservation(rows[0]) : null;
    },

    async updateReservationStatus(reservationId, status) {
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
      const rows = await database
        .select()
        .from(creditReservationGrant)
        .where(eq(creditReservationGrant.reservationId, reservationId))
        .orderBy(asc(creditReservationGrant.grantId));

      return rows.map(mapAllocation);
    },

    async listAllocationsForUpdate(reservationId) {
      const rows = await database
        .select()
        .from(creditReservationGrant)
        .where(eq(creditReservationGrant.reservationId, reservationId))
        .orderBy(asc(creditReservationGrant.grantId))
        .for("update");

      return rows.map(mapAllocation);
    },

    async listTerminalTransactionsByReservationForUpdate(reservationId) {
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

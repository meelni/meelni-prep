import { BILLING_CATALOG, type BillingCatalogId } from "@meelni/core";
import {
  trackBillingCreditConsumed,
  trackBillingCreditExpired,
  trackBillingCreditGranted,
  trackBillingCreditRefunded,
  trackBillingCreditReleased,
  trackBillingCreditReserved,
  trackBillingCreditRolloverCreated,
  trackBillingNoCredits,
} from "./analytics";

export type CreditGrantSource =
  | "trial"
  | "checkout"
  | "subscription_renewal"
  | "rollover"
  | "admin"
  | "refund"
  | "migration";

export type CreditTransactionType =
  | "grant"
  | "reserve"
  | "consume"
  | "release"
  | "refund"
  | "expire"
  | "adjustment"
  | "rollover";

export type CreditReservationStatus =
  | "active"
  | "consumed"
  | "released"
  | "refunded"
  | "expired";

export interface LedgerCreditGrant {
  id: string;
  userId: string;
  catalogId: BillingCatalogId;
  source: CreditGrantSource;
  sourceId: string | null;
  idempotencyKey: string;
  originalCredits: number;
  remainingCredits: number;
  reservedCredits: number;
  expiresAt: Date | null;
  rolloverEligible: boolean;
  rolloverSourceGrantId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerCreditReservation {
  id: string;
  userId: string;
  reservationKey: string;
  status: CreditReservationStatus;
  credits: number;
  sessionId: string | null;
  expiresAt: Date;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerReservationAllocation {
  id: string;
  reservationId: string;
  grantId: string;
  credits: number;
  createdAt: Date;
}

export interface LedgerCreditTransaction {
  id: string;
  userId: string;
  grantId: string | null;
  reservationId: string | null;
  type: CreditTransactionType;
  credits: number;
  idempotencyKey: string;
  sourceId: string | null;
  balanceAfter: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface CreditLedgerStore {
  createGrant(
    input: Omit<LedgerCreditGrant, "id" | "createdAt" | "updatedAt">
  ): Promise<LedgerCreditGrant>;
  findGrantByIdempotencyKey(
    idempotencyKey: string
  ): Promise<LedgerCreditGrant | null>;
  findTransactionByIdempotencyKey(
    idempotencyKey: string
  ): Promise<LedgerCreditTransaction | null>;
  listSpendableGrants(userId: string, now: Date): Promise<LedgerCreditGrant[]>;
  listUserGrants(userId: string): Promise<LedgerCreditGrant[]>;
  updateGrantBalances(
    grantId: string,
    balances: Pick<LedgerCreditGrant, "remainingCredits" | "reservedCredits">
  ): Promise<LedgerCreditGrant>;
  createReservation(
    input: Omit<LedgerCreditReservation, "id" | "createdAt" | "updatedAt">
  ): Promise<LedgerCreditReservation>;
  findReservationByKey(
    reservationKey: string
  ): Promise<LedgerCreditReservation | null>;
  updateReservationStatus(
    reservationId: string,
    status: CreditReservationStatus
  ): Promise<LedgerCreditReservation>;
  createAllocation(
    input: Omit<LedgerReservationAllocation, "id" | "createdAt">
  ): Promise<LedgerReservationAllocation>;
  listAllocations(
    reservationId: string
  ): Promise<LedgerReservationAllocation[]>;
  createTransaction(
    input: Omit<LedgerCreditTransaction, "id" | "createdAt">
  ): Promise<LedgerCreditTransaction>;
}

export interface CreditBalance {
  availableCredits: number;
  reservedCredits: number;
  expiringCredits: number;
  nextCreditExpiresAt: Date | null;
}

export interface CreateCreditLedgerServiceInput {
  store: CreditLedgerStore;
  now?: () => Date;
}

export interface GrantCreditsInput {
  userId: string;
  catalogId: BillingCatalogId;
  source: CreditGrantSource;
  idempotencyKey: string;
  sourceId?: string | null;
  includedCredits?: number;
  expiresAt?: Date | null;
  rolloverEligible?: boolean;
  rolloverSourceGrantId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface GrantCreditsResult {
  grant: LedgerCreditGrant;
}

export function getTrialGrantIdempotencyKey(userId: string): string {
  return `trial:${userId}`;
}

export interface ExpireCreditsResult {
  expiredCredits: number;
}

export interface ReserveCreditInput {
  userId: string;
  reservationKey: string;
  sessionId?: string | null;
  credits?: number;
  expiresAt?: Date;
  metadata?: Record<string, unknown> | null;
}

export interface ReserveCreditResult {
  reservation: LedgerCreditReservation;
  allocations: LedgerReservationAllocation[];
}

export interface CompleteReservationInput {
  reservationKey: string;
  idempotencyKey: string;
}

export interface CompleteReservationResult {
  reservation: LedgerCreditReservation;
}

export interface RolloverSubscriptionCreditsInput {
  userId: string;
  catalogId: BillingCatalogId;
  idempotencyKey: string;
  sourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RolloverSubscriptionCreditsResult {
  rolledCredits: number;
  grant: LedgerCreditGrant | null;
}

export function createCreditLedgerService({
  store,
  now = () => new Date(),
}: CreateCreditLedgerServiceInput) {
  return {
    async grantCredits(input: GrantCreditsInput): Promise<GrantCreditsResult> {
      const existing = await store.findGrantByIdempotencyKey(
        input.idempotencyKey
      );
      const catalogItem = BILLING_CATALOG[input.catalogId];
      const issuedAt = now();
      const includedCredits =
        input.includedCredits ?? catalogItem.includedCredits;
      const expiresAt =
        input.expiresAt === undefined
          ? addDaysOrNull(issuedAt, catalogItem.expiresAfterDays)
          : input.expiresAt;
      const grant =
        existing ??
        (await store.createGrant({
          userId: input.userId,
          catalogId: input.catalogId,
          source: input.source,
          sourceId: input.sourceId ?? null,
          idempotencyKey: input.idempotencyKey,
          originalCredits: includedCredits,
          remainingCredits: includedCredits,
          reservedCredits: 0,
          expiresAt,
          rolloverEligible:
            input.rolloverEligible ??
            (catalogItem.kind === "subscription" && includedCredits > 0),
          rolloverSourceGrantId: input.rolloverSourceGrantId ?? null,
          metadata: input.metadata ?? null,
        }));

      assertGrantMatchesRequest(grant, input);

      const transaction = await store.createTransaction({
        userId: grant.userId,
        grantId: grant.id,
        reservationId: null,
        type: "grant",
        credits: grant.originalCredits,
        idempotencyKey: `${input.idempotencyKey}:grant`,
        sourceId: grant.sourceId,
        balanceAfter: grant.originalCredits,
        metadata: grant.metadata,
      });

      assertGrantTransactionMatchesGrant(transaction, grant);

      trackBillingCreditGranted({
        userId: grant.userId,
        catalogId: grant.catalogId,
        creditSource: grant.source,
        credits: grant.originalCredits,
        balanceAfter: grant.remainingCredits,
        idempotencyKey: input.idempotencyKey,
        sourceId: grant.sourceId,
        grantId: grant.id,
        duplicate: existing !== null,
      });

      return { grant };
    },

    async getCreditBalance(userId: string): Promise<CreditBalance> {
      const currentTime = now();
      const activeGrants = (await store.listUserGrants(userId)).filter(
        (grant) => isGrantActive(grant, currentTime)
      );
      const availableCredits = sumBy(
        activeGrants,
        (grant) => grant.remainingCredits
      );
      const reservedCredits = sumBy(
        activeGrants,
        (grant) => grant.reservedCredits
      );
      const nextCreditExpiresAt = getNextExpiration(activeGrants);
      const expiringCredits = nextCreditExpiresAt
        ? sumBy(
            activeGrants.filter(
              (grant) =>
                grant.expiresAt?.getTime() === nextCreditExpiresAt.getTime()
            ),
            (grant) => grant.remainingCredits
          )
        : 0;

      return {
        availableCredits,
        reservedCredits,
        expiringCredits,
        nextCreditExpiresAt,
      };
    },

    async expireCredits(userId: string): Promise<ExpireCreditsResult> {
      const currentTime = now();
      let expiredCredits = 0;

      for (const grant of await store.listUserGrants(userId)) {
        if (!grant.expiresAt || grant.expiresAt > currentTime) {
          continue;
        }

        if (grant.remainingCredits <= 0) {
          continue;
        }

        expiredCredits += grant.remainingCredits;
        const updatedGrant = await store.updateGrantBalances(grant.id, {
          remainingCredits: 0,
          reservedCredits: grant.reservedCredits,
        });
        await store.createTransaction({
          userId,
          grantId: grant.id,
          reservationId: null,
          type: "expire",
          credits: grant.remainingCredits,
          idempotencyKey: `expire:${grant.id}:${currentTime.toISOString()}`,
          sourceId: null,
          balanceAfter: updatedGrant.remainingCredits,
          metadata: null,
        });
        trackBillingCreditExpired({
          userId,
          catalogId: grant.catalogId,
          creditSource: grant.source,
          transactionType: "expire",
          credits: grant.remainingCredits,
          balanceAfter: updatedGrant.remainingCredits,
          idempotencyKey: `expire:${grant.id}:${currentTime.toISOString()}`,
          grantId: grant.id,
        });
      }

      return { expiredCredits };
    },

    async reserveCredit(
      input: ReserveCreditInput
    ): Promise<ReserveCreditResult> {
      const existing = await store.findReservationByKey(input.reservationKey);
      if (existing) {
        return {
          reservation: existing,
          allocations: await store.listAllocations(existing.id),
        };
      }

      const requestedCredits = input.credits ?? 1;
      const spendableGrants = await store.listSpendableGrants(
        input.userId,
        now()
      );
      const availableCredits = sumBy(
        spendableGrants,
        (grant) => grant.remainingCredits
      );

      if (availableCredits < requestedCredits) {
        trackBillingNoCredits({
          userId: input.userId,
          credits: requestedCredits,
          balanceAfter: availableCredits,
          sessionId: input.sessionId,
          reason: "insufficient_credits",
        });
        throw new Error("insufficient_credits");
      }

      const reservation = await store.createReservation({
        userId: input.userId,
        reservationKey: input.reservationKey,
        status: "active",
        credits: requestedCredits,
        sessionId: input.sessionId ?? null,
        expiresAt: input.expiresAt ?? addMinutes(now(), 30),
        metadata: input.metadata ?? null,
      });
      const allocations: LedgerReservationAllocation[] = [];
      let remainingToReserve = requestedCredits;

      for (const grant of spendableGrants) {
        if (remainingToReserve === 0) {
          break;
        }

        const reservedFromGrant = Math.min(
          grant.remainingCredits,
          remainingToReserve
        );
        const updatedGrant = await store.updateGrantBalances(grant.id, {
          remainingCredits: grant.remainingCredits - reservedFromGrant,
          reservedCredits: grant.reservedCredits + reservedFromGrant,
        });
        allocations.push(
          await store.createAllocation({
            reservationId: reservation.id,
            grantId: grant.id,
            credits: reservedFromGrant,
          })
        );
        await store.createTransaction({
          userId: input.userId,
          grantId: grant.id,
          reservationId: reservation.id,
          type: "reserve",
          credits: reservedFromGrant,
          idempotencyKey: `reserve:${input.reservationKey}:${grant.id}`,
          sourceId: input.sessionId ?? null,
          balanceAfter: updatedGrant.remainingCredits,
          metadata: input.metadata ?? null,
        });
        trackBillingCreditReserved({
          userId: input.userId,
          catalogId: grant.catalogId,
          creditSource: grant.source,
          transactionType: "reserve",
          credits: reservedFromGrant,
          balanceAfter: updatedGrant.remainingCredits,
          idempotencyKey: `reserve:${input.reservationKey}:${grant.id}`,
          sourceId: input.sessionId,
          sessionId: input.sessionId,
          grantId: grant.id,
          reservationId: reservation.id,
        });
        remainingToReserve -= reservedFromGrant;
      }

      return { reservation, allocations };
    },

    async consumeReservation(
      input: CompleteReservationInput
    ): Promise<CompleteReservationResult> {
      return completeReservation({
        store,
        reservationKey: input.reservationKey,
        idempotencyKey: input.idempotencyKey,
        nextStatus: "consumed",
        transactionType: "consume",
        applyAllocation: ({ grant, credits }) => ({
          remainingCredits: grant.remainingCredits,
          reservedCredits: grant.reservedCredits - credits,
        }),
      });
    },

    async releaseReservation(
      input: CompleteReservationInput
    ): Promise<CompleteReservationResult> {
      return completeReservation({
        store,
        reservationKey: input.reservationKey,
        idempotencyKey: input.idempotencyKey,
        nextStatus: "released",
        transactionType: "release",
        applyAllocation: ({ grant, credits }) => ({
          remainingCredits: grant.remainingCredits + credits,
          reservedCredits: grant.reservedCredits - credits,
        }),
      });
    },

    async refundReservation(
      input: CompleteReservationInput
    ): Promise<CompleteReservationResult> {
      return completeReservation({
        store,
        reservationKey: input.reservationKey,
        idempotencyKey: input.idempotencyKey,
        nextStatus: "refunded",
        transactionType: "refund",
        applyAllocation: ({ grant, credits }) => ({
          remainingCredits: grant.remainingCredits + credits,
          reservedCredits: grant.reservedCredits,
        }),
      });
    },

    async rolloverSubscriptionCredits(
      input: RolloverSubscriptionCreditsInput
    ): Promise<RolloverSubscriptionCreditsResult> {
      const existing = await store.findGrantByIdempotencyKey(
        input.idempotencyKey
      );
      if (existing) {
        trackBillingCreditRolloverCreated({
          userId: input.userId,
          catalogId: existing.catalogId,
          creditSource: existing.source,
          transactionType: "rollover",
          credits: existing.originalCredits,
          balanceAfter: existing.remainingCredits,
          idempotencyKey: input.idempotencyKey,
          sourceId: input.sourceId,
          grantId: existing.id,
          duplicate: true,
        });
        return {
          rolledCredits: existing.originalCredits,
          grant: existing,
        };
      }

      const catalogItem = BILLING_CATALOG[input.catalogId];
      const rolloverCapCredits = catalogItem.rolloverCapCredits;
      const rolloverExpiresAfterDays = catalogItem.rolloverExpiresAfterDays;

      if (rolloverCapCredits <= 0 || rolloverExpiresAfterDays === null) {
        return { rolledCredits: 0, grant: null };
      }

      const currentTime = now();
      const sourceGrants = (await store.listUserGrants(input.userId))
        .filter(
          (grant) =>
            grant.catalogId === input.catalogId &&
            grant.rolloverEligible &&
            isGrantActive(grant, currentTime) &&
            grant.remainingCredits > 0
        )
        .sort(compareGrantSpendOrder);
      let remainingToRoll = Math.min(
        rolloverCapCredits,
        sumBy(sourceGrants, (grant) => grant.remainingCredits)
      );

      if (remainingToRoll === 0) {
        return { rolledCredits: 0, grant: null };
      }

      const rolledCredits = remainingToRoll;
      const rolloverGrant = await store.createGrant({
        userId: input.userId,
        catalogId: input.catalogId,
        source: "rollover",
        sourceId: input.sourceId ?? null,
        idempotencyKey: input.idempotencyKey,
        originalCredits: rolledCredits,
        remainingCredits: rolledCredits,
        reservedCredits: 0,
        expiresAt: addDaysOrNull(currentTime, rolloverExpiresAfterDays),
        rolloverEligible: false,
        rolloverSourceGrantId: sourceGrants[0]?.id ?? null,
        metadata: input.metadata ?? null,
      });

      for (const sourceGrant of sourceGrants) {
        if (remainingToRoll === 0) {
          break;
        }

        const creditsFromGrant = Math.min(
          sourceGrant.remainingCredits,
          remainingToRoll
        );
        const updatedGrant = await store.updateGrantBalances(sourceGrant.id, {
          remainingCredits: sourceGrant.remainingCredits - creditsFromGrant,
          reservedCredits: sourceGrant.reservedCredits,
        });
        await store.createTransaction({
          userId: input.userId,
          grantId: sourceGrant.id,
          reservationId: null,
          type: "rollover",
          credits: creditsFromGrant,
          idempotencyKey: `${input.idempotencyKey}:source:${sourceGrant.id}`,
          sourceId: input.sourceId ?? null,
          balanceAfter: updatedGrant.remainingCredits,
          metadata: {
            rolloverGrantId: rolloverGrant.id,
          },
        });
        remainingToRoll -= creditsFromGrant;
      }

      await store.createTransaction({
        userId: input.userId,
        grantId: rolloverGrant.id,
        reservationId: null,
        type: "rollover",
        credits: rolledCredits,
        idempotencyKey: `${input.idempotencyKey}:grant`,
        sourceId: input.sourceId ?? null,
        balanceAfter: rolloverGrant.remainingCredits,
        metadata: input.metadata ?? null,
      });

      trackBillingCreditRolloverCreated({
        userId: input.userId,
        catalogId: input.catalogId,
        creditSource: "rollover",
        transactionType: "rollover",
        credits: rolledCredits,
        balanceAfter: rolloverGrant.remainingCredits,
        idempotencyKey: input.idempotencyKey,
        sourceId: input.sourceId,
        grantId: rolloverGrant.id,
      });

      return {
        rolledCredits,
        grant: rolloverGrant,
      };
    },
  };
}

function assertGrantMatchesRequest(
  grant: LedgerCreditGrant,
  input: GrantCreditsInput
): void {
  if (
    grant.userId !== input.userId ||
    grant.catalogId !== input.catalogId ||
    grant.source !== input.source
  ) {
    throw new Error("credit_grant_idempotency_conflict");
  }
}

function assertGrantTransactionMatchesGrant(
  transaction: LedgerCreditTransaction,
  grant: LedgerCreditGrant
): void {
  if (
    transaction.userId !== grant.userId ||
    transaction.grantId !== grant.id ||
    transaction.reservationId !== null ||
    transaction.type !== "grant" ||
    transaction.credits !== grant.originalCredits ||
    transaction.sourceId !== grant.sourceId ||
    transaction.balanceAfter !== grant.originalCredits
  ) {
    throw new Error("credit_transaction_idempotency_conflict");
  }
}

export function createMemoryCreditLedgerStore(): CreditLedgerStore {
  let nextId = 1;
  const grants: LedgerCreditGrant[] = [];
  const reservations: LedgerCreditReservation[] = [];
  const allocations: LedgerReservationAllocation[] = [];
  const transactions: LedgerCreditTransaction[] = [];

  function id(prefix: string) {
    return `${prefix}-${nextId++}`;
  }

  return {
    async createGrant(input) {
      const existing = grants.find(
        (grant) => grant.idempotencyKey === input.idempotencyKey
      );
      if (existing) {
        return cloneGrant(existing);
      }

      const timestamp = new Date();
      const grant: LedgerCreditGrant = {
        ...input,
        id: id("grant"),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      grants.push(grant);
      return cloneGrant(grant);
    },

    async findGrantByIdempotencyKey(idempotencyKey) {
      const grant = grants.find(
        (candidate) => candidate.idempotencyKey === idempotencyKey
      );
      return grant ? cloneGrant(grant) : null;
    },

    async findTransactionByIdempotencyKey(idempotencyKey) {
      const transaction = transactions.find(
        (candidate) => candidate.idempotencyKey === idempotencyKey
      );
      return transaction ? cloneTransaction(transaction) : null;
    },

    async listSpendableGrants(userId, currentTime) {
      return grants
        .filter(
          (grant) =>
            grant.userId === userId &&
            isGrantActive(grant, currentTime) &&
            grant.remainingCredits > 0
        )
        .sort(compareGrantSpendOrder)
        .map(cloneGrant);
    },

    async listUserGrants(userId) {
      return grants.filter((grant) => grant.userId === userId).map(cloneGrant);
    },

    async updateGrantBalances(grantId, balances) {
      const grant = grants.find((candidate) => candidate.id === grantId);
      if (!grant) {
        throw new Error(`Credit grant ${grantId} was not found`);
      }

      grant.remainingCredits = balances.remainingCredits;
      grant.reservedCredits = balances.reservedCredits;
      grant.updatedAt = new Date();

      return cloneGrant(grant);
    },

    async createReservation(input) {
      const existing = reservations.find(
        (reservation) => reservation.reservationKey === input.reservationKey
      );
      if (existing) {
        return cloneReservation(existing);
      }

      const timestamp = new Date();
      const reservation: LedgerCreditReservation = {
        ...input,
        id: id("reservation"),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      reservations.push(reservation);
      return cloneReservation(reservation);
    },

    async findReservationByKey(reservationKey) {
      const reservation = reservations.find(
        (candidate) => candidate.reservationKey === reservationKey
      );
      return reservation ? cloneReservation(reservation) : null;
    },

    async updateReservationStatus(reservationId, status) {
      const reservation = reservations.find(
        (candidate) => candidate.id === reservationId
      );
      if (!reservation) {
        throw new Error(`Credit reservation ${reservationId} was not found`);
      }

      reservation.status = status;
      reservation.updatedAt = new Date();

      return cloneReservation(reservation);
    },

    async createAllocation(input) {
      const allocation: LedgerReservationAllocation = {
        ...input,
        id: id("allocation"),
        createdAt: new Date(),
      };
      allocations.push(allocation);
      return cloneAllocation(allocation);
    },

    async listAllocations(reservationId) {
      return allocations
        .filter((allocation) => allocation.reservationId === reservationId)
        .map(cloneAllocation);
    },

    async createTransaction(input) {
      const existing = transactions.find(
        (transaction) => transaction.idempotencyKey === input.idempotencyKey
      );
      if (existing) {
        return cloneTransaction(existing);
      }

      const transaction: LedgerCreditTransaction = {
        ...input,
        id: id("transaction"),
        createdAt: new Date(),
      };
      transactions.push(transaction);
      return cloneTransaction(transaction);
    },
  };
}

function addDaysOrNull(date: Date, days: number | null): Date | null {
  if (days === null) {
    return null;
  }

  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

async function completeReservation({
  store,
  reservationKey,
  idempotencyKey,
  nextStatus,
  transactionType,
  applyAllocation,
}: {
  store: CreditLedgerStore;
  reservationKey: string;
  idempotencyKey: string;
  nextStatus: CreditReservationStatus;
  transactionType: CreditTransactionType;
  applyAllocation(input: {
    grant: LedgerCreditGrant;
    credits: number;
  }): Pick<LedgerCreditGrant, "remainingCredits" | "reservedCredits">;
}): Promise<CompleteReservationResult> {
  const existingTransaction =
    await store.findTransactionByIdempotencyKey(idempotencyKey);
  const reservation = await store.findReservationByKey(reservationKey);

  if (!reservation) {
    throw new Error(`Credit reservation ${reservationKey} was not found`);
  }

  if (existingTransaction || reservation.status === nextStatus) {
    return { reservation };
  }

  if (!canTransitionReservation(reservation.status, nextStatus)) {
    throw new Error(
      `Cannot move credit reservation ${reservationKey} from ${reservation.status} to ${nextStatus}`
    );
  }

  const allocations = await store.listAllocations(reservation.id);
  const userGrants = await store.listUserGrants(reservation.userId);

  for (const allocation of allocations) {
    const grant = userGrants.find(
      (candidate) => candidate.id === allocation.grantId
    );
    if (!grant) {
      throw new Error(`Credit grant ${allocation.grantId} was not found`);
    }

    await store.updateGrantBalances(
      allocation.grantId,
      applyAllocation({ grant, credits: allocation.credits })
    );
  }

  const updatedReservation = await store.updateReservationStatus(
    reservation.id,
    nextStatus
  );
  await store.createTransaction({
    userId: reservation.userId,
    grantId: null,
    reservationId: reservation.id,
    type: transactionType,
    credits: reservation.credits,
    idempotencyKey,
    sourceId: reservation.sessionId,
    balanceAfter: null,
    metadata: {
      allocations: allocations.map((allocation) => ({
        grantId: allocation.grantId,
        credits: allocation.credits,
      })),
    },
  });

  const firstAllocation = allocations[0];
  const firstGrant = firstAllocation
    ? userGrants.find((grant) => grant.id === firstAllocation.grantId)
    : null;
  trackCompletedReservationEvent({
    transactionType,
    userId: reservation.userId,
    catalogId: firstGrant?.catalogId,
    creditSource: firstGrant?.source,
    credits: reservation.credits,
    idempotencyKey,
    sessionId: reservation.sessionId,
    reservationId: reservation.id,
    grantId: firstGrant?.id,
  });

  return { reservation: updatedReservation };
}

function trackCompletedReservationEvent({
  transactionType,
  userId,
  catalogId,
  creditSource,
  credits,
  idempotencyKey,
  sessionId,
  reservationId,
  grantId,
}: {
  transactionType: CreditTransactionType;
  userId: string;
  catalogId?: BillingCatalogId;
  creditSource?: CreditGrantSource;
  credits: number;
  idempotencyKey: string;
  sessionId: string | null;
  reservationId: string;
  grantId?: string;
}) {
  const input = {
    userId,
    catalogId,
    creditSource,
    transactionType,
    credits,
    idempotencyKey,
    sourceId: sessionId,
    sessionId,
    reservationId,
    grantId,
  };

  if (transactionType === "consume") {
    trackBillingCreditConsumed(input);
  } else if (transactionType === "release") {
    trackBillingCreditReleased(input);
  } else if (transactionType === "refund") {
    trackBillingCreditRefunded(input);
  }
}

function canTransitionReservation(
  currentStatus: CreditReservationStatus,
  nextStatus: CreditReservationStatus
): boolean {
  if (currentStatus === "active") {
    return nextStatus === "consumed" || nextStatus === "released";
  }

  if (currentStatus === "consumed") {
    return nextStatus === "refunded";
  }

  return false;
}

function isGrantActive(grant: LedgerCreditGrant, currentTime: Date): boolean {
  return grant.expiresAt === null || grant.expiresAt > currentTime;
}

function getNextExpiration(grants: LedgerCreditGrant[]): Date | null {
  const expirations = grants
    .filter((grant) => grant.remainingCredits > 0 && grant.expiresAt)
    .map((grant) => grant.expiresAt as Date)
    .sort((a, b) => a.getTime() - b.getTime());

  return expirations[0] ?? null;
}

function compareGrantSpendOrder(
  left: LedgerCreditGrant,
  right: LedgerCreditGrant
): number {
  if (left.expiresAt && right.expiresAt) {
    return left.expiresAt.getTime() - right.expiresAt.getTime();
  }

  if (left.expiresAt) {
    return -1;
  }

  if (right.expiresAt) {
    return 1;
  }

  return left.createdAt.getTime() - right.createdAt.getTime();
}

function sumBy<T>(items: T[], read: (item: T) => number): number {
  return items.reduce((total, item) => total + read(item), 0);
}

function cloneGrant(grant: LedgerCreditGrant): LedgerCreditGrant {
  return {
    ...grant,
    expiresAt: cloneDateOrNull(grant.expiresAt),
    createdAt: new Date(grant.createdAt),
    updatedAt: new Date(grant.updatedAt),
    metadata: cloneMetadata(grant.metadata),
  };
}

function cloneReservation(
  reservation: LedgerCreditReservation
): LedgerCreditReservation {
  return {
    ...reservation,
    expiresAt: new Date(reservation.expiresAt),
    createdAt: new Date(reservation.createdAt),
    updatedAt: new Date(reservation.updatedAt),
    metadata: cloneMetadata(reservation.metadata),
  };
}

function cloneAllocation(
  allocation: LedgerReservationAllocation
): LedgerReservationAllocation {
  return {
    ...allocation,
    createdAt: new Date(allocation.createdAt),
  };
}

function cloneTransaction(
  transaction: LedgerCreditTransaction
): LedgerCreditTransaction {
  return {
    ...transaction,
    createdAt: new Date(transaction.createdAt),
    metadata: cloneMetadata(transaction.metadata),
  };
}

function cloneDateOrNull(date: Date | null): Date | null {
  return date ? new Date(date) : null;
}

function cloneMetadata(
  metadata: Record<string, unknown> | null
): Record<string, unknown> | null {
  return metadata ? { ...metadata } : null;
}

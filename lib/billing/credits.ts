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

export interface CreditLedgerOperations {
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

export interface CreditLedgerTransaction extends CreditLedgerOperations {
  findGrantByIdempotencyKeyForUpdate(
    idempotencyKey: string
  ): Promise<LedgerCreditGrant | null>;
  findTransactionByIdempotencyKeyForUpdate(
    idempotencyKey: string
  ): Promise<LedgerCreditTransaction | null>;
  listSpendableGrantsForUpdate(
    userId: string,
    now: Date
  ): Promise<LedgerCreditGrant[]>;
  listUserGrantsForUpdate(userId: string): Promise<LedgerCreditGrant[]>;
  listUserReservationsForUpdate(
    userId: string
  ): Promise<LedgerCreditReservation[]>;
  findReservationByKeyForUpdate(
    reservationKey: string
  ): Promise<LedgerCreditReservation | null>;
  listAllocationsForUpdate(
    reservationId: string
  ): Promise<LedgerReservationAllocation[]>;
  listTerminalTransactionsByReservationForUpdate(
    reservationId: string
  ): Promise<LedgerCreditTransaction[]>;
}

export interface CreditLedgerStore extends CreditLedgerOperations {
  withUserTransaction<T>(
    userId: string,
    work: (transaction: CreditLedgerTransaction) => Promise<T>
  ): Promise<T>;
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
  trackTerminalSettlement?: CreditTerminalSettlementTracker;
}

export interface CreditTerminalSettlementEvent {
  transactionType: "consume" | "release" | "refund";
  userId: string;
  catalogId?: BillingCatalogId;
  creditSource?: CreditGrantSource;
  credits: number;
  idempotencyKey: string;
  sessionId: string | null;
  reservationId: string;
  grantId?: string;
}

export type CreditTerminalSettlementTracker = (
  event: CreditTerminalSettlementEvent
) => void | Promise<void>;

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
  duplicate: boolean;
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

export interface RenewSubscriptionCreditsInput {
  userId: string;
  catalogId: BillingCatalogId;
  renewalIdempotencyKey: string;
  rolloverIdempotencyKey: string;
  sourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RenewSubscriptionCreditsResult {
  grant: LedgerCreditGrant;
  rolledCredits: number;
  rolloverGrant: LedgerCreditGrant | null;
}

export function createCreditLedgerService({
  store,
  now = () => new Date(),
  trackTerminalSettlement = trackCompletedReservationEvent,
}: CreateCreditLedgerServiceInput) {
  return {
    async grantCredits(input: GrantCreditsInput): Promise<GrantCreditsResult> {
      const catalogItem = BILLING_CATALOG[input.catalogId];
      const issuedAt = now();
      const includedCredits =
        input.includedCredits ?? catalogItem.includedCredits;
      assertPositiveCredits(includedCredits);
      const expiresAt =
        input.expiresAt === undefined
          ? addDaysOrNull(issuedAt, catalogItem.expiresAfterDays)
          : input.expiresAt;
      const rolloverEligible =
        input.rolloverEligible ??
        (catalogItem.kind === "subscription" && includedCredits > 0);
      const { grant, duplicate } = await store.withUserTransaction(
        input.userId,
        async (transaction) =>
          grantCreditsInTransaction({
            store: transaction,
            input,
            includedCredits,
            expiresAt,
            rolloverEligible,
          })
      );

      await trackBillingCreditGranted({
        userId: grant.userId,
        catalogId: grant.catalogId,
        creditSource: grant.source,
        credits: grant.originalCredits,
        balanceAfter: grant.remainingCredits,
        idempotencyKey: input.idempotencyKey,
        sourceId: grant.sourceId,
        grantId: grant.id,
        duplicate,
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
      const expired = await store.withUserTransaction(
        userId,
        async (transaction) => {
          await assertUserReservationIntegrity(transaction, userId);
          const events: Array<{
            grant: LedgerCreditGrant;
            credits: number;
            idempotencyKey: string;
          }> = [];

          for (const grant of await transaction.listUserGrantsForUpdate(
            userId
          )) {
            if (
              !grant.expiresAt ||
              grant.expiresAt > currentTime ||
              grant.remainingCredits <= 0
            ) {
              continue;
            }

            const idempotencyKey = `expire:${grant.id}:${grant.expiresAt.toISOString()}`;
            const existing =
              await transaction.findTransactionByIdempotencyKeyForUpdate(
                idempotencyKey
              );
            if (existing) {
              throw new Error("credit_transaction_idempotency_conflict");
            }

            const credits = grant.remainingCredits;
            const updatedGrant = await transaction.updateGrantBalances(
              grant.id,
              {
                remainingCredits: 0,
                reservedCredits: grant.reservedCredits,
              }
            );
            await createAndValidateTransaction(transaction, {
              userId,
              grantId: grant.id,
              reservationId: null,
              type: "expire",
              credits,
              idempotencyKey,
              sourceId: null,
              balanceAfter: updatedGrant.remainingCredits,
              metadata: null,
            });
            events.push({ grant, credits, idempotencyKey });
          }

          return events;
        }
      );

      for (const event of expired) {
        await trackBillingCreditExpired({
          userId,
          catalogId: event.grant.catalogId,
          creditSource: event.grant.source,
          transactionType: "expire",
          credits: event.credits,
          balanceAfter: 0,
          idempotencyKey: event.idempotencyKey,
          grantId: event.grant.id,
        });
      }

      return {
        expiredCredits: sumBy(expired, (event) => event.credits),
      };
    },

    async reserveCredit(
      input: ReserveCreditInput
    ): Promise<ReserveCreditResult> {
      const requestedCredits = input.credits ?? 1;
      assertPositiveCredits(requestedCredits);
      const currentTime = now();
      let result:
        | (ReserveCreditResult & {
            events: Array<{
              grant: LedgerCreditGrant;
              credits: number;
              balanceAfter: number;
              transactionKey: string;
            }>;
          })
        | undefined;

      try {
        result = await store.withUserTransaction(
          input.userId,
          async (transaction) => {
            const existing = await transaction.findReservationByKeyForUpdate(
              input.reservationKey
            );
            if (existing) {
              assertReservationMatchesRequest(
                existing,
                input,
                requestedCredits
              );
              const allocations = await assertReservationEvidence(
                transaction,
                existing
              );
              return { reservation: existing, allocations, events: [] };
            }

            await assertUserReservationIntegrity(transaction, input.userId);
            const spendableGrants =
              await transaction.listSpendableGrantsForUpdate(
                input.userId,
                currentTime
              );
            const availableCredits = sumBy(
              spendableGrants,
              (grant) => grant.remainingCredits
            );

            if (availableCredits < requestedCredits) {
              throw new InsufficientCreditsError(availableCredits);
            }

            const reservation = await transaction.createReservation({
              userId: input.userId,
              reservationKey: input.reservationKey,
              status: "active",
              credits: requestedCredits,
              sessionId: input.sessionId ?? null,
              expiresAt: input.expiresAt ?? addMinutes(currentTime, 30),
              metadata: input.metadata ?? null,
            });
            assertReservationMatchesRequest(
              reservation,
              input,
              requestedCredits
            );

            const allocations: LedgerReservationAllocation[] = [];
            const events: Array<{
              grant: LedgerCreditGrant;
              credits: number;
              balanceAfter: number;
              transactionKey: string;
            }> = [];
            let remainingToReserve = requestedCredits;

            for (const grant of spendableGrants) {
              if (remainingToReserve === 0) break;

              const reservedFromGrant = Math.min(
                grant.remainingCredits,
                remainingToReserve
              );
              const updatedGrant = await transaction.updateGrantBalances(
                grant.id,
                {
                  remainingCredits: grant.remainingCredits - reservedFromGrant,
                  reservedCredits: grant.reservedCredits + reservedFromGrant,
                }
              );
              allocations.push(
                await transaction.createAllocation({
                  reservationId: reservation.id,
                  grantId: grant.id,
                  credits: reservedFromGrant,
                })
              );
              const transactionKey = `reserve:${input.reservationKey}:${grant.id}`;
              await createAndValidateTransaction(transaction, {
                userId: input.userId,
                grantId: grant.id,
                reservationId: reservation.id,
                type: "reserve",
                credits: reservedFromGrant,
                idempotencyKey: transactionKey,
                sourceId: input.sessionId ?? null,
                balanceAfter: updatedGrant.remainingCredits,
                metadata: input.metadata ?? null,
              });
              events.push({
                grant,
                credits: reservedFromGrant,
                balanceAfter: updatedGrant.remainingCredits,
                transactionKey,
              });
              remainingToReserve -= reservedFromGrant;
            }

            if (remainingToReserve !== 0) {
              throw new Error("credit_reservation_incomplete");
            }

            await assertReservationEvidence(transaction, reservation);
            await assertUserReservationIntegrity(transaction, input.userId);
            return { reservation, allocations, events };
          }
        );
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          await trackBillingNoCredits({
            userId: input.userId,
            credits: requestedCredits,
            balanceAfter: error.availableCredits,
            sessionId: input.sessionId,
            reason: "insufficient_credits",
          });
        }
        throw error;
      }

      for (const event of result.events) {
        await trackBillingCreditReserved({
          userId: input.userId,
          catalogId: event.grant.catalogId,
          creditSource: event.grant.source,
          transactionType: "reserve",
          credits: event.credits,
          balanceAfter: event.balanceAfter,
          idempotencyKey: event.transactionKey,
          sourceId: input.sessionId,
          sessionId: input.sessionId,
          grantId: event.grant.id,
          reservationId: result.reservation.id,
        });
      }

      return {
        reservation: result.reservation,
        allocations: result.allocations,
      };
    },

    async consumeReservation(
      input: CompleteReservationInput
    ): Promise<CompleteReservationResult> {
      return completeReservation({
        store,
        trackTerminalSettlement,
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
        trackTerminalSettlement,
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
        trackTerminalSettlement,
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

    async renewSubscriptionCredits(
      input: RenewSubscriptionCreditsInput
    ): Promise<RenewSubscriptionCreditsResult> {
      const catalogItem = BILLING_CATALOG[input.catalogId];
      if (
        catalogItem.kind !== "subscription" ||
        input.renewalIdempotencyKey === input.rolloverIdempotencyKey
      ) {
        throw new Error("invalid_subscription_renewal");
      }

      const currentTime = now();
      const renewalInput: GrantCreditsInput = {
        userId: input.userId,
        catalogId: input.catalogId,
        source: "subscription_renewal",
        sourceId: input.sourceId ?? null,
        idempotencyKey: input.renewalIdempotencyKey,
        includedCredits: catalogItem.includedCredits,
        rolloverEligible: true,
        metadata: input.metadata ?? null,
      };
      const rolloverInput: RolloverSubscriptionCreditsInput = {
        userId: input.userId,
        catalogId: input.catalogId,
        idempotencyKey: input.rolloverIdempotencyKey,
        sourceId: input.sourceId ?? null,
        metadata: input.metadata ?? null,
      };
      const outcome = await store.withUserTransaction(
        input.userId,
        async (transaction) => {
          const existingRenewal =
            await transaction.findGrantByIdempotencyKeyForUpdate(
              input.renewalIdempotencyKey
            );
          if (existingRenewal) {
            assertGrantMatchesRequest(
              existingRenewal,
              renewalInput,
              catalogItem.includedCredits,
              true
            );
            return {
              renewal: { grant: existingRenewal, duplicate: true },
              rollover: await validateCompositeRenewalReplay({
                store: transaction,
                input,
                renewalGrant: existingRenewal,
                rolloverInput,
              }),
            };
          }

          const orphanedRollover =
            await transaction.findGrantByIdempotencyKeyForUpdate(
              input.rolloverIdempotencyKey
            );
          let rollover: RolloverSubscriptionCreditsResult & {
            duplicate: boolean;
            sourceAllocations: RolloverSourceEvidence[];
          };
          if (orphanedRollover) {
            assertRolloverGrantMatchesRequest(orphanedRollover, rolloverInput);
            const sourceAllocations = await assertRolloverReplayEvidence(
              transaction,
              orphanedRollover,
              rolloverInput
            );
            await assertOrphanRolloverDebitsApplied(
              transaction,
              input.userId,
              sourceAllocations
            );
            rollover = {
              rolledCredits: orphanedRollover.originalCredits,
              grant: orphanedRollover,
              duplicate: true,
              sourceAllocations,
            };
          } else {
            rollover = await rolloverSubscriptionCreditsInTransaction({
              store: transaction,
              input: rolloverInput,
              currentTime,
            });
          }
          const renewal = await grantCreditsInTransaction({
            store: transaction,
            input: renewalInput,
            includedCredits: catalogItem.includedCredits,
            expiresAt: null,
            rolloverEligible: true,
            transactionMetadata: buildCompositeRenewalTransactionMetadata(
              input.metadata ?? null,
              {
                version: 1,
                rolloverIdempotencyKey: input.rolloverIdempotencyKey,
                rolledCredits: rollover.rolledCredits,
                rolloverGrantId: rollover.grant?.id ?? null,
                rolloverExpiresAt:
                  rollover.grant?.expiresAt?.toISOString() ?? null,
                rolloverSourceGrantId:
                  rollover.grant?.rolloverSourceGrantId ?? null,
                sourceAllocations: rollover.sourceAllocations,
              }
            ),
          });
          return { renewal, rollover };
        }
      );

      if (outcome.rollover.grant) {
        await trackBillingCreditRolloverCreated({
          userId: input.userId,
          catalogId: input.catalogId,
          creditSource: "rollover",
          transactionType: "rollover",
          credits: outcome.rollover.rolledCredits,
          balanceAfter: outcome.rollover.grant.remainingCredits,
          idempotencyKey: input.rolloverIdempotencyKey,
          sourceId: input.sourceId,
          grantId: outcome.rollover.grant.id,
          duplicate: outcome.rollover.duplicate,
        });
      }
      await trackBillingCreditGranted({
        userId: outcome.renewal.grant.userId,
        catalogId: outcome.renewal.grant.catalogId,
        creditSource: outcome.renewal.grant.source,
        credits: outcome.renewal.grant.originalCredits,
        balanceAfter: outcome.renewal.grant.remainingCredits,
        idempotencyKey: input.renewalIdempotencyKey,
        sourceId: outcome.renewal.grant.sourceId,
        grantId: outcome.renewal.grant.id,
        duplicate: outcome.renewal.duplicate,
      });

      return {
        grant: outcome.renewal.grant,
        rolledCredits: outcome.rollover.rolledCredits,
        rolloverGrant: outcome.rollover.grant,
      };
    },
  };
}

async function grantCreditsInTransaction({
  store,
  input,
  includedCredits,
  expiresAt,
  rolloverEligible,
  transactionMetadata,
}: {
  store: CreditLedgerTransaction;
  input: GrantCreditsInput;
  includedCredits: number;
  expiresAt: Date | null;
  rolloverEligible: boolean;
  transactionMetadata?: Record<string, unknown> | null;
}): Promise<{ grant: LedgerCreditGrant; duplicate: boolean }> {
  const existing = await store.findGrantByIdempotencyKeyForUpdate(
    input.idempotencyKey
  );
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
      rolloverEligible,
      rolloverSourceGrantId: input.rolloverSourceGrantId ?? null,
      metadata: input.metadata ?? null,
    }));

  assertGrantMatchesRequest(grant, input, includedCredits, rolloverEligible);
  await createAndValidateTransaction(store, {
    userId: grant.userId,
    grantId: grant.id,
    reservationId: null,
    type: "grant",
    credits: grant.originalCredits,
    idempotencyKey: `${input.idempotencyKey}:grant`,
    sourceId: grant.sourceId,
    balanceAfter: grant.originalCredits,
    metadata:
      transactionMetadata === undefined ? grant.metadata : transactionMetadata,
  });

  return { grant, duplicate: existing !== null };
}

const COMPOSITE_RENEWAL_EVIDENCE_KEY =
  "__meelni_subscription_renewal_completion";

interface RolloverSourceEvidence {
  grantId: string;
  credits: number;
  balanceAfter: number;
}

interface CompositeRenewalEvidence {
  version: 1;
  rolloverIdempotencyKey: string;
  rolledCredits: number;
  rolloverGrantId: string | null;
  rolloverExpiresAt: string | null;
  rolloverSourceGrantId: string | null;
  sourceAllocations: RolloverSourceEvidence[];
}

function buildCompositeRenewalTransactionMetadata(
  metadata: Record<string, unknown> | null,
  evidence: CompositeRenewalEvidence
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    [COMPOSITE_RENEWAL_EVIDENCE_KEY]: evidence,
  };
}

function readCompositeRenewalEvidence(
  metadata: Record<string, unknown> | null
): CompositeRenewalEvidence | null {
  const value = metadata?.[COMPOSITE_RENEWAL_EVIDENCE_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const evidence = value as Record<string, unknown>;
  const sourceAllocations = evidence.sourceAllocations;
  const validSourceAllocations =
    Array.isArray(sourceAllocations) &&
    sourceAllocations.every(
      (allocation) =>
        allocation !== null &&
        typeof allocation === "object" &&
        !Array.isArray(allocation) &&
        typeof (allocation as Record<string, unknown>).grantId === "string" &&
        Number.isSafeInteger((allocation as Record<string, unknown>).credits) &&
        ((allocation as Record<string, unknown>).credits as number) > 0 &&
        Number.isSafeInteger(
          (allocation as Record<string, unknown>).balanceAfter
        ) &&
        ((allocation as Record<string, unknown>).balanceAfter as number) >= 0
    );
  const rolledCredits = evidence.rolledCredits as number;
  const zeroRollover = rolledCredits === 0;
  if (
    evidence.version !== 1 ||
    typeof evidence.rolloverIdempotencyKey !== "string" ||
    !Number.isSafeInteger(evidence.rolledCredits) ||
    rolledCredits < 0 ||
    !(
      evidence.rolloverGrantId === null ||
      typeof evidence.rolloverGrantId === "string"
    ) ||
    !(
      evidence.rolloverExpiresAt === null ||
      typeof evidence.rolloverExpiresAt === "string"
    ) ||
    !(
      evidence.rolloverSourceGrantId === null ||
      typeof evidence.rolloverSourceGrantId === "string"
    ) ||
    !validSourceAllocations ||
    zeroRollover !== (evidence.rolloverGrantId === null) ||
    zeroRollover !== (evidence.rolloverExpiresAt === null) ||
    zeroRollover !== (evidence.rolloverSourceGrantId === null) ||
    (zeroRollover
      ? sourceAllocations.length !== 0
      : sourceAllocations.length === 0 ||
        sumBy(
          sourceAllocations as unknown as RolloverSourceEvidence[],
          (allocation) => allocation.credits
        ) !== rolledCredits)
  ) {
    throw new Error("credit_subscription_renewal_evidence_conflict");
  }

  return evidence as unknown as CompositeRenewalEvidence;
}

async function validateCompositeRenewalReplay({
  store,
  input,
  renewalGrant,
  rolloverInput,
}: {
  store: CreditLedgerTransaction;
  input: RenewSubscriptionCreditsInput;
  renewalGrant: LedgerCreditGrant;
  rolloverInput: RolloverSubscriptionCreditsInput;
}): Promise<
  RolloverSubscriptionCreditsResult & {
    duplicate: boolean;
    sourceAllocations: RolloverSourceEvidence[];
  }
> {
  const renewalTransactionKey = `${input.renewalIdempotencyKey}:grant`;
  const renewalTransaction =
    await store.findTransactionByIdempotencyKeyForUpdate(renewalTransactionKey);
  if (!renewalTransaction) {
    throw new Error("credit_ledger_reconciliation_required");
  }
  const evidence = readCompositeRenewalEvidence(renewalTransaction.metadata);
  const existingRollover = await store.findGrantByIdempotencyKeyForUpdate(
    input.rolloverIdempotencyKey
  );

  if (!evidence) {
    assertTransactionMatchesRequest(renewalTransaction, {
      userId: input.userId,
      grantId: renewalGrant.id,
      reservationId: null,
      type: "grant",
      credits: renewalGrant.originalCredits,
      idempotencyKey: renewalTransactionKey,
      sourceId: input.sourceId ?? null,
      balanceAfter: renewalGrant.originalCredits,
      metadata: input.metadata ?? null,
    });
    if (!existingRollover) {
      throw new Error("credit_ledger_reconciliation_required");
    }
    assertRolloverGrantMatchesRequest(existingRollover, rolloverInput);
    const sourceAllocations = await assertRolloverReplayEvidence(
      store,
      existingRollover,
      rolloverInput
    );
    return {
      rolledCredits: existingRollover.originalCredits,
      grant: existingRollover,
      duplicate: true,
      sourceAllocations,
    };
  }

  if (evidence.rolloverIdempotencyKey !== input.rolloverIdempotencyKey) {
    throw new Error("credit_subscription_renewal_evidence_conflict");
  }
  assertTransactionMatchesRequest(renewalTransaction, {
    userId: input.userId,
    grantId: renewalGrant.id,
    reservationId: null,
    type: "grant",
    credits: renewalGrant.originalCredits,
    idempotencyKey: renewalTransactionKey,
    sourceId: input.sourceId ?? null,
    balanceAfter: renewalGrant.originalCredits,
    metadata: buildCompositeRenewalTransactionMetadata(
      input.metadata ?? null,
      evidence
    ),
  });

  if (evidence.rolledCredits === 0) {
    if (existingRollover) {
      throw new Error("credit_subscription_renewal_evidence_conflict");
    }
    return {
      rolledCredits: 0,
      grant: null,
      duplicate: true,
      sourceAllocations: [],
    };
  }

  if (
    !existingRollover ||
    existingRollover.id !== evidence.rolloverGrantId ||
    existingRollover.originalCredits !== evidence.rolledCredits
  ) {
    throw new Error("credit_subscription_renewal_evidence_conflict");
  }
  assertRolloverGrantMatchesRequest(existingRollover, rolloverInput);
  const sourceAllocations = await assertRolloverReplayEvidence(
    store,
    existingRollover,
    rolloverInput
  );
  if (
    existingRollover.expiresAt?.toISOString() !== evidence.rolloverExpiresAt ||
    existingRollover.rolloverSourceGrantId !== evidence.rolloverSourceGrantId ||
    !metadataEquals(
      { sourceAllocations },
      { sourceAllocations: evidence.sourceAllocations }
    )
  ) {
    throw new Error("credit_subscription_renewal_evidence_conflict");
  }
  return {
    rolledCredits: existingRollover.originalCredits,
    grant: existingRollover,
    duplicate: true,
    sourceAllocations,
  };
}

async function rolloverSubscriptionCreditsInTransaction({
  store,
  input,
  currentTime,
}: {
  store: CreditLedgerTransaction;
  input: RolloverSubscriptionCreditsInput;
  currentTime: Date;
}): Promise<
  RolloverSubscriptionCreditsResult & {
    duplicate: boolean;
    sourceAllocations: RolloverSourceEvidence[];
  }
> {
  const catalogItem = BILLING_CATALOG[input.catalogId];
  if (
    catalogItem.rolloverCapCredits <= 0 ||
    catalogItem.rolloverExpiresAfterDays === null
  ) {
    return {
      rolledCredits: 0,
      grant: null,
      duplicate: false,
      sourceAllocations: [],
    };
  }

  const existing = await store.findGrantByIdempotencyKeyForUpdate(
    input.idempotencyKey
  );
  if (existing) {
    assertRolloverGrantMatchesRequest(existing, input);
    const sourceAllocations = await assertRolloverReplayEvidence(
      store,
      existing,
      input
    );
    return {
      rolledCredits: existing.originalCredits,
      grant: existing,
      duplicate: true,
      sourceAllocations,
    };
  }

  await assertUserReservationIntegrity(store, input.userId);
  const sourceGrants = (await store.listUserGrantsForUpdate(input.userId))
    .filter(
      (grant) =>
        grant.catalogId === input.catalogId &&
        grant.rolloverEligible &&
        isGrantActive(grant, currentTime) &&
        grant.remainingCredits > 0
    )
    .sort(compareGrantSpendOrder);
  let remainingToRoll = Math.min(
    catalogItem.rolloverCapCredits,
    sumBy(sourceGrants, (grant) => grant.remainingCredits)
  );

  if (remainingToRoll === 0) {
    return {
      rolledCredits: 0,
      grant: null,
      duplicate: false,
      sourceAllocations: [],
    };
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
    expiresAt: addDaysOrNull(currentTime, catalogItem.rolloverExpiresAfterDays),
    rolloverEligible: false,
    rolloverSourceGrantId: sourceGrants[0]?.id ?? null,
    metadata: input.metadata ?? null,
  });
  assertRolloverGrantMatchesRequest(rolloverGrant, input, rolledCredits);

  for (const sourceGrant of sourceGrants) {
    if (remainingToRoll === 0) break;

    const creditsFromGrant = Math.min(
      sourceGrant.remainingCredits,
      remainingToRoll
    );
    const updatedGrant = await store.updateGrantBalances(sourceGrant.id, {
      remainingCredits: sourceGrant.remainingCredits - creditsFromGrant,
      reservedCredits: sourceGrant.reservedCredits,
    });
    await createAndValidateTransaction(store, {
      userId: input.userId,
      grantId: sourceGrant.id,
      reservationId: null,
      type: "rollover",
      credits: creditsFromGrant,
      idempotencyKey: `${input.idempotencyKey}:source:${sourceGrant.id}`,
      sourceId: input.sourceId ?? null,
      balanceAfter: updatedGrant.remainingCredits,
      metadata: { rolloverGrantId: rolloverGrant.id },
    });
    remainingToRoll -= creditsFromGrant;
  }

  if (remainingToRoll !== 0) {
    throw new Error("credit_rollover_incomplete");
  }

  await createAndValidateTransaction(store, {
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
  const sourceAllocations = await assertRolloverReplayEvidence(
    store,
    rolloverGrant,
    input
  );

  return {
    rolledCredits,
    grant: rolloverGrant,
    duplicate: false,
    sourceAllocations,
  };
}

function assertGrantMatchesRequest(
  grant: LedgerCreditGrant,
  input: GrantCreditsInput,
  includedCredits: number,
  rolloverEligible: boolean
): void {
  if (
    grant.userId !== input.userId ||
    grant.catalogId !== input.catalogId ||
    grant.source !== input.source ||
    grant.sourceId !== (input.sourceId ?? null) ||
    grant.originalCredits !== includedCredits ||
    grant.rolloverEligible !== rolloverEligible ||
    grant.rolloverSourceGrantId !== (input.rolloverSourceGrantId ?? null) ||
    !metadataEquals(grant.metadata, input.metadata ?? null) ||
    (input.expiresAt !== undefined &&
      !datesEqual(grant.expiresAt, input.expiresAt))
  ) {
    throw new Error("credit_grant_idempotency_conflict");
  }
}

function assertTransactionMatchesRequest(
  transaction: LedgerCreditTransaction,
  input: Omit<LedgerCreditTransaction, "id" | "createdAt">
): void {
  if (
    transaction.userId !== input.userId ||
    transaction.grantId !== input.grantId ||
    transaction.reservationId !== input.reservationId ||
    transaction.type !== input.type ||
    transaction.credits !== input.credits ||
    transaction.sourceId !== input.sourceId ||
    transaction.balanceAfter !== input.balanceAfter ||
    !metadataEquals(transaction.metadata, input.metadata)
  ) {
    throw new Error("credit_transaction_idempotency_conflict");
  }
}

async function createAndValidateTransaction(
  store: CreditLedgerTransaction,
  input: Omit<LedgerCreditTransaction, "id" | "createdAt">
): Promise<LedgerCreditTransaction> {
  const transaction = await store.createTransaction(input);
  assertTransactionMatchesRequest(transaction, input);
  return transaction;
}

function assertReservationMatchesRequest(
  reservation: LedgerCreditReservation,
  input: ReserveCreditInput,
  requestedCredits: number
): void {
  if (
    reservation.userId !== input.userId ||
    reservation.credits !== requestedCredits ||
    reservation.sessionId !== (input.sessionId ?? null) ||
    !metadataEquals(reservation.metadata, input.metadata ?? null) ||
    (input.expiresAt !== undefined &&
      reservation.expiresAt.getTime() !== input.expiresAt.getTime())
  ) {
    throw new Error("credit_reservation_idempotency_conflict");
  }
}

async function assertReservationEvidence(
  store: CreditLedgerTransaction,
  reservation: LedgerCreditReservation
): Promise<LedgerReservationAllocation[]> {
  const allocations = await store.listAllocationsForUpdate(reservation.id);
  if (
    allocations.length === 0 ||
    sumBy(allocations, (allocation) => allocation.credits) !==
      reservation.credits
  ) {
    throw new Error("credit_reservation_incomplete");
  }

  const grants = await store.listUserGrantsForUpdate(reservation.userId);
  const grantsById = new Map(grants.map((grant) => [grant.id, grant]));
  for (const allocation of allocations) {
    const grant = grantsById.get(allocation.grantId);
    if (!grant) throw new Error("credit_ledger_reconciliation_required");

    const transactionKey = `reserve:${reservation.reservationKey}:${grant.id}`;
    const reserveTransaction =
      await store.findTransactionByIdempotencyKeyForUpdate(transactionKey);
    if (!reserveTransaction) {
      throw new Error("credit_reservation_incomplete");
    }
    if (
      reserveTransaction.balanceAfter === null ||
      !Number.isSafeInteger(reserveTransaction.balanceAfter) ||
      reserveTransaction.balanceAfter < 0 ||
      reserveTransaction.balanceAfter + allocation.credits >
        grant.originalCredits
    ) {
      throw new Error("credit_ledger_reconciliation_required");
    }
    assertTransactionMatchesRequest(reserveTransaction, {
      userId: reservation.userId,
      grantId: grant.id,
      reservationId: reservation.id,
      type: "reserve",
      credits: allocation.credits,
      idempotencyKey: transactionKey,
      sourceId: reservation.sessionId,
      balanceAfter: reserveTransaction.balanceAfter,
      metadata: reservation.metadata,
    });
  }

  return allocations.sort((left, right) =>
    left.grantId.localeCompare(right.grantId)
  );
}

async function assertUserReservationIntegrity(
  store: CreditLedgerTransaction,
  userId: string
): Promise<void> {
  const reservations = await store.listUserReservationsForUpdate(userId);
  const grants = await store.listUserGrantsForUpdate(userId);
  const expectedReservedByGrant = new Map<string, number>();

  for (const reservation of reservations) {
    const allocations = await assertReservationEvidence(store, reservation);
    assertReservationTerminalHistory(
      reservation,
      allocations,
      await store.listTerminalTransactionsByReservationForUpdate(reservation.id)
    );
    if (reservation.status !== "active") continue;

    for (const allocation of allocations) {
      expectedReservedByGrant.set(
        allocation.grantId,
        (expectedReservedByGrant.get(allocation.grantId) ?? 0) +
          allocation.credits
      );
    }
  }

  for (const grant of grants) {
    if (
      grant.reservedCredits !== (expectedReservedByGrant.get(grant.id) ?? 0)
    ) {
      throw new Error("credit_ledger_reconciliation_required");
    }
  }
}

function assertRolloverGrantMatchesRequest(
  grant: LedgerCreditGrant,
  input: RolloverSubscriptionCreditsInput,
  expectedCredits?: number
): void {
  if (
    grant.userId !== input.userId ||
    grant.catalogId !== input.catalogId ||
    grant.source !== "rollover" ||
    grant.sourceId !== (input.sourceId ?? null) ||
    (expectedCredits !== undefined &&
      grant.originalCredits !== expectedCredits) ||
    grant.rolloverEligible ||
    !metadataEquals(grant.metadata, input.metadata ?? null)
  ) {
    throw new Error("credit_grant_idempotency_conflict");
  }
}

async function assertRolloverReplayEvidence(
  store: CreditLedgerTransaction,
  rolloverGrant: LedgerCreditGrant,
  input: RolloverSubscriptionCreditsInput
): Promise<RolloverSourceEvidence[]> {
  const grants = await store.listUserGrantsForUpdate(input.userId);
  let sourceCredits = 0;
  const sourceAllocations: RolloverSourceEvidence[] = [];

  const approximateExpiryDays = rolloverGrant.expiresAt
    ? (rolloverGrant.expiresAt.getTime() - rolloverGrant.createdAt.getTime()) /
      86_400_000
    : null;
  if (
    approximateExpiryDays === null ||
    approximateExpiryDays < 59 ||
    approximateExpiryDays > 61 ||
    rolloverGrant.rolloverSourceGrantId === null
  ) {
    throw new Error("credit_rollover_incomplete");
  }

  for (const grant of grants) {
    if (grant.id === rolloverGrant.id) continue;
    const key = `${input.idempotencyKey}:source:${grant.id}`;
    const transaction =
      await store.findTransactionByIdempotencyKeyForUpdate(key);
    if (!transaction) continue;

    if (
      grant.catalogId !== input.catalogId ||
      !grant.rolloverEligible ||
      !Number.isSafeInteger(transaction.credits) ||
      transaction.credits <= 0 ||
      transaction.balanceAfter === null ||
      !Number.isSafeInteger(transaction.balanceAfter) ||
      transaction.balanceAfter < 0 ||
      transaction.balanceAfter + transaction.credits > grant.originalCredits
    ) {
      throw new Error("credit_rollover_incomplete");
    }

    assertTransactionMatchesRequest(transaction, {
      userId: input.userId,
      grantId: grant.id,
      reservationId: null,
      type: "rollover",
      credits: transaction.credits,
      idempotencyKey: key,
      sourceId: input.sourceId ?? null,
      balanceAfter: transaction.balanceAfter,
      metadata: { rolloverGrantId: rolloverGrant.id },
    });
    sourceCredits += transaction.credits;
    sourceAllocations.push({
      grantId: grant.id,
      credits: transaction.credits,
      balanceAfter: transaction.balanceAfter,
    });
  }

  sourceAllocations.sort((left, right) =>
    left.grantId.localeCompare(right.grantId)
  );
  if (
    sourceAllocations.length === 0 ||
    sourceCredits !== rolloverGrant.originalCredits ||
    !sourceAllocations.some(
      (allocation) => allocation.grantId === rolloverGrant.rolloverSourceGrantId
    )
  ) {
    throw new Error("credit_rollover_incomplete");
  }

  const destinationKey = `${input.idempotencyKey}:grant`;
  const destination =
    await store.findTransactionByIdempotencyKeyForUpdate(destinationKey);
  if (!destination) throw new Error("credit_rollover_incomplete");
  assertTransactionMatchesRequest(destination, {
    userId: input.userId,
    grantId: rolloverGrant.id,
    reservationId: null,
    type: "rollover",
    credits: rolloverGrant.originalCredits,
    idempotencyKey: destinationKey,
    sourceId: input.sourceId ?? null,
    balanceAfter: rolloverGrant.originalCredits,
    metadata: input.metadata ?? null,
  });
  return sourceAllocations;
}

async function assertOrphanRolloverDebitsApplied(
  store: CreditLedgerTransaction,
  userId: string,
  sourceAllocations: RolloverSourceEvidence[]
): Promise<void> {
  const grants = await store.listUserGrantsForUpdate(userId);
  const grantsById = new Map(grants.map((grant) => [grant.id, grant]));
  if (
    sourceAllocations.some(
      (allocation) =>
        grantsById.get(allocation.grantId)?.remainingCredits !==
        allocation.balanceAfter
    )
  ) {
    throw new Error("credit_ledger_reconciliation_required");
  }
}

export function createMemoryCreditLedgerStore(): CreditLedgerStore {
  let nextId = 1;
  let grants: LedgerCreditGrant[] = [];
  let reservations: LedgerCreditReservation[] = [];
  let allocations: LedgerReservationAllocation[] = [];
  let transactions: LedgerCreditTransaction[] = [];
  let transactionTail = Promise.resolve();

  function id(prefix: string) {
    return `${prefix}-${nextId++}`;
  }

  const store: CreditLedgerStore & CreditLedgerTransaction = {
    async withUserTransaction(_userId, work) {
      const previous = transactionTail;
      let release = () => {};
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;

      const snapshot = {
        nextId,
        grants: grants.map(cloneGrant),
        reservations: reservations.map(cloneReservation),
        allocations: allocations.map(cloneAllocation),
        transactions: transactions.map(cloneTransaction),
      };

      try {
        return await work(store);
      } catch (error) {
        nextId = snapshot.nextId;
        grants = snapshot.grants;
        reservations = snapshot.reservations;
        allocations = snapshot.allocations;
        transactions = snapshot.transactions;
        throw error;
      } finally {
        release();
      }
    },

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

    async findGrantByIdempotencyKeyForUpdate(idempotencyKey) {
      return store.findGrantByIdempotencyKey(idempotencyKey);
    },

    async findTransactionByIdempotencyKey(idempotencyKey) {
      const transaction = transactions.find(
        (candidate) => candidate.idempotencyKey === idempotencyKey
      );
      return transaction ? cloneTransaction(transaction) : null;
    },

    async findTransactionByIdempotencyKeyForUpdate(idempotencyKey) {
      return store.findTransactionByIdempotencyKey(idempotencyKey);
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

    async listSpendableGrantsForUpdate(userId, currentTime) {
      return store.listSpendableGrants(userId, currentTime);
    },

    async listUserGrants(userId) {
      return grants.filter((grant) => grant.userId === userId).map(cloneGrant);
    },

    async listUserGrantsForUpdate(userId) {
      return grants
        .filter((grant) => grant.userId === userId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(cloneGrant);
    },

    async listUserReservationsForUpdate(userId) {
      return reservations
        .filter((reservation) => reservation.userId === userId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(cloneReservation);
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

    async findReservationByKeyForUpdate(reservationKey) {
      return store.findReservationByKey(reservationKey);
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

    async listAllocationsForUpdate(reservationId) {
      return allocations
        .filter((allocation) => allocation.reservationId === reservationId)
        .sort((left, right) => left.grantId.localeCompare(right.grantId))
        .map(cloneAllocation);
    },

    async listTerminalTransactionsByReservationForUpdate(reservationId) {
      return transactions
        .filter(
          (transaction) =>
            transaction.reservationId === reservationId &&
            ["consume", "release", "refund"].includes(transaction.type)
        )
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(cloneTransaction);
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

  return store;
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

class InsufficientCreditsError extends Error {
  constructor(readonly availableCredits: number) {
    super("insufficient_credits");
  }
}

function assertPositiveCredits(credits: number): void {
  if (!Number.isSafeInteger(credits) || credits <= 0) {
    throw new Error("invalid_credit_amount");
  }
}

function assertGrantBalances(
  grant: LedgerCreditGrant,
  balances: Pick<LedgerCreditGrant, "remainingCredits" | "reservedCredits">
): void {
  if (
    balances.remainingCredits < 0 ||
    balances.reservedCredits < 0 ||
    balances.remainingCredits + balances.reservedCredits > grant.originalCredits
  ) {
    throw new Error("credit_ledger_reconciliation_required");
  }
}

function datesEqual(left: Date | null, right: Date | null): boolean {
  return left === null
    ? right === null
    : right !== null && left.getTime() === right.getTime();
}

function metadataEquals(
  left: Record<string, unknown> | null,
  right: Record<string, unknown> | null
): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function completeReservation({
  store,
  trackTerminalSettlement,
  reservationKey,
  idempotencyKey,
  nextStatus,
  transactionType,
  applyAllocation,
}: {
  store: CreditLedgerStore;
  trackTerminalSettlement: CreditTerminalSettlementTracker;
  reservationKey: string;
  idempotencyKey: string;
  nextStatus: CreditReservationStatus;
  transactionType: CreditTerminalSettlementEvent["transactionType"];
  applyAllocation(input: {
    grant: LedgerCreditGrant;
    credits: number;
  }): Pick<LedgerCreditGrant, "remainingCredits" | "reservedCredits">;
}): Promise<CompleteReservationResult> {
  const ownerLookup = await store.findReservationByKey(reservationKey);
  if (!ownerLookup) {
    throw new Error(`Credit reservation ${reservationKey} was not found`);
  }
  const outcome = await store.withUserTransaction(
    ownerLookup.userId,
    async (transaction) => {
      const reservation =
        await transaction.findReservationByKeyForUpdate(reservationKey);
      if (!reservation || reservation.userId !== ownerLookup.userId) {
        throw new Error("credit_reservation_idempotency_conflict");
      }

      await assertUserReservationIntegrity(transaction, reservation.userId);
      const allocations = await assertReservationEvidence(
        transaction,
        reservation
      );
      const userGrants = await transaction.listUserGrantsForUpdate(
        reservation.userId
      );
      const grantsById = new Map(userGrants.map((grant) => [grant.id, grant]));
      const transactionInput = {
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
      } satisfies Omit<LedgerCreditTransaction, "id" | "createdAt">;
      const terminalTransactions =
        await transaction.listTerminalTransactionsByReservationForUpdate(
          reservation.id
        );
      assertReservationTerminalHistory(
        reservation,
        allocations,
        terminalTransactions
      );
      const terminalTransaction =
        terminalTransactions.find(
          (candidate) => candidate.type === transactionType
        ) ?? null;
      if (
        terminalTransaction &&
        terminalTransaction.idempotencyKey !== idempotencyKey
      ) {
        throw new Error("credit_transaction_idempotency_conflict");
      }
      const existingTransaction =
        await transaction.findTransactionByIdempotencyKeyForUpdate(
          idempotencyKey
        );

      if (existingTransaction) {
        assertTransactionMatchesRequest(existingTransaction, transactionInput);
        if (reservation.status !== nextStatus) {
          throw new Error("credit_transaction_idempotency_conflict");
        }
        return {
          reservation,
          duplicate: true,
          firstGrant: allocations[0]
            ? (grantsById.get(allocations[0].grantId) ?? null)
            : null,
        };
      }

      if (reservation.status === nextStatus) {
        throw new Error("credit_ledger_reconciliation_required");
      }

      if (!canTransitionReservation(reservation.status, nextStatus)) {
        throw new Error(
          `Cannot move credit reservation ${reservationKey} from ${reservation.status} to ${nextStatus}`
        );
      }

      for (const allocation of allocations) {
        const grant = grantsById.get(allocation.grantId);
        if (!grant) {
          throw new Error("credit_ledger_reconciliation_required");
        }
        const balances = applyAllocation({
          grant,
          credits: allocation.credits,
        });
        assertGrantBalances(grant, balances);
        await transaction.updateGrantBalances(allocation.grantId, balances);
      }

      const updatedReservation = await transaction.updateReservationStatus(
        reservation.id,
        nextStatus
      );
      await createAndValidateTransaction(transaction, transactionInput);
      assertReservationTerminalHistory(
        updatedReservation,
        allocations,
        await transaction.listTerminalTransactionsByReservationForUpdate(
          reservation.id
        )
      );
      await assertUserReservationIntegrity(transaction, reservation.userId);

      return {
        reservation: updatedReservation,
        duplicate: false,
        firstGrant: allocations[0]
          ? (grantsById.get(allocations[0].grantId) ?? null)
          : null,
      };
    }
  );

  if (!outcome.duplicate) {
    try {
      const tracking = trackTerminalSettlement({
        transactionType,
        userId: outcome.reservation.userId,
        catalogId: outcome.firstGrant?.catalogId,
        creditSource: outcome.firstGrant?.source,
        credits: outcome.reservation.credits,
        idempotencyKey,
        sessionId: outcome.reservation.sessionId,
        reservationId: outcome.reservation.id,
        grantId: outcome.firstGrant?.id,
      });
      if (tracking) {
        void tracking.catch(() => {
          console.error("billing_terminal_settlement_analytics_failed");
        });
      }
    } catch {
      console.error("billing_terminal_settlement_analytics_failed");
    }
  }

  return {
    reservation: outcome.reservation,
    duplicate: outcome.duplicate,
  };
}

async function trackCompletedReservationEvent({
  transactionType,
  userId,
  catalogId,
  creditSource,
  credits,
  idempotencyKey,
  sessionId,
  reservationId,
  grantId,
}: CreditTerminalSettlementEvent) {
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
    await trackBillingCreditConsumed(input);
  } else if (transactionType === "release") {
    await trackBillingCreditReleased(input);
  } else if (transactionType === "refund") {
    await trackBillingCreditRefunded(input);
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

function assertReservationTerminalHistory(
  reservation: LedgerCreditReservation,
  allocations: LedgerReservationAllocation[],
  transactions: LedgerCreditTransaction[]
): void {
  const canonicalMetadata = {
    allocations: allocations.map((allocation) => ({
      grantId: allocation.grantId,
      credits: allocation.credits,
    })),
  };
  if (
    transactions.some(
      (transaction) =>
        transaction.userId !== reservation.userId ||
        transaction.reservationId !== reservation.id ||
        transaction.grantId !== null ||
        transaction.credits !== reservation.credits ||
        transaction.sourceId !== reservation.sessionId ||
        transaction.balanceAfter !== null ||
        !metadataEquals(transaction.metadata, canonicalMetadata)
    )
  ) {
    throw new Error("credit_ledger_reconciliation_required");
  }

  const counts = {
    consume: transactions.filter(
      (transaction) => transaction.type === "consume"
    ).length,
    release: transactions.filter(
      (transaction) => transaction.type === "release"
    ).length,
    refund: transactions.filter((transaction) => transaction.type === "refund")
      .length,
  };
  const valid =
    (reservation.status === "active" && transactions.length === 0) ||
    (reservation.status === "consumed" &&
      transactions.length === 1 &&
      counts.consume === 1) ||
    (reservation.status === "released" &&
      transactions.length === 1 &&
      counts.release === 1) ||
    (reservation.status === "refunded" &&
      transactions.length === 2 &&
      counts.consume === 1 &&
      counts.refund === 1) ||
    (reservation.status === "expired" && transactions.length === 0);

  if (!valid) throw new Error("credit_ledger_reconciliation_required");
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

  const createdAtOrder = left.createdAt.getTime() - right.createdAt.getTime();
  return createdAtOrder !== 0
    ? createdAtOrder
    : left.id.localeCompare(right.id);
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

import { BILLING_CATALOG, type BillingCatalogId } from "@meelni/core";
import {
  trackBillingCreditConsumed,
  trackBillingCreditExpired,
  trackBillingCreditGranted,
  trackBillingCreditRefunded,
  trackBillingCreditReleased,
  trackBillingCreditReserved,
  trackBillingCreditRolloverCreated,
  trackBillingPaymentAdjusted,
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
  revokedAt: Date | null;
  revocationKey: string | null;
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
  startContractVersion: number;
  startAttemptId: string | null;
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
  revokedCredits: number;
  createdAt: Date;
}

export type BillingAdjustmentType = "refund" | "dispute";
export type BillingAdjustmentDirection = "withdraw" | "reinstate";

export interface LedgerBillingAdjustment {
  id: string;
  userId: string;
  paymentHistoryId: string | null;
  creditGrantId: string | null;
  stripeEventId: string;
  providerAdjustmentId: string;
  adjustmentType: BillingAdjustmentType;
  direction: BillingAdjustmentDirection;
  amountInCents: number | null;
  currency: string | null;
  sourceCredits: number;
  remainingCredits: number;
  reservedCredits: number;
  consumedCredits: number;
  revokedCredits: number;
  unrecoverableCredits: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

interface GrantRevocationEvidence {
  grantId: string;
  rolloverLotId?: string;
  credits: number;
}

interface AllocationRevocationEvidence {
  allocationId: string;
  grantId: string;
  rolloverLotAllocationId?: string;
  credits: number;
}

export interface LedgerRolloverLot {
  id: string;
  userId: string;
  rolloverGrantId: string;
  sourceGrantId: string;
  originalCredits: number;
  remainingCredits: number;
  reservedCredits: number;
  consumedCredits: number;
  revokedCredits: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface LedgerRolloverLotAllocation {
  id: string;
  reservationGrantId: string;
  rolloverLotId: string;
  credits: number;
  revokedCredits: number;
  createdAt: Date;
}

export interface LedgerBillingPaymentState {
  id: string;
  userId: string;
  paymentHistoryId: string | null;
  creditGrantId: string;
  sourceCredits: number;
  targetCredits: number;
  revokedCredits: number;
  unrecoverableCredits: number;
  consumedCredits: number;
  grantRevocations: GrantRevocationEvidence[];
  allocationRevocations: AllocationRevocationEvidence[];
  lastProviderAdjustmentId: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

type CreateLedgerGrantInput = Omit<
  LedgerCreditGrant,
  "id" | "createdAt" | "updatedAt" | "revokedAt" | "revocationKey"
> &
  Partial<Pick<LedgerCreditGrant, "revokedAt" | "revocationKey">>;

type CreateLedgerAllocationInput = Omit<
  LedgerReservationAllocation,
  "id" | "createdAt" | "revokedCredits"
> &
  Partial<Pick<LedgerReservationAllocation, "revokedCredits">>;

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

export interface CreditLedgerReadStore {
  findGrantByIdempotencyKey(
    idempotencyKey: string
  ): Promise<LedgerCreditGrant | null>;
  findTransactionByIdempotencyKey(
    idempotencyKey: string
  ): Promise<LedgerCreditTransaction | null>;
  listSpendableGrants(userId: string, now: Date): Promise<LedgerCreditGrant[]>;
  listUserGrants(userId: string): Promise<LedgerCreditGrant[]>;
  getCreditReadSnapshot(userId: string): Promise<CreditReadSnapshot>;
  getSubscriptionCreditPolicy(
    userId: string
  ): Promise<SubscriptionCreditPolicy>;
  findReservationByKey(
    reservationKey: string
  ): Promise<LedgerCreditReservation | null>;
  listAllocations(
    reservationId: string
  ): Promise<LedgerReservationAllocation[]>;
}

export interface CreditLedgerMutationStore {
  createGrant(input: CreateLedgerGrantInput): Promise<LedgerCreditGrant>;
  updateGrantBalances(
    grantId: string,
    balances: Pick<LedgerCreditGrant, "remainingCredits" | "reservedCredits">
  ): Promise<LedgerCreditGrant>;
  revokeGrant(
    grantId: string,
    input: { revokedAt: Date; revocationKey: string; remainingCredits: number }
  ): Promise<LedgerCreditGrant>;
  restoreGrant(
    grantId: string,
    input: { remainingCredits: number; clearRevocation: boolean }
  ): Promise<LedgerCreditGrant>;
  createReservation(
    input: Omit<LedgerCreditReservation, "id" | "createdAt" | "updatedAt">
  ): Promise<LedgerCreditReservation>;
  updateReservationStatus(
    reservationId: string,
    status: CreditReservationStatus
  ): Promise<LedgerCreditReservation>;
  createAllocation(
    input: CreateLedgerAllocationInput
  ): Promise<LedgerReservationAllocation>;
  listAllocations(
    reservationId: string
  ): Promise<LedgerReservationAllocation[]>;
  updateAllocationRevokedCredits(
    allocationId: string,
    revokedCredits: number
  ): Promise<LedgerReservationAllocation>;
  createRolloverLot(
    input: Omit<LedgerRolloverLot, "id" | "createdAt" | "updatedAt">
  ): Promise<LedgerRolloverLot>;
  updateRolloverLotBalances(
    lotId: string,
    balances: Pick<
      LedgerRolloverLot,
      | "remainingCredits"
      | "reservedCredits"
      | "consumedCredits"
      | "revokedCredits"
    >
  ): Promise<LedgerRolloverLot>;
  createRolloverLotAllocation(
    input: Omit<LedgerRolloverLotAllocation, "id" | "createdAt">
  ): Promise<LedgerRolloverLotAllocation>;
  updateRolloverLotAllocationRevokedCredits(
    allocationId: string,
    revokedCredits: number
  ): Promise<LedgerRolloverLotAllocation>;
  createTransaction(
    input: Omit<LedgerCreditTransaction, "id" | "createdAt">
  ): Promise<LedgerCreditTransaction>;
  createBillingAdjustment(
    input: Omit<LedgerBillingAdjustment, "id" | "createdAt">
  ): Promise<LedgerBillingAdjustment>;
  findBillingAdjustment(
    providerAdjustmentId: string,
    direction: BillingAdjustmentDirection
  ): Promise<LedgerBillingAdjustment | null>;
  createBillingPaymentState(
    input: Omit<LedgerBillingPaymentState, "id" | "createdAt" | "updatedAt">
  ): Promise<LedgerBillingPaymentState>;
  updatePaymentHistoryStatus(
    paymentHistoryId: string,
    status: "succeeded" | "partially_refunded" | "refunded" | "disputed"
  ): Promise<void>;
}

export interface CreditLedgerTransaction
  extends CreditLedgerReadStore,
    CreditLedgerMutationStore {
  getCurrentTime(): Promise<Date>;
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
  getSubscriptionCreditPolicyForUpdate(
    userId: string
  ): Promise<SubscriptionCreditPolicy>;
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
  listTransactionsByGrantForUpdate(
    grantId: string
  ): Promise<LedgerCreditTransaction[]>;
  listRolloverLotsForGrantForUpdate(
    rolloverGrantId: string
  ): Promise<LedgerRolloverLot[]>;
  listRolloverLotsForSourceForUpdate(
    sourceGrantId: string
  ): Promise<LedgerRolloverLot[]>;
  listRolloverLotAllocationsForReservationGrantForUpdate(
    reservationGrantId: string
  ): Promise<LedgerRolloverLotAllocation[]>;
  findBillingAdjustmentForUpdate(
    providerAdjustmentId: string,
    direction: BillingAdjustmentDirection
  ): Promise<LedgerBillingAdjustment | null>;
  listBillingAdjustmentsForPaymentForUpdate(
    paymentHistoryId: string
  ): Promise<LedgerBillingAdjustment[]>;
  listBillingAdjustmentsForGrantForUpdate(
    creditGrantId: string
  ): Promise<LedgerBillingAdjustment[]>;
  findBillingPaymentStateForUpdate(
    creditGrantId: string
  ): Promise<LedgerBillingPaymentState | null>;
  updateBillingPaymentState(
    stateId: string,
    input: Omit<
      LedgerBillingPaymentState,
      | "id"
      | "userId"
      | "paymentHistoryId"
      | "creditGrantId"
      | "sourceCredits"
      | "createdAt"
      | "updatedAt"
    >
  ): Promise<LedgerBillingPaymentState>;
}

export interface CreditLedgerStore extends CreditLedgerReadStore {
  withUserTransaction<T>(
    userId: string,
    work: (transaction: CreditLedgerTransaction) => Promise<T>
  ): Promise<T>;
}

export interface CreditLedgerTestStore
  extends CreditLedgerStore,
    CreditLedgerTransaction {
  setSubscriptionCreditPolicy(
    userId: string,
    policy: SubscriptionCreditPolicy
  ): void;
  setCurrentTime(currentTime: Date): void;
}

export interface SubscriptionCreditPolicy {
  restricted: boolean;
  availableThrough: Date | null;
}

export interface CreditReadSnapshot {
  currentTime: Date;
  grants: LedgerCreditGrant[];
  subscriptionPolicy: SubscriptionCreditPolicy;
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
  startContractVersion?: number;
  startAttemptId?: string | null;
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
  postCommitEffects: SubscriptionRenewalPostCommitEffects;
}

export interface SubscriptionRenewalPostCommitEffects {
  userId: string;
  catalogId: BillingCatalogId;
  sourceId: string | null;
  renewalIdempotencyKey: string;
  rolloverIdempotencyKey: string;
  renewalGrant: LedgerCreditGrant;
  renewalDuplicate: boolean;
  rolledCredits: number;
  rolloverGrant: LedgerCreditGrant | null;
  rolloverDuplicate: boolean;
}

export interface RevokePaidGrantInput {
  userId: string;
  grantIdempotencyKey: string;
  stripeEventId: string;
  providerAdjustmentId: string;
  adjustmentType: BillingAdjustmentType;
  paymentHistoryId?: string | null;
  amountInCents?: number | null;
  sourcePaymentAmountInCents?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type ReinstatePaidGrantInput = RevokePaidGrantInput;

export interface RevokePaidGrantResult {
  adjustment: LedgerBillingAdjustment;
  duplicate: boolean;
}

export function createCreditLedgerService({
  store,
  now,
  trackTerminalSettlement = trackCompletedReservationEvent,
}: CreateCreditLedgerServiceInput) {
  const operationNow = now ?? (() => new Date());
  return {
    async grantCredits(input: GrantCreditsInput): Promise<GrantCreditsResult> {
      const catalogItem = BILLING_CATALOG[input.catalogId];
      const issuedAt = operationNow();
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

      trackBillingCreditGranted({
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
      const snapshot = await store.getCreditReadSnapshot(userId);
      const currentTime = now ? now() : snapshot.currentTime;
      const { grants, subscriptionPolicy } = snapshot;
      const activeGrants = grants.filter((grant) =>
        isCreditGrantAvailable(grant, currentTime, subscriptionPolicy)
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
      const currentTime = operationNow();
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
            if (grant.source === "rollover") {
              const lots = await transaction.listRolloverLotsForGrantForUpdate(
                grant.id
              );
              if (
                lots.length === 0 ||
                sumBy(lots, (lot) => lot.remainingCredits) !== credits ||
                sumBy(lots, (lot) => lot.reservedCredits) !==
                  grant.reservedCredits
              ) {
                throw new Error("credit_rollover_provenance_required");
              }
              for (const lot of lots) {
                if (lot.remainingCredits === 0) continue;
                const nextLot = await transaction.updateRolloverLotBalances(
                  lot.id,
                  {
                    remainingCredits: 0,
                    reservedCredits: lot.reservedCredits,
                    consumedCredits: lot.consumedCredits,
                    revokedCredits: lot.revokedCredits + lot.remainingCredits,
                  }
                );
                assertRolloverLotBalances(nextLot);
              }
              const nextLots =
                await transaction.listRolloverLotsForGrantForUpdate(grant.id);
              if (
                sumBy(nextLots, (lot) => lot.remainingCredits) !==
                  updatedGrant.remainingCredits ||
                sumBy(nextLots, (lot) => lot.reservedCredits) !==
                  updatedGrant.reservedCredits
              ) {
                throw new Error("credit_rollover_provenance_required");
              }
            }
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
        trackBillingCreditExpired({
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
        result = await store.withUserTransaction(input.userId, (transaction) =>
          reserveCreditInTransaction({
            store: transaction,
            input,
            currentTime: operationNow(),
          })
        );
      } catch (error) {
        if (error instanceof InsufficientCreditsError) {
          trackBillingNoCredits({
            userId: input.userId,
            credits: requestedCredits,
            balanceAfter: error.availableCredits,
            sessionId: input.sessionId,
            reason: "insufficient_credits",
          });
        }
        throw error;
      }

      trackReservedCreditEvents(input, result);

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
        applyAllocation: ({ grant, allocation }) => ({
          remainingCredits: grant.remainingCredits,
          reservedCredits: grant.reservedCredits - allocation.credits,
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
        applyAllocation: ({ grant, allocation }) => ({
          remainingCredits:
            grant.remainingCredits +
            (grant.revokedAt
              ? 0
              : allocation.credits - allocation.revokedCredits),
          reservedCredits: grant.reservedCredits - allocation.credits,
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
        applyAllocation: ({ grant, allocation }) => ({
          remainingCredits:
            grant.remainingCredits +
            (grant.revokedAt
              ? 0
              : allocation.credits - allocation.revokedCredits),
          reservedCredits: grant.reservedCredits,
        }),
      });
    },

    async revokePaidGrant(
      input: RevokePaidGrantInput
    ): Promise<RevokePaidGrantResult> {
      const adjustedAt = operationNow();
      const outcome = await store.withUserTransaction(
        input.userId,
        async (transaction) => {
          const existing = await transaction.findBillingAdjustmentForUpdate(
            input.providerAdjustmentId,
            "withdraw"
          );
          if (existing) {
            assertBillingAdjustmentMatches(existing, input);
            return { adjustment: existing, duplicate: true };
          }

          await assertUserReservationIntegrity(transaction, input.userId);
          const sourceGrant =
            await transaction.findGrantByIdempotencyKeyForUpdate(
              input.grantIdempotencyKey
            );
          if (
            !sourceGrant ||
            sourceGrant.userId !== input.userId ||
            !["checkout", "subscription_renewal"].includes(sourceGrant.source)
          ) {
            throw new Error("billing_adjustment_correlation_required");
          }
          const preexistingReinstatement =
            await transaction.findBillingAdjustmentForUpdate(
              input.providerAdjustmentId,
              "reinstate"
            );
          if (preexistingReinstatement) {
            assertBillingAdjustmentMatches(
              preexistingReinstatement,
              input,
              "reinstate"
            );
          }

          const priorAdjustments = await listPaymentAdjustmentsForUpdate(
            transaction,
            sourceGrant,
            input.paymentHistoryId ?? null
          );
          const prospective = createProspectiveBillingAdjustment(
            input,
            sourceGrant,
            "withdraw",
            adjustedAt
          );
          const reconciliation = await reconcileBillingPaymentState({
            transaction,
            userId: input.userId,
            sourceGrant,
            paymentHistoryId: input.paymentHistoryId ?? null,
            sourcePaymentAmountInCents:
              input.sourcePaymentAmountInCents ?? null,
            adjustments: [...priorAdjustments, prospective],
            providerAdjustmentId: input.providerAdjustmentId,
            direction: "withdraw",
            adjustedAt,
          });
          const unrecoverableDelta = Math.max(
            0,
            reconciliation.after.unrecoverableCredits -
              reconciliation.before.unrecoverableCredits
          );
          const adjustment = await transaction.createBillingAdjustment({
            ...toBillingAdjustmentInput(prospective),
            remainingCredits: reconciliation.frozenGrantCredits,
            reservedCredits: reconciliation.frozenAllocationCredits,
            consumedCredits: unrecoverableDelta,
            revokedCredits:
              reconciliation.frozenGrantCredits +
              reconciliation.frozenAllocationCredits,
            unrecoverableCredits: unrecoverableDelta,
            metadata: {
              ...(input.metadata ?? {}),
              sourceGrantId: sourceGrant.id,
              sourceGrantIdempotencyKey: sourceGrant.idempotencyKey,
              supersededByEarlierReinstatement:
                preexistingReinstatement !== null,
              sourcePaymentAmountInCents:
                input.sourcePaymentAmountInCents ?? null,
              aggregateStateId: reconciliation.state.id,
              aggregateStateVersion: reconciliation.state.version,
              aggregateBefore: reconciliation.before,
              aggregateAfter: reconciliation.after,
            },
          });
          await updatePaymentHistoryAfterAdjustment({
            transaction,
            paymentHistoryId: input.paymentHistoryId ?? null,
            sourcePaymentAmountInCents:
              input.sourcePaymentAmountInCents ?? null,
          });
          await assertUserReservationIntegrity(transaction, input.userId);
          return { adjustment, duplicate: false };
        }
      );

      trackBillingPaymentAdjusted({
        userId: input.userId,
        credits: outcome.adjustment.revokedCredits,
        reason: input.adjustmentType,
        duplicate: outcome.duplicate,
        reservedCredits: outcome.adjustment.reservedCredits,
        consumedCredits: outcome.adjustment.consumedCredits,
        unrecoverableCredits: outcome.adjustment.unrecoverableCredits,
      });
      return outcome;
    },

    async reinstatePaidGrant(
      input: ReinstatePaidGrantInput
    ): Promise<RevokePaidGrantResult> {
      const adjustedAt = operationNow();
      const outcome = await store.withUserTransaction(
        input.userId,
        async (transaction) => {
          const existing = await transaction.findBillingAdjustmentForUpdate(
            input.providerAdjustmentId,
            "reinstate"
          );
          if (existing) {
            assertBillingAdjustmentMatches(existing, input, "reinstate");
            return { adjustment: existing, duplicate: true };
          }

          await assertUserReservationIntegrity(transaction, input.userId);
          const sourceGrant =
            await transaction.findGrantByIdempotencyKeyForUpdate(
              input.grantIdempotencyKey
            );
          if (
            !sourceGrant ||
            sourceGrant.userId !== input.userId ||
            !["checkout", "subscription_renewal"].includes(sourceGrant.source)
          ) {
            throw new Error("billing_adjustment_correlation_required");
          }
          const withdrawal = await transaction.findBillingAdjustmentForUpdate(
            input.providerAdjustmentId,
            "withdraw"
          );
          if (withdrawal) {
            assertBillingAdjustmentMatches(withdrawal, input);
          }
          const priorAdjustments = await listPaymentAdjustmentsForUpdate(
            transaction,
            sourceGrant,
            input.paymentHistoryId ?? null
          );
          const prospective = createProspectiveBillingAdjustment(
            input,
            sourceGrant,
            "reinstate",
            adjustedAt,
            withdrawal
          );
          const reconciliation = await reconcileBillingPaymentState({
            transaction,
            userId: input.userId,
            sourceGrant,
            paymentHistoryId: input.paymentHistoryId ?? null,
            sourcePaymentAmountInCents:
              input.sourcePaymentAmountInCents ?? null,
            adjustments: [...priorAdjustments, prospective],
            providerAdjustmentId: input.providerAdjustmentId,
            direction: "reinstate",
            adjustedAt,
          });
          const restoredCredits =
            reconciliation.restoredGrantCredits +
            reconciliation.restoredAllocationCredits;
          const targetReduction = Math.max(
            0,
            reconciliation.before.targetCredits -
              reconciliation.after.targetCredits
          );
          const unrecoverableCredits = Math.max(
            0,
            targetReduction - restoredCredits
          );
          const adjustment = await transaction.createBillingAdjustment({
            ...toBillingAdjustmentInput(prospective),
            remainingCredits: reconciliation.restoredGrantCredits,
            reservedCredits: reconciliation.restoredAllocationCredits,
            consumedCredits: unrecoverableCredits,
            revokedCredits: restoredCredits,
            unrecoverableCredits,
            metadata: {
              ...(input.metadata ?? {}),
              withdrawalAdjustmentId: withdrawal?.id ?? null,
              arrivedBeforeWithdrawal: withdrawal === null,
              sourcePaymentAmountInCents:
                input.sourcePaymentAmountInCents ?? null,
              aggregateStateId: reconciliation.state.id,
              aggregateStateVersion: reconciliation.state.version,
              aggregateBefore: reconciliation.before,
              aggregateAfter: reconciliation.after,
            },
          });
          await updatePaymentHistoryAfterAdjustment({
            transaction,
            paymentHistoryId: input.paymentHistoryId ?? null,
            sourcePaymentAmountInCents:
              input.sourcePaymentAmountInCents ?? null,
          });
          await assertUserReservationIntegrity(transaction, input.userId);
          return { adjustment, duplicate: false };
        }
      );

      trackBillingPaymentAdjusted({
        userId: input.userId,
        credits: outcome.adjustment.revokedCredits,
        reason: `${input.adjustmentType}_reinstated`,
        duplicate: outcome.duplicate,
        reservedCredits: outcome.adjustment.reservedCredits,
        consumedCredits: outcome.adjustment.consumedCredits,
        unrecoverableCredits: outcome.adjustment.unrecoverableCredits,
      });
      return outcome;
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

      const currentTime = operationNow();
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

      return {
        grant: outcome.renewal.grant,
        rolledCredits: outcome.rollover.rolledCredits,
        rolloverGrant: outcome.rollover.grant,
        postCommitEffects: {
          userId: input.userId,
          catalogId: input.catalogId,
          sourceId: input.sourceId ?? null,
          renewalIdempotencyKey: input.renewalIdempotencyKey,
          rolloverIdempotencyKey: input.rolloverIdempotencyKey,
          renewalGrant: outcome.renewal.grant,
          renewalDuplicate: outcome.renewal.duplicate,
          rolledCredits: outcome.rollover.rolledCredits,
          rolloverGrant: outcome.rollover.grant,
          rolloverDuplicate: outcome.rollover.duplicate,
        },
      };
    },
  };
}

export function emitSubscriptionRenewalPostCommitEffects(
  effects: SubscriptionRenewalPostCommitEffects
): void {
  if (effects.rolloverGrant) {
    trackBillingCreditRolloverCreated({
      userId: effects.userId,
      catalogId: effects.catalogId,
      creditSource: "rollover",
      transactionType: "rollover",
      credits: effects.rolledCredits,
      balanceAfter: effects.rolloverGrant.remainingCredits,
      idempotencyKey: effects.rolloverIdempotencyKey,
      sourceId: effects.sourceId,
      grantId: effects.rolloverGrant.id,
      duplicate: effects.rolloverDuplicate,
    });
  }
  trackBillingCreditGranted({
    userId: effects.renewalGrant.userId,
    catalogId: effects.renewalGrant.catalogId,
    creditSource: effects.renewalGrant.source,
    credits: effects.renewalGrant.originalCredits,
    balanceAfter: effects.renewalGrant.remainingCredits,
    idempotencyKey: effects.renewalIdempotencyKey,
    sourceId: effects.renewalGrant.sourceId,
    grantId: effects.renewalGrant.id,
    duplicate: effects.renewalDuplicate,
  });
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

interface RolloverExpiryEvidence extends Record<string, unknown> {
  version: 1;
  rolloverGrantId: string;
  issuedAt: string;
  expiresAt: string;
}

function buildRolloverExpiryEvidence(
  rolloverGrantId: string,
  issuedAt: Date,
  expiresAt: Date
): RolloverExpiryEvidence {
  return {
    version: 1,
    rolloverGrantId,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

function readCanonicalEvidenceDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    return null;
  }
  return parsed;
}

function readRolloverExpiryEvidence(
  metadata: Record<string, unknown> | null
): RolloverExpiryEvidence | null {
  if (
    metadata?.version !== 1 ||
    typeof metadata.rolloverGrantId !== "string" ||
    !readCanonicalEvidenceDate(metadata.issuedAt) ||
    !readCanonicalEvidenceDate(metadata.expiresAt)
  ) {
    return null;
  }
  return metadata as unknown as RolloverExpiryEvidence;
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
  const subscriptionPolicy = await store.getSubscriptionCreditPolicyForUpdate(
    input.userId
  );
  const sourceGrants = (await store.listUserGrantsForUpdate(input.userId))
    .filter(
      (grant) =>
        grant.catalogId === input.catalogId &&
        grant.rolloverEligible &&
        isCreditGrantAvailable(grant, currentTime, subscriptionPolicy) &&
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
  const rolloverExpiresAt = addDaysOrNull(
    currentTime,
    catalogItem.rolloverExpiresAfterDays
  );
  if (!rolloverExpiresAt) {
    throw new Error("credit_rollover_incomplete");
  }
  const rolloverGrant = await store.createGrant({
    userId: input.userId,
    catalogId: input.catalogId,
    source: "rollover",
    sourceId: input.sourceId ?? null,
    idempotencyKey: input.idempotencyKey,
    originalCredits: rolledCredits,
    remainingCredits: rolledCredits,
    reservedCredits: 0,
    expiresAt: rolloverExpiresAt,
    rolloverEligible: false,
    rolloverSourceGrantId: sourceGrants[0]?.id ?? null,
    metadata: input.metadata ?? null,
  });
  const expiryEvidence = buildRolloverExpiryEvidence(
    rolloverGrant.id,
    currentTime,
    rolloverExpiresAt
  );
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
    const lot = await store.createRolloverLot({
      userId: input.userId,
      rolloverGrantId: rolloverGrant.id,
      sourceGrantId: sourceGrant.id,
      originalCredits: creditsFromGrant,
      remainingCredits: creditsFromGrant,
      reservedCredits: 0,
      consumedCredits: 0,
      revokedCredits: 0,
    });
    assertRolloverLotBalances(lot);
    await createAndValidateTransaction(store, {
      userId: input.userId,
      grantId: sourceGrant.id,
      reservationId: null,
      type: "rollover",
      credits: creditsFromGrant,
      idempotencyKey: `${input.idempotencyKey}:source:${sourceGrant.id}`,
      sourceId: input.sourceId ?? null,
      balanceAfter: updatedGrant.remainingCredits,
      metadata: expiryEvidence,
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
    input,
    rolloverExpiresAt
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
    reservation.startContractVersion !== (input.startContractVersion ?? 0) ||
    reservation.startAttemptId !== (input.startAttemptId ?? null) ||
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

    if (grant.source === "rollover") {
      const lots = await store.listRolloverLotsForGrantForUpdate(grant.id);
      const lotsById = new Map(lots.map((lot) => [lot.id, lot]));
      const lotAllocations =
        await store.listRolloverLotAllocationsForReservationGrantForUpdate(
          allocation.id
        );
      if (
        lots.length === 0 ||
        lotAllocations.length === 0 ||
        sumBy(lotAllocations, (lotAllocation) => lotAllocation.credits) !==
          allocation.credits ||
        sumBy(
          lotAllocations,
          (lotAllocation) => lotAllocation.revokedCredits
        ) !== allocation.revokedCredits ||
        lotAllocations.some((lotAllocation) => {
          const lot = lotsById.get(lotAllocation.rolloverLotId);
          return (
            !lot ||
            lot.userId !== reservation.userId ||
            lot.rolloverGrantId !== grant.id
          );
        })
      ) {
        throw new Error("credit_rollover_provenance_required");
      }
    }

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
    if (grant.source === "rollover") {
      const lots = await store.listRolloverLotsForGrantForUpdate(grant.id);
      if (
        lots.length === 0 ||
        lots.some((lot) => {
          assertRolloverLotBalances(lot);
          return lot.userId !== userId || lot.rolloverGrantId !== grant.id;
        }) ||
        sumBy(lots, (lot) => lot.originalCredits) !== grant.originalCredits ||
        sumBy(lots, (lot) => lot.remainingCredits) !== grant.remainingCredits ||
        sumBy(lots, (lot) => lot.reservedCredits) !== grant.reservedCredits
      ) {
        throw new Error("credit_rollover_provenance_required");
      }
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
  input: RolloverSubscriptionCreditsInput,
  expectedExpiresAt?: Date | null
): Promise<RolloverSourceEvidence[]> {
  const grants = await store.listUserGrantsForUpdate(input.userId);
  const rolloverExpiresAfterDays =
    BILLING_CATALOG[input.catalogId].rolloverExpiresAfterDays;
  let sourceCredits = 0;
  const sourceAllocations: RolloverSourceEvidence[] = [];

  if (
    rolloverGrant.expiresAt === null ||
    (expectedExpiresAt !== undefined &&
      !datesEqual(rolloverGrant.expiresAt, expectedExpiresAt)) ||
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

    const expiryEvidence = readRolloverExpiryEvidence(transaction.metadata);
    const issuedAt = readCanonicalEvidenceDate(expiryEvidence?.issuedAt);
    const evidenceExpiresAt = readCanonicalEvidenceDate(
      expiryEvidence?.expiresAt
    );

    if (
      rolloverExpiresAfterDays === null ||
      !expiryEvidence ||
      !issuedAt ||
      !evidenceExpiresAt ||
      expiryEvidence.rolloverGrantId !== rolloverGrant.id ||
      evidenceExpiresAt.getTime() - issuedAt.getTime() !==
        rolloverExpiresAfterDays * 86_400_000 ||
      !datesEqual(rolloverGrant.expiresAt, evidenceExpiresAt) ||
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
      metadata: expiryEvidence,
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

  const lots = await store.listRolloverLotsForGrantForUpdate(rolloverGrant.id);
  if (
    lots.length !== sourceAllocations.length ||
    lots.some((lot) => {
      assertRolloverLotBalances(lot);
      const source = sourceAllocations.find(
        (allocation) => allocation.grantId === lot.sourceGrantId
      );
      return !source || source.credits !== lot.originalCredits;
    }) ||
    sumBy(lots, (lot) => lot.remainingCredits) !==
      rolloverGrant.remainingCredits ||
    sumBy(lots, (lot) => lot.reservedCredits) !== rolloverGrant.reservedCredits
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

/** In-memory fault-injection adapter for billing tests; never use in app code. */
export function createMemoryCreditLedgerStore(): CreditLedgerTestStore {
  let nextId = 1;
  let grants: LedgerCreditGrant[] = [];
  let reservations: LedgerCreditReservation[] = [];
  let allocations: LedgerReservationAllocation[] = [];
  let rolloverLots: LedgerRolloverLot[] = [];
  let rolloverLotAllocations: LedgerRolloverLotAllocation[] = [];
  let transactions: LedgerCreditTransaction[] = [];
  let billingAdjustments: LedgerBillingAdjustment[] = [];
  let billingPaymentStates: LedgerBillingPaymentState[] = [];
  let subscriptionPolicies = new Map<string, SubscriptionCreditPolicy>();
  let currentTime = new Date(0);
  let transactionTail = Promise.resolve();

  function id(prefix: string) {
    return `${prefix}-${nextId++}`;
  }

  const store: CreditLedgerTestStore = {
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
        rolloverLots: rolloverLots.map(cloneRolloverLot),
        rolloverLotAllocations: rolloverLotAllocations.map(
          cloneRolloverLotAllocation
        ),
        transactions: transactions.map(cloneTransaction),
        billingAdjustments: billingAdjustments.map(cloneBillingAdjustment),
        billingPaymentStates: billingPaymentStates.map(
          cloneBillingPaymentState
        ),
        subscriptionPolicies: new Map(
          [...subscriptionPolicies].map(([userId, policy]) => [
            userId,
            cloneSubscriptionCreditPolicy(policy),
          ])
        ),
      };

      try {
        return await work(store);
      } catch (error) {
        nextId = snapshot.nextId;
        grants = snapshot.grants;
        reservations = snapshot.reservations;
        allocations = snapshot.allocations;
        rolloverLots = snapshot.rolloverLots;
        rolloverLotAllocations = snapshot.rolloverLotAllocations;
        transactions = snapshot.transactions;
        billingAdjustments = snapshot.billingAdjustments;
        billingPaymentStates = snapshot.billingPaymentStates;
        subscriptionPolicies = snapshot.subscriptionPolicies;
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
        revokedAt: input.revokedAt ?? null,
        revocationKey: input.revocationKey ?? null,
        id: id("grant"),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      grants.push(grant);
      return cloneGrant(grant);
    },

    async getCurrentTime() {
      return new Date(currentTime);
    },

    setCurrentTime(nextCurrentTime) {
      if (!Number.isFinite(nextCurrentTime.getTime())) {
        throw new Error("credit_ledger_clock_invalid");
      }
      currentTime = new Date(nextCurrentTime);
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

    async getCreditReadSnapshot(userId) {
      return {
        currentTime: new Date(currentTime),
        grants: await store.listUserGrants(userId),
        subscriptionPolicy: await store.getSubscriptionCreditPolicy(userId),
      };
    },

    async listUserGrantsForUpdate(userId) {
      return grants
        .filter((grant) => grant.userId === userId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(cloneGrant);
    },

    async getSubscriptionCreditPolicy(userId) {
      return cloneSubscriptionCreditPolicy(
        subscriptionPolicies.get(userId) ?? UNRESTRICTED_SUBSCRIPTION_CREDITS
      );
    },

    async getSubscriptionCreditPolicyForUpdate(userId) {
      return store.getSubscriptionCreditPolicy(userId);
    },

    setSubscriptionCreditPolicy(userId, policy) {
      subscriptionPolicies.set(userId, cloneSubscriptionCreditPolicy(policy));
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

    async revokeGrant(grantId, input) {
      const grant = grants.find((candidate) => candidate.id === grantId);
      if (!grant) throw new Error(`Credit grant ${grantId} was not found`);
      grant.remainingCredits = input.remainingCredits;
      grant.revokedAt = new Date(input.revokedAt);
      grant.revocationKey = input.revocationKey;
      grant.updatedAt = new Date();
      return cloneGrant(grant);
    },

    async restoreGrant(grantId, input) {
      const grant = grants.find((candidate) => candidate.id === grantId);
      if (!grant) throw new Error(`Credit grant ${grantId} was not found`);
      grant.remainingCredits = input.remainingCredits;
      if (input.clearRevocation) {
        grant.revokedAt = null;
        grant.revocationKey = null;
      }
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
        startContractVersion: input.startContractVersion ?? 0,
        startAttemptId: input.startAttemptId ?? null,
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
        revokedCredits: input.revokedCredits ?? 0,
        id: id("allocation"),
        createdAt: new Date(),
      };
      allocations.push(allocation);
      return cloneAllocation(allocation);
    },

    async updateAllocationRevokedCredits(allocationId, revokedCredits) {
      const allocation = allocations.find(
        (candidate) => candidate.id === allocationId
      );
      if (!allocation) {
        throw new Error(`Credit allocation ${allocationId} was not found`);
      }
      allocation.revokedCredits = revokedCredits;
      return cloneAllocation(allocation);
    },

    async createRolloverLot(input) {
      const existing = rolloverLots.find(
        (candidate) =>
          candidate.rolloverGrantId === input.rolloverGrantId &&
          candidate.sourceGrantId === input.sourceGrantId
      );
      if (existing) return cloneRolloverLot(existing);
      const timestamp = new Date();
      const lot: LedgerRolloverLot = {
        ...input,
        id: id("rollover-lot"),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      rolloverLots.push(lot);
      return cloneRolloverLot(lot);
    },

    async updateRolloverLotBalances(lotId, balances) {
      const lot = rolloverLots.find((candidate) => candidate.id === lotId);
      if (!lot) throw new Error(`Credit rollover lot ${lotId} was not found`);
      Object.assign(lot, balances, { updatedAt: new Date() });
      return cloneRolloverLot(lot);
    },

    async createRolloverLotAllocation(input) {
      const existing = rolloverLotAllocations.find(
        (candidate) =>
          candidate.reservationGrantId === input.reservationGrantId &&
          candidate.rolloverLotId === input.rolloverLotId
      );
      if (existing) return cloneRolloverLotAllocation(existing);
      const allocation: LedgerRolloverLotAllocation = {
        ...input,
        id: id("rollover-lot-allocation"),
        createdAt: new Date(),
      };
      rolloverLotAllocations.push(allocation);
      return cloneRolloverLotAllocation(allocation);
    },

    async updateRolloverLotAllocationRevokedCredits(
      allocationId,
      revokedCredits
    ) {
      const allocation = rolloverLotAllocations.find(
        (candidate) => candidate.id === allocationId
      );
      if (!allocation) {
        throw new Error(
          `Credit rollover lot allocation ${allocationId} was not found`
        );
      }
      allocation.revokedCredits = revokedCredits;
      return cloneRolloverLotAllocation(allocation);
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

    async listTransactionsByGrantForUpdate(grantId) {
      return transactions
        .filter((transaction) => transaction.grantId === grantId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(cloneTransaction);
    },

    async listRolloverLotsForGrantForUpdate(rolloverGrantId) {
      return rolloverLots
        .filter((lot) => lot.rolloverGrantId === rolloverGrantId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(cloneRolloverLot);
    },

    async listRolloverLotsForSourceForUpdate(sourceGrantId) {
      return rolloverLots
        .filter((lot) => lot.sourceGrantId === sourceGrantId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(cloneRolloverLot);
    },

    async listRolloverLotAllocationsForReservationGrantForUpdate(
      reservationGrantId
    ) {
      return rolloverLotAllocations
        .filter(
          (allocation) => allocation.reservationGrantId === reservationGrantId
        )
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(cloneRolloverLotAllocation);
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

    async createBillingAdjustment(input) {
      const existing = billingAdjustments.find(
        (candidate) =>
          candidate.providerAdjustmentId === input.providerAdjustmentId &&
          candidate.direction === input.direction
      );
      if (existing) return cloneBillingAdjustment(existing);
      const adjustment: LedgerBillingAdjustment = {
        ...input,
        id: id("adjustment"),
        createdAt: new Date(),
      };
      billingAdjustments.push(adjustment);
      return cloneBillingAdjustment(adjustment);
    },

    async findBillingAdjustment(providerAdjustmentId, direction) {
      const adjustment = billingAdjustments.find(
        (candidate) =>
          candidate.providerAdjustmentId === providerAdjustmentId &&
          candidate.direction === direction
      );
      return adjustment ? cloneBillingAdjustment(adjustment) : null;
    },

    async createBillingPaymentState(input) {
      const existing = billingPaymentStates.find(
        (candidate) => candidate.creditGrantId === input.creditGrantId
      );
      if (existing) return cloneBillingPaymentState(existing);
      const timestamp = new Date();
      const state: LedgerBillingPaymentState = {
        ...input,
        id: id("payment-state"),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      billingPaymentStates.push(state);
      return cloneBillingPaymentState(state);
    },

    async findBillingAdjustmentForUpdate(providerAdjustmentId, direction) {
      return store.findBillingAdjustment(providerAdjustmentId, direction);
    },

    async listBillingAdjustmentsForPaymentForUpdate(paymentHistoryId) {
      return billingAdjustments
        .filter(
          (adjustment) => adjustment.paymentHistoryId === paymentHistoryId
        )
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(cloneBillingAdjustment);
    },

    async listBillingAdjustmentsForGrantForUpdate(creditGrantId) {
      return billingAdjustments
        .filter((adjustment) => adjustment.creditGrantId === creditGrantId)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(cloneBillingAdjustment);
    },

    async findBillingPaymentStateForUpdate(creditGrantId) {
      const state = billingPaymentStates.find(
        (candidate) => candidate.creditGrantId === creditGrantId
      );
      return state ? cloneBillingPaymentState(state) : null;
    },

    async updateBillingPaymentState(stateId, input) {
      const state = billingPaymentStates.find(
        (candidate) => candidate.id === stateId
      );
      if (!state) {
        throw new Error(`Billing payment state ${stateId} was not found`);
      }
      Object.assign(state, input, { updatedAt: new Date() });
      return cloneBillingPaymentState(state);
    },

    async updatePaymentHistoryStatus() {},
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

function assertRolloverLotBalances(lot: LedgerRolloverLot): void {
  if (
    lot.originalCredits <= 0 ||
    lot.remainingCredits < 0 ||
    lot.reservedCredits < 0 ||
    lot.consumedCredits < 0 ||
    lot.revokedCredits < 0 ||
    lot.remainingCredits +
      lot.reservedCredits +
      lot.consumedCredits +
      lot.revokedCredits !==
      lot.originalCredits
  ) {
    throw new Error("credit_rollover_provenance_required");
  }
}

function assertBillingAdjustmentMatches(
  adjustment: LedgerBillingAdjustment,
  input: RevokePaidGrantInput,
  direction: BillingAdjustmentDirection = "withdraw"
): void {
  if (
    adjustment.userId !== input.userId ||
    adjustment.adjustmentType !== input.adjustmentType ||
    adjustment.direction !== direction ||
    adjustment.paymentHistoryId !== (input.paymentHistoryId ?? null) ||
    adjustment.amountInCents !== (input.amountInCents ?? null) ||
    adjustment.currency !== (input.currency ?? null)
  ) {
    throw new Error("billing_adjustment_idempotency_conflict");
  }
}

function derivePaymentHistoryStatus(
  adjustments: LedgerBillingAdjustment[],
  sourcePaymentAmountInCents: number | null
): "succeeded" | "partially_refunded" | "refunded" | "disputed" {
  const reinstatedProviderIds = new Set(
    adjustments
      .filter((adjustment) => adjustment.direction === "reinstate")
      .map((adjustment) => adjustment.providerAdjustmentId)
  );
  const activeWithdrawals = adjustments.filter(
    (adjustment) =>
      adjustment.direction === "withdraw" &&
      !reinstatedProviderIds.has(adjustment.providerAdjustmentId)
  );
  if (
    activeWithdrawals.some(
      (adjustment) => adjustment.adjustmentType === "dispute"
    )
  ) {
    return "disputed";
  }
  const refundedAmount = sumBy(
    activeWithdrawals.filter(
      (adjustment) => adjustment.adjustmentType === "refund"
    ),
    (adjustment) => adjustment.amountInCents ?? 0
  );
  if (refundedAmount <= 0) return "succeeded";
  return sourcePaymentAmountInCents !== null &&
    refundedAmount >= sourcePaymentAmountInCents
    ? "refunded"
    : "partially_refunded";
}

type BillingStateSnapshot = Pick<
  LedgerBillingPaymentState,
  | "targetCredits"
  | "revokedCredits"
  | "unrecoverableCredits"
  | "consumedCredits"
>;

interface BillingStateReconciliationResult {
  state: LedgerBillingPaymentState;
  before: BillingStateSnapshot;
  after: BillingStateSnapshot;
  frozenGrantCredits: number;
  frozenAllocationCredits: number;
  restoredGrantCredits: number;
  restoredAllocationCredits: number;
}

async function listPaymentAdjustmentsForUpdate(
  transaction: CreditLedgerTransaction,
  sourceGrant: LedgerCreditGrant,
  paymentHistoryId: string | null
): Promise<LedgerBillingAdjustment[]> {
  return paymentHistoryId
    ? transaction.listBillingAdjustmentsForPaymentForUpdate(paymentHistoryId)
    : transaction.listBillingAdjustmentsForGrantForUpdate(sourceGrant.id);
}

function createProspectiveBillingAdjustment(
  input: RevokePaidGrantInput,
  sourceGrant: LedgerCreditGrant,
  direction: BillingAdjustmentDirection,
  createdAt: Date,
  withdrawal?: LedgerBillingAdjustment | null
): LedgerBillingAdjustment {
  return {
    id: `prospective:${input.providerAdjustmentId}:${direction}`,
    userId: input.userId,
    paymentHistoryId: input.paymentHistoryId ?? null,
    creditGrantId: sourceGrant.id,
    stripeEventId: input.stripeEventId,
    providerAdjustmentId: input.providerAdjustmentId,
    adjustmentType: input.adjustmentType,
    direction,
    amountInCents: input.amountInCents ?? withdrawal?.amountInCents ?? null,
    currency: input.currency ?? withdrawal?.currency ?? null,
    sourceCredits: sourceGrant.originalCredits,
    remainingCredits: 0,
    reservedCredits: 0,
    consumedCredits: 0,
    revokedCredits: 0,
    unrecoverableCredits: 0,
    metadata: input.metadata ?? null,
    createdAt,
  };
}

function toBillingAdjustmentInput(
  adjustment: LedgerBillingAdjustment
): Omit<LedgerBillingAdjustment, "id" | "createdAt"> {
  const { id: _id, createdAt: _createdAt, ...input } = adjustment;
  void _id;
  void _createdAt;
  return input;
}

async function updatePaymentHistoryAfterAdjustment(input: {
  transaction: CreditLedgerTransaction;
  paymentHistoryId: string | null;
  sourcePaymentAmountInCents: number | null;
}): Promise<void> {
  if (!input.paymentHistoryId) return;
  await input.transaction.updatePaymentHistoryStatus(
    input.paymentHistoryId,
    derivePaymentHistoryStatus(
      await input.transaction.listBillingAdjustmentsForPaymentForUpdate(
        input.paymentHistoryId
      ),
      input.sourcePaymentAmountInCents
    )
  );
}

function calculateAggregateReversalTarget(input: {
  sourceCredits: number;
  sourcePaymentAmountInCents: number | null;
  adjustments: LedgerBillingAdjustment[];
}): number {
  const reinstatedProviderIds = new Set(
    input.adjustments
      .filter((adjustment) => adjustment.direction === "reinstate")
      .map((adjustment) => adjustment.providerAdjustmentId)
  );
  const activeWithdrawals = input.adjustments.filter(
    (adjustment) =>
      adjustment.direction === "withdraw" &&
      !reinstatedProviderIds.has(adjustment.providerAdjustmentId)
  );
  if (activeWithdrawals.length === 0) return 0;
  if (input.sourcePaymentAmountInCents === null) {
    if (
      activeWithdrawals.some((adjustment) => adjustment.amountInCents !== null)
    ) {
      throw new Error("billing_adjustment_amount_required");
    }
    return input.sourceCredits;
  }
  if (
    !Number.isSafeInteger(input.sourcePaymentAmountInCents) ||
    input.sourcePaymentAmountInCents <= 0 ||
    activeWithdrawals.some(
      (adjustment) =>
        !Number.isSafeInteger(adjustment.amountInCents) ||
        (adjustment.amountInCents ?? 0) <= 0
    )
  ) {
    throw new Error("billing_adjustment_amount_required");
  }
  const activeAmount = Math.min(
    input.sourcePaymentAmountInCents,
    sumBy(activeWithdrawals, (adjustment) => adjustment.amountInCents ?? 0)
  );
  return Math.floor(
    (activeAmount * input.sourceCredits) / input.sourcePaymentAmountInCents
  );
}

function mergeGrantRevocations(
  revocations: GrantRevocationEvidence[]
): GrantRevocationEvidence[] {
  const byProvenance = new Map<string, GrantRevocationEvidence>();
  for (const revocation of revocations) {
    const key = `${revocation.grantId}:${revocation.rolloverLotId ?? ""}`;
    const current = byProvenance.get(key);
    byProvenance.set(key, {
      grantId: revocation.grantId,
      ...(revocation.rolloverLotId
        ? { rolloverLotId: revocation.rolloverLotId }
        : {}),
      credits: (current?.credits ?? 0) + revocation.credits,
    });
  }
  return [...byProvenance.values()]
    .filter((revocation) => revocation.credits > 0)
    .sort((left, right) =>
      `${left.grantId}:${left.rolloverLotId ?? ""}`.localeCompare(
        `${right.grantId}:${right.rolloverLotId ?? ""}`
      )
    );
}

function mergeAllocationRevocations(
  revocations: AllocationRevocationEvidence[]
): AllocationRevocationEvidence[] {
  const byAllocation = new Map<string, AllocationRevocationEvidence>();
  for (const revocation of revocations) {
    const key = `${revocation.allocationId}:${revocation.rolloverLotAllocationId ?? ""}`;
    const current = byAllocation.get(key);
    byAllocation.set(key, {
      allocationId: revocation.allocationId,
      grantId: revocation.grantId,
      ...(revocation.rolloverLotAllocationId
        ? { rolloverLotAllocationId: revocation.rolloverLotAllocationId }
        : {}),
      credits: (current?.credits ?? 0) + revocation.credits,
    });
  }
  return [...byAllocation.values()]
    .filter((revocation) => revocation.credits > 0)
    .sort((left, right) =>
      `${left.allocationId}:${left.rolloverLotAllocationId ?? ""}`.localeCompare(
        `${right.allocationId}:${right.rolloverLotAllocationId ?? ""}`
      )
    );
}

async function reconcileBillingPaymentState(input: {
  transaction: CreditLedgerTransaction;
  userId: string;
  sourceGrant: LedgerCreditGrant;
  paymentHistoryId: string | null;
  sourcePaymentAmountInCents: number | null;
  adjustments: LedgerBillingAdjustment[];
  providerAdjustmentId: string;
  direction: BillingAdjustmentDirection;
  adjustedAt: Date;
}): Promise<BillingStateReconciliationResult> {
  const existingState =
    await input.transaction.findBillingPaymentStateForUpdate(
      input.sourceGrant.id
    );
  if (
    existingState &&
    (existingState.userId !== input.userId ||
      existingState.paymentHistoryId !== input.paymentHistoryId ||
      existingState.sourceCredits !== input.sourceGrant.originalCredits)
  ) {
    throw new Error("billing_adjustment_correlation_required");
  }
  if (
    input.adjustments.some(
      (adjustment) =>
        adjustment.userId !== input.userId ||
        adjustment.creditGrantId !== input.sourceGrant.id ||
        adjustment.paymentHistoryId !== input.paymentHistoryId
    )
  ) {
    throw new Error("billing_adjustment_correlation_required");
  }

  const before: BillingStateSnapshot = existingState
    ? {
        targetCredits: existingState.targetCredits,
        revokedCredits: existingState.revokedCredits,
        unrecoverableCredits: existingState.unrecoverableCredits,
        consumedCredits: existingState.consumedCredits,
      }
    : {
        targetCredits: 0,
        revokedCredits: 0,
        unrecoverableCredits: 0,
        consumedCredits: 0,
      };
  const grants = await input.transaction.listUserGrantsForUpdate(input.userId);
  const grantsById = new Map(grants.map((grant) => [grant.id, grant]));
  const reservations = await input.transaction.listUserReservationsForUpdate(
    input.userId
  );
  const reservationByAllocation = new Map<string, LedgerCreditReservation>();
  const allocationsById = new Map<string, LedgerReservationAllocation>();
  const rolloverLotAllocationsById = new Map<
    string,
    LedgerRolloverLotAllocation
  >();
  const rolloverLotAllocationsByAllocation = new Map<
    string,
    LedgerRolloverLotAllocation[]
  >();
  const rolloverLotsById = new Map<string, LedgerRolloverLot>();
  const reservationsWithConsumeEvidence = new Set<string>();
  for (const reservation of reservations) {
    if (
      reservation.status === "consumed" ||
      (
        await input.transaction.listTerminalTransactionsByReservationForUpdate(
          reservation.id
        )
      ).some((transaction) => transaction.type === "consume")
    ) {
      reservationsWithConsumeEvidence.add(reservation.id);
    }
    for (const allocation of await input.transaction.listAllocationsForUpdate(
      reservation.id
    )) {
      reservationByAllocation.set(allocation.id, reservation);
      allocationsById.set(allocation.id, allocation);
      const grant = grantsById.get(allocation.grantId);
      if (grant?.source === "rollover") {
        const lots = await input.transaction.listRolloverLotsForGrantForUpdate(
          grant.id
        );
        for (const lot of lots) rolloverLotsById.set(lot.id, lot);
        const lotAllocations =
          await input.transaction.listRolloverLotAllocationsForReservationGrantForUpdate(
            allocation.id
          );
        if (
          lotAllocations.length === 0 ||
          sumBy(lotAllocations, (entry) => entry.credits) !==
            allocation.credits ||
          sumBy(lotAllocations, (entry) => entry.revokedCredits) !==
            allocation.revokedCredits ||
          lotAllocations.some(
            (entry) =>
              rolloverLotsById.get(entry.rolloverLotId)?.rolloverGrantId !==
              grant.id
          )
        ) {
          throw new Error("credit_rollover_provenance_required");
        }
        rolloverLotAllocationsByAllocation.set(allocation.id, lotAllocations);
        for (const entry of lotAllocations) {
          rolloverLotAllocationsById.set(entry.id, entry);
        }
      }
    }
  }

  const sourceRolloverLots =
    await input.transaction.listRolloverLotsForSourceForUpdate(
      input.sourceGrant.id
    );
  for (const lot of sourceRolloverLots) {
    assertRolloverLotBalances(lot);
    if (
      lot.userId !== input.userId ||
      grantsById.get(lot.rolloverGrantId)?.source !== "rollover"
    ) {
      throw new Error("billing_adjustment_correlation_required");
    }
    rolloverLotsById.set(lot.id, lot);
  }

  let directConsumedCredits = 0;
  for (const [allocationId, reservation] of reservationByAllocation) {
    const allocation = allocationsById.get(allocationId);
    if (!allocation) throw new Error("credit_ledger_reconciliation_required");
    const consumedCredits =
      reservation.status === "consumed"
        ? allocation.credits
        : reservation.status === "refunded" &&
            reservationsWithConsumeEvidence.has(reservation.id)
          ? allocation.revokedCredits
          : 0;
    if (consumedCredits === 0) continue;
    if (allocation.grantId === input.sourceGrant.id) {
      directConsumedCredits += consumedCredits;
    }
  }
  const sourceConsumedCredits = Math.min(
    input.sourceGrant.originalCredits,
    directConsumedCredits +
      sumBy(sourceRolloverLots, (lot) => lot.consumedCredits)
  );

  let grantRevocations = mergeGrantRevocations(
    existingState?.grantRevocations ?? []
  );
  let allocationRevocations = mergeAllocationRevocations(
    existingState?.allocationRevocations ?? []
  ).filter((revocation) => {
    const reservation = reservationByAllocation.get(revocation.allocationId);
    return (
      reservation?.status !== "consumed" &&
      !(
        reservation?.status === "refunded" &&
        reservationsWithConsumeEvidence.has(reservation.id)
      )
    );
  });
  const physicalLotRevocations = new Map<string, number>();
  for (const revocation of grantRevocations) {
    if (!revocation.rolloverLotId) continue;
    physicalLotRevocations.set(
      revocation.rolloverLotId,
      (physicalLotRevocations.get(revocation.rolloverLotId) ?? 0) +
        revocation.credits
    );
  }
  for (const revocation of allocationRevocations) {
    if (!revocation.rolloverLotAllocationId) continue;
    const reservation = reservationByAllocation.get(revocation.allocationId);
    if (reservation?.status === "active") continue;
    const lotAllocation = rolloverLotAllocationsById.get(
      revocation.rolloverLotAllocationId
    );
    if (!lotAllocation) throw new Error("credit_rollover_provenance_required");
    physicalLotRevocations.set(
      lotAllocation.rolloverLotId,
      (physicalLotRevocations.get(lotAllocation.rolloverLotId) ?? 0) +
        revocation.credits
    );
  }
  const unavailableLotCredits = sumBy(sourceRolloverLots, (lot) =>
    Math.max(0, lot.revokedCredits - (physicalLotRevocations.get(lot.id) ?? 0))
  );
  const directPhysicalRevocations =
    sumBy(
      grantRevocations.filter(
        (revocation) =>
          revocation.grantId === input.sourceGrant.id &&
          !revocation.rolloverLotId
      ),
      (revocation) => revocation.credits
    ) +
    sumBy(
      allocationRevocations.filter((revocation) => {
        if (
          revocation.grantId !== input.sourceGrant.id ||
          revocation.rolloverLotAllocationId
        ) {
          return false;
        }
        return (
          reservationByAllocation.get(revocation.allocationId)?.status !==
          "active"
        );
      }),
      (revocation) => revocation.credits
    );
  const directUnavailableCredits = Math.max(
    0,
    input.sourceGrant.originalCredits -
      directConsumedCredits -
      sumBy(sourceRolloverLots, (lot) => lot.originalCredits) -
      input.sourceGrant.remainingCredits -
      input.sourceGrant.reservedCredits -
      directPhysicalRevocations
  );
  const targetCredits = calculateAggregateReversalTarget({
    sourceCredits: input.sourceGrant.originalCredits,
    sourcePaymentAmountInCents: input.sourcePaymentAmountInCents,
    adjustments: input.adjustments,
  });
  const unrecoverableCredits = Math.min(
    targetCredits,
    sourceConsumedCredits + unavailableLotCredits + directUnavailableCredits
  );
  const desiredRevokedCredits = targetCredits - unrecoverableCredits;
  let currentRevokedCredits =
    sumBy(grantRevocations, (revocation) => revocation.credits) +
    sumBy(allocationRevocations, (revocation) => revocation.credits);
  let restoredGrantCredits = 0;
  let restoredAllocationCredits = 0;
  let frozenGrantCredits = 0;
  let frozenAllocationCredits = 0;
  const transactionKey = (action: string, evidenceId: string) =>
    `billing-state:${input.sourceGrant.id}:${input.providerAdjustmentId}:${input.direction}:${action}:${evidenceId}`;

  if (currentRevokedCredits > desiredRevokedCredits) {
    let releaseBudget = currentRevokedCredits - desiredRevokedCredits;
    const retainedGrantRevocations: GrantRevocationEvidence[] = [];
    for (const revocation of grantRevocations) {
      const released = Math.min(revocation.credits, releaseBudget);
      if (released > 0) {
        const grant = grantsById.get(revocation.grantId);
        if (!grant) throw new Error("credit_ledger_reconciliation_required");
        let evidenceId = grant.id;
        if (revocation.rolloverLotId) {
          const lot = rolloverLotsById.get(revocation.rolloverLotId);
          if (
            !lot ||
            lot.sourceGrantId !== input.sourceGrant.id ||
            lot.rolloverGrantId !== grant.id ||
            lot.revokedCredits < released
          ) {
            throw new Error("credit_rollover_provenance_required");
          }
          const nextLot = await input.transaction.updateRolloverLotBalances(
            lot.id,
            {
              remainingCredits: lot.remainingCredits + released,
              reservedCredits: lot.reservedCredits,
              consumedCredits: lot.consumedCredits,
              revokedCredits: lot.revokedCredits - released,
            }
          );
          assertRolloverLotBalances(nextLot);
          rolloverLotsById.set(nextLot.id, nextLot);
          evidenceId = lot.id;
        } else if (grant.id !== input.sourceGrant.id) {
          throw new Error("credit_rollover_provenance_required");
        }
        const next = await input.transaction.updateGrantBalances(grant.id, {
          remainingCredits: grant.remainingCredits + released,
          reservedCredits: grant.reservedCredits,
        });
        grantsById.set(grant.id, next);
        await createAndValidateTransaction(input.transaction, {
          userId: input.userId,
          grantId: grant.id,
          reservationId: null,
          type: "adjustment",
          credits: released,
          idempotencyKey: transactionKey("restore-grant", evidenceId),
          sourceId: input.providerAdjustmentId,
          balanceAfter: next.remainingCredits,
          metadata: { direction: "reinstate", aggregatePaymentState: true },
        });
        restoredGrantCredits += released;
        releaseBudget -= released;
      }
      if (revocation.credits > released) {
        retainedGrantRevocations.push({
          ...revocation,
          credits: revocation.credits - released,
        });
      }
    }
    grantRevocations = retainedGrantRevocations;

    const retainedAllocationRevocations: AllocationRevocationEvidence[] = [];
    for (const revocation of allocationRevocations) {
      const released = Math.min(revocation.credits, releaseBudget);
      if (released > 0) {
        const allocation = allocationsById.get(revocation.allocationId);
        const reservation = reservationByAllocation.get(
          revocation.allocationId
        );
        if (
          !allocation ||
          !reservation ||
          allocation.revokedCredits < released
        ) {
          throw new Error("credit_ledger_reconciliation_required");
        }
        let evidenceId = allocation.id;
        const rolloverLotAllocation = revocation.rolloverLotAllocationId
          ? rolloverLotAllocationsById.get(revocation.rolloverLotAllocationId)
          : null;
        const rolloverLot = rolloverLotAllocation
          ? rolloverLotsById.get(rolloverLotAllocation.rolloverLotId)
          : null;
        if (
          revocation.rolloverLotAllocationId &&
          (!rolloverLotAllocation ||
            !rolloverLot ||
            rolloverLotAllocation.reservationGrantId !== allocation.id ||
            rolloverLot.sourceGrantId !== input.sourceGrant.id ||
            rolloverLot.rolloverGrantId !== allocation.grantId ||
            rolloverLotAllocation.revokedCredits < released)
        ) {
          throw new Error("credit_rollover_provenance_required");
        }
        if (
          !revocation.rolloverLotAllocationId &&
          allocation.grantId !== input.sourceGrant.id
        ) {
          throw new Error("credit_rollover_provenance_required");
        }
        if (reservation.status === "active") {
          const nextAllocation =
            await input.transaction.updateAllocationRevokedCredits(
              allocation.id,
              allocation.revokedCredits - released
            );
          allocationsById.set(allocation.id, nextAllocation);
          if (rolloverLotAllocation) {
            const nextLotAllocation =
              await input.transaction.updateRolloverLotAllocationRevokedCredits(
                rolloverLotAllocation.id,
                rolloverLotAllocation.revokedCredits - released
              );
            rolloverLotAllocationsById.set(
              nextLotAllocation.id,
              nextLotAllocation
            );
            evidenceId = rolloverLotAllocation.id;
          }
        } else {
          const grant = grantsById.get(allocation.grantId);
          if (!grant) throw new Error("credit_ledger_reconciliation_required");
          if (rolloverLotAllocation && rolloverLot) {
            if (rolloverLot.revokedCredits < released) {
              throw new Error("credit_rollover_provenance_required");
            }
            const nextLot = await input.transaction.updateRolloverLotBalances(
              rolloverLot.id,
              {
                remainingCredits: rolloverLot.remainingCredits + released,
                reservedCredits: rolloverLot.reservedCredits,
                consumedCredits: rolloverLot.consumedCredits,
                revokedCredits: rolloverLot.revokedCredits - released,
              }
            );
            assertRolloverLotBalances(nextLot);
            rolloverLotsById.set(nextLot.id, nextLot);
            evidenceId = rolloverLotAllocation.id;
          }
          const next = await input.transaction.updateGrantBalances(grant.id, {
            remainingCredits: grant.remainingCredits + released,
            reservedCredits: grant.reservedCredits,
          });
          grantsById.set(grant.id, next);
          await createAndValidateTransaction(input.transaction, {
            userId: input.userId,
            grantId: grant.id,
            reservationId: reservation.id,
            type: "adjustment",
            credits: released,
            idempotencyKey: transactionKey("restore-allocation", evidenceId),
            sourceId: input.providerAdjustmentId,
            balanceAfter: next.remainingCredits,
            metadata: { direction: "reinstate", aggregatePaymentState: true },
          });
        }
        restoredAllocationCredits += released;
        releaseBudget -= released;
      }
      if (revocation.credits > released) {
        retainedAllocationRevocations.push({
          ...revocation,
          credits: revocation.credits - released,
        });
      }
    }
    allocationRevocations = retainedAllocationRevocations;
    if (releaseBudget !== 0) {
      throw new Error("credit_ledger_reconciliation_required");
    }
    currentRevokedCredits = desiredRevokedCredits;
  }

  if (currentRevokedCredits < desiredRevokedCredits) {
    let freezeBudget = desiredRevokedCredits - currentRevokedCredits;
    const directGrant = grantsById.get(input.sourceGrant.id);
    if (!directGrant)
      throw new Error("billing_adjustment_correlation_required");
    const directAvailable = Math.min(
      freezeBudget,
      directGrant.remainingCredits
    );
    if (directAvailable > 0) {
      const next = await input.transaction.updateGrantBalances(directGrant.id, {
        remainingCredits: directGrant.remainingCredits - directAvailable,
        reservedCredits: directGrant.reservedCredits,
      });
      grantsById.set(next.id, next);
      grantRevocations.push({ grantId: next.id, credits: directAvailable });
      await createAndValidateTransaction(input.transaction, {
        userId: input.userId,
        grantId: next.id,
        reservationId: null,
        type: "adjustment",
        credits: directAvailable,
        idempotencyKey: transactionKey("freeze-grant", next.id),
        sourceId: input.providerAdjustmentId,
        balanceAfter: next.remainingCredits,
        metadata: { direction: "withdraw", aggregatePaymentState: true },
      });
      frozenGrantCredits += directAvailable;
      freezeBudget -= directAvailable;
    }
    for (const [allocationId, reservation] of reservationByAllocation) {
      if (freezeBudget === 0) break;
      if (reservation.status !== "active") continue;
      const allocation = allocationsById.get(allocationId);
      if (!allocation || allocation.grantId !== input.sourceGrant.id) continue;
      const credits = Math.min(
        freezeBudget,
        allocation.credits - allocation.revokedCredits
      );
      if (credits <= 0) continue;
      const nextAllocation =
        await input.transaction.updateAllocationRevokedCredits(
          allocation.id,
          allocation.revokedCredits + credits
        );
      allocationsById.set(nextAllocation.id, nextAllocation);
      allocationRevocations.push({
        allocationId: allocation.id,
        grantId: allocation.grantId,
        credits,
      });
      frozenAllocationCredits += credits;
      freezeBudget -= credits;
    }
    for (const sourceLot of sourceRolloverLots) {
      if (freezeBudget === 0) break;
      let lot = rolloverLotsById.get(sourceLot.id);
      if (!lot) throw new Error("credit_rollover_provenance_required");
      const grant = grantsById.get(lot.rolloverGrantId);
      if (!grant) throw new Error("credit_rollover_provenance_required");
      const fromAvailable = Math.min(freezeBudget, lot.remainingCredits);
      if (fromAvailable > 0) {
        const nextLot = await input.transaction.updateRolloverLotBalances(
          lot.id,
          {
            remainingCredits: lot.remainingCredits - fromAvailable,
            reservedCredits: lot.reservedCredits,
            consumedCredits: lot.consumedCredits,
            revokedCredits: lot.revokedCredits + fromAvailable,
          }
        );
        assertRolloverLotBalances(nextLot);
        rolloverLotsById.set(nextLot.id, nextLot);
        lot = nextLot;
        const nextGrant = await input.transaction.updateGrantBalances(
          grant.id,
          {
            remainingCredits: grant.remainingCredits - fromAvailable,
            reservedCredits: grant.reservedCredits,
          }
        );
        grantsById.set(nextGrant.id, nextGrant);
        grantRevocations.push({
          grantId: grant.id,
          rolloverLotId: lot.id,
          credits: fromAvailable,
        });
        await createAndValidateTransaction(input.transaction, {
          userId: input.userId,
          grantId: grant.id,
          reservationId: null,
          type: "adjustment",
          credits: fromAvailable,
          idempotencyKey: transactionKey("freeze-grant", lot.id),
          sourceId: input.providerAdjustmentId,
          balanceAfter: nextGrant.remainingCredits,
          metadata: { direction: "withdraw", aggregatePaymentState: true },
        });
        frozenGrantCredits += fromAvailable;
        freezeBudget -= fromAvailable;
      }
      for (const [allocationId, reservation] of reservationByAllocation) {
        if (freezeBudget === 0) break;
        if (reservation.status !== "active") continue;
        const allocation = allocationsById.get(allocationId);
        if (!allocation || allocation.grantId !== lot.rolloverGrantId) continue;
        const lotAllocations =
          rolloverLotAllocationsByAllocation.get(allocation.id) ?? [];
        const lotAllocation = lotAllocations.find(
          (entry) => entry.rolloverLotId === lot.id
        );
        if (!lotAllocation) continue;
        const currentLotAllocation =
          rolloverLotAllocationsById.get(lotAllocation.id) ?? lotAllocation;
        const credits = Math.min(
          freezeBudget,
          currentLotAllocation.credits - currentLotAllocation.revokedCredits
        );
        if (credits <= 0) continue;
        const nextLotAllocation =
          await input.transaction.updateRolloverLotAllocationRevokedCredits(
            currentLotAllocation.id,
            currentLotAllocation.revokedCredits + credits
          );
        rolloverLotAllocationsById.set(nextLotAllocation.id, nextLotAllocation);
        const nextAllocation =
          await input.transaction.updateAllocationRevokedCredits(
            allocation.id,
            allocation.revokedCredits + credits
          );
        allocationsById.set(nextAllocation.id, nextAllocation);
        allocationRevocations.push({
          allocationId: allocation.id,
          grantId: allocation.grantId,
          rolloverLotAllocationId: currentLotAllocation.id,
          credits,
        });
        frozenAllocationCredits += credits;
        freezeBudget -= credits;
      }
    }
    if (freezeBudget !== 0) {
      throw new Error("billing_adjustment_correlation_required");
    }
  }

  grantRevocations = mergeGrantRevocations(grantRevocations);
  allocationRevocations = mergeAllocationRevocations(allocationRevocations);
  const physicalRevokedCredits =
    sumBy(grantRevocations, (revocation) => revocation.credits) +
    sumBy(allocationRevocations, (revocation) => revocation.credits);
  if (physicalRevokedCredits !== desiredRevokedCredits) {
    throw new Error("credit_ledger_reconciliation_required");
  }

  const currentSourceGrant =
    await input.transaction.findGrantByIdempotencyKeyForUpdate(
      input.sourceGrant.idempotencyKey
    );
  if (!currentSourceGrant) {
    throw new Error("credit_ledger_reconciliation_required");
  }
  if (targetCredits === input.sourceGrant.originalCredits) {
    await input.transaction.revokeGrant(currentSourceGrant.id, {
      revokedAt: input.adjustedAt,
      revocationKey: `payment:${input.paymentHistoryId ?? input.sourceGrant.id}`,
      remainingCredits: currentSourceGrant.remainingCredits,
    });
  } else if (currentSourceGrant.revokedAt !== null) {
    await input.transaction.restoreGrant(currentSourceGrant.id, {
      remainingCredits: currentSourceGrant.remainingCredits,
      clearRevocation: true,
    });
  }

  const nextVersion = (existingState?.version ?? 0) + 1;
  const stateInput = {
    targetCredits,
    revokedCredits: desiredRevokedCredits,
    unrecoverableCredits,
    consumedCredits: unrecoverableCredits,
    grantRevocations,
    allocationRevocations,
    lastProviderAdjustmentId: input.providerAdjustmentId,
    version: nextVersion,
  };
  const state = existingState
    ? await input.transaction.updateBillingPaymentState(
        existingState.id,
        stateInput
      )
    : await input.transaction.createBillingPaymentState({
        userId: input.userId,
        paymentHistoryId: input.paymentHistoryId,
        creditGrantId: input.sourceGrant.id,
        sourceCredits: input.sourceGrant.originalCredits,
        ...stateInput,
      });
  const after: BillingStateSnapshot = {
    targetCredits: state.targetCredits,
    revokedCredits: state.revokedCredits,
    unrecoverableCredits: state.unrecoverableCredits,
    consumedCredits: state.consumedCredits,
  };
  return {
    state,
    before,
    after,
    frozenGrantCredits,
    frozenAllocationCredits,
    restoredGrantCredits,
    restoredAllocationCredits,
  };
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

export interface ReserveCreditTransactionResult extends ReserveCreditResult {
  events: Array<{
    grant: LedgerCreditGrant;
    credits: number;
    balanceAfter: number;
    transactionKey: string;
  }>;
}

/** Reserves credit after the caller has acquired the owning app_user lock. */
export async function reserveCreditInTransaction({
  store,
  input,
  currentTime: _currentTime,
}: {
  store: CreditLedgerTransaction;
  input: ReserveCreditInput;
  currentTime: Date;
}): Promise<ReserveCreditTransactionResult> {
  const requestedCredits = input.credits ?? 1;
  assertPositiveCredits(requestedCredits);
  const existing = await store.findReservationByKeyForUpdate(
    input.reservationKey
  );
  if (existing) {
    assertReservationMatchesRequest(existing, input, requestedCredits);
    const allocations = await assertReservationEvidence(store, existing);
    return { reservation: existing, allocations, events: [] };
  }

  await assertUserReservationIntegrity(store, input.userId);
  const subscriptionPolicy = await store.getSubscriptionCreditPolicyForUpdate(
    input.userId
  );
  // Authorization time is observed after the owning user and subscription
  // locks so a lock wait cannot spend credits at or beyond the paid cutoff.
  const authorizationTime = await store.getCurrentTime();
  const candidateGrants = await store.listSpendableGrantsForUpdate(
    input.userId,
    authorizationTime
  );
  const spendableGrants = candidateGrants.filter((grant) =>
    isCreditGrantAvailable(grant, authorizationTime, subscriptionPolicy)
  );
  const availableCredits = sumBy(
    spendableGrants,
    (grant) => grant.remainingCredits
  );
  if (availableCredits < requestedCredits) {
    throw new InsufficientCreditsError(availableCredits);
  }

  const reservation = await store.createReservation({
    userId: input.userId,
    reservationKey: input.reservationKey,
    status: "active",
    credits: requestedCredits,
    sessionId: input.sessionId ?? null,
    startContractVersion: input.startContractVersion ?? 0,
    startAttemptId: input.startAttemptId ?? null,
    expiresAt: input.expiresAt ?? addMinutes(authorizationTime, 30),
    metadata: input.metadata ?? null,
  });
  assertReservationMatchesRequest(reservation, input, requestedCredits);

  const allocations: LedgerReservationAllocation[] = [];
  const events: ReserveCreditTransactionResult["events"] = [];
  let remainingToReserve = requestedCredits;
  for (const grant of spendableGrants) {
    if (remainingToReserve === 0) break;
    const reservedFromGrant = Math.min(
      grant.remainingCredits,
      remainingToReserve
    );
    const updatedGrant = await store.updateGrantBalances(grant.id, {
      remainingCredits: grant.remainingCredits - reservedFromGrant,
      reservedCredits: grant.reservedCredits + reservedFromGrant,
    });
    const allocation = await store.createAllocation({
      reservationId: reservation.id,
      grantId: grant.id,
      credits: reservedFromGrant,
    });
    allocations.push(allocation);
    if (grant.source === "rollover") {
      const lots = await store.listRolloverLotsForGrantForUpdate(grant.id);
      if (
        lots.length === 0 ||
        sumBy(lots, (lot) => lot.remainingCredits) !== grant.remainingCredits ||
        sumBy(lots, (lot) => lot.reservedCredits) !== grant.reservedCredits
      ) {
        throw new Error("credit_rollover_provenance_required");
      }
      let remainingLotCredits = reservedFromGrant;
      for (const lot of lots) {
        if (remainingLotCredits === 0) break;
        assertRolloverLotBalances(lot);
        const credits = Math.min(lot.remainingCredits, remainingLotCredits);
        if (credits === 0) continue;
        const nextLot = await store.updateRolloverLotBalances(lot.id, {
          remainingCredits: lot.remainingCredits - credits,
          reservedCredits: lot.reservedCredits + credits,
          consumedCredits: lot.consumedCredits,
          revokedCredits: lot.revokedCredits,
        });
        assertRolloverLotBalances(nextLot);
        await store.createRolloverLotAllocation({
          reservationGrantId: allocation.id,
          rolloverLotId: lot.id,
          credits,
          revokedCredits: 0,
        });
        remainingLotCredits -= credits;
      }
      if (remainingLotCredits !== 0) {
        throw new Error("credit_rollover_provenance_required");
      }
      const nextLots = await store.listRolloverLotsForGrantForUpdate(grant.id);
      if (
        sumBy(nextLots, (lot) => lot.remainingCredits) !==
          updatedGrant.remainingCredits ||
        sumBy(nextLots, (lot) => lot.reservedCredits) !==
          updatedGrant.reservedCredits
      ) {
        throw new Error("credit_rollover_provenance_required");
      }
    }
    const transactionKey = `reserve:${input.reservationKey}:${grant.id}`;
    await createAndValidateTransaction(store, {
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
  await assertReservationEvidence(store, reservation);
  await assertUserReservationIntegrity(store, input.userId);
  return { reservation, allocations, events };
}

export function trackReservedCreditEvents(
  input: ReserveCreditInput,
  result: ReserveCreditTransactionResult
): void {
  for (const event of result.events) {
    trackBillingCreditReserved({
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
    allocation: LedgerReservationAllocation;
  }): Pick<LedgerCreditGrant, "remainingCredits" | "reservedCredits">;
}): Promise<CompleteReservationResult> {
  const ownerLookup = await store.findReservationByKey(reservationKey);
  if (!ownerLookup) {
    throw new Error(`Credit reservation ${reservationKey} was not found`);
  }
  const outcome = await store.withUserTransaction(
    ownerLookup.userId,
    (transaction) =>
      settleReservationInTransaction({
        store: transaction,
        expectedUserId: ownerLookup.userId,
        reservationKey,
        idempotencyKey,
        nextStatus,
        transactionType,
        applyAllocation,
      })
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

export interface ReservationSettlementTransactionOutcome {
  reservation: LedgerCreditReservation;
  firstGrant: LedgerCreditGrant | null;
  duplicate: boolean;
  makeGoodGrant: LedgerCreditGrant | null;
}

/**
 * Settles a reservation after the caller has acquired the owning app_user lock.
 * This is intentionally transaction-scoped so durable interview evidence and
 * the ledger terminal action can commit together.
 */
export async function settleReservationInTransaction({
  store,
  expectedUserId,
  reservationKey,
  idempotencyKey,
  action,
  currentTime = new Date(),
  nextStatus = action === "consume"
    ? "consumed"
    : action === "refund"
      ? "refunded"
      : "released",
  transactionType = action ?? "release",
  applyAllocation = action === "consume"
    ? ({ grant, allocation }) => ({
        remainingCredits: grant.remainingCredits,
        reservedCredits: grant.reservedCredits - allocation.credits,
      })
    : action === "refund"
      ? ({ grant, allocation }) => ({
          remainingCredits:
            grant.revokedAt !== null ||
            (grant.expiresAt !== null && grant.expiresAt <= currentTime)
              ? grant.remainingCredits
              : grant.remainingCredits +
                allocation.credits -
                allocation.revokedCredits,
          reservedCredits: grant.reservedCredits,
        })
      : ({ grant, allocation }) => ({
          remainingCredits:
            grant.revokedAt !== null
              ? grant.remainingCredits
              : grant.remainingCredits +
                allocation.credits -
                allocation.revokedCredits,
          reservedCredits: grant.reservedCredits - allocation.credits,
        }),
}: {
  store: CreditLedgerTransaction;
  expectedUserId: string;
  reservationKey: string;
  idempotencyKey: string;
  action?: "consume" | "release" | "refund";
  currentTime?: Date;
  nextStatus?: CreditReservationStatus;
  transactionType?: CreditTransactionType;
  applyAllocation?: (input: {
    grant: LedgerCreditGrant;
    allocation: LedgerReservationAllocation;
  }) => Pick<LedgerCreditGrant, "remainingCredits" | "reservedCredits">;
}): Promise<ReservationSettlementTransactionOutcome> {
  const reservation = await store.findReservationByKeyForUpdate(reservationKey);
  if (!reservation || reservation.userId !== expectedUserId) {
    throw new Error("credit_reservation_idempotency_conflict");
  }

  await assertUserReservationIntegrity(store, reservation.userId);
  const allocations = await assertReservationEvidence(store, reservation);
  const userGrants = await store.listUserGrantsForUpdate(reservation.userId);
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
    await store.listTerminalTransactionsByReservationForUpdate(reservation.id);
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
    await store.findTransactionByIdempotencyKeyForUpdate(idempotencyKey);

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
      makeGoodGrant:
        transactionType === "refund"
          ? await findRefundMakeGoodGrant({
              store,
              reservation,
              allocations,
              grantsById,
              idempotencyKey,
            })
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
    const balances = applyAllocation({ grant, allocation });
    assertGrantBalances(grant, balances);
    const updatedGrant = await store.updateGrantBalances(
      allocation.grantId,
      balances
    );
    grantsById.set(updatedGrant.id, updatedGrant);

    if (grant.source === "rollover") {
      const lots = await store.listRolloverLotsForGrantForUpdate(grant.id);
      const lotsById = new Map(lots.map((lot) => [lot.id, lot]));
      const lotAllocations =
        await store.listRolloverLotAllocationsForReservationGrantForUpdate(
          allocation.id
        );
      if (
        lotAllocations.length === 0 ||
        sumBy(lotAllocations, (entry) => entry.credits) !==
          allocation.credits ||
        sumBy(lotAllocations, (entry) => entry.revokedCredits) !==
          allocation.revokedCredits
      ) {
        throw new Error("credit_rollover_provenance_required");
      }
      for (const lotAllocation of lotAllocations) {
        const lot = lotsById.get(lotAllocation.rolloverLotId);
        if (
          !lot ||
          (reservation.status === "active" &&
            lot.reservedCredits < lotAllocation.credits)
        ) {
          throw new Error("credit_rollover_provenance_required");
        }
        let remainingCredits = lot.remainingCredits;
        let reservedCredits = lot.reservedCredits;
        let consumedCredits = lot.consumedCredits;
        let revokedCredits = lot.revokedCredits;
        if (reservation.status === "active" && nextStatus === "consumed") {
          reservedCredits -= lotAllocation.credits;
          consumedCredits += lotAllocation.credits;
        } else if (
          reservation.status === "active" &&
          nextStatus === "released"
        ) {
          const restored =
            grant.revokedAt === null
              ? lotAllocation.credits - lotAllocation.revokedCredits
              : 0;
          reservedCredits -= lotAllocation.credits;
          remainingCredits += restored;
          revokedCredits += lotAllocation.credits - restored;
        } else if (
          reservation.status === "consumed" &&
          nextStatus === "refunded"
        ) {
          const restored =
            grant.revokedAt === null &&
            (grant.expiresAt === null || grant.expiresAt > currentTime)
              ? lotAllocation.credits - lotAllocation.revokedCredits
              : 0;
          if (consumedCredits < restored) {
            throw new Error("credit_rollover_provenance_required");
          }
          consumedCredits -= restored;
          remainingCredits += restored;
        } else {
          throw new Error("credit_rollover_provenance_required");
        }
        const nextLot = await store.updateRolloverLotBalances(lot.id, {
          remainingCredits,
          reservedCredits,
          consumedCredits,
          revokedCredits,
        });
        assertRolloverLotBalances(nextLot);
        lotsById.set(nextLot.id, nextLot);
      }
      if (
        sumBy([...lotsById.values()], (lot) => lot.remainingCredits) !==
          updatedGrant.remainingCredits ||
        sumBy([...lotsById.values()], (lot) => lot.reservedCredits) !==
          updatedGrant.reservedCredits
      ) {
        throw new Error("credit_rollover_provenance_required");
      }
    }
  }

  const makeGoodGrant =
    transactionType === "refund"
      ? await createRefundMakeGoodGrant({
          store,
          reservation,
          allocations,
          grantsById,
          idempotencyKey,
          currentTime,
        })
      : null;

  const updatedReservation = await store.updateReservationStatus(
    reservation.id,
    nextStatus
  );
  await createAndValidateTransaction(store, transactionInput);
  assertReservationTerminalHistory(
    updatedReservation,
    allocations,
    await store.listTerminalTransactionsByReservationForUpdate(reservation.id)
  );
  await assertUserReservationIntegrity(store, reservation.userId);

  return {
    reservation: updatedReservation,
    duplicate: false,
    firstGrant: allocations[0]
      ? (grantsById.get(allocations[0].grantId) ?? null)
      : null,
    makeGoodGrant,
  };
}

async function createRefundMakeGoodGrant(input: {
  store: CreditLedgerTransaction;
  reservation: LedgerCreditReservation;
  allocations: LedgerReservationAllocation[];
  grantsById: Map<string, LedgerCreditGrant>;
  idempotencyKey: string;
  currentTime: Date;
}): Promise<LedgerCreditGrant | null> {
  const expiredAllocations = input.allocations.filter((allocation) => {
    const grant = input.grantsById.get(allocation.grantId);
    return (
      grant !== undefined &&
      grant.revokedAt === null &&
      grant.expiresAt !== null &&
      grant.expiresAt <= input.currentTime &&
      allocation.credits > allocation.revokedCredits
    );
  });
  if (expiredAllocations.length === 0) return null;
  if (expiredAllocations.length !== 1) {
    throw new Error("credit_refund_make_good_ambiguous");
  }

  const allocation = expiredAllocations[0]!;
  const sourceGrant = input.grantsById.get(allocation.grantId);
  if (!sourceGrant) throw new Error("credit_ledger_reconciliation_required");
  const grantKey = `make-good:${input.idempotencyKey}:${sourceGrant.id}`;
  const metadata = {
    policyVersion: "interview-credit-recovery.v1",
    reservationId: input.reservation.id,
    sourceGrantId: sourceGrant.id,
  };
  const grantInput = {
    userId: input.reservation.userId,
    catalogId: sourceGrant.catalogId,
    source: "refund" as const,
    sourceId: input.reservation.sessionId,
    idempotencyKey: grantKey,
    originalCredits: allocation.credits - allocation.revokedCredits,
    remainingCredits: allocation.credits - allocation.revokedCredits,
    reservedCredits: 0,
    expiresAt: null,
    rolloverEligible: false,
    rolloverSourceGrantId: null,
    metadata,
  };
  const grant = await input.store.createGrant(grantInput);
  assertMakeGoodGrantMatches(grant, grantInput);
  await createAndValidateTransaction(input.store, {
    userId: grant.userId,
    grantId: grant.id,
    reservationId: null,
    type: "grant",
    credits: grant.originalCredits,
    idempotencyKey: `${grantKey}:grant`,
    sourceId: input.reservation.sessionId,
    balanceAfter: grant.remainingCredits,
    metadata,
  });
  return grant;
}

async function findRefundMakeGoodGrant(input: {
  store: CreditLedgerTransaction;
  reservation: LedgerCreditReservation;
  allocations: LedgerReservationAllocation[];
  grantsById: Map<string, LedgerCreditGrant>;
  idempotencyKey: string;
}): Promise<LedgerCreditGrant | null> {
  const matches: LedgerCreditGrant[] = [];
  for (const allocation of input.allocations) {
    const source = input.grantsById.get(allocation.grantId);
    if (!source) throw new Error("credit_ledger_reconciliation_required");
    const key = `make-good:${input.idempotencyKey}:${source.id}`;
    const grant = await input.store.findGrantByIdempotencyKeyForUpdate(key);
    if (grant) {
      const metadata = {
        policyVersion: "interview-credit-recovery.v1",
        reservationId: input.reservation.id,
        sourceGrantId: source.id,
      };
      assertMakeGoodGrantMatches(grant, {
        userId: input.reservation.userId,
        catalogId: source.catalogId,
        source: "refund",
        sourceId: input.reservation.sessionId,
        idempotencyKey: key,
        originalCredits: allocation.credits,
        remainingCredits: allocation.credits,
        reservedCredits: 0,
        expiresAt: null,
        rolloverEligible: false,
        rolloverSourceGrantId: null,
        metadata,
      });
      const transaction =
        await input.store.findTransactionByIdempotencyKeyForUpdate(
          `${key}:grant`
        );
      if (!transaction) {
        throw new Error("credit_ledger_reconciliation_required");
      }
      assertTransactionMatchesRequest(transaction, {
        userId: grant.userId,
        grantId: grant.id,
        reservationId: null,
        type: "grant",
        credits: grant.originalCredits,
        idempotencyKey: `${key}:grant`,
        sourceId: input.reservation.sessionId,
        balanceAfter: grant.remainingCredits,
        metadata,
      });
      matches.push(grant);
    }
  }
  if (matches.length > 1) throw new Error("credit_refund_make_good_ambiguous");
  return matches[0] ?? null;
}

function assertMakeGoodGrantMatches(
  grant: LedgerCreditGrant,
  expected: CreateLedgerGrantInput
): void {
  if (
    grant.userId !== expected.userId ||
    grant.catalogId !== expected.catalogId ||
    grant.source !== expected.source ||
    grant.sourceId !== expected.sourceId ||
    grant.idempotencyKey !== expected.idempotencyKey ||
    grant.originalCredits !== expected.originalCredits ||
    grant.remainingCredits !== expected.remainingCredits ||
    grant.reservedCredits !== expected.reservedCredits ||
    grant.expiresAt !== null ||
    grant.rolloverEligible !== false ||
    grant.rolloverSourceGrantId !== null ||
    grant.revokedAt !== null ||
    grant.revocationKey !== null ||
    !metadataEquals(grant.metadata, expected.metadata)
  ) {
    throw new Error("credit_grant_idempotency_conflict");
  }
}

export function trackCompletedReservationEvent({
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

const UNRESTRICTED_SUBSCRIPTION_CREDITS: SubscriptionCreditPolicy = {
  restricted: false,
  availableThrough: null,
};

export function isCreditGrantAvailable(
  grant: LedgerCreditGrant,
  currentTime: Date,
  subscriptionPolicy: SubscriptionCreditPolicy
): boolean {
  if (!isGrantActive(grant, currentTime)) return false;
  if (!isSubscriptionDerivedGrant(grant) || !subscriptionPolicy.restricted) {
    return true;
  }
  return Boolean(
    subscriptionPolicy.availableThrough &&
      currentTime < subscriptionPolicy.availableThrough
  );
}

function isSubscriptionDerivedGrant(grant: LedgerCreditGrant): boolean {
  return grant.source === "subscription_renewal" || grant.source === "rollover";
}

function isGrantActive(grant: LedgerCreditGrant, currentTime: Date): boolean {
  return (
    grant.revokedAt === null &&
    (grant.expiresAt === null || grant.expiresAt > currentTime)
  );
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
    revokedAt: cloneDateOrNull(grant.revokedAt),
    createdAt: new Date(grant.createdAt),
    updatedAt: new Date(grant.updatedAt),
    metadata: cloneMetadata(grant.metadata),
  };
}

function cloneBillingAdjustment(
  adjustment: LedgerBillingAdjustment
): LedgerBillingAdjustment {
  return {
    ...adjustment,
    metadata: cloneMetadata(adjustment.metadata),
    createdAt: new Date(adjustment.createdAt),
  };
}

function cloneBillingPaymentState(
  state: LedgerBillingPaymentState
): LedgerBillingPaymentState {
  return {
    ...state,
    grantRevocations: state.grantRevocations.map((item) => ({ ...item })),
    allocationRevocations: state.allocationRevocations.map((item) => ({
      ...item,
    })),
    createdAt: new Date(state.createdAt),
    updatedAt: new Date(state.updatedAt),
  };
}

function cloneSubscriptionCreditPolicy(
  policy: SubscriptionCreditPolicy
): SubscriptionCreditPolicy {
  return {
    restricted: policy.restricted,
    availableThrough: policy.availableThrough
      ? new Date(policy.availableThrough)
      : null,
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

function cloneRolloverLot(lot: LedgerRolloverLot): LedgerRolloverLot {
  return {
    ...lot,
    createdAt: new Date(lot.createdAt),
    updatedAt: new Date(lot.updatedAt),
  };
}

function cloneRolloverLotAllocation(
  allocation: LedgerRolloverLotAllocation
): LedgerRolloverLotAllocation {
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

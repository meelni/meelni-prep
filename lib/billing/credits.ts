import {
  BILLING_CATALOG,
  type BillingCatalogId,
} from "@meelni/core";

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
  listAllocations(reservationId: string): Promise<LedgerReservationAllocation[]>;
  createTransaction(
    input: Omit<LedgerCreditTransaction, "id" | "createdAt">
  ): Promise<LedgerCreditTransaction>;
}

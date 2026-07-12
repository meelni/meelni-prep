import {
  createCreditLedgerService,
  getTrialGrantIdempotencyKey,
  isCreditGrantAvailable,
  type CreditLedgerStore,
} from "./credits";

export interface CreditBalanceGrantReadModel {
  id: string;
  catalogId: string;
  source: string;
  originalCredits: number;
  remainingCredits: number;
  reservedCredits: number;
  expiresAt: string | null;
  rolloverEligible: boolean;
  rolloverSourceGrantId: string | null;
  createdAt: string;
}

export interface CreditBalanceReadModel {
  availableCredits: number;
  reservedCredits: number;
  expiringCredits: number;
  nextCreditExpiresAt: string | null;
  trialAvailable: boolean;
  grants: CreditBalanceGrantReadModel[];
}

export async function getCreditBalanceReadModel({
  store,
  userId,
  now = () => new Date(),
}: {
  store: CreditLedgerStore;
  userId: string;
  now?: () => Date;
}): Promise<CreditBalanceReadModel> {
  const ledger = createCreditLedgerService({ store, now });
  const currentTime = now();
  const [balance, allGrants, subscriptionPolicy] = await Promise.all([
    ledger.getCreditBalance(userId),
    store.listUserGrants(userId),
    store.getSubscriptionCreditPolicy(userId),
  ]);
  const trialAvailable = !allGrants.some(
    (grant) => grant.idempotencyKey === getTrialGrantIdempotencyKey(userId)
  );
  const grants = allGrants
    .filter((grant) => {
      const hasCredits =
        grant.remainingCredits > 0 || grant.reservedCredits > 0;
      const isActive = isCreditGrantAvailable(
        grant,
        currentTime,
        subscriptionPolicy
      );
      return hasCredits && isActive;
    })
    .map((grant) => ({
      id: grant.id,
      catalogId: grant.catalogId,
      source: grant.source,
      originalCredits: grant.originalCredits,
      remainingCredits: grant.remainingCredits,
      reservedCredits: grant.reservedCredits,
      expiresAt: grant.expiresAt?.toISOString() ?? null,
      rolloverEligible: grant.rolloverEligible,
      rolloverSourceGrantId: grant.rolloverSourceGrantId,
      createdAt: grant.createdAt.toISOString(),
    }));

  return {
    availableCredits: balance.availableCredits,
    reservedCredits: balance.reservedCredits,
    expiringCredits: balance.expiringCredits,
    nextCreditExpiresAt: balance.nextCreditExpiresAt?.toISOString() ?? null,
    trialAvailable,
    grants,
  };
}

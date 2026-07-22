import {
  getTrialGrantIdempotencyKey,
  isCreditGrantAvailable,
  type CreditLedgerStore,
} from "./credit-ledger-trial";

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
  now,
}: {
  store: CreditLedgerStore;
  userId: string;
  now?: () => Date;
}): Promise<CreditBalanceReadModel> {
  const {
    currentTime: authoritativeTime,
    grants: allGrants,
    subscriptionPolicy,
  } = await store.getCreditReadSnapshot(userId);
  // Production callers omit the override and use database time. Tests may
  // still inject a deterministic clock without weakening the runtime path.
  const currentTime = now ? now() : authoritativeTime;
  const activeGrants = allGrants.filter((grant) =>
    isCreditGrantAvailable(grant, currentTime, subscriptionPolicy)
  );
  const availableCredits = sumBy(
    activeGrants,
    (grant) => grant.remainingCredits
  );
  const reservedCredits = sumBy(activeGrants, (grant) => grant.reservedCredits);
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
    availableCredits,
    reservedCredits,
    expiringCredits,
    nextCreditExpiresAt: nextCreditExpiresAt?.toISOString() ?? null,
    trialAvailable,
    grants,
  };
}

function sumBy<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}

function getNextExpiration(
  grants: Array<{ remainingCredits: number; expiresAt: Date | null }>
): Date | null {
  return (
    grants
      .filter((grant) => grant.remainingCredits > 0 && grant.expiresAt)
      .map((grant) => grant.expiresAt as Date)
      .sort((left, right) => left.getTime() - right.getTime())[0] ?? null
  );
}

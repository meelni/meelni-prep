import type { CreditLedgerStore, GrantCreditsResult } from "./credits";
import { getTrialGrantIdempotencyKey, type GrantCreditsInput } from "./credits";

export interface TrialGrantService {
  grantCredits(input: GrantCreditsInput): Promise<GrantCreditsResult>;
}

export async function ensureCanonicalTrialGrant(
  ledger: TrialGrantService,
  userId: string
): Promise<GrantCreditsResult> {
  return ledger.grantCredits({
    userId,
    catalogId: "trial",
    source: "trial",
    idempotencyKey: getTrialGrantIdempotencyKey(userId),
  });
}

export async function isCanonicalTrialAvailable(
  store: Pick<CreditLedgerStore, "findGrantByIdempotencyKey">,
  userId: string
): Promise<boolean> {
  const grant = await store.findGrantByIdempotencyKey(
    getTrialGrantIdempotencyKey(userId)
  );

  return grant === null;
}

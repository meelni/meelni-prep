import { createHash } from "node:crypto";

export interface SubscriptionCheckoutState {
  version: number;
  tier: string | null;
  status: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export interface SubscriptionCheckoutSession {
  id: string;
  url: string | null;
  catalogId: string | null;
  userId: string | null;
}

export type SerializedSubscriptionCheckoutResult =
  | {
      allowed: true;
      session: SubscriptionCheckoutSession;
      reused: boolean;
    }
  | {
      allowed: false;
      reason:
        | "active_subscription"
        | "scheduled_subscription"
        | "open_checkout_for_other_plan"
        | "state_changed";
    };

export async function obtainSerializedSubscriptionCheckout(input: {
  userId: string;
  catalogId: "starter" | "pro";
  withUserLock<T>(
    work: (readState: () => Promise<SubscriptionCheckoutState>) => Promise<T>
  ): Promise<T>;
  hasProviderActiveSubscription(customerId: string): Promise<boolean>;
  listOpenSessions(customerId: string): Promise<SubscriptionCheckoutSession[]>;
  createSession(
    idempotencyKey: string,
    customerId: string | null
  ): Promise<SubscriptionCheckoutSession>;
  expireSession(sessionId: string): Promise<void>;
}): Promise<SerializedSubscriptionCheckoutResult> {
  return input.withUserLock(async (readState) => {
    const initial = await readState();
    const initialBlock = blockingReason(initial);
    if (initialBlock) return { allowed: false, reason: initialBlock };

    if (
      initial.stripeCustomerId &&
      (await input.hasProviderActiveSubscription(initial.stripeCustomerId))
    ) {
      return {
        allowed: false,
        reason: initial.cancelAtPeriodEnd
          ? "scheduled_subscription"
          : "active_subscription",
      };
    }

    let session: SubscriptionCheckoutSession | null = null;
    let reused = false;
    if (initial.stripeCustomerId) {
      const openSessions = await input.listOpenSessions(
        initial.stripeCustomerId
      );
      const ownedSessions = openSessions.filter(
        (candidate) => candidate.userId === input.userId
      );
      const matching = ownedSessions.find(
        (candidate) => candidate.catalogId === input.catalogId
      );
      if (matching) {
        session = matching;
        reused = true;
      } else if (ownedSessions.length > 0) {
        return { allowed: false, reason: "open_checkout_for_other_plan" };
      }
    }

    session ??= await input.createSession(
      subscriptionCheckoutIdempotencyKey(input.userId, initial.version),
      initial.stripeCustomerId
    );
    const latest = await readState();
    if (
      stateFingerprint(latest) !== stateFingerprint(initial) ||
      blockingReason(latest)
    ) {
      await input.expireSession(session.id);
      return { allowed: false, reason: "state_changed" };
    }
    return { allowed: true, session, reused };
  });
}

export function subscriptionCheckoutIdempotencyKey(
  userId: string,
  stateVersion: number
): string {
  if (!Number.isSafeInteger(stateVersion) || stateVersion < 0) {
    throw new Error("billing_subscription_version_invalid");
  }
  const identity = createHash("sha256").update(userId).digest("hex");
  return `subscription-checkout:${identity}:v${stateVersion}`;
}

export function subscriptionCheckoutExpiryIdempotencyKey(
  sessionId: string
): string {
  const identity = createHash("sha256").update(sessionId).digest("hex");
  return `subscription-checkout-expire:${identity}`;
}

function blockingReason(
  state: SubscriptionCheckoutState
): "active_subscription" | "scheduled_subscription" | null {
  if (state.status !== "active" && state.status !== "trialing") return null;
  return state.cancelAtPeriodEnd
    ? "scheduled_subscription"
    : "active_subscription";
}

function stateFingerprint(state: SubscriptionCheckoutState): string {
  return JSON.stringify([
    state.version,
    state.tier,
    state.status,
    state.cancelAtPeriodEnd,
    state.stripeCustomerId,
    state.stripeSubscriptionId,
  ]);
}

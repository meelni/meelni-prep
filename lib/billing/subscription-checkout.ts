import { createHash, randomUUID } from "node:crypto";

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
  customerId: string | null;
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
  priceId: string;
  withUserLock<T>(
    work: (context: {
      readState: () => Promise<SubscriptionCheckoutState>;
      recordCustomerId: (customerId: string) => Promise<void>;
    }) => Promise<T>
  ): Promise<T>;
  hasProviderActiveSubscription(customerId: string): Promise<boolean>;
  createCustomer(): Promise<string>;
  listOpenSessions(customerId: string): Promise<SubscriptionCheckoutSession[]>;
  createSession(
    idempotencyKey: string,
    customerId: string | null
  ): Promise<SubscriptionCheckoutSession>;
  expireSession(sessionId: string): Promise<void>;
  createAttemptNonce?: () => string;
}): Promise<SerializedSubscriptionCheckoutResult> {
  return input.withUserLock(async ({ readState, recordCustomerId }) => {
    const initial = await readState();
    const initialBlock = blockingReason(initial);
    if (initialBlock) return { allowed: false, reason: initialBlock };

    let expected = initial;
    if (!expected.stripeCustomerId) {
      const customerId = await input.createCustomer();
      if (!customerId) {
        throw new Error("billing_subscription_checkout_customer_invalid");
      }
      await recordCustomerId(customerId);
      expected = { ...expected, stripeCustomerId: customerId };
    }
    const customerId = expected.stripeCustomerId;
    if (!customerId) {
      throw new Error("billing_subscription_checkout_customer_invalid");
    }

    if (await input.hasProviderActiveSubscription(customerId)) {
      return {
        allowed: false,
        reason: initial.cancelAtPeriodEnd
          ? "scheduled_subscription"
          : "active_subscription",
      };
    }

    let session: SubscriptionCheckoutSession | null = null;
    let reused = false;
    if (customerId) {
      const openSessions = await input.listOpenSessions(customerId);
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

    if (!session) {
      const attemptNonce = (input.createAttemptNonce ?? randomUUID)();
      const idempotencyKey = subscriptionCheckoutIdempotencyKey({
        userId: input.userId,
        catalogId: input.catalogId,
        priceId: input.priceId,
        attemptNonce,
      });
      try {
        session = await input.createSession(idempotencyKey, customerId);
      } catch {
        // One same-key retry resolves an ambiguous provider timeout without
        // creating a second Checkout Session.
        session = await input.createSession(idempotencyKey, customerId);
      }
    }
    if (session.customerId !== customerId) {
      throw new Error("billing_subscription_checkout_customer_mismatch");
    }
    if (await input.hasProviderActiveSubscription(customerId)) {
      await input.expireSession(session.id);
      return { allowed: false, reason: "state_changed" };
    }
    const latest = await readState();
    if (
      stateFingerprint(latest) !== stateFingerprint(expected) ||
      blockingReason(latest)
    ) {
      await input.expireSession(session.id);
      return { allowed: false, reason: "state_changed" };
    }
    return { allowed: true, session, reused };
  });
}

export function subscriptionCheckoutIdempotencyKey(input: {
  userId: string;
  catalogId: "starter" | "pro";
  priceId: string;
  attemptNonce: string;
}): string {
  if (!input.userId || !input.priceId || !input.attemptNonce) {
    throw new Error("billing_subscription_checkout_attempt_invalid");
  }
  const identity = createHash("sha256").update(input.userId).digest("hex");
  const attempt = createHash("sha256")
    .update(
      JSON.stringify([input.catalogId, input.priceId, input.attemptNonce])
    )
    .digest("hex");
  return `subscription-checkout:${identity}:${input.catalogId}:${attempt}`;
}

export function subscriptionCheckoutExpiryIdempotencyKey(
  sessionId: string
): string {
  const identity = createHash("sha256").update(sessionId).digest("hex");
  return `subscription-checkout-expire:${identity}`;
}

export function subscriptionCustomerIdempotencyKey(userId: string): string {
  if (!userId) throw new Error("billing_subscription_customer_user_invalid");
  const identity = createHash("sha256").update(userId).digest("hex");
  return `subscription-customer:${identity}`;
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

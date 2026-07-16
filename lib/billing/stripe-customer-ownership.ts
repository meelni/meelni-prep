import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { stripeCustomerMapping } from "@/lib/db/schema";

export type StripeCheckoutCorrelation = "not_applicable" | "valid" | "invalid";

export interface StripeCustomerOwnershipClaim {
  customerId: string;
  userId: string;
}

export type StripeCustomerOwnershipDatabase = typeof db;

/**
 * Atomically establishes a Stripe customer owner without ever transferring it.
 *
 * The primary-key conflict serializes concurrent claimants in Postgres. The
 * conditional no-op update returns a row only when the stored owner agrees
 * with the claimant, so callers can safely run this before granting credit.
 */
export async function claimStripeCustomerOwnership(
  input: StripeCustomerOwnershipClaim,
  database: StripeCustomerOwnershipDatabase = db
): Promise<void> {
  const [claimed] = await database
    .insert(stripeCustomerMapping)
    .values({
      stripeCustomerId: input.customerId,
      userId: input.userId,
    })
    .onConflictDoUpdate({
      target: stripeCustomerMapping.stripeCustomerId,
      set: {
        stripeCustomerId: sql`excluded.stripe_customer_id`,
      },
      setWhere: eq(stripeCustomerMapping.userId, input.userId),
    })
    .returning({ userId: stripeCustomerMapping.userId });

  if (claimed?.userId !== input.userId) {
    throw stripeSubjectOwnerMismatch();
  }
}

export async function getMappedStripeCustomerUserId(
  customerId: string | null
): Promise<string | null> {
  if (!customerId) return null;
  const [mapping] = await db
    .select({ userId: stripeCustomerMapping.userId })
    .from(stripeCustomerMapping)
    .where(eq(stripeCustomerMapping.stripeCustomerId, customerId))
    .limit(1);
  return mapping?.userId ?? null;
}

export function resolveAuthoritativeStripeUserId(input: {
  checkoutCorrelation: StripeCheckoutCorrelation;
  eventUserId: string | null;
  mappedUserId: string | null;
  tombstoneUserId: string | null;
}): string | null {
  if (input.checkoutCorrelation === "invalid") {
    throw stripeSubjectOwnerMismatch();
  }

  const candidates = [
    input.eventUserId,
    input.mappedUserId,
    input.tombstoneUserId,
  ].filter((value): value is string => Boolean(value));
  if (new Set(candidates).size > 1) {
    throw stripeSubjectOwnerMismatch();
  }

  return (
    input.tombstoneUserId ??
    input.mappedUserId ??
    (input.checkoutCorrelation === "valid" ? input.eventUserId : null)
  );
}

export function stripeSubjectOwnerMismatch(): Error & { code: string } {
  return Object.assign(new Error("Stripe subject owner mismatch"), {
    code: "stripe_subject_owner_mismatch",
  });
}

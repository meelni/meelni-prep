import type { BillingCatalogId } from "@meelni/core";

export const STRIPE_API_VERSION = "2026-02-25.clover";

export type StripeCheckoutCatalogId = Extract<
  BillingCatalogId,
  "interview_pass" | "starter" | "pro"
>;

export type StripeCheckoutMode = "payment" | "subscription";

export const PRICE_ENV_BY_CATALOG_ID = {
  interview_pass: "STRIPE_INTERVIEW_PASS_PRICE_ID",
  starter: "STRIPE_STARTER_MONTHLY_PRICE_ID",
  pro: "STRIPE_PRO_MONTHLY_PRICE_ID",
} as const satisfies Record<StripeCheckoutCatalogId, string>;

export function isStripeCheckoutCatalogId(
  value: string
): value is StripeCheckoutCatalogId {
  return value === "interview_pass" || value === "starter" || value === "pro";
}

export function getCheckoutModeForCatalogId(
  catalogId: StripeCheckoutCatalogId
): StripeCheckoutMode {
  return catalogId === "interview_pass" ? "payment" : "subscription";
}

export function getStripePriceIdForCatalogId(
  catalogId: BillingCatalogId,
  env: Record<string, string | undefined> = process.env
): string {
  if (!isStripeCheckoutCatalogId(catalogId)) {
    throw new Error(
      `Catalog item ${catalogId} is not sold through Stripe Checkout`
    );
  }

  const envName = PRICE_ENV_BY_CATALOG_ID[catalogId];
  const priceId = env[envName];

  if (!priceId) {
    throw new Error(`Missing ${envName}`);
  }

  return priceId;
}

export function getStripeCatalogIdForPrice(
  priceId: string | undefined,
  env: Record<string, string | undefined> = process.env
): StripeCheckoutCatalogId {
  if (!priceId) {
    throw new Error("Missing Stripe price ID");
  }

  for (const [catalogId, envName] of Object.entries(PRICE_ENV_BY_CATALOG_ID)) {
    if (env[envName] === priceId) {
      return catalogId as StripeCheckoutCatalogId;
    }
  }

  throw new Error(`Unknown Stripe price ID: ${priceId}`);
}

export type BillingCatalogId =
  | "trial"
  | "interview_pass"
  | "starter"
  | "pro"
  | "admin_grant";

export type BillingCatalogKind =
  | "trial"
  | "one_time"
  | "subscription"
  | "admin";

export interface BillingCatalogItem {
  id: BillingCatalogId;
  kind: BillingCatalogKind;
  displayName: string;
  description: string;
  priceInCents: number;
  currency: "usd";
  includedCredits: number;
  interval: "none" | "month";
  expiresAfterDays: number | null;
  rolloverCapCredits: number;
  rolloverExpiresAfterDays: number | null;
  canPurchase: boolean;
}

export const BILLING_CATALOG = {
  trial: {
    id: "trial",
    kind: "trial",
    displayName: "Trial",
    description: "Try 2 full PM interviews free.",
    priceInCents: 0,
    currency: "usd",
    includedCredits: 2,
    interval: "none",
    expiresAfterDays: 7,
    rolloverCapCredits: 0,
    rolloverExpiresAfterDays: null,
    canPurchase: false,
  },
  interview_pass: {
    id: "interview_pass",
    kind: "one_time",
    displayName: "Interview Pass",
    description: "One focused interview, no subscription.",
    priceInCents: 900,
    currency: "usd",
    includedCredits: 1,
    interval: "none",
    expiresAfterDays: 30,
    rolloverCapCredits: 0,
    rolloverExpiresAfterDays: null,
    canPurchase: true,
  },
  starter: {
    id: "starter",
    kind: "subscription",
    displayName: "Starter",
    description: "4 interviews per month.",
    priceInCents: 1900,
    currency: "usd",
    includedCredits: 4,
    interval: "month",
    expiresAfterDays: null,
    rolloverCapCredits: 4,
    rolloverExpiresAfterDays: 60,
    canPurchase: true,
  },
  pro: {
    id: "pro",
    kind: "subscription",
    displayName: "Pro",
    description: "12 interviews per month.",
    priceInCents: 4900,
    currency: "usd",
    includedCredits: 12,
    interval: "month",
    expiresAfterDays: null,
    rolloverCapCredits: 12,
    rolloverExpiresAfterDays: 60,
    canPurchase: true,
  },
  admin_grant: {
    id: "admin_grant",
    kind: "admin",
    displayName: "Admin Grant",
    description:
      "Manual credits for support, QA, pilots, and make-good grants.",
    priceInCents: 0,
    currency: "usd",
    includedCredits: 0,
    interval: "none",
    expiresAfterDays: null,
    rolloverCapCredits: 0,
    rolloverExpiresAfterDays: null,
    canPurchase: false,
  },
} as const satisfies Record<BillingCatalogId, BillingCatalogItem>;

export const BILLING_CATALOG_ORDER = [
  "trial",
  "interview_pass",
  "starter",
  "pro",
  "admin_grant",
] as const satisfies readonly BillingCatalogId[];

export function getBillingCatalogItem(
  id: BillingCatalogId
): BillingCatalogItem {
  return BILLING_CATALOG[id];
}

export function isSubscriptionCatalogItem(id: BillingCatalogId): boolean {
  return BILLING_CATALOG[id].kind === "subscription";
}

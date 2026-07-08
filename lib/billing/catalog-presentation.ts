import { BILLING_CATALOG, type BillingCatalogId } from "@meelni/core";
import type { StripeCheckoutCatalogId } from "./stripe-catalog";

export interface PublicPricingPlan {
  catalogId: Extract<
    BillingCatalogId,
    "trial" | "interview_pass" | "starter" | "pro"
  >;
  name: string;
  description: string;
  priceLabel: string;
  frequencyLabel: string;
  creditLabel: string;
  expirationLabel: string;
  rolloverLabel: string | null;
  features: string[];
  cta: string;
  canPurchase: boolean;
  popular: boolean;
}

export interface StructuredDataOffer {
  "@type": "Offer";
  name: string;
  price: string;
  priceCurrency: "USD";
  description: string;
}

const PUBLIC_PRICING_ORDER = [
  "trial",
  "interview_pass",
  "starter",
  "pro",
] as const;

export function formatCatalogPrice(priceInCents: number): string {
  return `$${formatPriceNumber(priceInCents)}`;
}

export function getPurchaseCatalogIds(): StripeCheckoutCatalogId[] {
  return ["interview_pass", "starter", "pro"];
}

export function getPublicPricingPlans(): PublicPricingPlan[] {
  return PUBLIC_PRICING_ORDER.map((catalogId) => {
    const item = BILLING_CATALOG[catalogId];
    const creditLabel = getCreditLabel(
      item.includedCredits,
      item.interval === "month" ? "/month" : ""
    );

    return {
      catalogId,
      name: getDisplayName(catalogId),
      description: getDescription(catalogId),
      priceLabel: formatCatalogPrice(item.priceInCents),
      frequencyLabel: getFrequencyLabel(catalogId),
      creditLabel,
      expirationLabel: getExpirationLabel(catalogId),
      rolloverLabel: getRolloverLabel(catalogId),
      features: getFeatures(catalogId),
      cta: getCta(catalogId),
      canPurchase: item.canPurchase,
      popular: false,
    };
  });
}

export function getStructuredDataOffers(): StructuredDataOffer[] {
  return getPublicPricingPlans().map((plan) => ({
    "@type": "Offer",
    name: plan.name,
    price: formatPriceNumber(BILLING_CATALOG[plan.catalogId].priceInCents),
    priceCurrency: "USD",
    description: getStructuredDataDescription(plan.catalogId),
  }));
}

function formatPriceNumber(priceInCents: number): string {
  const dollars = priceInCents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

function getCreditLabel(credits: number, suffix: string): string {
  return `${credits} ${credits === 1 ? "credit" : "credits"}${suffix}`;
}

function getDisplayName(catalogId: PublicPricingPlan["catalogId"]): string {
  switch (catalogId) {
    case "trial":
      return "Trial";
    case "interview_pass":
      return "Interview Pass";
    case "starter":
      return "Monthly Practice";
    case "pro":
      return "Pro";
  }
}

function getDescription(catalogId: PublicPricingPlan["catalogId"]): string {
  switch (catalogId) {
    case "trial":
      return "For a first week of practice. 2 credits expire after 7 days.";
    case "interview_pass":
      return "For one focused run-through. 1 credit expires after 30 days.";
    case "starter":
      return "For a steady prep rhythm. 4 credits each month with rollover.";
    case "pro":
      return "For an active interview loop. 12 credits each month with rollover.";
  }
}

function getFrequencyLabel(catalogId: PublicPricingPlan["catalogId"]): string {
  switch (catalogId) {
    case "trial":
      return "7-day trial";
    case "interview_pass":
      return "pass";
    case "starter":
    case "pro":
      return "month";
  }
}

function getExpirationLabel(catalogId: PublicPricingPlan["catalogId"]): string {
  const item = BILLING_CATALOG[catalogId];

  if (item.expiresAfterDays) {
    return `Credits expire after ${item.expiresAfterDays} days`;
  }

  return "Monthly credits refresh with your subscription";
}

function getRolloverLabel(
  catalogId: PublicPricingPlan["catalogId"]
): string | null {
  const item = BILLING_CATALOG[catalogId];

  if (!item.rolloverCapCredits || !item.rolloverExpiresAfterDays) {
    return null;
  }

  return `Rollover up to ${item.rolloverCapCredits} credits for ${item.rolloverExpiresAfterDays} days`;
}

function getFeatures(catalogId: PublicPricingPlan["catalogId"]): string[] {
  switch (catalogId) {
    case "trial":
      return [
        "2 full AI mock interviews",
        "All PM round types",
        "Expires after 7 days",
      ];
    case "interview_pass":
      return [
        "1 full AI mock interview",
        "All PM round types",
        "No subscription required",
      ];
    case "starter":
      return [
        "4 full AI mock interviews each month",
        "All PM round types",
        "Rollover up to 4 unused credits",
      ];
    case "pro":
      return [
        "12 full AI mock interviews each month",
        "All PM round types",
        "Rollover up to 12 unused credits",
      ];
  }
}

function getCta(catalogId: PublicPricingPlan["catalogId"]): string {
  switch (catalogId) {
    case "trial":
      return "Get 2 credits";
    case "interview_pass":
      return "Get 1 credit";
    case "starter":
      return "Get 4 credits";
    case "pro":
      return "Get 12 credits";
  }
}

function getStructuredDataDescription(
  catalogId: PublicPricingPlan["catalogId"]
): string {
  switch (catalogId) {
    case "trial":
      return "2 PM interview credits for 7 days";
    case "interview_pass":
      return "1 PM interview credit, expires after 30 days";
    case "starter":
      return "4 PM interview credits per month with rollover up to 4 credits for 60 days";
    case "pro":
      return "12 PM interview credits per month with rollover up to 12 credits for 60 days";
  }
}

import type { Metadata } from "next";

import {
  getPublicPricingPlans,
  type PublicPricingPlan,
} from "@/lib/billing/catalog-presentation";

export const LEGAL_DRAFT_REVIEWED_ON = "July 10, 2026";

export const LEGAL_DRAFT_NOTICE =
  "This temporary page is under accountable owner and legal review before relaunch. It is not approved, not effective, and not legal advice.";

export const PRIVACY_POLICY_EFFECTIVE_DATE = "July 26, 2026";
export const PRIVACY_POLICY_LAST_UPDATED = "July 26, 2026";

export interface LegalBillingFact {
  catalogId: PublicPricingPlan["catalogId"];
  name: string;
  priceLabel: string;
  frequencyLabel: string;
  creditLabel: string;
  expirationLabel: string;
  rolloverLabel: string | null;
}

export function getLegalBillingFacts(): LegalBillingFact[] {
  return getPublicPricingPlans().map(
    ({
      catalogId,
      name,
      priceLabel,
      frequencyLabel,
      creditLabel,
      expirationLabel,
      rolloverLabel,
    }) => ({
      catalogId,
      name,
      priceLabel,
      frequencyLabel,
      creditLabel,
      expirationLabel,
      rolloverLabel,
    })
  );
}

export const TERMS_OWNER_DECISIONS = [
  "Identify the contracting legal entity, business address, and monitored legal contact.",
  "Approve account eligibility, age requirements, acceptable use, enforcement, and appeals.",
  "Approve ownership and license terms for user content, transcripts, feedback, and question-bank content.",
  "Approve purchase, tax, renewal, cancellation, and refund terms that match the live Stripe catalog.",
  "Approve warranty, liability, indemnity, dispute, governing-law, and change-notice language.",
  "Set an effective date only after the final policy and product behavior are reviewed together.",
] as const;

export function createLegalDraftMetadata(
  title: string,
  description: string
): Metadata {
  return {
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    alternates: { canonical: null },
    openGraph: null,
    twitter: null,
  };
}

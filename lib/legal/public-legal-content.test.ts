import assert from "node:assert/strict";
import test from "node:test";

import { getPublicPricingPlans } from "@/lib/billing/catalog-presentation";
import {
  createLegalDraftMetadata,
  getLegalBillingFacts,
  LEGAL_DRAFT_NOTICE,
  PRIVACY_POLICY_EFFECTIVE_DATE,
  PRIVACY_POLICY_LAST_UPDATED,
  TERMS_OWNER_DECISIONS,
} from "./public-legal-content";

test("legal billing facts are a projection of the canonical credit catalog", () => {
  assert.deepEqual(
    getLegalBillingFacts(),
    getPublicPricingPlans().map(
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
    )
  );

  const pro = getLegalBillingFacts().find(
    ({ catalogId }) => catalogId === "pro"
  );
  assert.equal(pro?.creditLabel, "12 credits/month");
  assert.equal(pro?.priceLabel, "$49");
});

test("legal draft metadata remains available for the unapproved Terms route", () => {
  const metadata = createLegalDraftMetadata(
    "Terms Draft | Meelni",
    "Draft service terms."
  );

  assert.deepEqual(metadata.robots, { index: false, follow: false });
  assert.deepEqual(metadata.alternates, { canonical: null });
  assert.equal(metadata.openGraph, null);
  assert.equal(metadata.twitter, null);
  assert.match(
    LEGAL_DRAFT_NOTICE,
    /not approved, not effective, and not legal advice/i
  );
});

test("the Privacy Policy has an approved version while Terms decisions remain open", () => {
  assert.equal(PRIVACY_POLICY_EFFECTIVE_DATE, "July 26, 2026");
  assert.equal(PRIVACY_POLICY_LAST_UPDATED, "July 26, 2026");
  assert.ok(TERMS_OWNER_DECISIONS.length >= 5);
});

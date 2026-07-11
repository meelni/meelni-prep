import assert from "node:assert/strict";
import test from "node:test";

import { getPublicPricingPlans } from "@/lib/billing/catalog-presentation";
import {
  createLegalDraftMetadata,
  getLegalBillingFacts,
  LEGAL_DRAFT_NOTICE,
  PRIVACY_OWNER_DECISIONS,
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

test("legal draft metadata is explicitly unindexed and has no canonical or social promotion", () => {
  const metadata = createLegalDraftMetadata(
    "Privacy Draft | Meelni",
    "Draft product-data summary."
  );

  assert.deepEqual(metadata.robots, { index: false, follow: false });
  assert.deepEqual(metadata.alternates, { canonical: null });
  assert.equal(metadata.openGraph, null);
  assert.equal(metadata.twitter, null);
});

test("draft content names review status and separates privacy and terms decisions", () => {
  assert.match(
    LEGAL_DRAFT_NOTICE,
    /not approved, not effective, and not legal advice/i
  );
  assert.ok(PRIVACY_OWNER_DECISIONS.length >= 5);
  assert.ok(TERMS_OWNER_DECISIONS.length >= 5);
  assert.notDeepEqual(PRIVACY_OWNER_DECISIONS, TERMS_OWNER_DECISIONS);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  STRIPE_API_VERSION,
  getCheckoutModeForCatalogId,
  getStripeCatalogIdForPrice,
  getStripePriceIdForCatalogId,
} from "./stripe-catalog";

test("stripe catalog maps checkout products to modes and prices", () => {
  const env = {
    STRIPE_INTERVIEW_PASS_PRICE_ID: "price_pass",
    STRIPE_STARTER_MONTHLY_PRICE_ID: "price_starter",
    STRIPE_PRO_MONTHLY_PRICE_ID: "price_pro",
  };

  assert.equal(STRIPE_API_VERSION, "2026-02-25.clover");
  assert.equal(getCheckoutModeForCatalogId("interview_pass"), "payment");
  assert.equal(getCheckoutModeForCatalogId("starter"), "subscription");
  assert.equal(getCheckoutModeForCatalogId("pro"), "subscription");
  assert.equal(
    getStripePriceIdForCatalogId("interview_pass", env),
    "price_pass"
  );
  assert.equal(getStripeCatalogIdForPrice("price_starter", env), "starter");
  assert.equal(getStripeCatalogIdForPrice("price_pro", env), "pro");
});

test("stripe catalog rejects unsupported and unconfigured prices", () => {
  assert.throws(
    () => getStripePriceIdForCatalogId("trial", {}),
    /stripe_catalog_item_not_checkout/
  );
  assert.throws(
    () => getStripePriceIdForCatalogId("starter", {}),
    /stripe_price_not_configured/
  );
  assert.throws(
    () => getStripeCatalogIdForPrice("price_unknown", {}),
    /stripe_price_unknown/
  );
});

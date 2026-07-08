import assert from "node:assert/strict";
import test from "node:test";

import {
  formatCatalogPrice,
  getPublicPricingPlans,
  getPurchaseCatalogIds,
  getStructuredDataOffers,
} from "./catalog-presentation";

test("public pricing plans expose credit catalog in launch order", () => {
  const plans = getPublicPricingPlans();

  assert.deepEqual(
    plans.map((plan) => plan.catalogId),
    ["trial", "interview_pass", "starter", "pro"]
  );
  assert.deepEqual(getPurchaseCatalogIds(), [
    "interview_pass",
    "starter",
    "pro",
  ]);
});

test("public pricing plans format credits, prices, and rollover copy", () => {
  const plans = getPublicPricingPlans();
  const trial = plans.find((plan) => plan.catalogId === "trial");
  const pass = plans.find((plan) => plan.catalogId === "interview_pass");
  const starter = plans.find((plan) => plan.catalogId === "starter");
  const pro = plans.find((plan) => plan.catalogId === "pro");

  assert.equal(trial?.priceLabel, "$0");
  assert.equal(trial?.creditLabel, "2 credits");
  assert.equal(trial?.frequencyLabel, "7-day trial");
  assert.equal(trial?.cta, "Get 2 credits");
  assert.equal(trial?.canPurchase, false);

  assert.equal(pass?.priceLabel, "$9");
  assert.equal(pass?.creditLabel, "1 credit");
  assert.equal(pass?.frequencyLabel, "pass");
  assert.equal(pass?.cta, "Get 1 credit");
  assert.equal(pass?.canPurchase, true);

  assert.equal(starter?.priceLabel, "$19");
  assert.equal(starter?.name, "Monthly Practice");
  assert.equal(starter?.creditLabel, "4 credits/month");
  assert.equal(starter?.rolloverLabel, "Rollover up to 4 credits for 60 days");
  assert.equal(starter?.cta, "Get 4 credits");
  assert.equal(starter?.canPurchase, true);
  assert.equal(starter?.popular, false);

  assert.equal(pro?.priceLabel, "$49");
  assert.equal(pro?.creditLabel, "12 credits/month");
  assert.equal(pro?.rolloverLabel, "Rollover up to 12 credits for 60 days");
  assert.equal(pro?.cta, "Get 12 credits");
  assert.equal(pro?.canPurchase, true);
  assert.equal(pro?.popular, false);
});

test("structured data offers mirror credit catalog prices", () => {
  assert.equal(formatCatalogPrice(900), "$9");
  assert.equal(formatCatalogPrice(1900), "$19");

  assert.deepEqual(
    getStructuredDataOffers().map((offer) => ({
      name: offer.name,
      price: offer.price,
      description: offer.description,
    })),
    [
      {
        name: "Trial",
        price: "0",
        description: "2 PM interview credits for 7 days",
      },
      {
        name: "Interview Pass",
        price: "9",
        description: "1 PM interview credit, expires after 30 days",
      },
      {
        name: "Monthly Practice",
        price: "19",
        description:
          "4 PM interview credits per month with rollover up to 4 credits for 60 days",
      },
      {
        name: "Pro",
        price: "49",
        description:
          "12 PM interview credits per month with rollover up to 12 credits for 60 days",
      },
    ]
  );
});

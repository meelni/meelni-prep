#!/usr/bin/env node

import Stripe from "stripe";

const STRIPE_API_VERSION = "2026-02-25.clover";

const catalog = [
  {
    catalogId: "interview_pass",
    productName: "Meelni Interview Pass",
    description:
      "One credit for one full Meelni interview. Expires after 30 days.",
    lookupKey: "meelni_interview_pass_usd",
    envName: "STRIPE_INTERVIEW_PASS_PRICE_ID",
    unitAmount: 900,
    recurring: null,
  },
  {
    catalogId: "starter",
    productName: "Meelni Starter",
    description:
      "Four Meelni interview credits per month with rollover capped at four credits.",
    lookupKey: "meelni_starter_monthly_usd",
    envName: "STRIPE_STARTER_MONTHLY_PRICE_ID",
    unitAmount: 1900,
    recurring: { interval: "month" },
  },
  {
    catalogId: "pro",
    productName: "Meelni Pro",
    description:
      "Twelve Meelni interview credits per month with rollover capped at twelve credits.",
    lookupKey: "meelni_pro_monthly_usd",
    envName: "STRIPE_PRO_MONTHLY_PRICE_ID",
    unitAmount: 4900,
    recurring: { interval: "month" },
  },
];

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const confirmLive = args.has("--confirm-live");

if (dryRun) {
  printCatalogPlan();
  process.exit(0);
}

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  fail(
    "Missing STRIPE_SECRET_KEY. Export a test or live Stripe secret key before running this script."
  );
}

if (/^(?:sk|rk)_live_/.test(secretKey) && !confirmLive) {
  fail(
    "Live key detected. Re-run with --confirm-live after reviewing docs/STRIPE_LIVE_MODE_CHECKLIST.md."
  );
}

const stripe = new Stripe(secretKey, {
  apiVersion: STRIPE_API_VERSION,
});

const createdPrices = [];

for (const item of catalog) {
  const price = await findOrCreatePrice(item);
  createdPrices.push({ envName: item.envName, priceId: price.id });
}

console.log("\nStripe credit catalog is ready.\n");
for (const { envName, priceId } of createdPrices) {
  console.log(`${envName}=${priceId}`);
}

async function findOrCreatePrice(item) {
  const existingPrices = await stripe.prices.list({
    active: true,
    lookup_keys: [item.lookupKey],
    limit: 1,
  });

  const existingPrice = existingPrices.data[0];
  if (existingPrice) {
    assertPriceMatchesCatalog(existingPrice, item);
    console.log(`Reusing ${item.lookupKey}: ${existingPrice.id}`);
    return existingPrice;
  }

  const product = await findOrCreateProduct(item);
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: item.unitAmount,
    lookup_key: item.lookupKey,
    ...(item.recurring ? { recurring: item.recurring } : {}),
    metadata: metadataFor(item),
  });

  console.log(`Created ${item.lookupKey}: ${price.id}`);
  return price;
}

async function findOrCreateProduct(item) {
  const query = `metadata['app']:'meelni' AND metadata['catalog_id']:'${item.catalogId}'`;
  const existingProducts = await stripe.products.search({
    query,
    limit: 1,
  });

  const existingProduct = existingProducts.data[0];
  if (existingProduct) {
    return existingProduct;
  }

  return stripe.products.create({
    name: item.productName,
    description: item.description,
    metadata: metadataFor(item),
  });
}

function assertPriceMatchesCatalog(price, item) {
  const recurringInterval = price.recurring?.interval ?? null;
  const expectedInterval = item.recurring?.interval ?? null;
  const mismatches = [];

  if (price.currency !== "usd") {
    mismatches.push(`currency=${price.currency}`);
  }

  if (price.unit_amount !== item.unitAmount) {
    mismatches.push(`unit_amount=${price.unit_amount}`);
  }

  if (recurringInterval !== expectedInterval) {
    mismatches.push(`recurring.interval=${recurringInterval}`);
  }

  if (mismatches.length > 0) {
    fail(
      `Existing price ${price.id} for ${item.lookupKey} does not match the catalog: ${mismatches.join(", ")}`
    );
  }
}

function metadataFor(item) {
  return {
    app: "meelni",
    catalog_id: item.catalogId,
    managed_by: "scripts/setup-stripe-credit-catalog.mjs",
  };
}

function printCatalogPlan() {
  console.log("Stripe credit catalog plan:\n");
  for (const item of catalog) {
    const amount = `$${(item.unitAmount / 100).toFixed(2)}`;
    const cadence = item.recurring
      ? `/${item.recurring.interval}`
      : " one-time";
    console.log(
      `- ${item.catalogId}: ${item.productName}, ${amount}${cadence}, lookup_key=${item.lookupKey}, env=${item.envName}`
    );
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

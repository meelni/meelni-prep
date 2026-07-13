#!/usr/bin/env node

import Stripe from "stripe";
import { pathToFileURL } from "node:url";

import {
  canonicalJson,
  consumeProductionActionAuthorization,
  PRODUCTION_ACTIONS,
  sha256,
} from "../lib/operations/production-action-authorization.mjs";

const STRIPE_API_VERSION = "2026-02-25.clover";
const STRIPE_ACCOUNT_ID = "acct_1SSreECdoT5hfbsF";

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

export async function runStripeCatalogSetup({
  argv = process.argv.slice(2),
  env = process.env,
  StripeClient = Stripe,
  authorizeProductionAction = consumeProductionActionAuthorization,
  log = console.log,
} = {}) {
  const args = new Set(argv);
  if (
    args.size !== argv.length ||
    [...args].some(
      (argument) => !["--dry-run", "--confirm-live"].includes(argument)
    ) ||
    (args.has("--dry-run") && args.has("--confirm-live"))
  ) {
    throw new Error(
      "Catalog setup accepts --dry-run or --confirm-live, not both."
    );
  }
  if (args.has("--dry-run")) {
    printCatalogPlan(log);
    return { disposition: "dry_run" };
  }

  const deployment = resolveDeploymentEnvironment(env);
  const secretKey = env.STRIPE_SECRET_KEY;
  const keyMatch = /^(?:sk|rk)_(test|live)_[A-Za-z0-9]+$/.exec(secretKey ?? "");
  if (!keyMatch) {
    throw new Error("STRIPE_SECRET_KEY is missing or invalid.");
  }
  const keyMode = keyMatch[1];
  const expectedMode = deployment === "production" ? "live" : "test";
  if (keyMode !== expectedMode) {
    throw new Error(
      `Stripe ${expectedMode} mode is required for the ${deployment} environment.`
    );
  }
  if (keyMode === "live" && !args.has("--confirm-live")) {
    throw new Error(
      "Live key detected. Re-run with --confirm-live after reviewing docs/STRIPE_LIVE_MODE_CHECKLIST.md."
    );
  }
  if (keyMode === "live") {
    await authorizeProductionAction({
      authorizationPath: env.MEELNI_PRODUCTION_ACTION_AUTHORIZATION,
      expected: {
        action: PRODUCTION_ACTIONS.STRIPE_LIVE_CATALOG,
        provider: "stripe",
        configurationSha256: STRIPE_LIVE_CATALOG_CONFIGURATION_SHA256,
        targetFingerprint: STRIPE_LIVE_TARGET_FINGERPRINT,
      },
    });
  }

  const stripe = new StripeClient(secretKey, {
    apiVersion: STRIPE_API_VERSION,
  });
  if (keyMode === "live") {
    const account = await stripe.accounts.retrieve();
    if (account.deleted || account.id !== STRIPE_ACCOUNT_ID) {
      throw new Error("Stripe live key does not match the authorized account.");
    }
  }
  const createdPrices = [];
  for (const item of catalog) {
    const price = await findOrCreatePrice(stripe, item, log);
    createdPrices.push({ envName: item.envName, priceId: price.id });
  }

  log("\nStripe credit catalog is ready.\n");
  for (const { envName, priceId } of createdPrices) {
    log(`${envName}=${priceId}`);
  }
  return { disposition: "ready", createdPrices };
}

export const STRIPE_LIVE_CATALOG_CONFIGURATION_SHA256 = sha256(
  canonicalJson({
    accountId: STRIPE_ACCOUNT_ID,
    apiVersion: STRIPE_API_VERSION,
    catalog,
  })
);

export const STRIPE_LIVE_TARGET_FINGERPRINT = sha256(
  `stripe-account:${STRIPE_ACCOUNT_ID}`
);

async function findOrCreatePrice(stripe, item, log) {
  const existingPrices = await stripe.prices.list({
    active: true,
    lookup_keys: [item.lookupKey],
    limit: 1,
  });

  const existingPrice = existingPrices.data[0];
  if (existingPrice) {
    assertPriceMatchesCatalog(existingPrice, item);
    log(`Reusing ${item.lookupKey}: ${existingPrice.id}`);
    return existingPrice;
  }

  const product = await findOrCreateProduct(stripe, item);
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: item.unitAmount,
    lookup_key: item.lookupKey,
    ...(item.recurring ? { recurring: item.recurring } : {}),
    metadata: metadataFor(item),
  });

  log(`Created ${item.lookupKey}: ${price.id}`);
  return price;
}

async function findOrCreateProduct(stripe, item) {
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
    throw new Error(
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

function printCatalogPlan(log) {
  log("Stripe credit catalog plan:\n");
  for (const item of catalog) {
    const amount = `$${(item.unitAmount / 100).toFixed(2)}`;
    const cadence = item.recurring
      ? `/${item.recurring.interval}`
      : " one-time";
    log(
      `- ${item.catalogId}: ${item.productName}, ${amount}${cadence}, lookup_key=${item.lookupKey}, env=${item.envName}`
    );
  }
}

function resolveDeploymentEnvironment(env) {
  const vercelPresent = Object.hasOwn(env, "VERCEL_ENV");
  const markerPresent = Object.hasOwn(env, "MEELNI_ENV_PULL_ENVIRONMENT");
  const vercelEnvironment = vercelPresent ? env.VERCEL_ENV : undefined;
  const marker = markerPresent ? env.MEELNI_ENV_PULL_ENVIRONMENT : undefined;
  if (
    (vercelPresent &&
      !["development", "preview", "production"].includes(vercelEnvironment)) ||
    (markerPresent && !["preview", "production"].includes(marker))
  ) {
    throw new Error("A valid trusted deployment environment is required.");
  }
  if (vercelEnvironment && marker && vercelEnvironment !== marker) {
    throw new Error("Trusted deployment environments conflict.");
  }
  const deployment = vercelEnvironment ?? marker;
  if (!deployment) {
    throw new Error("A trusted deployment environment is required.");
  }
  return deployment;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runStripeCatalogSetup().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Catalog setup failed."
    );
    process.exitCode = 1;
  });
}

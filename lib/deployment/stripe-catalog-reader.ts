import Stripe from "stripe";

import { STRIPE_API_VERSION } from "@/lib/billing/stripe-catalog";
import type { StripeCatalogReader } from "./deployment-preflight";

interface StripePreflightClient {
  accounts: {
    retrieveCurrent(): Promise<{ id: string }>;
  };
  prices: {
    retrieve(priceId: string): Promise<{
      active: boolean;
      currency: string;
      livemode: boolean;
      metadata: Record<string, string>;
      recurring?: {
        interval: string;
        interval_count: number;
        usage_type: string;
      } | null;
      unit_amount: number | null;
    }>;
  };
}

export function createStripeCatalogReader(
  secretKey: string,
  client: StripePreflightClient = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    maxNetworkRetries: 0,
    timeout: 10_000,
  })
): StripeCatalogReader {
  return {
    async readAccountId() {
      const account = await client.accounts.retrieveCurrent();
      return account.id;
    },
    async readPrice(priceId) {
      const price = await client.prices.retrieve(priceId);
      return {
        active: price.active,
        currency: price.currency,
        livemode: price.livemode,
        metadataApp: price.metadata.app,
        metadataCatalogId: price.metadata.catalog_id,
        recurringInterval: price.recurring?.interval ?? null,
        recurringIntervalCount: price.recurring?.interval_count ?? null,
        recurringUsageType: price.recurring?.usage_type ?? null,
        unitAmount: price.unit_amount,
      };
    },
  };
}

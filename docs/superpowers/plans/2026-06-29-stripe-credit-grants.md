# Stripe Credit Grants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `SAV-123` by mapping Stripe Checkout and webhook events to canonical billing catalog IDs and granting interview credits exactly once.

**Architecture:** Add a small Stripe catalog adapter that owns price-ID-to-catalog-ID normalization and Checkout mode selection. Update checkout and webhook routes to use catalog IDs instead of ad hoc tier strings, and grant credits through the credit ledger service with Stripe event/session/invoice IDs as idempotency keys. Keep Customer Portal and subscription sync compatible, but do not redesign pricing UI in this slice.

**Tech Stack:** TypeScript, Stripe Checkout/Billing, Drizzle ORM, `@meelni/core` billing catalog, `lib/billing/credits.ts`, Node test runner via `tsx --test`.

---

## File Structure

- Create `lib/billing/stripe-catalog.ts`
  - Owns Stripe API version, checkout catalog IDs, price env names, price-to-catalog mapping, and Checkout mode.
- Create `lib/billing/stripe-catalog.test.ts`
  - Contract tests for price mapping, missing env handling, and Checkout mode.
- Modify `app/api/checkout/create-session/route.ts`
  - Accept `catalogId: "interview_pass" | "starter" | "pro"`.
  - Use `mode: "payment"` for Interview Pass and `mode: "subscription"` for Starter/Pro.
  - Store `catalogId` in Checkout Session metadata and Subscription metadata.
- Modify `app/api/webhooks/stripe/route.ts`
  - Use latest Stripe API version `2026-02-25.clover`.
  - Map prices to catalog IDs.
  - On `checkout.session.completed`, grant Interview Pass credit once.
  - On `invoice.payment_succeeded`, grant Starter/Pro monthly credits once and roll over remaining subscription credits up to the catalog cap.
  - Preserve event-log idempotency and credit-ledger idempotency.
- Modify `app/api/billing/sync/route.ts` and `app/api/billing/portal/route.ts`
  - Use the shared Stripe API version constant.
  - Map subscription prices through catalog IDs.
- Modify `lib/db/schema-pricing.ts` and add `lib/db/migrations/0004_subscription_catalog_ids.sql`
  - Allow subscription `tier` values `free`, `starter`, and `pro`.
  - Do not add Interview Pass to `subscription.tier`; one-time passes are credit grants, not subscriptions.
- Update `docs/integrations/stripe/test-plan.md` and `docs/integrations/stripe/quick-reference.md`
  - Replace Pro/Premium/unlimited copy with Interview Pass, Starter, and Pro credit checks.

## Task 1: Add Stripe Catalog Adapter

**Files:**
- Create: `lib/billing/stripe-catalog.ts`
- Create: `lib/billing/stripe-catalog.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing catalog tests**

Create `lib/billing/stripe-catalog.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  STRIPE_API_VERSION,
  getCheckoutModeForCatalogId,
  getStripePriceIdForCatalogId,
  getStripeCatalogIdForPrice,
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
  assert.equal(getStripePriceIdForCatalogId("interview_pass", env), "price_pass");
  assert.equal(getStripeCatalogIdForPrice("price_starter", env), "starter");
  assert.equal(getStripeCatalogIdForPrice("price_pro", env), "pro");
});

test("stripe catalog rejects unsupported and unconfigured prices", () => {
  assert.throws(
    () => getStripePriceIdForCatalogId("trial", {}),
    /Catalog item trial is not sold through Stripe Checkout/
  );
  assert.throws(
    () => getStripePriceIdForCatalogId("starter", {}),
    /Missing STRIPE_STARTER_MONTHLY_PRICE_ID/
  );
  assert.throws(
    () => getStripeCatalogIdForPrice("price_unknown", {}),
    /Unknown Stripe price ID/
  );
});
```

- [ ] **Step 2: Add test script if needed**

If `package.json` does not already have a script that runs `lib/billing/*.test.ts`, keep using:

```json
"test:billing": "tsx --test lib/billing/*.test.ts"
```

- [ ] **Step 3: Run test red**

Run:

```bash
npm run test:billing
```

Expected: FAIL because `stripe-catalog.ts` is missing.

- [ ] **Step 4: Implement adapter**

Create `lib/billing/stripe-catalog.ts`:

```ts
import type Stripe from "stripe";
import type { BillingCatalogId } from "@meelni/core";

export const STRIPE_API_VERSION = "2026-02-25.clover" satisfies Stripe.LatestApiVersion;

export type StripeCheckoutCatalogId = Extract<
  BillingCatalogId,
  "interview_pass" | "starter" | "pro"
>;

export type StripeCheckoutMode = "payment" | "subscription";

const PRICE_ENV_BY_CATALOG_ID = {
  interview_pass: "STRIPE_INTERVIEW_PASS_PRICE_ID",
  starter: "STRIPE_STARTER_MONTHLY_PRICE_ID",
  pro: "STRIPE_PRO_MONTHLY_PRICE_ID",
} as const satisfies Record<StripeCheckoutCatalogId, string>;

export function isStripeCheckoutCatalogId(
  value: string
): value is StripeCheckoutCatalogId {
  return value === "interview_pass" || value === "starter" || value === "pro";
}

export function getCheckoutModeForCatalogId(
  catalogId: StripeCheckoutCatalogId
): StripeCheckoutMode {
  return catalogId === "interview_pass" ? "payment" : "subscription";
}

export function getStripePriceIdForCatalogId(
  catalogId: BillingCatalogId,
  env: Record<string, string | undefined> = process.env
): string {
  if (!isStripeCheckoutCatalogId(catalogId)) {
    throw new Error(`Catalog item ${catalogId} is not sold through Stripe Checkout`);
  }

  const envName = PRICE_ENV_BY_CATALOG_ID[catalogId];
  const priceId = env[envName];

  if (!priceId) {
    throw new Error(`Missing ${envName}`);
  }

  return priceId;
}

export function getStripeCatalogIdForPrice(
  priceId: string | undefined,
  env: Record<string, string | undefined> = process.env
): StripeCheckoutCatalogId {
  if (!priceId) {
    throw new Error("Missing Stripe price ID");
  }

  for (const [catalogId, envName] of Object.entries(PRICE_ENV_BY_CATALOG_ID)) {
    if (env[envName] === priceId) {
      return catalogId as StripeCheckoutCatalogId;
    }
  }

  throw new Error(`Unknown Stripe price ID: ${priceId}`);
}
```

- [ ] **Step 5: Run tests green and commit**

Run:

```bash
npm run test:billing
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add lib/billing/stripe-catalog.ts lib/billing/stripe-catalog.test.ts package.json
git commit -m "Add Stripe billing catalog adapter"
```

## Task 2: Update Checkout Session Creation

**Files:**
- Modify: `app/api/checkout/create-session/route.ts`
- Test: `npm run typecheck`

- [ ] **Step 1: Update schema and metadata**

Change the route request schema to:

```ts
const checkoutSchema = z.object({
  catalogId: z.enum(["interview_pass", "starter", "pro"]),
  email: z.string().email().optional(),
});
```

Use `getStripePriceIdForCatalogId`, `getCheckoutModeForCatalogId`, and `STRIPE_API_VERSION`.

Set Checkout Session metadata:

```ts
metadata: {
  ...(userId ? { userId } : {}),
  catalogId,
}
```

For subscriptions, set `subscription_data.metadata.catalogId = catalogId`. Do not set a trial period in Stripe Checkout for paid subscriptions; the product trial is a separate 2-credit, 7-day local grant.

- [ ] **Step 2: Preserve duplicate subscription guard**

Change the active-subscription guard so it blocks only active `starter` or `pro` subscriptions:

```ts
if (
  (sub.tier === "starter" || sub.tier === "pro") &&
  (sub.status === "active" || sub.status === "trialing") &&
  !sub.cancelAtPeriodEnd
) {
  return NextResponse.json(
    {
      error: "You already have an active subscription",
      existingTier: sub.tier,
      status: sub.status,
    },
    { status: 400 }
  );
}
```

Do not block Interview Pass checkout for active subscribers.

- [ ] **Step 3: Run validation and commit**

Run:

```bash
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add app/api/checkout/create-session/route.ts
git commit -m "Map Checkout sessions to billing catalog"
```

## Task 3: Update Subscription Schema Catalog Values

**Files:**
- Modify: `lib/db/schema-pricing.ts`
- Create: `lib/db/migrations/0004_subscription_catalog_ids.sql`

- [ ] **Step 1: Update check constraint in schema**

Change `subscription_tier_check` to:

```ts
tierCheck: check("subscription_tier_check", sql`${table.tier} IN ('free', 'starter', 'pro')`),
```

- [ ] **Step 2: Add migration**

Create `lib/db/migrations/0004_subscription_catalog_ids.sql`:

```sql
ALTER TABLE "subscription" DROP CONSTRAINT IF EXISTS "subscription_tier_check";
--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_tier_check" CHECK ("subscription"."tier" IN ('free', 'starter', 'pro'));
```

- [ ] **Step 3: Run validation and commit**

Run:

```bash
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add lib/db/schema-pricing.ts lib/db/migrations/0004_subscription_catalog_ids.sql
git commit -m "Allow subscription catalog tiers"
```

## Task 4: Grant Credits From Stripe Webhooks

**Files:**
- Modify: `app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Update imports and API version**

Import:

```ts
import { createCreditLedgerService } from "@/lib/billing/credits";
import { createDrizzleCreditLedgerStore } from "@/lib/billing/credit-ledger-store";
import {
  STRIPE_API_VERSION,
  getStripeCatalogIdForPrice,
  isStripeCheckoutCatalogId,
} from "@/lib/billing/stripe-catalog";
```

Replace Stripe API version with `STRIPE_API_VERSION`.

- [ ] **Step 2: Add Checkout completed handling**

Add `checkout.session.completed` to the switch. Implement:

```ts
async function handleCheckoutCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.userId;
  const catalogId = session.metadata?.catalogId;

  if (!userId || !catalogId || !isStripeCheckoutCatalogId(catalogId)) {
    console.warn("Missing Checkout metadata for credit grant", { sessionId: session.id });
    return;
  }

  if (catalogId !== "interview_pass") {
    return;
  }

  const ledger = createCreditLedgerService({ store: createDrizzleCreditLedgerStore() });
  await ledger.grantCredits({
    userId,
    catalogId,
    source: "checkout",
    sourceId: session.id,
    idempotencyKey: `stripe:checkout:${session.id}:interview_pass`,
  });
}
```

- [ ] **Step 3: Normalize subscription updates**

Replace `getTierFromPrice` with `getStripeCatalogIdForPrice`. Store `subscription.tier = catalogId` for `starter` and `pro`. Remove `premiumTrialUsed` writes.

- [ ] **Step 4: Grant subscription credits on paid invoices**

In `handlePaymentSucceeded`, resolve user ID from invoice metadata, subscription metadata, or customer mapping. Resolve catalog ID from the first line price. If catalog ID is `starter` or `pro`, call:

```ts
const ledger = createCreditLedgerService({ store: createDrizzleCreditLedgerStore() });
await ledger.rolloverSubscriptionCredits({
  userId,
  catalogId,
  idempotencyKey: `stripe:rollover:${invoice.id}:${catalogId}`,
  sourceId: invoice.id,
});
await ledger.grantCredits({
  userId,
  catalogId,
  source: "subscription_renewal",
  sourceId: invoice.id,
  idempotencyKey: `stripe:invoice:${invoice.id}:${catalogId}`,
});
```

Keep `paymentHistory` insert idempotent with `stripeEventId`.

- [ ] **Step 5: Run validation and commit**

Run:

```bash
npm run test:billing
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add app/api/webhooks/stripe/route.ts
git commit -m "Grant credits from Stripe webhooks"
```

## Task 5: Sync And Portal Compatibility

**Files:**
- Modify: `app/api/billing/sync/route.ts`
- Modify: `app/api/billing/portal/route.ts`

- [ ] **Step 1: Use shared Stripe API version**

Import `STRIPE_API_VERSION` in both routes and use it when constructing Stripe clients.

- [ ] **Step 2: Map sync subscription tier through catalog ID**

In `app/api/billing/sync/route.ts`, replace `getTierFromPriceId` implementation with `getStripeCatalogIdForPrice`. If the price is unknown, log and preserve current local state instead of defaulting to Pro.

- [ ] **Step 3: Stop creating free usage records in sync**

Remove usage-record initialization for the default free path. Local trial grants are handled outside Stripe; ongoing free full interviews are removed from the product.

- [ ] **Step 4: Run validation and commit**

Run:

```bash
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add app/api/billing/sync/route.ts app/api/billing/portal/route.ts
git commit -m "Sync billing routes with Stripe catalog"
```

## Task 6: Update Stripe Runbooks

**Files:**
- Modify: `docs/integrations/stripe/test-plan.md`
- Modify: `docs/integrations/stripe/quick-reference.md`

- [ ] **Step 1: Replace old plan references**

Update docs to use:

- Interview Pass: $9, one credit, 30-day expiration.
- Starter monthly: $19, 4 credits, rollover cap 4, rollover expiration 60 days.
- Pro monthly: $49, 12 credits, rollover cap 12, rollover expiration 60 days.

Remove Premium annual and unlimited language.

- [ ] **Step 2: Add webhook replay checks**

Add SQL checks for credit grants:

```sql
SELECT user_id, catalog_id, source, source_id, original_credits, remaining_credits, expires_at
FROM credit_grant
ORDER BY created_at DESC LIMIT 10;
```

Add Stripe CLI replay note:

```bash
stripe events resend <evt_id> --webhook-endpoint=<endpoint_id>
```

Expected: replay does not create duplicate `credit_grant` rows because `idempotency_key` is unique.

- [ ] **Step 3: Commit**

```bash
git add docs/integrations/stripe/test-plan.md docs/integrations/stripe/quick-reference.md
git commit -m "Update Stripe credit grant runbooks"
```

## Task 7: Final Validation And Linear Update

- [ ] **Step 1: Run final checks**

Run:

```bash
npm run test:billing
npm run test:workflows
npm run test:core
npm run test:packages
npm run typecheck
```

- [ ] **Step 2: Open stacked PR**

Push `codex/sav-123-stripe-credit-grants` and open a draft PR against `codex/sav-122-credit-enforcement`.

- [ ] **Step 3: Update Linear**

Comment on `SAV-123` with PR link and validation, then move it to `In Review`.

## Self-Review

Spec coverage:

- Price IDs map to catalog IDs: Tasks 1, 2, 4, 5.
- Duplicate webhook events do not double-grant credits: event log idempotency remains, and credit grant idempotency keys are unique in Task 4.
- Subscription start and renewal grant monthly credits with rollover cap rules: Task 4.
- One-time pass checkout grants one expiring credit: Task 4.
- Tests or documented Stripe CLI checks cover webhook replay and failed payment behavior: Tasks 1 and 6.

Intentional boundary:

- Pricing page UI copy and product surfaces are handled in `SAV-124`.

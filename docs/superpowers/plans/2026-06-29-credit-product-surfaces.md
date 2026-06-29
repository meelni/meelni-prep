# Credit Product Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `SAV-124` so pricing, setup, dashboard billing, no-credit modals, and structured data describe the credit-based catalog instead of free/unlimited quotas.

**Architecture:** Add a small UI-facing billing catalog presenter in `lib/billing/catalog-presentation.ts` that derives labels, prices, CTAs, and feature bullets from `@meelni/core`. Add a read-only credit balance API for dashboard/setup surfaces. Replace old Free/Pro quota copy in pricing, modals, success/cancel pages, dashboard billing, and structured data with credit catalog language.

**Tech Stack:** Next.js App Router, React, TypeScript, Drizzle-backed credit ledger service, `@meelni/core` billing catalog.

---

## File Structure

- Create `lib/billing/catalog-presentation.ts`: Converts `BILLING_CATALOG` items into UI plan cards and SEO offers.
- Create `lib/billing/catalog-presentation.test.ts`: Contract tests that public cards include Trial, Interview Pass, Starter, and Pro with correct prices/credits.
- Create `app/api/billing/credits/route.ts`: Authenticated read-only API returning credit balance and active grant summaries.
- Modify `app/pricing/page.tsx` and `components/sections/pricing.tsx`: Render catalog plans and start Checkout with `catalogId` for purchasable plans.
- Modify `components/structured-data.tsx`: Replace stale free/unlimited FAQ and offers with credit pricing.
- Modify `app/pricing/success/page.tsx` and `app/pricing/canceled/page.tsx`: Remove trial/subscription-only copy and make success generic for pass/subscription purchases.
- Modify `components/dashboard/quota-exceeded-modal.tsx` and `components/dashboard/tier-upgrade-modal.tsx`: Convert quota/tier language into no-credit/purchase-options language.
- Modify `components/dashboard/sections/billing.tsx`: Fetch `/api/billing/credits`, show current plan, available/reserved/expiring credits, next expiration, and rollover rules.
- Modify `app/setup/setup-content.tsx`: Stop gating round types by free/pro tier, fetch credit balance, and show purchase options when session start returns `insufficient_credits`.

## Task 1: Catalog Presenter

**Files:**
- Create: `lib/billing/catalog-presentation.ts`
- Create: `lib/billing/catalog-presentation.test.ts`

- [ ] **Step 1: Write presenter tests**

Create tests that assert:
- `getPublicPricingPlans()` returns `trial`, `interview_pass`, `starter`, `pro`.
- Interview Pass displays `$9`, `1 credit`, and `/pass`.
- Starter displays `$19`, `4 credits/month`, rollover cap 4, and catalog ID `starter`.
- Pro displays `$49`, `12 credits/month`, rollover cap 12, and catalog ID `pro`.

Run `npm run test:billing`; expect failure until implementation exists.

- [ ] **Step 2: Implement presenter**

Implement exported helpers:
- `formatCatalogPrice(cents: number): string`
- `getPublicPricingPlans(): PublicPricingPlan[]`
- `getStructuredDataOffers(): StructuredDataOffer[]`
- `getPurchaseCatalogIds(): Array<"interview_pass" | "starter" | "pro">`

Use `BILLING_CATALOG` from `@meelni/core`; do not hardcode prices outside this file.

- [ ] **Step 3: Validate and commit**

Run:

```bash
npm run test:billing
npm run typecheck
```

Commit:

```bash
git add lib/billing/catalog-presentation.ts lib/billing/catalog-presentation.test.ts
git commit -m "Add billing catalog presentation helpers"
```

## Task 2: Credit Balance API

**Files:**
- Create: `app/api/billing/credits/route.ts`

- [ ] **Step 1: Implement authenticated read endpoint**

Create `GET /api/billing/credits` that:
- Authenticates through Supabase.
- Uses `createCreditLedgerService({ store: createDrizzleCreditLedgerStore() })`.
- Returns `availableCredits`, `reservedCredits`, `expiringCredits`, `nextCreditExpiresAt`.
- Returns active grant summaries from `createDrizzleCreditLedgerStore().listUserGrants(user.id)`, excluding expired and empty grants.

- [ ] **Step 2: Validate and commit**

Run:

```bash
npm run typecheck
```

Commit:

```bash
git add app/api/billing/credits/route.ts
git commit -m "Expose billing credit balance"
```

## Task 3: Public Pricing and SEO

**Files:**
- Modify: `app/pricing/page.tsx`
- Modify: `components/sections/pricing.tsx`
- Modify: `components/structured-data.tsx`
- Modify: `app/pricing/success/page.tsx`
- Modify: `app/pricing/canceled/page.tsx`

- [ ] **Step 1: Render public plans from presenter**

Replace `siteConfig.pricing` usage with `getPublicPricingPlans()`. Use Checkout for purchasable plans:

```ts
await fetch("/api/checkout/create-session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ catalogId: plan.catalogId }),
});
```

Use link/button fallback to dashboard for Trial.

- [ ] **Step 2: Update SEO structured data**

Replace stale FAQ and software offers with `getStructuredDataOffers()`. Copy should mention:
- 2-credit, 7-day trial.
- $9 Interview Pass.
- $19 Starter with 4 monthly credits.
- $49 Pro with 12 monthly credits.

- [ ] **Step 3: Update checkout result copy**

Success page title should be generic: `Credits added to your account`. Copy should avoid “trial starts now” and “charged when trial ends”.

- [ ] **Step 4: Validate and commit**

Run:

```bash
npm run typecheck
```

Commit:

```bash
git add app/pricing/page.tsx components/sections/pricing.tsx components/structured-data.tsx app/pricing/success/page.tsx app/pricing/canceled/page.tsx
git commit -m "Update public pricing for credit catalog"
```

## Task 4: Setup and No-Credit Modals

**Files:**
- Modify: `app/setup/setup-content.tsx`
- Modify: `components/dashboard/quota-exceeded-modal.tsx`
- Modify: `components/dashboard/tier-upgrade-modal.tsx`

- [ ] **Step 1: Remove free/pro round locks from setup**

Allow all PM round types in the setup UI and track credit state separately. Keep defensive handling for older `interview_type_locked` responses, but primary session-start failure should be `insufficient_credits`.

- [ ] **Step 2: Convert modals to purchase-options language**

Quota modal becomes `No credits available` and highlights:
- Interview Pass: 1 credit for $9.
- Starter: 4 credits/month for $19.
- Pro: 12 credits/month for $49.

Tier upgrade modal becomes a backwards-compatible wrapper with the same plan options.

- [ ] **Step 3: Validate and commit**

Run:

```bash
npm run typecheck
```

Commit:

```bash
git add app/setup/setup-content.tsx components/dashboard/quota-exceeded-modal.tsx components/dashboard/tier-upgrade-modal.tsx
git commit -m "Update setup no-credit purchase surfaces"
```

## Task 5: Dashboard Billing Credits

**Files:**
- Modify: `components/dashboard/sections/billing.tsx`
- Optionally modify: `app/api/billing/subscription/route.ts`

- [ ] **Step 1: Fetch credit balance**

Add `/api/billing/credits` fetch to the billing section and replace the quota card with credit balance:
- Available credits.
- Reserved credits.
- Expiring credits.
- Next expiration date.
- Active grants by catalog/source.

- [ ] **Step 2: Update plan copy**

Use catalog names and prices. Free tier copy should say “No active paid plan” instead of “free tier with limited interviews”.

- [ ] **Step 3: Validate and commit**

Run:

```bash
npm run typecheck
```

Commit:

```bash
git add components/dashboard/sections/billing.tsx app/api/billing/subscription/route.ts
git commit -m "Show credit balance in billing dashboard"
```

## Task 6: Final Validation and Handoff

- [ ] **Step 1: Run validation**

Run:

```bash
npm run test:billing
npm run test:workflows
npm run test:core
npm run test:packages
npm run typecheck
rg -n "3 free|Product Sense questions only|UNLIMITED|unlimited interviews|\\$29|\\$249|premiumTrialUsed|interview_type_locked|quota_exceeded|free tier with limited" app components lib packages -g '*.ts' -g '*.tsx'
```

- [ ] **Step 2: Push and open PR**

Push branch `codex/sav-124-credit-product-surfaces` and open a draft PR against `codex/sav-123-stripe-credit-grants`.

- [ ] **Step 3: Update Linear**

Move `SAV-124` to In Review, attach PR, and comment with validation results.

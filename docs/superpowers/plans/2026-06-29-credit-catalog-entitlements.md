# Credit Catalog Entitlements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `SAV-120` by adding a canonical credit-based billing catalog and provider-independent entitlement contract in `@meelni/core`.

**Architecture:** Add new provider-independent catalog and entitlement helpers in `packages/core`, then export them through the existing package entrypoint. Keep existing legacy tier helpers temporarily so the current app keeps compiling while later tickets migrate session enforcement, Stripe, and UI to the credit model.

**Tech Stack:** TypeScript, Node test runner via `tsx --test`, `@meelni/core` package exports.

---

## File Structure

- Create `packages/core/src/billing-catalog.ts`
  - Owns catalog IDs, prices, included credits, expiration rules, rollover caps, and purchase metadata.
- Modify `packages/core/src/entitlements.ts`
  - Adds credit-bearing entitlement state and capability calculation.
  - Keeps legacy `SubscriptionTier` helpers during migration.
- Modify `packages/core/src/index.ts`
  - Exports `billing-catalog` before `entitlements` so all catalog contracts are available from `@meelni/core`.
- Modify `packages/core/src/contracts.test.ts`
  - Adds catalog and entitlement behavior tests.
  - Removes the old free Product Sense entitlement assertions from the package contract test.

## Task 1: Add Catalog Contract

**Files:**
- Create: `packages/core/src/billing-catalog.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/contracts.test.ts`

- [ ] **Step 1: Write the failing catalog test**

In `packages/core/src/contracts.test.ts`, update the import from `./index` to include the new catalog exports:

```ts
import {
  ALL_INTERVIEW_TYPES,
  BILLING_CATALOG,
  BILLING_CATALOG_ORDER,
  buildFullConfig,
  calculateOverallScore,
  canAccessInterviewType,
  clampScore,
  getAllowedInterviewTypes,
  getBillingCatalogItem,
  getDefaultDuration,
  getLockedInterviewTypes,
  getRequiredTier,
  getRequiredTierBadge,
  isValidRoundType,
  validateScores,
} from "./index";
```

Then add this test after `buildFullConfig applies system defaults and smart duration`:

```ts
test("billing catalog exposes accepted credit products", () => {
  assert.deepEqual(BILLING_CATALOG_ORDER, [
    "trial",
    "interview_pass",
    "starter",
    "pro",
    "admin_grant",
  ]);

  assert.equal(BILLING_CATALOG.trial.priceInCents, 0);
  assert.equal(BILLING_CATALOG.trial.includedCredits, 2);
  assert.equal(BILLING_CATALOG.trial.expiresAfterDays, 7);
  assert.equal(BILLING_CATALOG.trial.rolloverCapCredits, 0);

  assert.equal(BILLING_CATALOG.interview_pass.priceInCents, 900);
  assert.equal(BILLING_CATALOG.interview_pass.includedCredits, 1);
  assert.equal(BILLING_CATALOG.interview_pass.expiresAfterDays, 30);

  assert.equal(BILLING_CATALOG.starter.priceInCents, 1900);
  assert.equal(BILLING_CATALOG.starter.includedCredits, 4);
  assert.equal(BILLING_CATALOG.starter.rolloverCapCredits, 4);
  assert.equal(BILLING_CATALOG.starter.rolloverExpiresAfterDays, 60);

  assert.equal(BILLING_CATALOG.pro.priceInCents, 4900);
  assert.equal(BILLING_CATALOG.pro.includedCredits, 12);
  assert.equal(BILLING_CATALOG.pro.rolloverCapCredits, 12);
  assert.equal(BILLING_CATALOG.pro.rolloverExpiresAfterDays, 60);

  assert.equal(getBillingCatalogItem("pro").displayName, "Pro");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:core
```

Expected: FAIL because `BILLING_CATALOG`, `BILLING_CATALOG_ORDER`, and `getBillingCatalogItem` are not exported.

- [ ] **Step 3: Add the catalog implementation**

Create `packages/core/src/billing-catalog.ts`:

```ts
export type BillingCatalogId =
  | "trial"
  | "interview_pass"
  | "starter"
  | "pro"
  | "admin_grant";

export type BillingCatalogKind =
  | "trial"
  | "one_time"
  | "subscription"
  | "admin";

export interface BillingCatalogItem {
  id: BillingCatalogId;
  kind: BillingCatalogKind;
  displayName: string;
  description: string;
  priceInCents: number;
  currency: "usd";
  includedCredits: number;
  interval: "none" | "month";
  expiresAfterDays: number | null;
  rolloverCapCredits: number;
  rolloverExpiresAfterDays: number | null;
  canPurchase: boolean;
}

export const BILLING_CATALOG = {
  trial: {
    id: "trial",
    kind: "trial",
    displayName: "Trial",
    description: "Try 2 full PM interviews free.",
    priceInCents: 0,
    currency: "usd",
    includedCredits: 2,
    interval: "none",
    expiresAfterDays: 7,
    rolloverCapCredits: 0,
    rolloverExpiresAfterDays: null,
    canPurchase: false,
  },
  interview_pass: {
    id: "interview_pass",
    kind: "one_time",
    displayName: "Interview Pass",
    description: "One focused interview, no subscription.",
    priceInCents: 900,
    currency: "usd",
    includedCredits: 1,
    interval: "none",
    expiresAfterDays: 30,
    rolloverCapCredits: 0,
    rolloverExpiresAfterDays: null,
    canPurchase: true,
  },
  starter: {
    id: "starter",
    kind: "subscription",
    displayName: "Starter",
    description: "4 interviews per month.",
    priceInCents: 1900,
    currency: "usd",
    includedCredits: 4,
    interval: "month",
    expiresAfterDays: null,
    rolloverCapCredits: 4,
    rolloverExpiresAfterDays: 60,
    canPurchase: true,
  },
  pro: {
    id: "pro",
    kind: "subscription",
    displayName: "Pro",
    description: "12 interviews per month.",
    priceInCents: 4900,
    currency: "usd",
    includedCredits: 12,
    interval: "month",
    expiresAfterDays: null,
    rolloverCapCredits: 12,
    rolloverExpiresAfterDays: 60,
    canPurchase: true,
  },
  admin_grant: {
    id: "admin_grant",
    kind: "admin",
    displayName: "Admin Grant",
    description: "Manual credits for support, QA, pilots, and make-good grants.",
    priceInCents: 0,
    currency: "usd",
    includedCredits: 0,
    interval: "none",
    expiresAfterDays: null,
    rolloverCapCredits: 0,
    rolloverExpiresAfterDays: null,
    canPurchase: false,
  },
} as const satisfies Record<BillingCatalogId, BillingCatalogItem>;

export const BILLING_CATALOG_ORDER = [
  "trial",
  "interview_pass",
  "starter",
  "pro",
  "admin_grant",
] as const satisfies readonly BillingCatalogId[];

export function getBillingCatalogItem(id: BillingCatalogId): BillingCatalogItem {
  return BILLING_CATALOG[id];
}

export function isSubscriptionCatalogItem(id: BillingCatalogId): boolean {
  return BILLING_CATALOG[id].kind === "subscription";
}
```

Modify `packages/core/src/index.ts`:

```ts
export * from "./interview";
export * from "./billing-catalog";
export * from "./entitlements";
export * from "./evaluation";
export * from "./question";
export * from "./session";
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:core
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/billing-catalog.ts packages/core/src/index.ts packages/core/src/contracts.test.ts
git commit -m "Add credit billing catalog contract"
```

## Task 2: Add Credit Entitlement Capabilities

**Files:**
- Modify: `packages/core/src/entitlements.ts`
- Test: `packages/core/src/contracts.test.ts`

- [ ] **Step 1: Write the failing entitlement tests**

In `packages/core/src/contracts.test.ts`, update the import from `./index` to include:

```ts
  computeCreditEntitlements,
  type CreditEntitlementState,
```

Add this test after `billing catalog exposes accepted credit products`:

```ts
test("credit entitlements unlock all PM rounds while credits remain", () => {
  const trialState: CreditEntitlementState = {
    activeOffer: "trial",
    billingStatus: "trialing",
    remainingCredits: 2,
    nextCreditExpiresAt: "2026-07-06T00:00:00.000Z",
    trialAvailable: false,
  };

  const entitlements = computeCreditEntitlements(trialState);

  assert.equal(entitlements.canStartInterview, true);
  assert.equal(entitlements.remainingCredits, 2);
  assert.deepEqual(entitlements.allowedRoundTypes, ALL_INTERVIEW_TYPES);
  assert.deepEqual(entitlements.lockedRoundTypes, []);
  assert.equal(entitlements.creditExpiresAt, "2026-07-06T00:00:00.000Z");
  assert.equal(entitlements.activeOffer, "trial");
  assert.equal(entitlements.canBuyPass, true);
  assert.equal(entitlements.canSubscribe, true);
});

test("credit entitlements block interview start when credits are exhausted", () => {
  const exhaustedState: CreditEntitlementState = {
    activeOffer: "starter",
    billingStatus: "active",
    remainingCredits: 0,
    nextCreditExpiresAt: null,
    trialAvailable: false,
  };

  const entitlements = computeCreditEntitlements(exhaustedState);

  assert.equal(entitlements.canStartInterview, false);
  assert.equal(entitlements.remainingCredits, 0);
  assert.deepEqual(entitlements.allowedRoundTypes, []);
  assert.deepEqual(entitlements.lockedRoundTypes, ALL_INTERVIEW_TYPES);
  assert.equal(entitlements.noCreditReason, "no_credits_remaining");
  assert.equal(entitlements.canBuyPass, true);
  assert.equal(entitlements.canSubscribe, true);
});

test("credit entitlements expose trial CTA for users without active billing", () => {
  const expiredState: CreditEntitlementState = {
    activeOffer: null,
    billingStatus: "none",
    remainingCredits: 0,
    nextCreditExpiresAt: null,
    trialAvailable: true,
  };

  const entitlements = computeCreditEntitlements(expiredState);

  assert.equal(entitlements.canStartInterview, false);
  assert.equal(entitlements.trialAvailable, true);
  assert.equal(entitlements.canBuyPass, true);
  assert.equal(entitlements.canSubscribe, true);
});

test("admin credit state can start interviews when credits are present", () => {
  const adminState: CreditEntitlementState = {
    activeOffer: "admin_grant",
    billingStatus: "admin",
    remainingCredits: 5,
    nextCreditExpiresAt: null,
    trialAvailable: false,
  };

  const entitlements = computeCreditEntitlements(adminState);

  assert.equal(entitlements.canStartInterview, true);
  assert.deepEqual(entitlements.allowedRoundTypes, ALL_INTERVIEW_TYPES);
  assert.equal(entitlements.canBuyPass, false);
  assert.equal(entitlements.canSubscribe, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:core
```

Expected: FAIL because `computeCreditEntitlements` and `CreditEntitlementState` do not exist.

- [ ] **Step 3: Add the entitlement implementation**

Replace `packages/core/src/entitlements.ts` with:

```ts
import {
  ALL_INTERVIEW_TYPES,
  type RoundType,
} from "./interview";
import type { BillingCatalogId } from "./billing-catalog";

export type BillingStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired"
  | "admin";

export interface CreditEntitlementState {
  activeOffer: BillingCatalogId | null;
  billingStatus: BillingStatus;
  remainingCredits: number;
  nextCreditExpiresAt: string | null;
  trialAvailable: boolean;
}

export interface CreditEntitlements {
  canStartInterview: boolean;
  remainingCredits: number;
  allowedRoundTypes: RoundType[];
  lockedRoundTypes: RoundType[];
  creditExpiresAt: string | null;
  billingStatus: BillingStatus;
  activeOffer: BillingCatalogId | null;
  trialAvailable: boolean;
  canBuyPass: boolean;
  canSubscribe: boolean;
  canBuyTopUp: boolean;
  noCreditReason: "no_credits_remaining" | "billing_inactive" | null;
}

const ACTIVE_BILLING_STATUSES = new Set<BillingStatus>([
  "trialing",
  "active",
  "admin",
]);

export function computeCreditEntitlements(
  state: CreditEntitlementState
): CreditEntitlements {
  const normalizedCredits = Math.max(0, state.remainingCredits);
  const billingActive = ACTIVE_BILLING_STATUSES.has(state.billingStatus);
  const canStartInterview = billingActive && normalizedCredits > 0;
  const isAdmin = state.billingStatus === "admin";

  return {
    canStartInterview,
    remainingCredits: normalizedCredits,
    allowedRoundTypes: canStartInterview ? [...ALL_INTERVIEW_TYPES] : [],
    lockedRoundTypes: canStartInterview ? [] : [...ALL_INTERVIEW_TYPES],
    creditExpiresAt: state.nextCreditExpiresAt,
    billingStatus: state.billingStatus,
    activeOffer: state.activeOffer,
    trialAvailable: state.trialAvailable,
    canBuyPass: !isAdmin,
    canSubscribe: !isAdmin,
    canBuyTopUp:
      !isAdmin &&
      (state.activeOffer === "starter" || state.activeOffer === "pro"),
    noCreditReason: canStartInterview
      ? null
      : billingActive
        ? "no_credits_remaining"
        : "billing_inactive",
  };
}

/**
 * Legacy tier helpers are retained during the credit-billing migration so the
 * current app can compile while session, Stripe, and UI slices move over.
 */
export type SubscriptionTier = "free" | "pro" | "premium";

const TIER_PERMISSIONS: Record<
  SubscriptionTier,
  readonly RoundType[] | "all"
> = {
  free: ["product_sense"],
  pro: "all",
  premium: "all",
};

export function canAccessInterviewType(
  tier: SubscriptionTier,
  roundType: RoundType
): boolean {
  const permissions = TIER_PERMISSIONS[tier];

  if (permissions === "all") {
    return true;
  }

  return permissions.includes(roundType);
}

export function getAllowedInterviewTypes(tier: SubscriptionTier): RoundType[] {
  const permissions = TIER_PERMISSIONS[tier];

  if (permissions === "all") {
    return [...ALL_INTERVIEW_TYPES];
  }

  return [...permissions];
}

export function getLockedInterviewTypes(tier: SubscriptionTier): RoundType[] {
  const allowed = getAllowedInterviewTypes(tier);
  return ALL_INTERVIEW_TYPES.filter((type) => !allowed.includes(type));
}

export function getRequiredTier(roundType: RoundType): SubscriptionTier {
  if (roundType === "product_sense") {
    return "free";
  }

  return "pro";
}

export function getRequiredTierBadge(roundType: RoundType): string {
  const tier = getRequiredTier(roundType);

  if (tier === "free") {
    return "";
  }

  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm run test:core
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/entitlements.ts packages/core/src/contracts.test.ts
git commit -m "Add credit entitlement capabilities"
```

## Task 3: Remove Legacy Entitlement Assertions From Core Contracts

**Files:**
- Modify: `packages/core/src/contracts.test.ts`

- [ ] **Step 1: Verify no legacy entitlement helpers are imported**

In `packages/core/src/contracts.test.ts`, confirm these legacy helper imports are absent from the `./index` import list:

```ts
  canAccessInterviewType,
  getAllowedInterviewTypes,
  getLockedInterviewTypes,
  getRequiredTier,
  getRequiredTierBadge,
```

The import should keep the new credit helpers and non-billing core helpers.

- [ ] **Step 2: Replace the old access model test**

Replace the current test named `interview type helpers preserve current PM interview access model` with:

```ts
test("interview type helpers preserve PM round contracts", () => {
  assert.deepEqual(ALL_INTERVIEW_TYPES, [
    "product_sense",
    "behavioral",
    "execution",
    "strategy",
  ]);
  assert.equal(isValidRoundType("product_sense"), true);
  assert.equal(isValidRoundType("sales"), false);
  assert.equal(getDefaultDuration("behavioral"), 30);
});
```

- [ ] **Step 3: Run tests**

Run:

```bash
npm run test:core
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/contracts.test.ts
git commit -m "Remove legacy entitlement assertions from core contracts"
```

## Task 4: Verify Package Entry Points

**Files:**
- Verify: `scripts/package-entrypoints.test.ts`
- Verify: `packages/core/src/index.ts`

- [ ] **Step 1: Run package entrypoint tests**

Run:

```bash
npm run test:packages
```

Expected: PASS. If this fails because the script asserts the old `free` Product Sense behavior, update that script in the next step.

- [ ] **Step 2: Update package entrypoint test only if needed**

If `scripts/package-entrypoints.test.ts` imports `canAccessInterviewType` and asserts free Product Sense behavior, replace that assertion with a credit entitlement assertion:

```ts
import {
  computeCreditEntitlements,
  getBillingCatalogItem,
} from "@meelni/core";

const trial = getBillingCatalogItem("trial");
assert.equal(trial.includedCredits, 2);

const entitlements = computeCreditEntitlements({
  activeOffer: "trial",
  billingStatus: "trialing",
  remainingCredits: 1,
  nextCreditExpiresAt: null,
  trialAvailable: false,
});
assert.equal(entitlements.canStartInterview, true);
```

- [ ] **Step 3: Re-run package entrypoint tests**

Run:

```bash
npm run test:packages
```

Expected: PASS.

- [ ] **Step 4: Commit if the script changed**

If `scripts/package-entrypoints.test.ts` changed:

```bash
git add scripts/package-entrypoints.test.ts
git commit -m "Update package entrypoint billing contract"
```

If it did not change, do not create a commit for this task.

## Task 5: Final Validation And Linear Update

**Files:**
- Verify: package tests and Linear `SAV-120`

- [ ] **Step 1: Run focused validation**

Run:

```bash
npm run test:core
npm run test:packages
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 2: Check worktree**

Run:

```bash
git status --short
git log --oneline -5
```

Expected: clean worktree, with commits for completed implementation tasks.

- [ ] **Step 3: Update Linear**

Add a comment to `SAV-120` with:

```markdown
Implemented canonical credit catalog and core entitlement capabilities.

Validation:
- `npm run test:core`
- `npm run test:packages`
- `npm run typecheck`

Notes:
- Legacy tier helpers remain temporarily for current app compatibility.
- Core contract tests now assert credit-based access instead of free Product Sense access.
```

Move `SAV-120` to `In Review` if the branch is ready for review, or keep it `In Progress` if another task continues in the same branch.

## Self-Review

Spec coverage:

- Catalog exposes Trial, Interview Pass, Starter, Pro, and Admin grant definitions: Task 1.
- Entitlements compute `canStartInterview`, `remainingCredits`, round access, expiration, purchase options, and billing status: Task 2.
- Core tests cover trial, pass/subscription catalog, Starter, Pro, exhausted, expired, and admin-adjacent states: Tasks 1 and 2.
- Legacy premium/free Product Sense assumptions are removed from core contract tests: Task 3.

Known intentional gap:

- Legacy helper code remains during migration so app surfaces depending on `SubscriptionTier` keep compiling. Later tickets should remove it after setup, session, Stripe, and dashboard code migrate to credit entitlements.

# Pricing Implementation Plan
**Meelni - Three-Tier Subscription System**

**Date**: 2025-11-13
**Version**: 1.0
**Status**: Ready for Implementation

---

## Executive Summary

This document outlines the technical implementation roadmap for Meelni's three-tier pricing model (Free, Pro $29/mo, Premium $79/mo). The plan is structured in phases to minimize risk and allow for iterative validation.

**Timeline**: 6-8 weeks (MVP complete with Free + Pro tiers)
**Tech Stack**: Stripe + Next.js + Supabase + Drizzle ORM
**Launch Strategy**: Soft launch with Free + Pro only (Month 1), Premium tier in Month 2-3

---

## Phase 0: Current State Analysis

### What We Have ✅
- **Auth System**: Supabase Auth with Google OAuth + Email/Password
- **Database**: PostgreSQL via Supabase with Drizzle ORM
- **User Tables**: `app_user`, `user_settings` already exist
- **Session Tracking**: `interview_session` table with user_id references
- **RLS Policies**: 12 policies enforcing user data isolation
- **Analytics**: `user_insights` table for aggregated stats

### What We Need 🔲
- **Subscription Management**: User tier, billing cycle, status
- **Usage Tracking**: Interview count per billing period
- **Payment Integration**: Stripe subscriptions + webhooks
- **Feature Gating**: Middleware/API checks for tier limits
- **Billing Portal**: Stripe Customer Portal integration
- **Admin Dashboard**: View subscriptions, usage, revenue

---

## Phase 1: Database Schema Extensions (Week 1)

### 1.1 New Tables

#### `subscription` Table
Tracks user subscription state and billing.

```typescript
export const subscription = pgTable("subscription", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => appUser.id, { onDelete: "cascade" }).notNull().unique(),

  // Tier and status
  tier: text("tier").notNull().default("free"), // 'free', 'pro', 'premium'
  status: text("status").notNull().default("active"), // 'active', 'canceled', 'past_due', 'paused'
  billingCycle: text("billing_cycle"), // 'monthly', 'annual', null for free

  // Stripe integration
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),

  // Billing dates
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  trialEnd: timestamp("trial_end", { withTimezone: true }),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),

  // Metadata
  planName: text("plan_name"), // "Pro Monthly", "Premium Annual", etc.
  priceInCents: integer("price_in_cents"), // Store for historical record
  currency: text("currency").default("usd"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  tierCheck: check("tier_check", sql`${table.tier} IN ('free', 'pro', 'premium')`),
  statusCheck: check("status_check", sql`${table.status} IN ('active', 'canceled', 'past_due', 'paused', 'trialing')`),
  billingCycleCheck: check("billing_cycle_check", sql`${table.billingCycle} IS NULL OR ${table.billingCycle} IN ('monthly', 'annual')`),

  // Indexes
  stripeCustomerIdx: index("subscription_stripe_customer_idx").on(table.stripeCustomerId),
  stripeSubscriptionIdx: index("subscription_stripe_subscription_idx").on(table.stripeSubscriptionId),
  tierStatusIdx: index("subscription_tier_status_idx").on(table.tier, table.status),
}));
```

#### `usage_record` Table
Tracks interview usage per billing period for quota enforcement.

```typescript
export const usageRecord = pgTable("usage_record", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => appUser.id, { onDelete: "cascade" }).notNull(),

  // Billing period tracking
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),

  // Usage counters
  interviewsUsed: integer("interviews_used").default(0).notNull(),
  interviewsLimit: integer("interviews_limit").notNull(), // 3 for free, null/-1 for unlimited

  // Tier at time of period (for historical accuracy)
  tierSnapshot: text("tier_snapshot").notNull(),

  // Metadata
  resetAt: timestamp("reset_at", { withTimezone: true }), // Next reset date
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // Unique constraint: one record per user per period
  userPeriodUnique: index("usage_record_user_period_idx").on(table.userId, table.periodStart),
  userIdIdx: index("usage_record_user_id_idx").on(table.userId),
  periodEndIdx: index("usage_record_period_end_idx").on(table.periodEnd),
}));
```

#### `payment_history` Table
Historical record of all payments for analytics and support.

```typescript
export const paymentHistory = pgTable("payment_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => appUser.id, { onDelete: "cascade" }).notNull(),

  // Stripe references
  stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
  stripeInvoiceId: text("stripe_invoice_id"),

  // Payment details
  amountInCents: integer("amount_in_cents").notNull(),
  currency: text("currency").default("usd").notNull(),
  status: text("status").notNull(), // 'succeeded', 'failed', 'refunded', 'canceled'

  // Subscription info
  tier: text("tier"),
  billingCycle: text("billing_cycle"),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),

  // Metadata
  failureReason: text("failure_reason"),
  receiptUrl: text("receipt_url"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("payment_history_user_id_idx").on(table.userId),
  statusIdx: index("payment_history_status_idx").on(table.status),
  createdAtIdx: index("payment_history_created_at_idx").on(table.createdAt),
}));
```

### 1.2 Schema Extensions

#### Update `app_user` Table
Add trial tracking fields:

```typescript
// Add to existing app_user table
export const appUser = pgTable("app_user", {
  // ... existing fields ...

  // Trial tracking
  hasUsedTrial: boolean("has_used_trial").default(false).notNull(),
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
  trialEndedAt: timestamp("trial_ended_at", { withTimezone: true }),

  // Marketing attribution
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  referralCode: text("referral_code"),
});
```

### 1.3 Relations

```typescript
export const subscriptionRelations = relations(subscription, ({ one }) => ({
  user: one(appUser, {
    fields: [subscription.userId],
    references: [appUser.id],
  }),
}));

export const usageRecordRelations = relations(usageRecord, ({ one }) => ({
  user: one(appUser, {
    fields: [usageRecord.userId],
    references: [appUser.id],
  }),
}));

export const paymentHistoryRelations = relations(paymentHistory, ({ one }) => ({
  user: one(appUser, {
    fields: [paymentHistory.userId],
    references: [appUser.id],
  }),
}));

// Update appUserRelations
export const appUserRelations = relations(appUser, ({ many, one }) => ({
  // ... existing relations ...
  subscription: one(subscription, {
    fields: [appUser.id],
    references: [subscription.userId],
  }),
  usageRecords: many(usageRecord),
  paymentHistory: many(paymentHistory),
}));
```

### 1.4 Migration Steps

```bash
# Week 1: Database schema deployment

# 1. Update schema.ts with new tables
# 2. Generate migration
npx drizzle-kit generate

# 3. Review migration files
cat drizzle/migrations/*.sql

# 4. Apply migration to Supabase
npx drizzle-kit push

# 5. Verify tables created
# Check Supabase dashboard → Database → Tables

# 6. Add RLS policies via Supabase SQL editor (see Phase 2)
```

---

## Phase 2: RLS Policies & Security (Week 1)

### 2.1 Subscription RLS Policies

```sql
-- Enable RLS on subscription table
ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own subscription
CREATE POLICY "Users can view own subscription"
  ON subscription
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users cannot directly modify subscriptions (Stripe webhooks only)
-- No INSERT/UPDATE/DELETE policies for users
-- Admin service role will handle via Stripe webhooks

-- Policy: Service role (backend) can manage all subscriptions
CREATE POLICY "Service role can manage subscriptions"
  ON subscription
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
```

### 2.2 Usage Record RLS Policies

```sql
-- Enable RLS on usage_record table
ALTER TABLE usage_record ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own usage records
CREATE POLICY "Users can view own usage"
  ON usage_record
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can manage all usage records
CREATE POLICY "Service role can manage usage records"
  ON usage_record
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
```

### 2.3 Payment History RLS Policies

```sql
-- Enable RLS on payment_history table
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own payment history
CREATE POLICY "Users can view own payments"
  ON payment_history
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Service role can manage all payment records
CREATE POLICY "Service role can manage payments"
  ON payment_history
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
```

### 2.4 Update Interview Session Policies

Add tier-based access control:

```sql
-- Users can only create interviews if within quota
CREATE POLICY "Users can create interviews within quota"
  ON interview_session
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    -- Check if user is within quota (implemented in application layer)
    TRUE -- Application will enforce quota before insert
  );
```

---

## Phase 3: Stripe Integration (Week 2)

### 3.1 Stripe Setup

**Products & Prices to Create in Stripe Dashboard**:

```javascript
// Pro Tier
{
  product: {
    name: "Meelni Pro",
    description: "Unlimited AI mock interviews with advanced feedback",
    metadata: { tier: "pro", features: "unlimited_interviews,all_types,detailed_feedback" }
  },
  prices: [
    {
      nickname: "Pro Monthly",
      unit_amount: 2900, // $29.00
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { tier: "pro", cycle: "monthly" }
    },
    {
      nickname: "Pro Annual",
      unit_amount: 24900, // $249.00
      currency: "usd",
      recurring: { interval: "year" },
      metadata: { tier: "pro", cycle: "annual", discount_percent: "28" }
    }
  ]
}

// Premium Tier
{
  product: {
    name: "Meelni Premium",
    description: "Everything in Pro + advanced analytics, priority support, custom features",
    metadata: { tier: "premium", features: "all_pro,advanced_analytics,priority_support,custom_drills" }
  },
  prices: [
    {
      nickname: "Premium Monthly",
      unit_amount: 7900, // $79.00
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { tier: "premium", cycle: "monthly" }
    },
    {
      nickname: "Premium Annual",
      unit_amount: 69900, // $699.00
      currency: "usd",
      recurring: { interval: "year" },
      metadata: { tier: "premium", cycle: "annual", discount_percent: "26" }
    }
  ]
}
```

### 3.2 Environment Variables

Add to `.env.local`:

```bash
# Stripe (Get from Stripe Dashboard)
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs (after creating prices)
NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PREMIUM_ANNUAL_PRICE_ID=price_...
```

### 3.3 Install Stripe SDK

```bash
npm install stripe @stripe/stripe-js
npm install -D @types/stripe
```

### 3.4 Stripe API Wrapper

Create `/lib/stripe/server.ts`:

```typescript
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("Missing STRIPE_SECRET_KEY environment variable");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
  typescript: true,
});

// Helper: Create or retrieve Stripe customer
export async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  const { data: subscription } = await db
    .select()
    .from(subscriptionTable)
    .where(eq(subscriptionTable.userId, userId))
    .limit(1);

  if (subscription?.[0]?.stripeCustomerId) {
    return subscription[0].stripeCustomerId;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  // Save customer ID to database
  await db
    .insert(subscriptionTable)
    .values({
      userId,
      stripeCustomerId: customer.id,
      tier: "free",
      status: "active",
    })
    .onConflictDoUpdate({
      target: subscriptionTable.userId,
      set: { stripeCustomerId: customer.id },
    });

  return customer.id;
}
```

Create `/lib/stripe/client.ts`:

```typescript
import { loadStripe, Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null>;

export const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
};
```

---

## Phase 4: API Routes & Webhooks (Week 2-3)

### 4.1 Checkout Session API

Create `/app/api/stripe/create-checkout-session/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { priceId, tier, billingCycle } = await req.json();

    // Validate price ID
    const validPriceIds = [
      process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID,
      process.env.NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID,
      process.env.NEXT_PUBLIC_STRIPE_PREMIUM_MONTHLY_PRICE_ID,
      process.env.NEXT_PUBLIC_STRIPE_PREMIUM_ANNUAL_PRICE_ID,
    ];

    if (!validPriceIds.includes(priceId)) {
      return NextResponse.json({ error: "Invalid price ID" }, { status: 400 });
    }

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(user.id, user.email!);

    // Determine trial period (7 days for Pro, 14 days for Premium)
    const trialPeriodDays = tier === "premium" ? 14 : 7;

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: trialPeriodDays,
        metadata: {
          userId: user.id,
          tier,
          billingCycle,
        },
      },
      success_url: `${req.headers.get("origin")}/dashboard?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/pricing?canceled=true`,
      metadata: {
        userId: user.id,
        tier,
        billingCycle,
      },
    });

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
```

### 4.2 Customer Portal API

Create `/app/api/stripe/create-portal-session/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { subscription as subscriptionTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's Stripe customer ID
    const [subscription] = await db
      .select()
      .from(subscriptionTable)
      .where(eq(subscriptionTable.userId, user.id))
      .limit(1);

    if (!subscription?.stripeCustomerId) {
      return NextResponse.json({ error: "No subscription found" }, { status: 404 });
    }

    // Create portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${req.headers.get("origin")}/dashboard/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error: any) {
    console.error("Portal session error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create portal session" },
      { status: 500 }
    );
  }
}
```

### 4.3 Stripe Webhooks

Create `/app/api/stripe/webhook/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/server";
import { db } from "@/lib/db";
import { subscription, paymentHistory, usageRecord } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import Stripe from "stripe";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpdate(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: error.message || "Webhook handler failed" },
      { status: 500 }
    );
  }
}

// Webhook handlers
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) return;

  // Subscription created - handled by subscription.created webhook
}

async function handleSubscriptionUpdate(stripeSubscription: Stripe.Subscription) {
  const userId = stripeSubscription.metadata?.userId;
  if (!userId) {
    console.error("No userId in subscription metadata");
    return;
  }

  const tier = stripeSubscription.metadata?.tier || "pro";
  const billingCycle = stripeSubscription.metadata?.billingCycle || "monthly";
  const priceId = stripeSubscription.items.data[0]?.price.id;
  const priceAmount = stripeSubscription.items.data[0]?.price.unit_amount || 0;

  // Upsert subscription record
  await db
    .insert(subscription)
    .values({
      userId,
      tier,
      status: stripeSubscription.status === "active" || stripeSubscription.status === "trialing" ? "active" : stripeSubscription.status,
      billingCycle,
      stripeCustomerId: stripeSubscription.customer as string,
      stripeSubscriptionId: stripeSubscription.id,
      stripePriceId: priceId,
      currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
      trialEnd: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null,
      canceledAt: stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : null,
      cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      planName: `${tier.charAt(0).toUpperCase() + tier.slice(1)} ${billingCycle.charAt(0).toUpperCase() + billingCycle.slice(1)}`,
      priceInCents: priceAmount,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscription.userId,
      set: {
        tier,
        status: stripeSubscription.status === "active" || stripeSubscription.status === "trialing" ? "active" : stripeSubscription.status,
        billingCycle,
        stripeSubscriptionId: stripeSubscription.id,
        stripePriceId: priceId,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        trialEnd: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null,
        canceledAt: stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : null,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });

  // Initialize usage record for new billing period
  await initializeUsageRecord(userId, tier, new Date(stripeSubscription.current_period_start * 1000), new Date(stripeSubscription.current_period_end * 1000));
}

async function handleSubscriptionDeleted(stripeSubscription: Stripe.Subscription) {
  const userId = stripeSubscription.metadata?.userId;
  if (!userId) return;

  // Downgrade to free tier
  await db
    .update(subscription)
    .set({
      tier: "free",
      status: "canceled",
      canceledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscription.userId, userId));

  // Reset usage to free tier limits
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1); // End of current month
  await initializeUsageRecord(userId, "free", now, periodEnd);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const userId = invoice.subscription_details?.metadata?.userId || invoice.metadata?.userId;
  if (!userId) return;

  // Record payment
  await db.insert(paymentHistory).values({
    userId,
    stripePaymentIntentId: invoice.payment_intent as string,
    stripeInvoiceId: invoice.id,
    amountInCents: invoice.amount_paid,
    currency: invoice.currency,
    status: "succeeded",
    tier: invoice.subscription_details?.metadata?.tier,
    billingCycle: invoice.subscription_details?.metadata?.billingCycle,
    periodStart: invoice.period_start ? new Date(invoice.period_start * 1000) : null,
    periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : null,
    receiptUrl: invoice.hosted_invoice_url,
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const userId = invoice.subscription_details?.metadata?.userId || invoice.metadata?.userId;
  if (!userId) return;

  // Record failed payment
  await db.insert(paymentHistory).values({
    userId,
    stripeInvoiceId: invoice.id,
    amountInCents: invoice.amount_due,
    currency: invoice.currency,
    status: "failed",
    failureReason: invoice.last_finalization_error?.message || "Payment failed",
  });

  // Update subscription status
  await db
    .update(subscription)
    .set({
      status: "past_due",
      updatedAt: new Date(),
    })
    .where(eq(subscription.userId, userId));
}

// Helper: Initialize usage record
async function initializeUsageRecord(userId: string, tier: string, periodStart: Date, periodEnd: Date) {
  const limit = tier === "free" ? 3 : -1; // -1 = unlimited

  await db
    .insert(usageRecord)
    .values({
      userId,
      periodStart,
      periodEnd,
      interviewsUsed: 0,
      interviewsLimit: limit,
      tierSnapshot: tier,
      resetAt: periodEnd,
    })
    .onConflictDoUpdate({
      target: [usageRecord.userId, usageRecord.periodStart],
      set: {
        interviewsLimit: limit,
        tierSnapshot: tier,
        updatedAt: new Date(),
      },
    });
}
```

---

## Phase 5: Feature Gating & Usage Tracking (Week 3-4)

### 5.1 Usage Tracking Service

Create `/lib/services/usage.ts`:

```typescript
import { db } from "@/lib/db";
import { usageRecord, subscription as subscriptionTable } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

export interface UsageQuota {
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
  resetAt: Date;
}

export async function getUserQuota(userId: string): Promise<UsageQuota> {
  // Get current subscription tier
  const [sub] = await db
    .select()
    .from(subscriptionTable)
    .where(eq(subscriptionTable.userId, userId))
    .limit(1);

  const tier = sub?.tier || "free";

  // Get current billing period
  const now = new Date();
  const periodStart = sub?.currentPeriodStart || new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = sub?.currentPeriodEnd || new Date(now.getFullYear(), now.getMonth() + 1, 1);

  // Get or create usage record for current period
  let [usage] = await db
    .select()
    .from(usageRecord)
    .where(
      and(
        eq(usageRecord.userId, userId),
        gte(usageRecord.periodStart, periodStart),
        lte(usageRecord.periodEnd, periodEnd)
      )
    )
    .limit(1);

  if (!usage) {
    // Create new usage record
    const limit = tier === "free" ? 3 : -1;
    [usage] = await db
      .insert(usageRecord)
      .values({
        userId,
        periodStart,
        periodEnd,
        interviewsUsed: 0,
        interviewsLimit: limit,
        tierSnapshot: tier,
        resetAt: periodEnd,
      })
      .returning();
  }

  const unlimited = usage.interviewsLimit === -1;
  const remaining = unlimited ? Infinity : Math.max(0, usage.interviewsLimit - usage.interviewsUsed);

  return {
    used: usage.interviewsUsed,
    limit: usage.interviewsLimit,
    remaining,
    unlimited,
    resetAt: usage.resetAt!,
  };
}

export async function incrementUsage(userId: string): Promise<{ success: boolean; quota: UsageQuota }> {
  const quota = await getUserQuota(userId);

  // Check if within quota
  if (!quota.unlimited && quota.remaining <= 0) {
    return { success: false, quota };
  }

  // Increment usage
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

  await db
    .update(usageRecord)
    .set({
      interviewsUsed: quota.used + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(usageRecord.userId, userId),
        gte(usageRecord.periodStart, periodStart)
      )
    );

  // Return updated quota
  const updatedQuota = await getUserQuota(userId);
  return { success: true, quota: updatedQuota };
}

export async function canStartInterview(userId: string): Promise<{ allowed: boolean; reason?: string; quota?: UsageQuota }> {
  const quota = await getUserQuota(userId);

  if (quota.unlimited) {
    return { allowed: true, quota };
  }

  if (quota.remaining <= 0) {
    return {
      allowed: false,
      reason: `You've reached your ${quota.limit} interview limit for this month. Upgrade to Pro for unlimited interviews.`,
      quota,
    };
  }

  return { allowed: true, quota };
}
```

### 5.2 Feature Gate Middleware

Create `/lib/middleware/feature-gate.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type Tier = "free" | "pro" | "premium";

export interface FeatureAccess {
  unlimited_interviews: boolean;
  all_interview_types: boolean;
  detailed_feedback: boolean;
  advanced_analytics: boolean;
  transcript_history: boolean;
  difficulty_levels: boolean;
  pdf_export: boolean;
  priority_support: boolean;
  custom_questions: boolean;
}

const FEATURE_MATRIX: Record<Tier, FeatureAccess> = {
  free: {
    unlimited_interviews: false,
    all_interview_types: false, // Product Sense only
    detailed_feedback: false,
    advanced_analytics: false,
    transcript_history: false, // Last 5 only
    difficulty_levels: false, // Intermediate only
    pdf_export: false,
    priority_support: false,
    custom_questions: false,
  },
  pro: {
    unlimited_interviews: true,
    all_interview_types: true,
    detailed_feedback: true,
    advanced_analytics: false,
    transcript_history: true,
    difficulty_levels: true,
    pdf_export: true,
    priority_support: false,
    custom_questions: false,
  },
  premium: {
    unlimited_interviews: true,
    all_interview_types: true,
    detailed_feedback: true,
    advanced_analytics: true,
    transcript_history: true,
    difficulty_levels: true,
    pdf_export: true,
    priority_support: true,
    custom_questions: true,
  },
};

export async function getUserTier(userId: string): Promise<Tier> {
  const [sub] = await db
    .select()
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);

  return (sub?.tier as Tier) || "free";
}

export async function getFeatureAccess(userId: string): Promise<FeatureAccess> {
  const tier = await getUserTier(userId);
  return FEATURE_MATRIX[tier];
}

export async function requireFeature(
  req: NextRequest,
  feature: keyof FeatureAccess
): Promise<{ allowed: boolean; tier?: Tier; response?: NextResponse }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      allowed: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const tier = await getUserTier(user.id);
  const access = FEATURE_MATRIX[tier];

  if (!access[feature]) {
    return {
      allowed: false,
      tier,
      response: NextResponse.json(
        {
          error: "Upgrade required",
          feature,
          currentTier: tier,
          requiredTier: feature.startsWith("custom") ? "premium" : "pro",
        },
        { status: 403 }
      ),
    };
  }

  return { allowed: true, tier };
}
```

### 5.3 Update Interview Start API

Modify `/app/api/livekit/token/route.ts` to check quota:

```typescript
import { canStartInterview, incrementUsage } from "@/lib/services/usage";

export async function POST(req: NextRequest) {
  // ... existing auth check ...

  // Check quota before allowing interview
  const { allowed, reason, quota } = await canStartInterview(user.id);

  if (!allowed) {
    return NextResponse.json(
      {
        error: reason,
        quota,
        upgradeUrl: "/pricing",
      },
      { status: 403 }
    );
  }

  // ... existing token generation ...

  // Increment usage counter AFTER successful token generation
  await incrementUsage(user.id);

  return NextResponse.json({ token, url, quota });
}
```

---

## Phase 6: Pricing Page & Checkout Flow (Week 4-5)

### 6.1 Pricing Page Component

Create `/app/pricing/page.tsx`:

```typescript
"use client";

import { useState } from "use";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { getStripe } from "@/lib/stripe/client";

const TIERS = [
  {
    id: "free",
    name: "Free",
    price: { monthly: 0, annual: 0 },
    description: "Perfect for exploring",
    features: [
      "3 AI mock interviews per month",
      "Product Sense questions only",
      "Basic scoring (overall + 4 dimensions)",
      "Last 5 sessions visible",
      "Community support",
    ],
    cta: "Start Free",
    highlighted: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: { monthly: 29, annual: 249 },
    priceIds: {
      monthly: process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID!,
      annual: process.env.NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID!,
    },
    description: "For serious interview prep",
    badge: "Most Popular",
    features: [
      "UNLIMITED AI mock interviews",
      "All 4 interview types (PS/Analytical/Leadership/Strategy)",
      "2,879 curated PM questions",
      "Detailed framework-based feedback + rubrics",
      "Full analytics dashboard with trends",
      "Unlimited transcript history",
      "All difficulty levels (Junior → Senior PM)",
      "PDF export of feedback reports",
      "Email support (24h response)",
    ],
    cta: "Start 7-Day Free Trial",
    highlighted: true,
    trial: 7,
  },
  {
    id: "premium",
    name: "Premium",
    price: { monthly: 79, annual: 699 },
    priceIds: {
      monthly: process.env.NEXT_PUBLIC_STRIPE_PREMIUM_MONTHLY_PRICE_ID!,
      annual: process.env.NEXT_PUBLIC_STRIPE_PREMIUM_ANNUAL_PRICE_ID!,
    },
    description: "For power users & career switchers",
    features: [
      "Everything in Pro, PLUS:",
      "Advanced analytics & competitive benchmarks",
      "Custom improvement drills tailored to weaknesses",
      "Early access to new questions & features",
      "API access for data export",
      "Priority support + monthly office hours",
      "Custom question uploads (for specific companies)",
      "Adaptive difficulty AI (learns your level)",
    ],
    cta: "Start 14-Day Free Trial",
    highlighted: false,
    trial: 14,
  },
];

export default function PricingPage() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [loading, setLoading] = useState<string | null>(null);
  const router = useRouter();

  const handleCheckout = async (tierId: string) => {
    if (tierId === "free") {
      router.push("/auth/signup");
      return;
    }

    setLoading(tierId);

    try {
      const tier = TIERS.find((t) => t.id === tierId)!;
      const priceId = tier.priceIds![billingCycle];

      // Create checkout session
      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId,
          tier: tierId,
          billingCycle,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create checkout session");
      }

      const { sessionId } = await res.json();

      // Redirect to Stripe Checkout
      const stripe = await getStripe();
      await stripe?.redirectToCheckout({ sessionId });
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Failed to start checkout. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background py-24 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-display font-bold mb-4">
            Choose Your Plan
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Start free and upgrade anytime. No credit card required for free tier.
          </p>

          {/* Billing cycle toggle */}
          <div className="mt-8 flex items-center justify-center gap-4">
            <span className={billingCycle === "monthly" ? "font-semibold" : "text-muted-foreground"}>
              Monthly
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === "monthly" ? "annual" : "monthly")}
              className="relative inline-flex h-6 w-11 items-center rounded-full bg-primary/20 transition-colors hover:bg-primary/30"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-primary transition-transform ${
                  billingCycle === "annual" ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span className={billingCycle === "annual" ? "font-semibold" : "text-muted-foreground"}>
              Annual <Badge variant="success" className="ml-2">Save 28%</Badge>
            </span>
          </div>
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-3 gap-8">
          {TIERS.map((tier) => (
            <Card
              key={tier.id}
              className={`p-8 relative ${
                tier.highlighted
                  ? "border-primary shadow-lg shadow-primary/20 scale-105"
                  : ""
              }`}
            >
              {tier.badge && (
                <Badge variant="default" className="absolute -top-3 left-1/2 -translate-x-1/2">
                  {tier.badge}
                </Badge>
              )}

              <div className="text-center mb-6">
                <h3 className="text-2xl font-display font-bold mb-2">{tier.name}</h3>
                <p className="text-sm text-muted-foreground">{tier.description}</p>
              </div>

              <div className="text-center mb-6">
                <div className="text-5xl font-bold">
                  ${tier.price[billingCycle]}
                  {tier.id !== "free" && (
                    <span className="text-lg text-muted-foreground">
                      /{billingCycle === "monthly" ? "mo" : "yr"}
                    </span>
                  )}
                </div>
                {billingCycle === "annual" && tier.id !== "free" && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Billed ${tier.price.annual}/year
                  </p>
                )}
              </div>

              <Button
                onClick={() => handleCheckout(tier.id)}
                variant={tier.highlighted ? "default" : "outline"}
                className="w-full mb-6"
                disabled={loading === tier.id}
              >
                {loading === tier.id ? "Loading..." : tier.cta}
              </Button>

              {tier.trial && (
                <p className="text-xs text-center text-muted-foreground mb-6">
                  {tier.trial}-day free trial • Cancel anytime
                </p>
              )}

              <ul className="space-y-3">
                {tier.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        {/* FAQ section */}
        <div className="mt-24 max-w-3xl mx-auto">
          <h2 className="text-3xl font-display font-bold text-center mb-12">
            Frequently Asked Questions
          </h2>
          {/* Add FAQ items here */}
        </div>
      </div>
    </div>
  );
}
```

### 6.2 Success/Cancel Pages

Create `/app/dashboard/page.tsx` success handler:

```typescript
// Add to existing dashboard page
"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const success = searchParams.get("success");
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (success === "true" && sessionId) {
      // Show success toast
      toast.success("Welcome to Meelni Pro! Your subscription is active.");
    }
  }, [success, sessionId]);

  // ... rest of dashboard ...
}
```

---

## Phase 7: Billing Dashboard (Week 5)

### 7.1 Billing Page Component

Create `/app/dashboard/billing/page.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/providers/auth-provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { CreditCard, Calendar, TrendingUp } from "lucide-react";

interface SubscriptionData {
  tier: string;
  status: string;
  billingCycle: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  planName: string;
  priceInCents: number;
}

interface UsageData {
  used: number;
  limit: number;
  unlimited: boolean;
  resetAt: string;
}

export default function BillingPage() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBillingData() {
      try {
        const [subRes, usageRes] = await Promise.all([
          fetch("/api/billing/subscription"),
          fetch("/api/billing/usage"),
        ]);

        if (subRes.ok) {
          setSubscription(await subRes.json());
        }

        if (usageRes.ok) {
          setUsage(await usageRes.json());
        }
      } catch (error) {
        console.error("Failed to fetch billing data:", error);
      } finally {
        setLoading(false);
      }
    }

    if (user) {
      fetchBillingData();
    }
  }, [user]);

  const handleManageSubscription = async () => {
    try {
      const res = await fetch("/api/stripe/create-portal-session", {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Failed to create portal session");
      }

      const { url } = await res.json();
      window.location.href = url;
    } catch (error) {
      console.error("Portal error:", error);
      alert("Failed to open billing portal. Please try again.");
    }
  };

  if (loading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-3xl font-display font-bold mb-8">Billing & Usage</h1>

      <div className="grid gap-6">
        {/* Subscription Card */}
        <Card className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold mb-2">Current Plan</h2>
              <div className="flex items-center gap-2">
                <Badge variant={subscription?.tier === "premium" ? "default" : "secondary"}>
                  {subscription?.tier?.toUpperCase() || "FREE"}
                </Badge>
                {subscription?.status === "active" && (
                  <Badge variant="success">Active</Badge>
                )}
                {subscription?.cancelAtPeriodEnd && (
                  <Badge variant="warning">Cancels {format(new Date(subscription.currentPeriodEnd), "MMM d, yyyy")}</Badge>
                )}
              </div>
            </div>
            <CreditCard className="w-8 h-8 text-muted-foreground" />
          </div>

          {subscription && subscription.tier !== "free" && (
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{subscription.planName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Price</span>
                <span className="font-medium">${(subscription.priceInCents / 100).toFixed(2)}/{subscription.billingCycle === "monthly" ? "mo" : "yr"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Next billing date</span>
                <span className="font-medium">{format(new Date(subscription.currentPeriodEnd), "MMMM d, yyyy")}</span>
              </div>

              <Button onClick={handleManageSubscription} className="w-full mt-4">
                Manage Subscription
              </Button>
            </div>
          )}

          {(!subscription || subscription.tier === "free") && (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">
                You're on the Free plan. Upgrade for unlimited interviews and advanced features.
              </p>
              <Button onClick={() => (window.location.href = "/pricing")}>
                View Plans
              </Button>
            </div>
          )}
        </Card>

        {/* Usage Card */}
        <Card className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold mb-2">Usage This Month</h2>
              <p className="text-sm text-muted-foreground">
                Resets {usage && format(new Date(usage.resetAt), "MMMM d, yyyy")}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-muted-foreground" />
          </div>

          {usage && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Interviews</span>
                  <span className="text-sm font-medium">
                    {usage.used} {usage.unlimited ? "" : `/ ${usage.limit}`}
                  </span>
                </div>
                {!usage.unlimited && (
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }}
                    />
                  </div>
                )}
                {usage.unlimited && (
                  <Badge variant="success" className="mt-2">Unlimited</Badge>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Payment History Card */}
        <Card className="p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl font-semibold mb-2">Payment History</h2>
              <p className="text-sm text-muted-foreground">
                View and download past invoices
              </p>
            </div>
            <Calendar className="w-8 h-8 text-muted-foreground" />
          </div>

          <Button onClick={handleManageSubscription} variant="outline" className="w-full">
            View All Invoices
          </Button>
        </Card>
      </div>
    </div>
  );
}
```

### 7.2 Billing API Routes

Create `/app/api/billing/subscription/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { subscription } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [sub] = await db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, user.id))
      .limit(1);

    return NextResponse.json(sub || { tier: "free", status: "active" });
  } catch (error) {
    console.error("Subscription fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch subscription" }, { status: 500 });
  }
}
```

Create `/app/api/billing/usage/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserQuota } from "@/lib/services/usage";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const quota = await getUserQuota(user.id);
    return NextResponse.json(quota);
  } catch (error) {
    console.error("Usage fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch usage" }, { status: 500 });
  }
}
```

---

## Phase 8: Testing & Launch (Week 6)

### 8.1 Testing Checklist

**Stripe Integration**:
- [ ] Test checkout flow (monthly + annual)
- [ ] Verify webhooks fire correctly (use Stripe CLI)
- [ ] Test trial periods (7 days Pro, 14 days Premium)
- [ ] Test subscription cancellation
- [ ] Test payment failure scenarios
- [ ] Verify Customer Portal access

**Usage Tracking**:
- [ ] Free tier limited to 3 interviews/month
- [ ] Pro/Premium tiers have unlimited interviews
- [ ] Usage resets correctly at period end
- [ ] Quota enforcement blocks interviews when limit reached

**Feature Gating**:
- [ ] Free tier: Product Sense questions only
- [ ] Pro tier: All 4 interview types accessible
- [ ] Premium tier: Advanced analytics visible
- [ ] PDF export restricted to Pro+ tiers
- [ ] Transcript history limited on Free tier

**Billing Portal**:
- [ ] Users can upgrade from Free → Pro
- [ ] Users can upgrade from Pro → Premium
- [ ] Users can downgrade from Premium → Pro
- [ ] Users can cancel subscription
- [ ] Users can update payment method
- [ ] Users can view invoice history

### 8.2 Stripe Webhook Testing

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
stripe trigger invoice.payment_failed
```

### 8.3 Launch Sequence

**Week 6: Soft Launch (Free + Pro Only)**
1. Deploy database migrations to Supabase
2. Create Stripe products and prices (Pro only)
3. Set up Stripe webhooks in production
4. Deploy Next.js app to Vercel
5. Test end-to-end flow in production
6. Announce to small beta group (10-20 users)

**Week 7-8: Premium Tier Rollout**
1. Create Premium tier in Stripe
2. Update pricing page with Premium tier
3. Add Premium-only features (advanced analytics, etc.)
4. Email existing Pro users about Premium option
5. Announce publicly

**Week 9+: Optimization**
1. A/B test pricing ($29 vs $34 for Pro)
2. Monitor conversion funnels
3. Iterate on feature packaging based on usage data
4. Implement referral program

---

## Phase 9: Admin Dashboard (Optional, Week 7-8)

### 9.1 Admin API Routes

Create `/app/api/admin/metrics/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subscription, paymentHistory } from "@/lib/db/schema";
import { sql, eq, gte, count } from "drizzle-orm";

export async function GET() {
  try {
    // Verify admin access (implement your own auth check)
    // ...

    // MRR calculation
    const [mrrData] = await db
      .select({
        totalMRR: sql<number>`
          SUM(
            CASE
              WHEN ${subscription.billingCycle} = 'monthly' THEN ${subscription.priceInCents}
              WHEN ${subscription.billingCycle} = 'annual' THEN ${subscription.priceInCents} / 12
              ELSE 0
            END
          ) / 100
        `,
        proUsers: sql<number>`COUNT(*) FILTER (WHERE ${subscription.tier} = 'pro')`,
        premiumUsers: sql<number>`COUNT(*) FILTER (WHERE ${subscription.tier} = 'premium')`,
        freeUsers: sql<number>`COUNT(*) FILTER (WHERE ${subscription.tier} = 'free')`,
      })
      .from(subscription)
      .where(eq(subscription.status, "active"));

    // Revenue this month
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);

    const [revenueData] = await db
      .select({
        totalRevenue: sql<number>`SUM(${paymentHistory.amountInCents}) / 100`,
        paymentCount: count(),
      })
      .from(paymentHistory)
      .where(
        sql`${paymentHistory.createdAt} >= ${firstDayOfMonth} AND ${paymentHistory.status} = 'succeeded'`
      );

    return NextResponse.json({
      mrr: mrrData?.totalMRR || 0,
      arr: (mrrData?.totalMRR || 0) * 12,
      users: {
        free: mrrData?.freeUsers || 0,
        pro: mrrData?.proUsers || 0,
        premium: mrrData?.premiumUsers || 0,
        total: (mrrData?.freeUsers || 0) + (mrrData?.proUsers || 0) + (mrrData?.premiumUsers || 0),
      },
      revenue: {
        thisMonth: revenueData?.totalRevenue || 0,
        paymentCount: revenueData?.paymentCount || 0,
      },
    });
  } catch (error) {
    console.error("Metrics error:", error);
    return NextResponse.json({ error: "Failed to fetch metrics" }, { status: 500 });
  }
}
```

---

## Implementation Summary

### Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Phase 1** | Week 1 | Database schema + migrations |
| **Phase 2** | Week 1 | RLS policies deployed |
| **Phase 3** | Week 2 | Stripe products + SDK integration |
| **Phase 4** | Week 2-3 | API routes + webhooks |
| **Phase 5** | Week 3-4 | Usage tracking + feature gates |
| **Phase 6** | Week 4-5 | Pricing page + checkout flow |
| **Phase 7** | Week 5 | Billing dashboard |
| **Phase 8** | Week 6 | Testing + soft launch |
| **Phase 9** | Week 7-8 | Admin dashboard (optional) |

**Total**: 6-8 weeks to MVP (Free + Pro + Premium)

### Tech Stack

- **Payments**: Stripe Subscriptions + Checkout + Customer Portal
- **Database**: PostgreSQL (Supabase) + Drizzle ORM
- **Auth**: Supabase Auth (already implemented)
- **Frontend**: Next.js 14 + React + Tailwind + shadcn/ui
- **Webhooks**: Stripe webhooks → Next.js API routes

### Key Files to Create

```
/lib/db/schema.ts                            # Add 3 new tables
/lib/stripe/server.ts                        # Stripe server SDK
/lib/stripe/client.ts                        # Stripe client SDK
/lib/services/usage.ts                       # Usage tracking service
/lib/middleware/feature-gate.ts              # Feature access control

/app/api/stripe/create-checkout-session/route.ts
/app/api/stripe/create-portal-session/route.ts
/app/api/stripe/webhook/route.ts
/app/api/billing/subscription/route.ts
/app/api/billing/usage/route.ts
/app/api/admin/metrics/route.ts

/app/pricing/page.tsx                        # Pricing page
/app/dashboard/billing/page.tsx              # Billing dashboard

drizzle/migrations/0001_add_subscription_tables.sql
```

### Environment Variables

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs
NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PRO_ANNUAL_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_...
NEXT_PUBLIC_STRIPE_PREMIUM_ANNUAL_PRICE_ID=price_...
```

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Validate assumptions** with 5-10 user interviews (willingness to pay)
3. **Set up Stripe account** and create test products
4. **Start Phase 1** (database schema) this week
5. **Schedule weekly check-ins** to track progress

**Questions? Blockers? Let's discuss.**

---

**End of Implementation Plan**

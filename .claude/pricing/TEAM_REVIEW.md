# Pricing Implementation Plan - Team Review

**Date**: 2025-11-13
**Reviewers**: Architect, Quality Reviewer, Product Lead
**Plan Version**: 1.0
**Status**: Review Complete - Requires Changes Before Implementation

---

## Executive Summary

**Overall Verdict**: 🟡 **APPROVED WITH CONDITIONS**

The pricing implementation plan is comprehensive and well-structured, but contains **12 critical issues** that must be addressed before implementation begins. The plan is production-ready **after fixes** are applied.

### Key Findings

✅ **Strengths**:
- Clear three-tier pricing model with strong value prop differentiation
- Comprehensive Stripe integration architecture
- Well-designed database schema with proper indexing
- Feature gating system is maintainable and scalable

🚨 **Critical Issues** (12 total):
- **Data Integrity** (5): Race conditions, webhook idempotency, transaction safety
- **Payment & Billing** (4): Failed payment recovery, trial expiration, refunds
- **User Experience** (3): Downgrade handling, quota preview, cancellation UX

📊 **Revised Timeline**: 6 weeks → **10 weeks**
- +2 weeks for Phase 0.5 (Critical Fixes)
- +2 weeks for extended testing

---

## Review #1: Architect Review

**Reviewer**: Technical Architect
**Focus**: Database schema, Stripe integration, scalability, security
**Grade**: 7.5/10

### ✅ What's Good

1. **Database Schema Design**
   - Proper separation of Stripe data (customer IDs) from business logic (tier/status)
   - Comprehensive indexing strategy (foreign keys, Stripe IDs, composite indexes)
   - Check constraints for enum validation at database level
   - Cascade deletes configured correctly

2. **Stripe Integration**
   - Idempotent webhook handlers using `onConflictDoUpdate`
   - Explicit trial periods (7 days Pro, 14 days Premium)
   - Webhook signature verification implemented
   - Metadata tracking for userId, tier, billingCycle

3. **Feature Gating System**
   - Declarative feature matrix is readable
   - Clean tier-based access control
   - Separate usage limits from feature flags

### ⚠️ What Needs Attention

#### 1. Database Schema Issues

**Missing Indexes**:
```typescript
// Add to usage_record table:
periodEndIdx: index("usage_record_period_end_idx").on(table.periodEnd),
tierSnapshotIdx: index("usage_record_tier_snapshot_idx").on(table.tierSnapshot),
```

**Incorrect Constraint Type**:
```typescript
// Line 112-113 uses index() but should be unique()
// CURRENT (WRONG):
userPeriodUnique: index("usage_record_user_period_idx").on(table.userId, table.periodStart),

// FIXED:
userPeriodUnique: unique("usage_record_user_period_uniq").on(table.userId, table.periodStart),
```

**Nullable Fields That Shouldn't Be**:
```typescript
// subscription table - active subscriptions ALWAYS have billing period
currentPeriodStart: timestamp("current_period_start", { withTimezone: true }).notNull(),
currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
```

**Trial Tracking Design Flaw**:
```typescript
// PROBLEM: What if user tries Pro trial, then Premium trial?
// app_user.hasUsedTrial is boolean (one trial per user)

// SOLUTION: Move trial tracking to subscription table
export const subscription = pgTable("subscription", {
  // ... existing fields ...
  proTrialUsed: boolean("pro_trial_used").default(false),
  premiumTrialUsed: boolean("premium_trial_used").default(false),
});
```

#### 2. RLS Policy Gaps

**Missing User Read Policy**:
```sql
-- Current: Only service role can read subscriptions
-- Problem: Frontend can't display subscription status

-- FIX:
CREATE POLICY "Users can view own subscription"
  ON subscription
  FOR SELECT
  USING (
    (SELECT auth.uid()) = user_id
    OR
    auth.jwt() ->> 'role' = 'service_role'
  );
```

#### 3. Webhook Race Conditions

**Critical: Subscription Update vs Usage Increment**:
```typescript
// SCENARIO:
// 1. User upgrades Pro → Premium
// 2. Webhook updates subscription.tier = "premium"
// 3. User starts interview (increments usage)
// 4. incrementUsage() reads OLD tier from cache → WRONG LIMIT

// SOLUTION: Add version column for optimistic locking
export const subscription = pgTable("subscription", {
  // ... existing fields ...
  version: integer("version").default(1).notNull(),
});

// Update with version check:
await db.update(subscription)
  .set({
    tier,
    version: sql`${subscription.version} + 1`
  })
  .where(and(
    eq(subscription.userId, userId),
    eq(subscription.version, currentVersion) // Fails if version changed
  ));
```

**Webhook Idempotency Key Missing**:
```typescript
// Add to payment_history:
stripeEventId: text("stripe_event_id").unique(),

// In webhook handler:
const [existing] = await db.select()
  .from(paymentHistory)
  .where(eq(paymentHistory.stripeEventId, event.id))
  .limit(1);

if (existing) {
  return NextResponse.json({ received: true, cached: true });
}
```

#### 4. Usage Tracking Edge Cases

**Concurrent Interview Start Race**:
```typescript
// PROBLEM:
// 1. User A checks quota: 2/3 (1 remaining)
// 2. User B checks quota: 2/3 (1 remaining) ← RACE
// 3. Both increment → 4/3 ← OVER LIMIT

// SOLUTION: Atomic increment with WHERE clause
await db.update(usageRecord)
  .set({
    interviewsUsed: sql`${usageRecord.interviewsUsed} + 1`,
  })
  .where(and(
    eq(usageRecord.userId, userId),
    gte(usageRecord.periodStart, periodStart),
    // ATOMIC CHECK: Only increment if under limit
    or(
      eq(usageRecord.interviewsLimit, -1), // unlimited
      sql`${usageRecord.interviewsUsed} < ${usageRecord.interviewsLimit}`
    )
  ))
  .returning();

if (result.length === 0) {
  // Quota exceeded
  return { success: false, reason: "Quota exceeded" };
}
```

**Period Reset Logic Missing**:
```typescript
// PROBLEM: No automatic reset when billing period ends
// User at 3/3 interviews stays blocked after period end

// SOLUTION: Add pre-flight check
export async function ensureCurrentPeriodUsage(userId: string) {
  const now = new Date();
  const [latest] = await db.select()
    .from(usageRecord)
    .where(eq(usageRecord.userId, userId))
    .orderBy(desc(usageRecord.periodStart))
    .limit(1);

  if (!latest || latest.periodEnd < now) {
    // Create new period
    await initializeUsageRecord(userId, tier, now, nextPeriodEnd);
  }
}
```

#### 5. Feature Gating Performance

**N+1 Query Problem**:
```typescript
// CURRENT: getUserTier() + getFeatureAccess() = 2 queries per check
// PROBLEM: Every feature gate triggers DB query

// SOLUTION: Cache tier in JWT claims
// Use Supabase custom access token hook to add tier to JWT
const tier = session?.user?.app_metadata?.tier || 'free';
```

### 🚨 What's Risky

#### 1. No Webhook Failure Recovery

**Problem**: If webhook handler throws, Stripe retries for 3 days. But if DB is down, subscription updates lost.

**Solution**: Add webhook event log table
```typescript
export const webhookEvent = pgTable("webhook_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  stripeEventId: text("stripe_event_id").unique().notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull(), // 'pending', 'processed', 'failed'
  attempts: integer("attempts").default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Process: Insert event → Process → Mark processed
// Background job retries failed events
```

#### 2. Quota Enforcement Bypass

**Problem**: User can call LiveKit agent dispatch API directly, bypassing quota check.

**Solution**: Validate quota in agent on room join
```python
# agent.py
room_metadata = room.metadata
if not room_metadata.get("quotaChecked"):
    await session.disconnect("Unauthorized")
```

#### 3. No Rate Limiting on Checkout

**Attack**: User spams checkout sessions → Stripe charges you per session.

**Solution**: Add rate limiting
```typescript
import { Ratelimit } from "@upstash/ratelimit";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, "60s"), // 3 checkouts/min
});

const { success } = await ratelimit.limit(user.id);
if (!success) {
  return NextResponse.json({ error: "Too many requests" }, { status: 429 });
}
```

#### 4. Subscription Downgrade Data Loss

**Scenario**: Premium user (50 sessions) downgrades to Free (3/month limit). Can they view old sessions?

**Solution**: Add `tierAtCreation` to interview_session
```typescript
export const interviewSession = pgTable("interview_session", {
  // ... existing fields ...
  tierAtCreation: text("tier_at_creation").notNull(), // 'free', 'pro', 'premium'
});

// Allow viewing sessions created at any tier
if (userTier === 'free' && session.tierAtCreation !== 'free') {
  // Show with "Upgrade to Pro" banner instead of blocking
}
```

#### 5. Free User Exploitation

**Attack**: Create account → use 3 interviews → delete → create new account with same email.

**Solution**: Track by email hash + IP fingerprint
```typescript
export const usageFingerprint = pgTable("usage_fingerprint", {
  id: uuid("id").primaryKey().defaultRandom(),
  emailHash: text("email_hash").notNull(), // SHA-256
  ipAddress: text("ip_address"),
  deviceFingerprint: text("device_fingerprint"),
  totalInterviewsUsed: integer("total_interviews_used").default(0),
});

// Check before allowing free interview
if (fingerprint && fingerprint.totalInterviewsUsed >= 3) {
  return { allowed: false, reason: "Free trial used. Upgrade to continue." };
}
```

### 💡 Recommendations

**Short-Term (Before MVP)**:
1. Add unique constraint on `usage_record(user_id, period_start)`
2. Fix RLS policies (allow users to read own subscription)
3. Add webhook event log table
4. Fix race conditions (atomic increment, optimistic locking)
5. Add rate limiting to checkout API

**Medium-Term (Month 2-3)**:
1. Cache tier in JWT claims
2. Add Redis cache for usage_record
3. Implement webhook failure recovery job
4. Add Stripe sync reconciliation (hourly)

**Long-Term (Month 4+)**:
1. Event sourcing for subscription state
2. Shard usage_record by year-month
3. Archive old payment history

---

## Review #2: Quality Review

**Reviewer**: Quality & Security Reviewer
**Focus**: Security vulnerabilities, data loss scenarios, edge cases, performance
**Grade**: REQUIRES CHANGES

### 🔴 Critical Issues (Must Fix)

#### Issue #1: Race Condition in Usage Increment

**Severity**: 🔴 **CRITICAL** - Data Integrity
**Location**: `/lib/services/usage.ts:885-913`

**Problem**: Usage increment uses separate read-then-update operations.

**Evidence**:
```typescript
// UNSAFE:
const quota = await getUserQuota(userId);  // Read
// ... later ...
await db.update(usageRecord).set({ interviewsUsed: quota.used + 1 }); // Write
```

**Impact**: Free tier user (limit 3) could start 4-5 interviews concurrently.

**Fix**: See Architect Review - Atomic increment with WHERE clause.

**Test Case**:
```typescript
// Simulate 5 concurrent interview starts on Free tier (limit 3)
await Promise.all([
  startInterview(userId),
  startInterview(userId),
  startInterview(userId),
  startInterview(userId),
  startInterview(userId),
]);

// Expected: Only 3 succeed
// Actual (without fix): All 5 succeed
```

---

#### Issue #2: Webhook Idempotency Missing

**Severity**: 🔴 **CRITICAL** - Data Integrity
**Location**: `/app/api/stripe/webhook/route.ts:605-804`

**Problem**: No idempotency key tracking. Duplicate events cause double-writes.

**Impact**:
- Duplicate payment history records
- Usage records initialized twice
- Subscription status flickering

**Fix**: Add `stripe_event_log` table (see Architect Review).

**Test Case**:
```bash
# Simulate duplicate webhook event
stripe trigger checkout.session.completed
stripe trigger checkout.session.completed  # Same event ID

# Expected: Second event ignored
# Actual (without fix): Both processed
```

---

#### Issue #3: Failed Payment Recovery Missing

**Severity**: 🔴 **CRITICAL** - Revenue & UX
**Location**: Plan mentions `handlePaymentFailed` but no recovery flow

**Problem**: User's card declines → immediate lockout, no recovery path.

**Impact**:
- Churn from fixable payment issues
- Support ticket volume spike
- Lost revenue

**Fix**: 7-day grace period + email + retry API
```typescript
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const userId = invoice.subscription_details?.metadata?.userId;
  if (!userId) return;

  // Grace period: 7 days Pro access
  const gracePeriodEnd = new Date();
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() + 7);

  await db.update(subscription).set({
    status: "past_due",
    gracePeriodEnd,
    updatedAt: new Date(),
  });

  // Send email with "Update payment method" link
  await sendPaymentFailureEmail(userId, invoice.hosted_invoice_url);
}
```

**Test Case**:
```typescript
// Simulate card decline
const invoice = await stripe.invoices.create({
  customer: customerId,
  auto_advance: true,
});

await stripe.invoices.finalizeInvoice(invoice.id);
await stripe.invoices.pay(invoice.id, {
  payment_method: expiredCard
}); // Fails

// Expected: User has 7-day grace period
// Actual (without fix): Immediate downgrade to Free
```

---

#### Issue #4: Checkout → Token Generation Race

**Severity**: 🔴 **CRITICAL** - UX
**Location**: `/app/api/livekit/token/route.ts:1052-1077`

**Problem**: User completes checkout, webhook hasn't fired yet → quota check fails.

**Impact**: User pays for Pro, clicks "Start Interview", gets "Quota exceeded" error.

**Fix**: Fallback to Stripe session verification
```typescript
export async function POST(req: NextRequest) {
  let { allowed, reason, quota } = await canStartInterview(user.id);

  // FALLBACK: If blocked but has recent checkout session, verify with Stripe
  if (!allowed) {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");

    if (sessionId) {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === "paid" && session.metadata?.userId === user.id) {
        allowed = true;
        quota = { unlimited: true, ... };
      }
    }
  }

  // ... rest of handler ...
}
```

**Test Case**:
```typescript
// 1. User completes checkout
const session = await createCheckoutSession();
await completeCheckout(session.id);

// 2. Immediately start interview (webhook hasn't fired)
const token = await fetch("/api/livekit/token?session_id=" + session.id);

// Expected: Token generated (fallback to Stripe verification)
// Actual (without fix): 403 Quota exceeded
```

---

#### Issue #5: Usage Period Calculation Bug

**Severity**: 🔴 **CRITICAL** - Revenue
**Location**: `/lib/services/usage.ts:828-883`

**Problem**: Usage record uses calendar month, not subscription billing period.

**Evidence**:
```typescript
// WRONG: Uses calendar month
const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

// CORRECT: Use subscription billing period
const periodStart = sub?.currentPeriodStart || ...;
const periodEnd = sub?.currentPeriodEnd || ...;
```

**Impact**: User subscribes Jan 15 → billing period is Jan 15 - Feb 15, but quota resets Feb 1.
- Result: User gets 2.5 weeks of extra interviews.

**Fix**: Use `subscription.currentPeriodStart/End` for period boundaries.

**Test Case**:
```typescript
// User subscribes on Jan 15
await createSubscription(userId, { startDate: new Date("2025-01-15") });

// Check quota on Feb 1 (calendar month reset)
const quota = await getUserQuota(userId);

// Expected: Quota NOT reset (billing period is Jan 15 - Feb 15)
// Actual (without fix): Quota reset (uses calendar month)
```

---

#### Issue #6: Subscription Update Missing Transaction

**Severity**: 🟡 **HIGH** - Data Integrity
**Location**: `/app/api/stripe/webhook/route.ts:663-714`

**Problem**: Subscription update writes to multiple tables without transaction.

**Impact**: If usage_record insert fails after subscription update, DB inconsistent.

**Fix**: Wrap in transaction
```typescript
await db.transaction(async (tx) => {
  // Update subscription
  await tx.insert(subscription).values(...).onConflictDoUpdate(...);

  // Initialize usage record (transactional)
  await initializeUsageRecordTx(tx, userId, tier, periodStart, periodEnd);
});
```

---

#### Issue #7: Trial End Handling Missing

**Severity**: 🟡 **HIGH** - Revenue
**Location**: Plan mentions trials but no trial-end logic

**Problem**: Trial ends without payment method → user keeps Pro access indefinitely.

**Fix**: Add webhook + cron job
```typescript
// Webhook
case "customer.subscription.trial_will_end":
  await handleTrialEnding(event.data.object);
  break;

// Cron job: Check expired trials daily
const expiredTrials = await db.select()
  .from(subscription)
  .where(and(
    eq(subscription.status, "trialing"),
    lte(subscription.trialEnd, now)
  ));

for (const sub of expiredTrials) {
  // Downgrade to free if trial expired
  await downgradeToFree(sub.userId);
}
```

---

### 🟡 High Priority (User Experience)

#### Issue #8: Downgrade Data Loss

**Problem**: Premium user (50 sessions) downgrades to Free → loses access to old sessions.

**Fix**: Add `tierAtCreation` to `interview_session` (see Architect Review).

---

#### Issue #9: No Client-Side Quota Display

**Problem**: User clicks "Start Interview" → API returns 403 → Error message. No warning.

**Fix**: Add quota check to setup page
```typescript
{quota && !quota.unlimited && quota.remaining <= 0 && (
  <div className="bg-warning p-4">
    You've reached your {quota.limit} interview limit.
    <a href="/pricing">Upgrade to Pro →</a>
  </div>
)}
```

---

#### Issue #10: Subscription Cancellation UX

**Problem**: User cancels → immediate lockout. No grace period.

**Fix**: Implement "cancel at period end"
```typescript
await db.update(subscription).set({
  cancelAtPeriodEnd: true,
  status: "active", // Keep active until period ends
});
```

---

### 🟢 Medium Priority (Edge Cases)

#### Issue #11: Metadata Loss Risk

**Problem**: Stripe metadata can be overwritten, losing userId reference.

**Fix**: Create `stripe_customer_mapping` table as source of truth (see Architect Review).

---

#### Issue #12: Refund Handling Missing

**Problem**: User gets refund, DB still shows "succeeded" payment.

**Fix**: Add refund webhook
```typescript
case "charge.refunded":
  await db.update(paymentHistory)
    .set({ status: "refunded" })
    .where(eq(paymentHistory.stripePaymentIntentId, charge.payment_intent));
  break;
```

---

### Testing Gaps

**Missing Test Scenarios**:
1. Concurrent interview starts (race condition)
2. Duplicate webhook events (idempotency)
3. Payment failure → grace period → retry
4. Trial expiration → downgrade
5. Downgrade → data retention
6. Quota limit → upgrade flow
7. Annual subscription → proration on upgrade

**Recommendation**: Add integration tests for all 12 critical issues before launch.

---

## Review #3: Product Review

**Reviewer**: Product Lead
**Focus**: Pricing strategy, UX, conversion funnels, business metrics
**Grade**: B+ (Solid with tactical gaps)

### 🎯 Priority 0 (Must Fix Before Launch)

#### Gap #1: Mid-Session Quota Enforcement Undefined

**Problem**: Plan doesn't define what happens when user hits quota **during** an active interview.

**Scenarios**:
- User starts Interview #4 on Free tier (already at 3/3)
- User's trial expires mid-interview
- Pro user downgrades mid-interview

**Recommendation**: Add quota enforcement policy
```typescript
enum QuotaPolicy {
  HARD_BLOCK,       // Cannot start if over quota
  GRACE_FINISH,     // Can finish current, blocked from next
  OVERAGE_ALLOWED,  // Track overage, bill later (enterprise)
}
```

**UX Flow**:
```typescript
async function handleInterviewStart() {
  const { canStart, reason } = await checkQuota();

  if (!canStart) {
    if (reason === 'quota_exceeded') {
      showUpgradeModal({
        message: "You've used all 3 free interviews this month",
        cta: "Upgrade to Pro for unlimited practice",
        allowOnce: false  // Hard block
      });
    }
  }
}
```

---

#### Gap #2: Billing Failure Graceful Degradation

**Problem**: No strategy for failed payment renewals.

**Recommendation**:
- **Day 0**: Payment fails → email sent, retry in 3 days, keep Pro active
- **Day 3**: Retry payment, downgrade to Free if fails
- **Day 7**: Hard downgrade, archive premium data

---

#### Gap #3: Annual Plan Ambiguity

**Problem**: Is annual plan $249 **upfront** or $20.75/month × 12?

**Recommendation**: Upfront payment (industry standard)
- Better cash flow
- Lower churn (sunk cost)
- Simpler billing

**UI Copy**:
```
Pro Annual: $249/year
Billed once annually • Save $99 vs monthly ($28/mo)
```

---

### 🎯 Priority 1 (Should Add in Phase 1)

#### Gap #4: Trial Conversion Nudges Missing

**Problem**: Trial users may forget to convert before expiration.

**Recommendation**: Email automation
- **Day 1**: "Welcome to 7-day Pro trial"
- **Day 4**: "3 days left - here's what you'll lose"
- **Day 6**: "Last chance - upgrade now for 20% off"
- **Day 7**: "Trial ended - upgrade to keep progress"

**A/B Test**: Day 6 urgency discount (20% off first month)
- Hypothesis: Increases conversion by 15%

---

#### Gap #5: Free Tier Psychology - 3 Interviews Might Be Wrong

**Analysis**:
- **Too generous**: Users satisfied with 3/month, no upgrade pressure
- **Too restrictive**: Serious prep needs 10+ interviews, Free feels like demo

**Recommendation**: A/B test
- **Variant A**: 3 interviews/month (current)
- **Variant B**: 5 interviews/month (more generous)
- **Variant C**: 2 interviews/month + 1 bonus for email verification

**Metric**: Free → Pro conversion rate (target >8%)

---

#### Gap #6: Downgrade Experience Undefined

**Problem**: Pro user downgrades mid-month. Immediate downgrade or end-of-period?

**Recommendation**: Stripe standard
- Downgrade takes effect at **end of billing period**
- User keeps Pro until renewal date
- Next month: starts on Free tier

**UI Copy**:
```
Downgrade to Free
Your Pro access continues until Dec 1, 2025.
Starting Dec 1, you'll have 3 free interviews/month.
```

---

### Pricing Psychology Analysis

#### Annual Discount (28% off) - Is It Compelling?

**Benchmark**:
- Netflix: 17% annual discount
- Spotify: 17%
- **SaaS average**: 20-30%

**Your pricing**:
- Pro: $348/yr monthly → $249/yr annual = **28% off** ✅
- Premium: $948/yr monthly → $699/yr annual = **26% off** ✅

**Verdict**: Competitive and compelling.

**A/B Test**: Try 30% ($239 Pro, $649 Premium) to see if conversion lifts.

---

#### Trial Lengths (7 days Pro, 14 days Premium) - Smart or Confusing?

**Rationale**: Premium users get more value, deserve longer trial.

**Concern**: Decision paralysis
- User thinks: "Should I trial Pro (7 days) or Premium (14 days)?"

**Alternative**: Unified 7-day trial for both
- Simpler messaging
- Premium users don't need 14 days to see value

**A/B Test**:
- **Control**: 7-day Pro, 14-day Premium
- **Variant**: 7-day for both
- **Metric**: Trial start rate, conversion

---

### Feature Packaging Review

#### Free Tier: Is "Basic Feedback" Too Limited?

**Concern**: If users only see scores (6/10) without rubric, they can't improve.

**Recommendation**: Give Free users **1 detailed feedback/month**
```
Free tier benefits:
✓ 3 interviews/month
✓ 1 detailed feedback report/month (full rubric)
✓ Last 5 sessions visible
```

**Why**: Creates "aha moment" that drives upgrades.

---

#### Premium Tier: Is $79/mo Justified?

**Challenge**: $79 is 2.7x more than $29 Pro. Need clear value.

**Current differentiators**:
- Custom company questions
- Advanced analytics
- Priority support

**Concern**: "Priority support" feels weak for $79/mo.

**Recommendation**: Replace with tangible feature
```
Premium ($79/mo):
✓ Custom company question banks (Google, Meta, Amazon)
✓ AI interview coach (real-time nudges during interview)
✓ Performance benchmarking (vs other Premium users)
✓ Interview replay & self-review
```

**Why "AI interview coach"**:
- High perceived value (feels like 1:1 coaching)
- Justifies $50/mo premium over Pro

---

### Business Risk Analysis

#### Risk #1: Free Tier Cannibalization

**Risk**: 3 interviews/month satisfies 80% of users.

**Mitigation**:
- Survey users: "How many interviews do serious job seekers do?"
- If industry avg is 10-15, then 3/month creates upgrade path ✅
- If avg is 3-5, Free tier too generous ⚠️

**Fallback**: Reduce to 2 interviews/month if conversion <5%.

---

#### Risk #2: LTV:CAC = 41:1 Seems Unrealistic

**Pricing Strategy Calculation**:
- LTV: $985 (assumes 24-month retention)
- CAC: $24 (100% organic)
- **LTV:CAC = 41:1**

**Industry Benchmarks**:
- **Good SaaS**: 3:1 to 5:1
- **Great SaaS**: 5:1 to 7:1
- **Exceptional**: 10:1+

**Why 41:1 is suspect**:
1. 24-month retention aggressive for consumer SaaS
2. $24 CAC assumes no paid ads
3. Ignores server costs (LiveKit, Supabase)

**Realistic Model**:
- LTV: $400 (12-month retention)
- CAC: $80 (includes paid ads)
- **LTV:CAC = 5:1** ✅ (still excellent)

**Action**: Remodel before fundraising/scaling.

---

### A/B Tests to Prep

1. **Free Tier Quota**: 3 vs 5 interviews/month
2. **Annual Discount**: 28% vs 35% off
3. **Trial Parity**: 7/14 split vs 7/7 unified
4. **Premium Pricing**: $79 vs $59/month
5. **Free Feedback Depth**: Scores-only vs 1 detailed/month

---

## Consolidated Action Plan

### Phase 0.5: Critical Fixes (Add 2 Weeks)

**Week 0.5A: Database & Race Conditions**
- [ ] Add `stripe_event_log` table
- [ ] Fix usage increment to atomic SQL
- [ ] Add unique constraint on `usage_record`
- [ ] Wrap subscription updates in transactions
- [ ] Fix usage period to billing cycle

**Week 0.5B: Webhooks & Payment**
- [ ] Add idempotency checks to webhooks
- [ ] Implement 7-day grace period for failed payments
- [ ] Add trial expiration webhook
- [ ] Create refund webhook handler
- [ ] Add `stripe_customer_mapping` table

### Phase 1-8: Core Implementation

**Additions to Original Plan**:

**Phase 5 (Usage Tracking)**:
- [ ] Add mid-session quota enforcement
- [ ] Checkout → token race fallback

**Phase 6 (Pricing Page)**:
- [ ] Add "1 detailed feedback/month" to Free
- [ ] Replace "Priority support" with "AI coach" in Premium
- [ ] Build trial conversion emails

**Phase 7 (Billing Dashboard)**:
- [ ] Grace period banner for `past_due`
- [ ] Quota warning before hitting limit
- [ ] Downgrade migration logic

---

## Key Metrics to Track

### North Star Metric
**Monthly Recurring Revenue (MRR)**

### Supporting Metrics
| Metric | Target | Stretch | Critical |
|--------|--------|---------|----------|
| Free → Pro conversion | 8% | 12% | <5% |
| Pro → Premium upgrade | 10% | 15% | <5% |
| Trial → Paid conversion | 40% | 50% | <25% |
| Monthly churn (Pro) | <8% | <5% | >12% |
| LTV:CAC ratio | 5:1 | 10:1 | <3:1 |

---

## Final Verdict

**Overall**: 🟡 **APPROVED WITH CONDITIONS**

**Strengths**:
- Comprehensive technical plan
- Clear pricing strategy
- Strong Stripe integration

**Critical Gaps**:
- 12 critical issues must be fixed first
- Trial conversion automation missing
- Premium value prop needs strengthening

**Revised Timeline**: 6 weeks → **10 weeks**
- +2 weeks for critical fixes
- +2 weeks for testing

**Confidence**: 75% this will convert at 8%+ Free → Pro if P0 + P1 items addressed.

**Recommendation**: Fix critical issues in Phase 0.5, then launch with Free + Pro only (defer Premium to Month 2-3).

---

**End of Team Review**

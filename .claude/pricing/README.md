# Pricing Implementation - Documentation Hub

**Created**: 2025-11-13
**Status**: Planning & Review Complete
**Next Phase**: Critical Fixes (Phase 0.5)

---

## 📚 Documentation Index

### Core Documents

1. **[PRICING_STRATEGY.md](./PRICING_STRATEGY.md)** - Business strategy & financial model
   - Three-tier pricing model (Free, Pro $29, Premium $79)
   - Unit economics & LTV:CAC analysis
   - Competitive landscape analysis
   - Revenue projections at scale

2. **[PRICING_IMPLEMENTATION_PLAN.md](./PRICING_IMPLEMENTATION_PLAN.md)** - Technical implementation roadmap
   - 9-phase implementation plan (6-8 weeks)
   - Database schema extensions (subscription, usage_record, payment_history)
   - Stripe integration (webhooks, checkout, portal)
   - Feature gating & usage tracking
   - Testing & launch checklist

3. **[TEAM_REVIEW.md](./TEAM_REVIEW.md)** - Comprehensive team review (this file)
   - Architect review (technical assessment)
   - Quality review (security & risks)
   - Product review (strategy & UX)
   - Consolidated action plan

---

## 🎯 Quick Start

**If you're new to this pricing work, start here:**

1. Read **PRICING_STRATEGY.md** (15 min) - Understand the business case
2. Skim **PRICING_IMPLEMENTATION_PLAN.md** (20 min) - See technical approach
3. Review **TEAM_REVIEW.md** (10 min) - Understand critical fixes needed

**Total time**: ~45 minutes to get up to speed

---

## ⚡ Executive Summary

### Pricing Model

| Tier | Price | Trial | Key Features |
|------|-------|-------|--------------|
| **Free** | $0/mo | - | 3 interviews/month, Product Sense only, basic feedback |
| **Pro** | $29/mo or $249/yr | 7 days | Unlimited interviews, all types, detailed feedback |
| **Premium** | $79/mo or $699/yr | 14 days | Everything + advanced analytics, AI coach, custom drills |

### Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| **Phase 0.5**: Critical Fixes | 2 weeks | 🔴 Not Started |
| **Phase 1-4**: Core Implementation | 5 weeks | ⚪ Planned |
| **Phase 5-7**: Usage & Billing UI | 3 weeks | ⚪ Planned |
| **Phase 8**: Testing & Launch | 2 weeks | ⚪ Planned |
| **Total** | **10 weeks** | - |

### Critical Issues to Fix First

**12 Critical Issues Identified** (see TEAM_REVIEW.md for details):

🔴 **Data Integrity** (Must Fix):
1. Race condition in usage tracking
2. Webhook idempotency missing
3. Subscription state desync
4. Usage period calculation bug

🔴 **Payment & Billing** (Must Fix):
1. Failed payment recovery missing
2. Checkout → token race condition
3. Trial expiration handling missing
4. Refund handling missing

🟡 **User Experience** (High Priority):
1. Downgrade data loss
2. No quota preview UI
3. Cancellation UX poor
4. Mid-session quota enforcement undefined

---

## 📋 Action Items by Priority

### Priority 0: Before Implementation Starts

- [ ] **Review team feedback** - Read TEAM_REVIEW.md
- [ ] **Validate pricing assumptions** - Survey 10 PM candidates about:
  - Willingness to pay $29/mo
  - Expected interview frequency (validate 3/month free tier)
  - Premium features worth $79/mo
- [ ] **Stress test unit economics** - Remodel at 5:1 LTV:CAC (not 41:1)
- [ ] **Decide on annual payment** - Confirm $249 upfront (vs $20.75/month)

### Priority 1: Phase 0.5 (Critical Fixes)

**Week 1: Database & Race Conditions**
- [ ] Add `stripe_event_log` table
- [ ] Fix usage increment to atomic SQL
- [ ] Add unique constraint on `usage_record(user_id, period_start)`
- [ ] Wrap subscription updates in transactions
- [ ] Fix usage period to use billing cycle (not calendar month)

**Week 2: Webhooks & Payment Recovery**
- [ ] Add idempotency checks to all webhooks
- [ ] Implement 7-day grace period for failed payments
- [ ] Add trial expiration webhook
- [ ] Create refund webhook handler
- [ ] Add `stripe_customer_mapping` table (metadata fallback)

### Priority 2: Phase 1-8 (Core Implementation)

Follow **PRICING_IMPLEMENTATION_PLAN.md** with these additions:

**Phase 5 Additions** (Usage Tracking):
- [ ] Add mid-session quota enforcement (hard block vs grace finish)
- [ ] Implement checkout → token race fallback

**Phase 6 Additions** (Pricing Page):
- [ ] Add "1 detailed feedback/month" to Free tier
- [ ] Replace "Priority support" with "AI coach" in Premium
- [ ] Build trial conversion email automation

**Phase 7 Additions** (Billing Dashboard):
- [ ] Add grace period banner for `past_due` status
- [ ] Show quota warning before hitting limit
- [ ] Implement downgrade migration logic

---

## 🧪 A/B Tests to Prep

### Test 1: Free Tier Quota
- **Variants**: 3 vs 5 interviews/month
- **Metric**: Free → Pro conversion rate
- **Decision**: If 5/month increases conversion >15%, adopt it

### Test 2: Annual Discount
- **Variants**: 28% off ($249) vs 35% off ($225)
- **Metric**: % choosing annual, total revenue
- **Decision**: If 35% increases annual adoption >20% without revenue loss, adopt it

### Test 3: Premium Pricing
- **Variants**: $79/mo vs $59/mo
- **Metric**: Premium adoption rate, revenue
- **Decision**: If $59 increases adoption >30%, consider it

### Test 4: Free Tier Feedback Depth
- **Variants**: Scores-only vs 1 detailed feedback/month
- **Metric**: Free → Pro conversion rate
- **Decision**: If detailed feedback increases conversion >20%, adopt it

---

## 📊 Success Metrics

### North Star Metric
**Monthly Recurring Revenue (MRR)**

### Supporting Metrics
| Metric | Target | Stretch | Critical Threshold |
|--------|--------|---------|-------------------|
| Free → Pro conversion | 8% | 12% | <5% = reevaluate Free tier |
| Pro → Premium upgrade | 10% | 15% | <5% = Premium overpriced |
| Trial → Paid conversion | 40% | 50% | <25% = poor trial experience |
| Monthly churn (Pro) | <8% | <5% | >12% = value prop broken |
| Monthly churn (Premium) | <5% | <3% | >8% = Premium not sticky |
| LTV:CAC ratio | 5:1 | 10:1 | <3:1 = unprofitable |

---

## 🚀 Launch Checklist

### Pre-Launch (Week 10)
- [ ] All 12 critical issues fixed
- [ ] Stripe webhook testing complete (use Stripe CLI)
- [ ] RLS policies deployed and tested
- [ ] Feature gating verified (Free/Pro/Premium)
- [ ] Usage quota enforcement tested
- [ ] Trial conversion emails configured
- [ ] Billing dashboard functional
- [ ] Customer Portal integration working

### Soft Launch (Week 11)
- [ ] Deploy to production (Free + Pro only)
- [ ] Invite 10-20 beta users
- [ ] Monitor webhook logs for errors
- [ ] Track first conversions
- [ ] Collect user feedback

### Public Launch (Week 12)
- [ ] Announce to mailing list
- [ ] Post on Product Hunt
- [ ] Monitor conversion funnels
- [ ] Set up daily metrics dashboard

### Premium Rollout (Week 14-16)
- [ ] Add Premium tier to pricing page
- [ ] Email existing Pro users
- [ ] Monitor Premium adoption
- [ ] Iterate based on feedback

---

## 🔗 Related Documentation

- **Codebase docs**: `/docs/architecture/adrs/` (ADRs)
- **Database schema**: `/lib/db/schema.ts`
- **Stripe docs**: [Stripe Subscriptions Guide](https://stripe.com/docs/billing/subscriptions/overview)
- **Supabase RLS**: [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)

---

## 🤝 Team Roles

| Role | Responsibility | Contact |
|------|---------------|---------|
| **Product Lead** | Pricing strategy, A/B tests, user validation | - |
| **Architect** | Database schema, Stripe integration, performance | - |
| **Quality Reviewer** | Security, edge cases, testing | - |
| **Frontend Engineer** | Pricing page, billing dashboard, checkout flow | - |
| **Backend Engineer** | Webhooks, usage tracking, feature gating | - |

---

## 📝 Change Log

### 2025-11-13 - Initial Planning
- Created pricing folder structure
- Moved PRICING_STRATEGY.md and PRICING_IMPLEMENTATION_PLAN.md
- Completed team review (architect, quality, product)
- Identified 12 critical issues
- Revised timeline: 6 weeks → 10 weeks

---

## ❓ FAQ

### Why 10 weeks instead of 6 weeks?
**Answer**: Team review identified 12 critical issues (race conditions, webhook idempotency, payment recovery) that need fixing before implementation. Added Phase 0.5 (2 weeks) for critical fixes + extended testing (Week 8 → Week 10).

### Should we launch with Premium tier?
**Answer**: No, launch with Free + Pro only (Month 1), add Premium in Month 2-3 after validating core pricing.

### Why is LTV:CAC 5:1 not 41:1?
**Answer**: Original calculation assumed 24-month retention and 100% organic CAC. Conservative model uses 12-month retention + paid ads = 5:1 (still excellent).

### What's the biggest risk?
**Answer**: Free tier (3 interviews/month) might be too generous or too restrictive. Need user validation before launch.

### Can we skip Phase 0.5 critical fixes?
**Answer**: No. Race conditions and webhook issues will cause production failures (duplicate charges, quota bypass, data loss). Fix before implementing core features.

---

**Questions?** Review team feedback in `TEAM_REVIEW.md` or check implementation details in `PRICING_IMPLEMENTATION_PLAN.md`.

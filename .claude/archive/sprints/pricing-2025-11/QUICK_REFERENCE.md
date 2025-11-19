# Pricing Implementation - Quick Reference Card

**📍 Location**: `.claude/pricing/`
**🎯 Goal**: Launch three-tier subscription pricing (Free, Pro $29, Premium $79)
**⏱️ Timeline**: 10 weeks (6 weeks original + 4 weeks for fixes/testing)

---

## 🚀 Where to Start

**New to this project?** → Read [README.md](./README.md) first (5 min)

**Need business context?** → [PRICING_STRATEGY.md](./PRICING_STRATEGY.md) (15 min)

**Want technical details?** → [PRICING_IMPLEMENTATION_PLAN.md](./PRICING_IMPLEMENTATION_PLAN.md) (30 min)

**Need team feedback?** → [TEAM_REVIEW.md](./TEAM_REVIEW.md) (10 min)

---

## 📊 Pricing Model at a Glance

| Tier | Price | Trial | Limit | Key Features |
|------|-------|-------|-------|--------------|
| **Free** | $0 | - | 3/month | Product Sense only, basic scores |
| **Pro** | $29/mo<br>$249/yr | 7 days | Unlimited | All types, detailed feedback |
| **Premium** | $79/mo<br>$699/yr | 14 days | Unlimited | AI coach, analytics, custom drills |

---

## 🔴 Critical Issues (12 Total)

### Data Integrity (5 issues)
1. **Race condition** - Usage increment not atomic
2. **Webhook duplicates** - No idempotency tracking
3. **Transaction safety** - Multi-table updates not wrapped
4. **Period bug** - Uses calendar month vs billing cycle
5. **Metadata loss** - Stripe metadata unreliable

### Payment & Billing (4 issues)
1. **Failed payment** - No grace period or retry
2. **Trial expiration** - No handling for expired trials
3. **Checkout race** - Webhook delay breaks quota check
4. **Refunds** - Missing refund webhook

### User Experience (3 issues)
1. **Downgrade** - Data loss when Premium → Free
2. **Quota preview** - No warning before limit hit
3. **Cancellation** - Immediate lockout vs grace

---

## ✅ Action Checklist

### This Week
- [ ] Read all 4 documents in `/pricing/`
- [ ] Survey 10 PM candidates about pricing
- [ ] Validate 3 interviews/month is right limit
- [ ] Confirm $249 annual paid upfront (not monthly)

### Next Week (Phase 0.5A)
- [ ] Add `stripe_event_log` table to schema
- [ ] Fix usage increment to atomic SQL
- [ ] Add unique constraint on usage_record
- [ ] Wrap subscription updates in transactions
- [ ] Fix usage period to billing cycle

### Week After (Phase 0.5B)
- [ ] Add idempotency to all webhooks
- [ ] Implement 7-day grace for failed payments
- [ ] Add trial expiration webhook
- [ ] Create refund webhook
- [ ] Add stripe_customer_mapping table

---

## 🎯 Success Metrics

| Metric | Target | What It Means |
|--------|--------|---------------|
| Free → Pro | 8% | 8 of every 100 free users upgrade |
| Trial → Paid | 40% | 4 of every 10 trials convert |
| Monthly Churn | <8% | <8% of Pro users cancel monthly |
| LTV:CAC | 5:1 | $400 LTV / $80 CAC = 5:1 |

---

## 💰 Revenue Model

**At 1,000 users** (6 months):
- 820 Free users → $0 MRR
- 180 Paid users → $6,390 MRR
- **Monthly profit**: $1,506 (24% margin)

**At 10,000 users** (18 months):
- 8,200 Free users → $0 MRR
- 1,800 Paid users → $63,896 MRR
- **Monthly profit**: $17,197 (27% margin)

---

## 🧪 A/B Tests to Run

1. **Free tier quota**: 3 vs 5 interviews/month
2. **Annual discount**: 28% vs 35% off
3. **Premium price**: $79 vs $59/month
4. **Free feedback**: Scores-only vs 1 detailed/month
5. **Trial length**: 7/14 split vs 7/7 unified

---

## 📂 File Structure

```
.claude/pricing/
├── README.md                        ← Start here (index + action plan)
├── PRICING_STRATEGY.md              ← Business strategy & financials
├── PRICING_IMPLEMENTATION_PLAN.md   ← Technical roadmap (9 phases)
├── TEAM_REVIEW.md                   ← Architect + Quality + Product feedback
└── QUICK_REFERENCE.md               ← This file (cheat sheet)
```

---

## 🔗 External Resources

- **Stripe Docs**: [Subscriptions Guide](https://stripe.com/docs/billing/subscriptions/overview)
- **Supabase RLS**: [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- **Drizzle ORM**: [Transactions](https://orm.drizzle.team/docs/transactions)
- **LiveKit**: [Agent Dispatch](https://docs.livekit.io/agents/dispatch/)

---

## 📞 Getting Help

**Question Type** | **Where to Look**
---|---
"Why this pricing model?" | PRICING_STRATEGY.md
"How do I implement X?" | PRICING_IMPLEMENTATION_PLAN.md
"What are the risks?" | TEAM_REVIEW.md (Quality Review)
"What needs fixing?" | TEAM_REVIEW.md (12 Critical Issues)
"What's the timeline?" | README.md (Timeline section)

---

## 🎨 Color Key

- 🔴 **Critical** - Must fix before launch
- 🟡 **High** - Should fix in Phase 1
- 🟢 **Medium** - Can defer to Month 2-3
- ⚪ **Low** - Nice to have

---

**Last Updated**: 2025-11-13
**Next Review**: After Phase 0.5 completion (2 weeks)

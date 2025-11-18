# PRD: Tier-Based Interview Type Access Control

**Date**: November 17, 2025
**Author**: Head of Product
**Status**: Proposal
**Priority**: P0 (Blocks user acquisition and retention)

---

## Executive Summary

**Problem**: Free tier users see all 4 interview types in the setup flow but can only access Product Sense interviews. They discover this limitation only after selecting a restricted type and clicking "Start Interview," creating a frustrating bait-and-switch experience.

**Proposed Solution**: Implement tier-aware UI in the setup page that clearly communicates access limitations before users make selections, with inline upgrade prompts.

**Impact**:
- **User Experience**: Eliminate frustration and confusion for free tier users
- **Conversion**: Create clear upgrade moments with contextual CTAs
- **Retention**: Prevent negative first impressions that drive churn

**Success Metrics**:
- Reduce setup page abandonment rate by 40%
- Increase free → paid conversion by 15%
- Decrease support tickets about "locked features" by 80%

---

## 1. Problem Statement

### Current User Journey (Broken Experience)

```
Free Tier User Journey:
1. Landing page → "Start A Mock" → Dashboard → "Start Mock Interview"
2. Setup page: See ALL 4 interview types (Behavioral, Product Sense, Execution, Strategy)
3. User selects "Execution" (looks interesting!)
4. User selects "IC PM" difficulty
5. User clicks "Start Interview"
6. API returns 403 quota_exceeded
7. Modal appears: "You've used all 3 interviews this month" (CONFUSING - they haven't started yet!)
8. User realizes: "Wait, I can't even do Execution interviews?"
9. Frustration → Churn
```

**Key Friction Points**:
- ❌ **Late Discovery**: Users don't learn about restrictions until after making choices
- ❌ **Confusing Error**: Quota modal doesn't explain interview type restrictions
- ❌ **Wasted Time**: Users invest effort in selection only to be blocked
- ❌ **Poor Trust**: Feels like bait-and-switch ("Why show me options I can't use?")

### Current Pricing Tiers

| Feature | Free | Pro ($29/mo) | Premium ($79/mo) |
|---------|------|--------------|------------------|
| **Interviews** | 3/month | Unlimited | Unlimited |
| **Interview Types** | **Product Sense ONLY** | All 4 types | All 4 + Custom |
| **Question Bank** | 100 questions | 2,879 full database | 2,879 + early access |
| **Difficulty Levels** | Intermediate only | Junior/IC/Senior | All + Adaptive AI |
| **Feedback** | Basic scores | Framework rubrics | Detailed + drills |

**The Gap**: Setup page UI doesn't reflect these tier differences AT ALL.

---

## 2. Recommended Solution: Option B

### Show All Types + Disable with Badges (RECOMMENDED)

**Implementation**:
- Show all 4 interview types for all tiers
- Free tier: Product Sense is ENABLED, others are DISABLED with visual treatment
- Disabled cards have:
  - Reduced opacity (60%)
  - "Pro" or "Premium" badge in top-right corner
  - Lock icon overlay
  - Hover tooltip: "Upgrade to Pro to unlock Execution interviews"
  - Click handler: Opens inline upgrade modal (NOT the quota modal)

**UX Mockup**:
```
Free Tier Setup Page:

┌──────────────────────────────────────────────┐
│  Choose Interview Type                       │
├──────────────────────────────────────────────┤
│                                              │
│  ┌─────────────────┐  ┌─────────────────┐  │
│  │ 💡 Product Sense│  │ 👥 Behavioral   │  │  ← DISABLED
│  │ (ENABLED)       │  │ [Pro Badge]     │  │
│  │ Design...       │  │ 🔒 Leadership...│  │
│  └─────────────────┘  └─────────────────┘  │
│                                              │
│  ┌─────────────────┐  ┌─────────────────┐  │
│  │ 🎯 Execution    │  │ 📈 Strategy     │  │  ← DISABLED
│  │ [Pro Badge]     │  │ [Pro Badge]     │  │
│  │ 🔒 Metrics...   │  │ 🔒 Business...  │  │
│  └─────────────────┘  └─────────────────┘  │
│                                              │
│  💡 Upgrade to Pro for unlimited access to  │
│  all 4 interview types →                    │
│                                              │
└──────────────────────────────────────────────┘
```

**Why This Approach**:
- ✅ **Transparent**: Users see the full product value
- ✅ **Conversion-focused**: Creates desire for unavailable features
- ✅ **Educational**: Shows what they get with upgrade
- ✅ **Clear boundaries**: Visual hierarchy prevents accidental selection

---

## 3. Implementation Plan

### Phase 1: Backend Security (P0) - Week 1

**Tasks**:
- [ ] Create permissions service (`/lib/services/permissions-service.ts`)
- [ ] Add interview type validation to `/api/session/start`
- [ ] Add new error response: `interview_type_locked`
- [ ] Write unit tests for permissions

**Acceptance Criteria**:
- ✅ Free users get 403 when trying non-Product Sense interviews
- ✅ Pro/Premium users can access all types
- ✅ Clear error message with upgrade URL

### Phase 2: Frontend UX (P1) - Week 1-2

**Tasks**:
- [ ] Update setup page to fetch subscription
- [ ] Update RoundSelector with locked state UI
- [ ] Create TierUpgradeModal component
- [ ] Add lock icons, badges, tooltips
- [ ] Handle `interview_type_locked` error

**Acceptance Criteria**:
- ✅ Locked types show lock icon and "Pro" badge
- ✅ Clicking locked type shows upgrade modal
- ✅ Modal has clear benefits and pricing
- ✅ "View Plans" button redirects to /pricing

### Phase 3: Testing & Optimization (P2) - Week 2-3

**Tasks**:
- [ ] E2E tests for free/pro/premium flows
- [ ] A/B test upgrade modal variants
- [ ] Add analytics tracking
- [ ] Difficulty level restrictions (Free = Intermediate only)
- [ ] Trial period handling

---

## 4. Success Metrics

### Primary Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| Setup abandonment | ~35% | <20% | % users who don't start interview after landing on setup |
| Free → Paid conversion | ~15% | >17% | % free users who upgrade within 30 days |
| Support tickets | ~12/week | <3/week | Tickets about locked features |

### Secondary Metrics

| Metric | Target |
|--------|--------|
| Upgrade modal views | Track |
| Upgrade modal CTR | >25% |
| Locked type clicks | Track (intent signal) |

---

## 5. Edge Cases

| Scenario | Behavior |
|----------|----------|
| Free tier, 0/3 used | Show 1 enabled, 3 disabled with badges |
| Free tier, 3/3 used | Same + quota warning banner |
| Pro trial active | All 4 enabled with "Trial" banner |
| Pro trial expired | Revert to free tier (1 enabled, 3 locked) |
| Pro → Free downgrade | Immediate restriction (next page load) |

---

## 6. Open Questions

1. **Should we restrict difficulty levels too?**
   - **Recommendation**: YES - Free = Intermediate only, Pro = All levels

2. **Should we allow interview type "previews"?**
   - **Recommendation**: DEFER to Phase 3 (focus on core UX first)

3. **What happens to in-progress interviews during downgrade?**
   - **Recommendation**: Let current session complete, apply restrictions to next session

---

**For full implementation details, see:**
- Architecture Design: `TIER_ACCESS_CONTROL_ARCHITECTURE.md`
- Implementation Plan: `TIER_ACCESS_CONTROL_IMPLEMENTATION.md`

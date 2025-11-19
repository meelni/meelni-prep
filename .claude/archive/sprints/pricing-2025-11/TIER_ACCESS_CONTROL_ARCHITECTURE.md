# Architecture Design: Tier-Based Interview Type Access Control

**Author**: Senior Software Architect
**Date**: 2025-11-17
**Status**: Proposed
**Version**: 1.0

---

## Executive Summary

We need to implement tier-based access control for interview types. Free tier users should only access Product Sense interviews, while Pro/Premium users get all 4 types. This requires both frontend filtering (UX) and backend validation (security).

**Recommended Approach**: Backend Validation + Frontend Filtering (Option B)

---

## 1. Current State

**Problem**: `/app/setup/page.tsx` shows all 4 interview types to everyone, regardless of tier.

**Security Gap**: `/app/api/session/start` doesn't validate interview type access (only quota limits).

---

## 2. Proposed Architecture

```
┌─────────────────────────────────────────────────┐
│         Frontend: /app/setup/page.tsx           │
│  1. Fetch subscription on mount                 │
│  2. Get allowed types: getAllowedInterviewTypes │
│  3. Pass to RoundSelector component             │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│    Frontend: components/round-selector.tsx      │
│  - Show all 4 types                             │
│  - Disable locked types (opacity, lock icon)    │
│  - onClick locked → show UpgradeModal           │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│      Backend: /api/session/start                │
│  1. Authenticate user                           │
│  2. Fetch subscription                          │
│  3. Validate: canAccessInterviewType()          │
│  4. If denied → 403 with upgrade URL            │
│  5. Proceed with quota check                    │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│   Service: /lib/services/permissions-service.ts │
│  TIER_PERMISSIONS = {                           │
│    free: ['product_sense'],                     │
│    pro: 'all',                                  │
│    premium: 'all'                               │
│  }                                              │
└─────────────────────────────────────────────────┘
```

---

## 3. New Service: Permissions Service

**File**: `/lib/services/permissions-service.ts`

```typescript
export type SubscriptionTier = "free" | "pro" | "premium";

const TIER_PERMISSIONS: Record<SubscriptionTier, RoundType[] | "all"> = {
  free: ["product_sense"],
  pro: "all",
  premium: "all",
};

const ALL_INTERVIEW_TYPES: RoundType[] = [
  "product_sense",
  "behavioral",
  "execution",
  "strategy",
];

export function canAccessInterviewType(
  tier: SubscriptionTier,
  roundType: RoundType
): boolean {
  const permissions = TIER_PERMISSIONS[tier];
  if (permissions === "all") return true;
  return permissions.includes(roundType);
}

export function getAllowedInterviewTypes(
  tier: SubscriptionTier
): RoundType[] {
  const permissions = TIER_PERMISSIONS[tier];
  if (permissions === "all") return ALL_INTERVIEW_TYPES;
  return permissions;
}

export function getLockedInterviewTypes(
  tier: SubscriptionTier
): RoundType[] {
  const allowed = getAllowedInterviewTypes(tier);
  return ALL_INTERVIEW_TYPES.filter(type => !allowed.includes(type));
}
```

---

## 4. Backend Changes

### Update: `/app/api/session/start/route.ts`

**Add after authentication, before quota check:**

```typescript
import { canAccessInterviewType, getAllowedInterviewTypes } from "@/lib/services/permissions-service";

// After auth check (line 122)
const subscription = await db
  .select()
  .from(subscription)
  .where(eq(subscription.userId, user.id))
  .limit(1);

const sub = subscription[0];

// NEW: Check interview type access
if (!canAccessInterviewType(sub.tier, roundType)) {
  const allowed = getAllowedInterviewTypes(sub.tier);

  return NextResponse.json(
    {
      error: "interview_type_locked",
      message: `${roundType} interviews require a Pro subscription`,
      currentTier: sub.tier,
      requestedType: roundType,
      allowedTypes: allowed,
      upgradeUrl: "/pricing",
    },
    { status: 403 }
  );
}

// Then proceed with existing quota check
const incrementResult = await incrementUsage(user.id);
```

---

## 5. Frontend Changes

### Update: `/app/setup/page.tsx`

```typescript
import { getAllowedInterviewTypes } from "@/lib/services/permissions-service";

const [subscription, setSubscription] = useState<Subscription | null>(null);
const [allowedTypes, setAllowedTypes] = useState<RoundType[]>([]);

useEffect(() => {
  async function fetchSubscription() {
    const res = await fetch('/api/billing/subscription');
    const sub = await res.json();
    setSubscription(sub);

    const allowed = getAllowedInterviewTypes(sub.tier);
    setAllowedTypes(allowed);
  }
  fetchSubscription();
}, []);

// Pass to RoundSelector
<RoundSelector
  selected={roundType}
  onSelect={setRoundType}
  allowedTypes={allowedTypes}
  userTier={subscription?.tier || 'free'}
/>
```

### Update: `/app/setup/components/round-selector.tsx`

```typescript
interface RoundSelectorProps {
  selected: RoundType | null;
  onSelect: (roundType: RoundType) => void;
  allowedTypes: RoundType[]; // NEW
  userTier: SubscriptionTier; // NEW
}

export function RoundSelector({ selected, onSelect, allowedTypes, userTier }: RoundSelectorProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedLockedType, setSelectedLockedType] = useState<RoundType | null>(null);

  return (
    <>
      {ROUND_TYPES.map((roundType) => {
        const isLocked = !allowedTypes.includes(roundType);

        return (
          <Card
            className={isLocked ? 'opacity-60 cursor-not-allowed' : ''}
            onClick={() => {
              if (isLocked) {
                setSelectedLockedType(roundType);
                setShowUpgradeModal(true);
              } else {
                onSelect(roundType);
              }
            }}
          >
            {/* Lock overlay */}
            {isLocked && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Lock className="w-8 h-8" />
                <Badge className="absolute top-4 right-4">Pro</Badge>
              </div>
            )}

            {/* Existing card content */}
          </Card>
        );
      })}

      <TierUpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        interviewType={selectedLockedType}
        currentTier={userTier}
      />
    </>
  );
}
```

### New: `/components/dashboard/tier-upgrade-modal.tsx`

```typescript
interface TierUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  interviewType: RoundType | null;
  currentTier: SubscriptionTier;
}

export function TierUpgradeModal({ isOpen, onClose, interviewType, currentTier }: TierUpgradeModalProps) {
  const router = useRouter();

  const proFeatures = [
    "Unlimited interviews",
    "All 4 interview types",
    "2,879 curated PM questions",
    "Detailed framework feedback",
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unlock {interviewTypeLabels[interviewType]} Interviews</DialogTitle>
        </DialogHeader>

        <ul>
          {proFeatures.map((feature) => (
            <li><Check /> {feature}</li>
          ))}
        </ul>

        <div className="pricing">
          <p>Pro Plan: $29/month</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Maybe Later</Button>
          <Button onClick={() => router.push('/pricing')}>View Plans</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 6. Security

### Defense in Depth

| Layer | Control | Purpose |
|-------|---------|---------|
| Frontend | Lock icon, disabled state | User experience |
| Frontend | Upgrade modal | Conversion funnel |
| API | Authentication check | Identity verification |
| API | Tier permission check | Authorization enforcement |
| Database | RLS policies | Data isolation |

**Attack Vectors Mitigated**:
- ✅ Direct API call: Blocked by backend validation
- ✅ Modified frontend: Backend enforces rules
- ✅ Session replay: RLS policies prevent cross-user access

---

## 7. Performance

**Frontend**: One additional API call (`GET /api/billing/subscription`)
- Called once on page mount
- ~50ms latency
- Cached in React state

**Backend**: Permission check
- O(1) lookup in permissions object
- <1ms overhead
- No additional database queries

**Total Impact**: Negligible (<5ms)

---

## 8. Implementation Phases

### Phase 1: Backend Security (P0) - 2-3 hours
- [ ] Create permissions service
- [ ] Add validation to `/api/session/start`
- [ ] Unit tests

### Phase 2: Frontend UX (P1) - 4-5 hours
- [ ] Update setup page
- [ ] Update round selector
- [ ] Create upgrade modal
- [ ] Error handling

### Phase 3: Testing (P2) - 3-4 hours
- [ ] E2E tests
- [ ] Performance testing
- [ ] Accessibility review

**Total Effort**: 9-12 hours

---

## 9. Database Schema

**NO CHANGES REQUIRED** ✅

Permissions are config-driven (in code), not database-driven. Benefits:
- Faster to update
- Version-controlled
- Easier to test

---

## 10. Monitoring

**Metrics to Track**:
- `interview_type_locked` 403 errors (should be rare after Phase 2)
- Upgrade modal views
- Upgrade modal CTR (click-through rate)
- Free → Pro conversions from locked types

**Logging**:
```typescript
// Backend
console.log('[Access Control] Interview type denied', {
  userId, tier, requestedType, allowedTypes
});

// Frontend
console.log('[Access Control] Locked type clicked', {
  roundType, userTier, action: 'show_upgrade_modal'
});
```

---

**For product requirements, see:**
- Product PRD: `TIER_ACCESS_CONTROL_PRD.md`
- Implementation Plan: `TIER_ACCESS_CONTROL_IMPLEMENTATION.md`

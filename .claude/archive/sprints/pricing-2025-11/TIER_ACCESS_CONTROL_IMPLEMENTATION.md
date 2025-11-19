# Implementation Plan: Tier-Based Interview Type Access Control

**Date**: November 17, 2025
**Priority**: P0 (Critical UX Issue)
**Estimated Effort**: 9-12 hours (3 phases)
**Target Completion**: Week of Nov 18-22, 2025

---

## Overview

This document provides the step-by-step implementation plan for adding tier-based access control to interview types. Free tier users should only see Product Sense as available, with other types locked behind Pro/Premium upgrades.

**Related Documents**:
- Product Requirements: `TIER_ACCESS_CONTROL_PRD.md`
- Architecture Design: `TIER_ACCESS_CONTROL_ARCHITECTURE.md`

---

## Phase 1: Backend Security (P0)

**Goal**: Prevent unauthorized access to premium interview types
**Timeline**: Day 1 (2-3 hours)
**Priority**: MUST SHIP FIRST (security)

### Task 1.1: Create Permissions Service

**File**: `/lib/services/permissions-service.ts`

```typescript
/**
 * Tier-based permissions service
 *
 * Defines which interview types each subscription tier can access.
 * Free tier: Product Sense only
 * Pro/Premium: All interview types
 */

import { RoundType } from "@/lib/interview-config";

export type SubscriptionTier = "free" | "pro" | "premium";

/**
 * Tier permissions mapping
 * - "all" = access to all interview types
 * - Array = access to specific types only
 */
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

/**
 * Check if tier allows access to interview type
 *
 * @param tier - User's subscription tier
 * @param roundType - Interview type being requested
 * @returns true if access allowed, false otherwise
 *
 * @example
 * canAccessInterviewType("free", "product_sense") // true
 * canAccessInterviewType("free", "execution") // false
 * canAccessInterviewType("pro", "execution") // true
 */
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

/**
 * Get all interview types allowed for tier
 *
 * @param tier - User's subscription tier
 * @returns Array of allowed interview types
 */
export function getAllowedInterviewTypes(
  tier: SubscriptionTier
): RoundType[] {
  const permissions = TIER_PERMISSIONS[tier];

  if (permissions === "all") {
    return ALL_INTERVIEW_TYPES;
  }

  return permissions;
}

/**
 * Get locked interview types for tier (for upgrade prompts)
 *
 * @param tier - User's subscription tier
 * @returns Array of locked interview types
 */
export function getLockedInterviewTypes(
  tier: SubscriptionTier
): RoundType[] {
  const allowed = getAllowedInterviewTypes(tier);
  return ALL_INTERVIEW_TYPES.filter(type => !allowed.includes(type));
}

/**
 * Get required tier for interview type
 *
 * @param roundType - Interview type
 * @returns Minimum tier required ("free", "pro", or "premium")
 */
export function getRequiredTier(roundType: RoundType): SubscriptionTier {
  if (roundType === "product_sense") {
    return "free";
  }
  return "pro";
}
```

**Test File**: `/lib/services/__tests__/permissions-service.test.ts`

```typescript
import {
  canAccessInterviewType,
  getAllowedInterviewTypes,
  getLockedInterviewTypes,
  getRequiredTier,
} from "../permissions-service";

describe("Permissions Service", () => {
  describe("canAccessInterviewType", () => {
    it("allows free tier access to product_sense", () => {
      expect(canAccessInterviewType("free", "product_sense")).toBe(true);
    });

    it("denies free tier access to behavioral", () => {
      expect(canAccessInterviewType("free", "behavioral")).toBe(false);
    });

    it("allows pro tier access to all types", () => {
      expect(canAccessInterviewType("pro", "product_sense")).toBe(true);
      expect(canAccessInterviewType("pro", "behavioral")).toBe(true);
      expect(canAccessInterviewType("pro", "execution")).toBe(true);
      expect(canAccessInterviewType("pro", "strategy")).toBe(true);
    });

    it("allows premium tier access to all types", () => {
      expect(canAccessInterviewType("premium", "product_sense")).toBe(true);
      expect(canAccessInterviewType("premium", "behavioral")).toBe(true);
    });
  });

  describe("getAllowedInterviewTypes", () => {
    it("returns only product_sense for free tier", () => {
      const allowed = getAllowedInterviewTypes("free");
      expect(allowed).toEqual(["product_sense"]);
    });

    it("returns all types for pro tier", () => {
      const allowed = getAllowedInterviewTypes("pro");
      expect(allowed).toHaveLength(4);
      expect(allowed).toContain("product_sense");
      expect(allowed).toContain("behavioral");
      expect(allowed).toContain("execution");
      expect(allowed).toContain("strategy");
    });
  });

  describe("getLockedInterviewTypes", () => {
    it("returns 3 locked types for free tier", () => {
      const locked = getLockedInterviewTypes("free");
      expect(locked).toHaveLength(3);
      expect(locked).toContain("behavioral");
      expect(locked).toContain("execution");
      expect(locked).toContain("strategy");
      expect(locked).not.toContain("product_sense");
    });

    it("returns 0 locked types for pro tier", () => {
      const locked = getLockedInterviewTypes("pro");
      expect(locked).toHaveLength(0);
    });
  });
});
```

### Task 1.2: Add Validation to Session Start API

**File**: `/app/api/session/start/route.ts`

**Changes** (add after line 134, before quota check):

```typescript
import { canAccessInterviewType, getAllowedInterviewTypes } from "@/lib/services/permissions-service";

// ... existing code ...

// After quota enforcement (line 135), add interview type access control:

// Interview type access control: Check tier permissions
// This prevents free users from starting premium interview types
const userSub = await db
  .select()
  .from(subscription)
  .where(eq(subscription.userId, user.id))
  .limit(1);

if (userSub.length === 0) {
  // If no subscription exists, create a free tier subscription
  await db.insert(subscription).values({
    userId: user.id,
    tier: "free",
    status: "active",
  });
}

const sub = userSub[0] || { tier: "free" };

// Check if user's tier allows this interview type
if (!canAccessInterviewType(sub.tier as SubscriptionTier, roundType)) {
  const allowed = getAllowedInterviewTypes(sub.tier as SubscriptionTier);
  const locked = getLockedInterviewTypes(sub.tier as SubscriptionTier);

  console.log("[Access Control] Interview type access denied", {
    userId: user.id,
    tier: sub.tier,
    requestedType: roundType,
    allowedTypes: allowed,
  });

  return NextResponse.json(
    {
      error: "interview_type_locked",
      message: `${roundType} interviews are only available on the Pro plan`,
      currentTier: sub.tier,
      requestedType: roundType,
      allowedTypes: allowed,
      lockedTypes: locked,
      upgradeUrl: "/pricing",
    },
    { status: 403 }
  );
}
```

**Update JSDoc** (add to throws section):

```typescript
 * @throws {403} Forbidden - Interview type locked (Free tier cannot access premium types)
 *
 * // Error Response (403 Forbidden - Interview Type Locked)
 * {
 *   "error": "interview_type_locked",
 *   "message": "behavioral interviews are only available on the Pro plan",
 *   "currentTier": "free",
 *   "requestedType": "behavioral",
 *   "allowedTypes": ["product_sense"],
 *   "lockedTypes": ["behavioral", "execution", "strategy"],
 *   "upgradeUrl": "/pricing"
 * }
```

### Task 1.3: Manual Testing (Backend)

**Test Cases**:

1. **Free user requests Product Sense** → ✅ Should succeed
   ```bash
   curl -X POST http://localhost:3000/api/session/start \
     -H "Authorization: Bearer <free-user-token>" \
     -H "Content-Type: application/json" \
     -d '{"roundType": "product_sense"}'
   ```

2. **Free user requests Execution** → ❌ Should return 403
   ```bash
   curl -X POST http://localhost:3000/api/session/start \
     -H "Authorization: Bearer <free-user-token>" \
     -H "Content-Type: application/json" \
     -d '{"roundType": "execution"}'
   # Expected: 403 with interview_type_locked error
   ```

3. **Pro user requests any type** → ✅ Should succeed
   ```bash
   curl -X POST http://localhost:3000/api/session/start \
     -H "Authorization: Bearer <pro-user-token>" \
     -H "Content-Type: application/json" \
     -d '{"roundType": "behavioral"}'
   ```

---

## Phase 2: Frontend UX (P1)

**Goal**: Provide visual indicators and upgrade prompts
**Timeline**: Days 2-3 (4-5 hours)
**Priority**: HIGH (user experience)

### Task 2.1: Update Setup Page

**File**: `/app/setup/page.tsx`

**Add imports**:
```typescript
import { getAllowedInterviewTypes, SubscriptionTier } from "@/lib/services/permissions-service";
```

**Add state**:
```typescript
const [subscription, setSubscription] = useState<{
  tier: SubscriptionTier;
  status: string;
} | null>(null);
const [allowedTypes, setAllowedTypes] = useState<RoundType[]>([]);
const [loadingSubscription, setLoadingSubscription] = useState(true);
```

**Fetch subscription**:
```typescript
useEffect(() => {
  async function fetchSubscription() {
    try {
      const res = await fetch('/api/billing/subscription');
      if (!res.ok) {
        console.warn('Failed to fetch subscription, defaulting to free tier');
        setAllowedTypes(['product_sense']);
        return;
      }

      const sub = await res.json();
      setSubscription(sub);

      // Get allowed interview types based on tier
      const allowed = getAllowedInterviewTypes(sub.tier);
      setAllowedTypes(allowed);
    } catch (error) {
      console.error('Failed to fetch subscription:', error);
      // Default to free tier permissions on error
      setAllowedTypes(['product_sense']);
    } finally {
      setLoadingSubscription(false);
    }
  }

  if (user && !authLoading) {
    fetchSubscription();
  }
}, [user, authLoading]);
```

**Handle interview_type_locked error**:
```typescript
const handleStartInterview = async () => {
  // ... existing code ...

  if (!response.ok) {
    const errorData = await response.json();

    // Handle interview type locked error (NEW)
    if (response.status === 403 && errorData.error === "interview_type_locked") {
      setError(`${errorData.requestedType} interviews require a Pro subscription. Upgrade to unlock all interview types.`);
      setIsCreatingSession(false);
      // Could also redirect to pricing: router.push('/pricing');
      return;
    }

    // Handle quota exceeded error (existing)
    if (response.status === 403 && errorData.error === "quota_exceeded") {
      // ... existing quota handling ...
    }

    // ... rest of error handling ...
  }
};
```

**Pass to RoundSelector**:
```typescript
{step === 1 && (
  <RoundSelector
    selected={roundType}
    onSelect={setRoundType}
    allowedTypes={allowedTypes}
    userTier={subscription?.tier || 'free'}
    loading={loadingSubscription}
  />
)}
```

### Task 2.2: Update Round Selector Component

**File**: `/app/setup/components/round-selector.tsx`

**Update interface**:
```typescript
import { Lock, Crown } from "lucide-react";
import { SubscriptionTier } from "@/lib/services/permissions-service";
import { TierUpgradeModal } from "@/components/dashboard/tier-upgrade-modal";

interface RoundSelectorProps {
  selected: RoundType | null;
  onSelect: (roundType: RoundType) => void;
  allowedTypes: RoundType[]; // NEW
  userTier: SubscriptionTier; // NEW
  loading?: boolean; // NEW
}
```

**Add state**:
```typescript
export function RoundSelector({
  selected,
  onSelect,
  allowedTypes,
  userTier,
  loading = false
}: RoundSelectorProps) {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedLockedType, setSelectedLockedType] = useState<RoundType | null>(null);

  // ... existing code ...
}
```

**Update render logic**:
```typescript
{(Object.keys(ROUND_TYPES) as RoundType[]).map((roundType) => {
  const config = ROUND_TYPES[roundType];
  const Icon = iconMap[config.icon as keyof typeof iconMap];
  const isSelected = selected === roundType;
  const isLocked = !allowedTypes.includes(roundType);
  const isDisabled = loading || isLocked;

  return (
    <motion.div key={roundType} variants={fadeInUp}>
      <Card
        className={cn(
          "relative p-6 cursor-pointer transition-all group",
          isDisabled
            ? "opacity-60 cursor-not-allowed border-dashed"
            : "hover:scale-[1.02] hover:shadow-lg border-solid",
          isSelected && !isLocked
            ? "ring-2 ring-primary border-primary bg-primary/5"
            : "border-border"
        )}
        onClick={() => {
          if (isLocked) {
            setSelectedLockedType(roundType);
            setShowUpgradeModal(true);
          } else if (!loading) {
            onSelect(roundType);
          }
        }}
      >
        {/* Tier badge for locked types */}
        {isLocked && (
          <Badge
            variant="outline"
            className="absolute top-4 right-4 bg-background border-primary/50 text-primary"
          >
            <Crown className="w-3 h-3 mr-1" />
            Pro
          </Badge>
        )}

        {/* Icon */}
        <div className={cn(
          "w-12 h-12 rounded-xl flex items-center justify-center mb-4",
          isLocked
            ? "bg-muted"
            : "bg-primary/10 group-hover:bg-primary/20"
        )}>
          <Icon className={cn(
            "w-6 h-6",
            isLocked ? "text-muted-foreground" : "text-primary"
          )} />
        </div>

        {/* Title */}
        <h3 className={cn(
          "text-lg font-semibold mb-2",
          isLocked ? "text-muted-foreground" : "text-foreground"
        )}>
          {config.label}
        </h3>

        {/* Description */}
        <p className="text-sm text-muted-foreground line-clamp-2">
          {config.description}
        </p>

        {/* Lock overlay */}
        {isLocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-[2px] rounded-xl">
            <Lock className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-muted-foreground">
              Unlock with Pro
            </p>
          </div>
        )}

        {/* Selected indicator */}
        {isSelected && !isLocked && (
          <div className="absolute top-4 right-4">
            <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
})}

{/* Upgrade Modal */}
{selectedLockedType && (
  <TierUpgradeModal
    isOpen={showUpgradeModal}
    onClose={() => {
      setShowUpgradeModal(false);
      setSelectedLockedType(null);
    }}
    interviewType={selectedLockedType}
    currentTier={userTier}
  />
)}
```

### Task 2.3: Create Tier Upgrade Modal

**File**: `/components/dashboard/tier-upgrade-modal.tsx`

```typescript
"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Lock,
  Crown,
  Sparkles,
  Check,
  Target,
  Zap,
  MessageSquare,
} from "lucide-react";
import { RoundType } from "@/lib/interview-config";
import { SubscriptionTier } from "@/lib/services/permissions-service";

interface TierUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  interviewType: RoundType;
  currentTier: SubscriptionTier;
}

const INTERVIEW_TYPE_LABELS: Record<RoundType, string> = {
  product_sense: "Product Sense",
  behavioral: "Behavioral & Leadership",
  execution: "Execution & Analytical",
  strategy: "Strategy",
};

const INTERVIEW_TYPE_DESCRIPTIONS: Record<RoundType, string> = {
  product_sense: "Design products, prioritize features, and solve user problems",
  behavioral: "Practice leadership using STAR method for behavioral questions",
  execution: "Master metrics, roadmapping, and technical execution",
  strategy: "Think long-term about market positioning and business strategy",
};

export function TierUpgradeModal({
  isOpen,
  onClose,
  interviewType,
  currentTier,
}: TierUpgradeModalProps) {
  const router = useRouter();

  const handleUpgrade = () => {
    router.push('/pricing');
    onClose();
  };

  const proFeatures = [
    {
      icon: Sparkles,
      title: "Unlimited Interviews",
      description: "Practice as much as you want with no monthly limits",
    },
    {
      icon: Target,
      title: "All 4 Interview Types",
      description: "Product Sense, Behavioral, Execution, and Strategy",
    },
    {
      icon: MessageSquare,
      title: "2,879 Curated Questions",
      description: "Full question bank from top tech companies",
    },
    {
      icon: Zap,
      title: "Detailed Feedback",
      description: "Framework-based rubrics and improvement suggestions",
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-display">
                Unlock {INTERVIEW_TYPE_LABELS[interviewType]} Interviews
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1">
                {INTERVIEW_TYPE_DESCRIPTIONS[interviewType]}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current tier indicator */}
          <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
            <div className="text-sm text-muted-foreground">
              Current plan: <span className="font-medium capitalize">{currentTier}</span>
            </div>
          </div>

          {/* Pro features */}
          <div>
            <p className="text-sm font-medium mb-3">Upgrade to Pro and get:</p>
            <div className="grid gap-3">
              {proFeatures.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card/50"
                >
                  <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0">
                    <feature.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {feature.title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {feature.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing highlight */}
          <Card className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Pro Plan</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-foreground">$29</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Or $249/year (save $99) • 7-day free trial
                </div>
              </div>
              <Crown className="w-8 h-8 text-primary" />
            </div>
          </Card>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="w-full sm:w-auto order-2 sm:order-1"
          >
            Stay with Product Sense
          </Button>
          <Button
            onClick={handleUpgrade}
            className="w-full sm:w-auto order-1 sm:order-2"
          >
            <Crown className="w-4 h-4 mr-2" />
            View Plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Phase 3: Testing & Optimization (P2)

**Goal**: Ensure robust implementation and measure impact
**Timeline**: Days 4-5 (3-4 hours)
**Priority**: MEDIUM (quality assurance)

### Task 3.1: E2E Testing

**Test Scenarios**:

1. **Free Tier User Journey**
   - [ ] Navigate to /setup
   - [ ] See Product Sense enabled, others locked
   - [ ] Click on locked "Execution" type
   - [ ] Verify TierUpgradeModal appears
   - [ ] Click "View Plans" → redirects to /pricing
   - [ ] Click "Stay with Product Sense" → modal closes
   - [ ] Select Product Sense → proceed to difficulty
   - [ ] Start interview → succeeds

2. **Pro Tier User Journey**
   - [ ] Navigate to /setup
   - [ ] See all 4 types enabled (no locks)
   - [ ] Select "Behavioral" → proceed to difficulty
   - [ ] Start interview → succeeds

3. **Trial Period Journey**
   - [ ] User on 7-day Pro trial
   - [ ] Navigate to /setup
   - [ ] See all 4 types enabled
   - [ ] Trial banner shows "X days remaining"
   - [ ] Select any type → succeeds

4. **Downgrade Journey**
   - [ ] Pro user downgrades to Free mid-month
   - [ ] Navigate to /setup (after downgrade)
   - [ ] See Product Sense enabled, others locked
   - [ ] Previously available types now show lock icons

### Task 3.2: Analytics Tracking

**File**: `/lib/analytics.ts` (create if doesn't exist)

```typescript
export function trackTierRestriction(data: {
  userId: string;
  tier: string;
  requestedType: string;
  action: 'modal_shown' | 'upgrade_clicked' | 'dismissed';
}) {
  // Send to analytics service (PostHog, Mixpanel, etc.)
  console.log('[Analytics] Tier restriction event', data);

  // Example: PostHog
  if (typeof window !== 'undefined' && window.posthog) {
    window.posthog.capture('tier_restriction_interaction', data);
  }
}
```

**Usage in TierUpgradeModal**:

```typescript
import { trackTierRestriction } from "@/lib/analytics";

export function TierUpgradeModal({ ... }) {
  // Track modal shown
  useEffect(() => {
    if (isOpen) {
      trackTierRestriction({
        userId: user?.id || 'anonymous',
        tier: currentTier,
        requestedType: interviewType,
        action: 'modal_shown',
      });
    }
  }, [isOpen]);

  const handleUpgrade = () => {
    trackTierRestriction({
      userId: user?.id || 'anonymous',
      tier: currentTier,
      requestedType: interviewType,
      action: 'upgrade_clicked',
    });
    router.push('/pricing');
    onClose();
  };

  const handleDismiss = () => {
    trackTierRestriction({
      userId: user?.id || 'anonymous',
      tier: currentTier,
      requestedType: interviewType,
      action: 'dismissed',
    });
    onClose();
  };

  // Update buttons to use these handlers
}
```

---

## Visual Design Mockup

### Free Tier Setup Page

```
┌─────────────────────────────────────────────────────────┐
│  ← Back to Dashboard                                    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Setup Your Interview                                   │
│  Two quick choices and you're ready to practice         │
│                                                         │
│  ⓵ Interview Type  ⓶ Difficulty Level                  │
│  ━━━━━━━━━━━━━━━━  ─────────────────                   │
│                                                         │
│  Choose Interview Type                                  │
│  Select the type of interview you want to practice      │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │ 💡 Product Sense │  │ 👥 Behavioral    │ [Pro]      │
│  │                  │  │ ┌────────────────┤            │
│  │ Design thinking, │  │ │   🔒           │            │
│  │ prioritization,  │  │ │ Unlock with Pro│            │
│  │ user problems    │  │ └────────────────┤            │
│  │                  │  │ Leadership, STAR │            │
│  └──────────────────┘  └──────────────────┘            │
│                                                         │
│  ┌──────────────────┐  ┌──────────────────┐            │
│  │ 🎯 Execution     │  │ 📈 Strategy      │            │
│  │ [Pro]            │  │ [Pro]            │            │
│  │ ┌────────────────┤  │ ┌────────────────┤            │
│  │ │   🔒           │  │ │   🔒           │            │
│  │ │ Unlock with Pro│  │ │ Unlock with Pro│            │
│  │ └────────────────┤  │ └────────────────┤            │
│  │ Metrics, roadmap │  │ Market strategy  │            │
│  └──────────────────┘  └──────────────────┘            │
│                                                         │
│  💡 Upgrade to Pro for unlimited access to all 4       │
│  interview types → [View Plans]                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Tier Upgrade Modal

```
┌────────────────────────────────────────────┐
│  🔒  Unlock Execution & Analytical         │
│      Interviews                            │
│                                            │
│  Master metrics, roadmapping, and          │
│  technical execution                       │
├────────────────────────────────────────────┤
│                                            │
│  Current plan: Free                        │
│                                            │
│  Upgrade to Pro and get:                   │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │ ✨ Unlimited Interviews               │ │
│  │    Practice as much as you want      │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │ 🎯 All 4 Interview Types             │ │
│  │    Product, Behavioral, Execution... │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │ 💬 2,879 Curated Questions           │ │
│  │    Full question bank from top...    │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │ ⚡ Detailed Feedback                 │ │
│  │    Framework-based rubrics and...    │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │  Pro Plan            👑               │ │
│  │  $29 /month                           │ │
│  │  Or $249/year • 7-day free trial      │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  [Stay with Product Sense]  [👑 View Plans]│
│                                            │
└────────────────────────────────────────────┘
```

---

## Success Criteria

### Phase 1 (Backend Security)
- ✅ Free users cannot start premium interview types via API
- ✅ Returns 403 with clear error message
- ✅ Pro/Premium users can start all types
- ✅ All unit tests pass

### Phase 2 (Frontend UX)
- ✅ Locked types show lock icon and "Pro" badge
- ✅ Clicking locked type shows upgrade modal
- ✅ Modal has clear benefits and pricing
- ✅ "View Plans" redirects to /pricing
- ✅ Free users see Product Sense as only enabled option
- ✅ Build succeeds with no TypeScript errors

### Phase 3 (Testing)
- ✅ All E2E tests pass for free/pro/premium flows
- ✅ Analytics tracking implemented and tested
- ✅ Performance metrics acceptable (<5ms overhead)
- ✅ Accessibility review complete (WCAG 2.1 AA)

---

## Rollout Plan

1. **Day 1**: Deploy Phase 1 (backend security) to staging
2. **Day 2**: Test Phase 1 with manual API calls
3. **Day 3**: Deploy Phase 2 (frontend UX) to staging
4. **Day 4**: QA testing (all flows)
5. **Day 5**: Deploy to production with monitoring

**Monitoring** (first 7 days):
- Track `interview_type_locked` 403 errors
- Monitor upgrade modal click-through rate
- Watch for setup page abandonment rate changes
- Check free → paid conversion rate

---

## Questions & Decisions

### Resolved
- ✅ Hide or disable locked types? → **Disable** (better discovery)
- ✅ Restrict difficulty levels? → **YES** (Free = Intermediate only)
- ✅ Where to store permissions? → **Code config** (not database)

### Open
- [ ] Should we A/B test upgrade modal variants?
- [ ] Should we add a "trial preview" for locked types?
- [ ] What email nurture for users who click locked types?

---

**Implementation Ready**: YES
**Blocked By**: None
**Next Action**: Begin Phase 1 (create permissions service)

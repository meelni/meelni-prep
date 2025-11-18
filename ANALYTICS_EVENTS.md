# Analytics Events - Tier & Pricing Tracking

## Overview

This document describes all analytics events tracked for the tier-based pricing and upgrade flow.

## Implementation

All events are tracked using the `track()` function from `/lib/analytics.ts`.

Currently logs to console in development. Easy to integrate with:
- PostHog
- Mixpanel
- Segment
- Amplitude
- Google Analytics

## Events Tracked

### 1. Setup Page Viewed
**Event Name:** `Setup Page Viewed`
**Triggered:** When user loads /setup page and subscription tier is fetched
**Properties:**
- `userTier`: string (free, pro, premium)
- `allowedTypesCount`: number (1 for free, 4 for pro/premium)
- `lockedTypesCount`: number (3 for free, 0 for pro/premium)

**Use Case:** Understand funnel - how many free vs paid users start interview setup

---

### 2. Locked Interview Type Clicked
**Event Name:** `Locked Interview Type Clicked`
**Triggered:** When free tier user clicks on a locked interview type (Behavioral, Execution, or Strategy)
**Properties:**
- `interviewType`: string (behavioral, execution, strategy)
- `interviewTypeLabel`: string (Behavioral, Execution, Strategy)
- `currentTier`: string (typically "free")

**Use Case:**
- Which locked types are most popular? (helps prioritize features)
- How many free users encounter paywall?

---

### 3. Upgrade Modal Viewed
**Event Name:** `Upgrade Modal Viewed`
**Triggered:** When tier upgrade modal opens after clicking locked interview type
**Properties:**
- `requestedType`: string (interview type user wanted)
- `requestedTypeLabel`: string (human-readable label)
- `currentTier`: string (free)

**Use Case:**
- Conversion funnel: Locked Click → Modal View
- Which interview types drive most upgrade modal views?

---

### 4. Upgrade Modal Dismissed
**Event Name:** `Upgrade Modal Dismissed`
**Triggered:** When user closes modal without upgrading ("Maybe Later" or X button)
**Properties:**
- `requestedType`: string
- `requestedTypeLabel`: string
- `currentTier`: string

**Use Case:**
- Measure drop-off rate
- A/B test modal copy to reduce dismissals

---

### 5. Upgrade Modal CTA Clicked
**Event Name:** `Upgrade Modal CTA Clicked`
**Triggered:** When user clicks "View Plans" button in upgrade modal
**Properties:**
- `requestedType`: string
- `requestedTypeLabel`: string
- `currentTier`: string

**Use Case:**
- Conversion funnel: Modal View → CTA Click → Pricing Page
- Calculate upgrade intent rate

---

## Key Metrics to Calculate

### Upgrade Modal Conversion Rate
```
Modal CTA Clicks / Modal Views = Conversion Rate
```
Target: >20%

### Interview Type Popularity (Free Tier)
```
Locked Clicks by Type / Total Locked Clicks = Type Distribution
```
Helps prioritize which interview types to promote

### Free User Paywall Encounter Rate
```
Users with Locked Clicks / Total Free Users = Encounter Rate
```
Measures product-market fit for paid features

---

## Sample Event Flow (Free Tier User)

1. User loads /setup
   - Event: `Setup Page Viewed` (userTier: free, lockedTypesCount: 3)

2. User clicks "Behavioral" (locked)
   - Event: `Locked Interview Type Clicked` (interviewType: behavioral)

3. Modal opens
   - Event: `Upgrade Modal Viewed` (requestedType: behavioral)

4. User clicks "View Plans"
   - Event: `Upgrade Modal CTA Clicked` (requestedType: behavioral)
   - User redirected to /pricing

---

## Integration Example

### PostHog
```typescript
// lib/analytics.ts
export function track(eventName: string, properties?: EventProperties): void {
  if (typeof window !== 'undefined' && window.posthog) {
    window.posthog.capture(eventName, properties);
  }
}
```

### Mixpanel
```typescript
export function track(eventName: string, properties?: EventProperties): void {
  if (typeof window !== 'undefined' && window.mixpanel) {
    window.mixpanel.track(eventName, properties);
  }
}
```

---

## Future Events (Not Yet Implemented)

- `Interview Type Selected` - When user selects unlocked type
- `Quota Modal Viewed` - When free user exceeds 3/month limit
- `Quota Modal CTA Clicked` - When user clicks upgrade from quota modal
- `Pricing Page Viewed` - Referral source tracking
- `Checkout Started` - Stripe checkout initiated
- `Subscription Created` - Successful upgrade

---

## Testing

Run in development mode and check browser console:
```
[Analytics] Setup Page Viewed { userTier: 'free', allowedTypesCount: 1, lockedTypesCount: 3 }
[Analytics] Locked Interview Type Clicked { interviewType: 'behavioral', ... }
[Analytics] Upgrade Modal Viewed { requestedType: 'behavioral', ... }
```

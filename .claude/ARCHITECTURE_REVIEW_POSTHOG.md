# PostHog Analytics Integration - Technical Architecture Review

**Reviewer**: architect
**Date**: 2025-11-18
**Status**: Approved with Modifications

---

## Executive Summary

The product team's plan is sound from a product analytics perspective, but requires architectural modifications for Next.js 14 App Router and our existing patterns. I've identified 3 critical technical risks and 5 implementation patterns that need addressing.

**Recommendation**: Approve with modifications. Implement Phase 1 with server-side tracking, custom analytics service layer, and privacy-first architecture.

---

## Key Architecture Decisions

### 1. Hybrid Tracking Approach (Client + Server)

**Use Server-Side For**:
- API route conversions (`/api/interview/start`, `/api/feedback/generate`)
- Server actions (future Supabase operations)
- Background job completions (Inngest evaluation)
- Critical path events (guaranteed delivery)

**Use Client-Side For**:
- UI interactions (button clicks, navigation)
- Session replays and heatmaps
- User engagement metrics
- Real-time feature flags (future)

### 2. Custom Analytics Service Layer

**DO NOT** use PostHog hooks directly in components. Create abstraction layer.

**Benefits**:
- Type safety for all events
- Easy migration if PostHog replaced
- Consistent error handling
- Testability

**File Structure**:
```
/lib/analytics/
├── index.ts                    # Re-export public API
├── analytics-service.ts        # Main service class
├── posthog-provider.tsx        # Client-side provider
├── posthog-server.ts           # Server-side client
├── config.ts                   # Environment config
├── types.ts                    # Event definitions
└── use-analytics-pageview.ts   # Pageview hook
```

### 3. TypeScript Event Definitions

All events must be type-safe with mapped property types:

```typescript
export type AnalyticsEvent =
  | 'landing_page_viewed'
  | 'interview_started'
  | 'auth_signup_completed'
  // ... all events

export type EventProperties = {
  interview_started: {
    session_id: string
    interview_type: 'product_sense' | 'analytical' | 'leadership' | 'strategy'
    mode: 'mock' | 'practice' | 'learning'
    skill_level: 'junior' | 'intermediate' | 'senior'
  }
  // ... all event properties
}
```

---

## Critical Technical Risks

### Risk 1: Performance Impact
- **Issue**: Session recording at 30% sample rate could impact Core Web Vitals
- **Mitigation**: Conditional recording based on connection speed, disable canvas recording
- **Target**: <50ms impact on page loads

### Risk 2: Bundle Size Increase
- **Issue**: PostHog adds +45KB gzipped
- **Mitigation**: Dynamic import, lazy-load session recording, tree-shaking
- **Target**: <50KB total increase

### Risk 3: Race Conditions with Auth State
- **Issue**: User identification might fire before Supabase session resolves
- **Mitigation**: Sync PostHog identify with AuthProvider state using usePostHog hook

### Risk 4: Privacy Leaks in Error Tracking
- **Issue**: Error events might contain PII
- **Mitigation**: Sanitize error properties before capture, use PII detection patterns

---

## Required Implementation Patterns

### Pattern 1: AnalyticsService Class

```typescript
// lib/analytics/analytics-service.ts
export class AnalyticsService {
  track<E extends AnalyticsEvent>(
    event: E,
    properties?: EventProperties[E]
  ): void {
    try {
      this.client?.capture(event, properties)
    } catch (error) {
      console.error('Analytics error:', error)
      // Don't throw - analytics should never break app
    }
  }

  static async trackServer<E extends AnalyticsEvent>(
    event: E,
    properties?: EventProperties[E] & { distinctId: string }
  ): Promise<void> {
    const ph = getServerPostHog()
    ph.capture({
      distinctId: properties.distinctId,
      event,
      properties,
    })
  }
}

export const analytics = new AnalyticsService()
```

### Pattern 2: PostHog Provider Placement

```typescript
// app/layout.tsx
import { PostHogProvider } from '@/lib/analytics/posthog-provider'
import { AuthProvider } from '@/app/providers/auth-provider'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <PostHogProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </PostHogProvider>
      </body>
    </html>
  )
}
```

**Critical**: PostHog must wrap AuthProvider to capture user identification events.

### Pattern 3: User Identification in AuthProvider

```typescript
// app/providers/auth-provider.tsx
import { usePostHog } from 'posthog-js/react'

export function AuthProvider({ children }) {
  const posthog = usePostHog()

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          // Identify user in PostHog
          posthog?.identify(session.user.id, {
            email_domain: session.user.email?.split('@')[1],
            signup_method: session.user.app_metadata?.provider,
            created_at: session.user.created_at,
          })
        } else {
          posthog?.reset() // Clear identity on logout
        }
      }
    )
  }, [posthog])
}
```

### Pattern 4: PII Sanitization

```typescript
const PII_PATTERNS = {
  email: /[\w.-]+@[\w.-]+\.\w+/g,
  phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  credit_card: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
}

function sanitizeProperties(properties: any): any {
  const sanitized = { ...properties }

  Object.keys(sanitized).forEach((key) => {
    if (typeof sanitized[key] === 'string') {
      Object.entries(PII_PATTERNS).forEach(([type, pattern]) => {
        sanitized[key] = sanitized[key].replace(pattern, `[REDACTED_${type.toUpperCase()}]`)
      })
    }
  })

  return sanitized
}
```

### Pattern 5: Cookie Consent Banner

```typescript
// components/cookie-consent-banner.tsx
export function CookieConsentBanner() {
  const handleAccept = () => {
    localStorage.setItem('cookie-consent', 'accepted')
    posthog.opt_in_capturing()
    setShowBanner(false)
  }

  const handleDeny = () => {
    localStorage.setItem('cookie-consent', 'denied')
    posthog.opt_out_capturing()
    setShowBanner(false)
  }
}
```

---

## Required ADRs

### ADR-027: PostHog Analytics Integration

**Decision**: Implement hybrid (client + server) PostHog integration with custom analytics service layer and privacy-first defaults.

**Key Patterns**:
1. Custom `AnalyticsService` abstraction layer
2. TypeScript event definitions for type safety
3. Hybrid tracking (client for UI, server for API routes)
4. Privacy defaults: IP anonymization, PII sanitization, cookie consent
5. Environment-based initialization (prod only, debug in dev)

**Consequences**:
- +45KB bundle size increase
- +~10ms initialization time on client
- Type-safe event tracking
- Easy migration if switching providers
- GDPR compliant by default

### ADR-028: Analytics Privacy & Compliance

**Decision**: Implement granular cookie consent, IP anonymization, PII sanitization, and data export/deletion APIs.

**Key Patterns**:
1. Cookie consent banner with opt-in/opt-out
2. Automatic PII detection and redaction
3. IP address anonymization
4. User data export/deletion via PostHog API
5. Session recording disabled in sensitive flows

**Consequences**:
- Reduced analytics coverage from users who decline cookies (~10-15%)
- Additional API endpoints for GDPR compliance
- Automated PII sanitization prevents accidental leaks

---

## Implementation Checklist

### Phase 1: Foundation (Week 1)

**Infrastructure**:
- [ ] Install `posthog-js` and `posthog-node`
- [ ] Create `/lib/analytics/` directory structure
- [ ] Implement `AnalyticsService` with TypeScript types
- [ ] Create `posthog-provider.tsx` (client-side)
- [ ] Create `posthog-server.ts` (server-side)
- [ ] Add PostHogProvider to root layout
- [ ] Implement `useAnalyticsPageview` hook
- [ ] Add environment variables

**Privacy**:
- [ ] Implement cookie consent banner
- [ ] Configure IP anonymization
- [ ] Add PII sanitization to AnalyticsService
- [ ] Create `/api/user/analytics-data` endpoint (GDPR)

**Testing**:
- [ ] Create PostHog mocks for Jest
- [ ] Write unit tests for AnalyticsService
- [ ] Add analytics status endpoint

**Documentation**:
- [ ] Create ADR-027 (PostHog Integration)
- [ ] Create ADR-028 (Analytics Privacy)
- [ ] Update CLAUDE.md with patterns
- [ ] Document event naming conventions

---

## Critical Gotchas

### 1. PostHog Provider Must Wrap AuthProvider
**Wrong**: `<AuthProvider><PostHogProvider>...</PostHogProvider></AuthProvider>`
**Correct**: `<PostHogProvider><AuthProvider>...</AuthProvider></PostHogProvider>`

### 2. Don't Call posthog.identify() Before Init
Use `usePostHog()` hook to guarantee initialization.

### 3. Server-Side Tracking Requires distinctId
Always include user ID in server-side events.

### 4. Session Recording Performance Impact
Disable canvas recording for agent visualizer.

### 5. Development vs Production Events
Use separate PostHog projects for dev/prod.

---

## Final Recommendation

**Approve integration with following modifications**:

1. **Architecture Changes**:
   - ✅ Use hybrid (client + server) tracking
   - ✅ Create custom `AnalyticsService` abstraction
   - ✅ Add TypeScript event definitions
   - ✅ Implement server-side PostHog client

2. **Privacy Requirements** (MUST implement):
   - ✅ Cookie consent banner
   - ✅ IP anonymization
   - ✅ PII sanitization
   - ✅ GDPR export/deletion APIs

3. **Performance Requirements**:
   - ✅ Dynamic import PostHogProvider
   - ✅ Disable canvas recording
   - ✅ 30% session recording sample rate
   - ✅ Monitor bundle size (<50KB)

**Estimated Effort**: 2-3 weeks
**Risk Level**: Low

**Next Steps**:
1. Hand off to developer agent with this review
2. Create Phase 1 implementation tasks
3. Set up PostHog projects (dev/staging/prod)
4. Begin implementation with foundation layer

---

**Reviewed By**: architect
**Approved By**: Head of Product
**Date**: 2025-11-18

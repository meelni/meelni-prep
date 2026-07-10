# ADR-027: PostHog Analytics Integration with Privacy-First Architecture

**Date**: 2025-11-18
**Status**: Accepted
**Deciders**: Lead Architect, Head of Product
**Updated**: N/A

> Amended by [Explicit Analytics Consent](../../decisions/2026-07-09-explicit-analytics-consent.md). PostHog now initializes only after current persisted acceptance. Autocapture and session replay remain globally disabled; the historical replay rollout below is no longer planned behavior.

## Context

### Background

- Meelni requires product analytics to measure user engagement, conversion funnels, retention, and feature usage
- Need visibility into interview completion rates, user drop-off points, and feature adoption
- Analytics infrastructure must support GDPR compliance from day one
- Integration must work seamlessly with Next.js 14 App Router and Supabase Auth

### Problem Statement

How do we instrument comprehensive product analytics while maintaining privacy-first principles, type safety, and flexibility to migrate providers if needed?

## Decision

**We will integrate PostHog with a custom analytics abstraction layer using hybrid client/server-side tracking.**

Key components:

1. **Custom AnalyticsService class** - Abstraction layer over PostHog SDK
2. **TypeScript event definitions** - Type-safe event tracking with mapped properties
3. **Hybrid tracking approach** - Client-side for UI interactions, server-side for API routes
4. **Privacy-first defaults** - IP anonymization, PII sanitization, cookie consent

## Rationale

### Factors Considered

- **Type Safety**: All analytics events must be type-checked at compile time
- **Vendor Lock-in**: Need ability to switch analytics providers without refactoring components
- **Privacy Compliance**: GDPR requirements for EU users (likely customer base)
- **Performance Impact**: Minimal impact on Core Web Vitals and bundle size
- **Cost at Scale**: Predictable pricing as user base grows
- **Developer Experience**: Easy to instrument new events without error-prone string literals

### Alternatives Considered

#### Alternative 1: Google Analytics 4

- **Pros**:
  - Free tier with generous limits
  - Familiar to most product teams
  - Rich ecosystem and documentation
- **Cons**:
  - Privacy concerns (data processed by Google)
  - Limited feature flagging capabilities
  - Complex event schema
  - No self-hosting option
- **Why not chosen**: Privacy concerns conflict with GDPR-first approach; limited product features beyond basic analytics

#### Alternative 2: Mixpanel

- **Pros**:
  - Excellent user journey tracking
  - Powerful segmentation
  - Mature product with strong reputation
- **Cons**:
  - Expensive at scale ($89/month after 100K MTU)
  - No self-hosting option
  - Vendor lock-in with proprietary APIs
- **Why not chosen**: Cost becomes prohibitive as we scale; lack of feature flags limits product experimentation

#### Alternative 3: Amplitude

- **Pros**:
  - Industry-leading behavioral analytics
  - Advanced cohort analysis
  - Strong enterprise features
- **Cons**:
  - Expensive for MVP stage ($50/month+)
  - Complex setup and learning curve
  - Overkill for current needs
- **Why not chosen**: Cost and complexity outweigh benefits for MVP; better suited for enterprise scale

#### Alternative 4: Direct PostHog Hooks (No Abstraction)

- **Pros**:
  - Simpler implementation (fewer files)
  - Direct access to all PostHog features
  - Less code to maintain
- **Cons**:
  - Vendor lock-in (hard to migrate)
  - No type safety for events
  - Scattered analytics logic across components
  - Difficult to test
- **Why not chosen**: Violates principle of loose coupling; migrating providers would require touching 100+ files

### Why This Decision Wins

- **PostHog + Abstraction Layer** provides best balance of flexibility, cost, and features
- Self-hostable option (future-proofing for enterprise customers)
- Built-in feature flags (A/B testing without additional tools)
- Session recording and heatmaps for qualitative insights
- Open-source with transparent pricing ($0-$450/month predictable tiers)
- GDPR-compliant with IP anonymization and data residency controls
- Custom abstraction layer prevents vendor lock-in and ensures type safety
- Hybrid tracking enables comprehensive analytics without missing server-side events

## Consequences

### Positive Consequences

- ✅ **Type Safety**: TypeScript enforces correct event names and property types at compile time
- ✅ **Privacy Compliance**: IP anonymization and PII sanitization enabled by default
- ✅ **Easy Migration**: Switching providers only requires updating AnalyticsService implementation
- ✅ **Comprehensive Tracking**: Hybrid approach captures both client and server-side events
- ✅ **Feature Flags**: Built-in support for A/B testing without additional tools
- ✅ **Session Replay**: Qualitative insights via session recordings and heatmaps
- ✅ **Predictable Cost**: $0 for MVP (up to 1M events/month), ~$200-300/month at 100K MAU

### Negative Consequences

- ⚠️ **Bundle Size Increase**: +45KB gzipped (PostHog SDK)
- ⚠️ **Initialization Overhead**: +10ms on page load for PostHog init
- ⚠️ **Abstraction Maintenance**: Custom AnalyticsService layer requires ongoing maintenance
- ⚠️ **Analytics Coverage Loss**: ~10-15% opt-out rate from cookie consent

### Future Implications

- Additional abstraction layer to maintain (AnalyticsService, event types)
- Need to keep event definitions in sync between frontend and backend
- Session recording storage costs scale with user base
- Potential need for self-hosting if enterprise customers require data residency

### Technical Debt Created (if any)

- None significant; abstraction layer is well-architected and tested

## Implementation

### Required Changes

- [x] Install `posthog-js` (client) and `posthog-node` (server)
- [x] Create `/lib/analytics/` directory structure
- [x] Implement `AnalyticsService` class with type-safe methods
- [x] Create `posthog-provider.tsx` for client-side initialization
- [x] Create `posthog-server.ts` for server-side client
- [x] Define all event types in `types.ts`
- [x] Add PostHogProvider to root layout
- [x] Implement `useAnalyticsPageview` hook for automatic pageview tracking
- [x] Update AuthProvider to identify users on login
- [x] Add environment variables to `.env.local`

### File Structure

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

### Migration Strategy (if applicable)

N/A - New integration, no migration required

### Timeline

- Phase 1: Foundation (Week 1)
  - Install dependencies
  - Create analytics infrastructure
  - Implement AnalyticsService
  - Add privacy controls (cookie consent, IP anonymization)
- Phase 2: Instrumentation (Week 2)
  - Add pageview tracking
  - Instrument authentication flows
  - Track interview lifecycle events
  - Add dashboard interaction events
- Phase 3: Advanced Features (Week 3)
  - Enable session recording (30% sample rate)
  - Implement feature flags for A/B tests
  - Add conversion funnel tracking
  - Integrate with error tracking

## Validation

### Success Criteria

- [ ] All events type-checked at compile time
- [ ] PostHog dashboard shows real-time events
- [ ] User identification synced with Supabase Auth
- [ ] Cookie consent banner operational with opt-in/opt-out
- [ ] IP anonymization enabled and verified
- [ ] PII sanitization tested with sample data
- [ ] Bundle size increase <50KB
- [ ] Page load impact <50ms (P95)
- [ ] Server-side events captured from API routes
- [ ] Zero TypeScript errors in analytics code

### Metrics to Track

- **Coverage**: % of key user flows instrumented
- **Opt-in Rate**: % of users accepting analytics cookies
- **Bundle Size**: PostHog SDK impact on page weight
- **Performance**: PostHog init time impact on Time to Interactive
- **Event Volume**: Daily/monthly event counts vs PostHog free tier limits
- **Session Recording Sample Rate**: % of sessions recorded (target 30%)

## Related Decisions

- [ADR-028: Analytics Privacy & GDPR Compliance](./ADR-028-analytics-privacy-compliance.md) - Privacy architecture for analytics
- [ADR-020: Google OAuth Authentication](./ADR-020-google-oauth-authentication.md) - User identification integration
- [ADR-003: Tech Stack Finalization](./ADR-003-tech-stack-finalization.md) - Next.js App Router considerations

## References

- [PostHog Documentation](https://posthog.com/docs)
- [PostHog Next.js Integration Guide](https://posthog.com/docs/libraries/next-js)
- [PostHog GDPR Compliance](https://posthog.com/docs/privacy/gdpr-compliance)
- Internal documentation: `.claude/ARCHITECTURE_REVIEW_POSTHOG.md`
- [TypeScript Event Tracking Best Practices](https://posthog.com/tutorials/event-tracking-guide)

## Notes

**Critical Implementation Patterns**:

1. **Provider Placement**: PostHogProvider must wrap AuthProvider in app/layout.tsx to capture user identification
2. **User Identification**: Sync PostHog identify() with Supabase auth state changes
3. **PII Sanitization**: Automatically redact email, phone, SSN, credit card patterns
4. **Server-Side Tracking**: Always include `distinctId` in server-side events
5. **Error Handling**: Analytics failures must never break app functionality

**Environment Configuration**:

- Development: Separate PostHog project for dev/staging (avoid polluting production data)
- Production: Enable session recording at 30% sample rate
- All environments: IP anonymization enabled by default

**Testing Strategy**:

- Mock PostHog client in Jest tests
- Create analytics status endpoint for debugging
- Test PII sanitization with known patterns
- Verify cookie consent logic with E2E tests

**Future Considerations**:

- Self-hosting PostHog for enterprise customers requiring data residency
- Advanced feature flagging for multivariate tests
- Integration with error tracking (Sentry) for correlated analytics
- Real-time dashboards for customer success teams

---

**Revision Log**:

- 2025-11-18: Initial decision (ADR created)

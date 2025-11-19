# ADR-028: Analytics Privacy & GDPR Compliance

**Date**: 2025-11-18
**Status**: Accepted
**Deciders**: Lead Architect, Head of Product, Legal Counsel
**Updated**: N/A

## Context

### Background
- Meelni will have significant EU user base (PM candidates preparing for interviews at European tech companies)
- GDPR requires explicit consent for analytics cookies and user tracking
- Users must have right to access, export, and delete their analytics data
- Privacy violations can result in fines up to €20M or 4% of annual revenue
- Building trust with users requires transparency about data collection practices

### Problem Statement
How do we implement analytics in full compliance with GDPR while maintaining sufficient data quality for product decisions?

## Decision

**We will implement privacy-first analytics architecture with granular cookie consent, IP anonymization, automated PII sanitization, and user data control APIs.**

Key components:
1. **Granular Cookie Consent** - Opt-in/opt-out with clear explanations
2. **IP Anonymization** - Enabled by default in PostHog configuration
3. **Automated PII Sanitization** - Pattern-based detection and redaction
4. **User Data APIs** - Export/deletion endpoints for GDPR rights
5. **Session Recording Restrictions** - Disabled on sensitive pages (payment, auth)

## Rationale

### Factors Considered
- **Legal Compliance**: GDPR Article 6 (lawful basis), Article 7 (consent), Article 15-20 (data subject rights)
- **User Trust**: Transparent data practices build confidence in our platform
- **Data Quality**: Balance between privacy protection and actionable insights
- **Engineering Complexity**: Privacy controls must not require ongoing manual intervention
- **Competitive Advantage**: Privacy-first approach differentiates from competitors

### Why This Decision Wins
- **Proactive Compliance**: Avoids regulatory fines and legal challenges
- **User Trust**: Transparent consent builds long-term user confidence
- **Automated Protection**: PII sanitization prevents accidental leaks
- **Global Scalability**: GDPR compliance covers most global privacy laws (CCPA, LGPD)
- **Minimal Friction**: Cookie banner only shown once; defaults to privacy-preserving

## Consequences

### Positive Consequences
- ✅ **GDPR Compliant**: Full compliance with EU data protection regulations
- ✅ **User Trust**: Transparent data practices build confidence
- ✅ **Automated PII Protection**: Pattern-based sanitization prevents accidental leaks
- ✅ **Data Subject Rights**: Export/deletion APIs fulfill legal requirements
- ✅ **Risk Mitigation**: Reduces legal liability and regulatory fines
- ✅ **Competitive Differentiation**: Privacy-first approach attracts privacy-conscious users

### Negative Consequences
- ⚠️ **Analytics Coverage Loss**: ~10-15% of users expected to opt-out
- ⚠️ **Development Overhead**: Additional consent UI and GDPR API endpoints
- ⚠️ **Incomplete User Journeys**: Opt-out users create gaps in funnel analytics
- ⚠️ **Storage Complexity**: Need to maintain consent state across sessions

### Future Implications
- Need to maintain consent database (localStorage + server-side sync)
- Privacy policy must be kept up-to-date with data collection practices
- Annual GDPR compliance audits recommended
- Potential need for data processing agreements (DPAs) with PostHog

### Technical Debt Created (if any)
- Cookie consent state management adds complexity to analytics initialization
- Need to handle race conditions between consent check and analytics init

## Implementation

### Required Changes
- [x] Create cookie consent banner component
- [x] Implement consent state management (localStorage + PostHog opt-in/opt-out)
- [x] Configure IP anonymization in PostHog
- [x] Implement PII sanitization patterns
- [x] Create `/api/user/analytics-data` endpoint for data export
- [x] Create `/api/user/analytics-delete` endpoint for data deletion
- [x] Update privacy policy with analytics disclosure
- [x] Disable session recording on sensitive pages

### Privacy Implementation Details

#### 1. Cookie Consent Banner
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

  return (
    <div className="cookie-banner">
      <p>We use cookies to improve your experience and analyze usage.</p>
      <button onClick={handleAccept}>Accept</button>
      <button onClick={handleDeny}>Decline</button>
      <a href="/privacy">Learn More</a>
    </div>
  )
}
```

#### 2. PII Sanitization Patterns
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
        sanitized[key] = sanitized[key].replace(
          pattern,
          `[REDACTED_${type.toUpperCase()}]`
        )
      })
    }
  })

  return sanitized
}
```

#### 3. PostHog IP Anonymization
```typescript
// lib/analytics/config.ts
export const posthogConfig = {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  loaded: (posthog) => {
    posthog.set_config({
      ip: false,  // Disable IP capture
      property_denylist: ['$ip'],  // Block IP from events
    })
  },
}
```

#### 4. GDPR Data Export API
```typescript
// app/api/user/analytics-data/route.ts
export async function GET(request: Request) {
  const { user } = await getSession()

  const posthog = getServerPostHog()
  const userData = await posthog.getPersonData(user.id)

  return Response.json({
    user_id: user.id,
    events: userData.events,
    properties: userData.properties,
    consent_status: userData.consent,
  })
}
```

#### 5. GDPR Data Deletion API
```typescript
// app/api/user/analytics-delete/route.ts
export async function DELETE(request: Request) {
  const { user } = await getSession()

  const posthog = getServerPostHog()
  await posthog.deletePerson(user.id)

  return Response.json({ success: true })
}
```

### Migration Strategy (if applicable)
N/A - Privacy controls implemented from day one

### Timeline
- Week 1: Foundation
  - Implement cookie consent banner
  - Configure IP anonymization
  - Add PII sanitization to AnalyticsService
- Week 2: User Rights
  - Create data export API
  - Create data deletion API
  - Update privacy policy
- Week 3: Validation
  - Test consent flows
  - Verify PII sanitization
  - Conduct GDPR compliance review

## Validation

### Success Criteria
- [ ] Cookie consent banner shown to new users
- [ ] Consent state persisted across sessions
- [ ] PostHog respects opt-out state
- [ ] IP addresses not captured in events
- [ ] PII patterns successfully redacted
- [ ] Data export API returns complete user data
- [ ] Data deletion API removes all user data
- [ ] Privacy policy updated and accessible
- [ ] Session recording disabled on `/auth/*` and `/billing/*` routes
- [ ] GDPR compliance verified by legal counsel

### Metrics to Track
- **Opt-in Rate**: % of users accepting analytics cookies (target 85-90%)
- **PII Leak Rate**: # of events with detected PII patterns (target 0)
- **Data Export Requests**: # of users requesting data export (monitor trend)
- **Data Deletion Requests**: # of users requesting deletion (monitor trend)
- **Consent Abandonment**: % of users closing banner without choosing (target <5%)

## GDPR Compliance Checklist

### Article 6: Lawful Basis for Processing
- [x] User consent obtained before analytics tracking
- [x] Consent mechanism clear and unambiguous
- [x] Users can withdraw consent at any time

### Article 7: Conditions for Consent
- [x] Affirmative action required (explicit "Accept" button)
- [x] Consent freely given (equal access if declined)
- [x] Clear information about data collection provided
- [x] Consent granular (can opt-out of analytics while using product)

### Article 13: Information to be Provided
- [x] Privacy policy discloses analytics data collection
- [x] Purpose of data collection explained (product improvement)
- [x] Retention period specified (90 days)
- [x] Data subject rights explained

### Article 15-20: Data Subject Rights
- [x] Right to Access: Data export API implemented
- [x] Right to Erasure: Data deletion API implemented
- [x] Right to Data Portability: Export in JSON format
- [x] Right to Object: Opt-out mechanism provided

### Article 25: Data Protection by Design
- [x] IP anonymization enabled by default
- [x] PII sanitization automated
- [x] Session recording disabled on sensitive pages
- [x] Data minimization (only collect necessary properties)

### Article 30: Records of Processing Activities
- [x] Data processing documented in privacy policy
- [x] Data retention period specified (90 days)
- [x] Third-party processors disclosed (PostHog)

## Related Decisions

- [ADR-027: PostHog Analytics Integration](./ADR-027-posthog-analytics-integration.md) - Analytics infrastructure
- [ADR-020: Google OAuth Authentication](./ADR-020-google-oauth-authentication.md) - User authentication context
- [ADR-026: Email/Password Authentication](./ADR-026-email-password-authentication.md) - Auth flows requiring privacy

## References

- [GDPR Official Text](https://gdpr-info.eu/)
- [PostHog GDPR Compliance Guide](https://posthog.com/docs/privacy/gdpr-compliance)
- [ICO Cookie Guidance](https://ico.org.uk/for-organisations/guide-to-pecr/guidance-on-the-use-of-cookies-and-similar-technologies/what-are-the-rules-on-cookies-and-similar-technologies/)
- [Common PII Patterns](https://www.w3.org/TR/tracking-dnt/#terminology)
- Internal documentation: `.claude/ARCHITECTURE_REVIEW_POSTHOG.md`

## Notes

**Critical Privacy Principles**:
1. **Privacy by Default**: IP anonymization and PII sanitization enabled from day one
2. **Transparency**: Clear disclosure of data collection in privacy policy and consent banner
3. **User Control**: Easy opt-out and data deletion mechanisms
4. **Data Minimization**: Only collect properties necessary for product decisions
5. **Automated Protection**: PII sanitization prevents human error

**Sensitive Pages** (Session Recording Disabled):
- `/auth/signin`
- `/auth/signup`
- `/auth/reset-password`
- `/billing/*` (future)
- `/settings/account` (future)

**Data Retention Policy**:
- Analytics events: 90 days
- Session recordings: 30 days
- User properties: Until deletion request or account closure
- Aggregate reports: Indefinite (de-identified)

**Testing Strategy**:
- Manual testing with browser DevTools (verify no IP in events)
- Automated PII detection tests with known patterns
- E2E tests for consent banner interactions
- Verify PostHog opt-out state in test environment

**Future Considerations**:
- EU data residency (self-hosted PostHog instance)
- Cookie consent for additional trackers (advertising pixels)
- CCPA compliance for California users (similar to GDPR)
- Regular GDPR compliance audits (annual recommended)

**Common Gotchas**:
1. **Consent State Persistence**: Store consent in both localStorage and server-side for logged-in users
2. **Opt-Out Race Condition**: Check consent before initializing PostHog to avoid tracking opted-out users
3. **PII in Error Messages**: Sanitize error event properties (user input may contain PII)
4. **Session Recording Leaks**: Disable on pages with sensitive forms (passwords, credit cards)

---

**Revision Log**:
- 2025-11-18: Initial decision (ADR created)

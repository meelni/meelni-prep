# Analytics Privacy & Compliance Guide
**GDPR-Compliant Analytics for Meelni**

**Audience**: Legal, Compliance, Data Science, Engineering
**Last Updated**: 2025-11-18
**Compliance**: GDPR, CCPA-ready
**Privacy Level**: Privacy-First by Design

---

## Table of Contents

1. [Privacy Philosophy](#privacy-philosophy)
2. [GDPR Compliance Overview](#gdpr-compliance-overview)
3. [Data Collection Practices](#data-collection-practices)
4. [User Consent Management](#user-consent-management)
5. [PII Protection](#pii-protection)
6. [User Rights & Data Requests](#user-rights--data-requests)
7. [Data Retention & Deletion](#data-retention--deletion)
8. [Security Measures](#security-measures)
9. [Third-Party Data Processing](#third-party-data-processing)
10. [Incident Response](#incident-response)

---

## Privacy Philosophy

### Core Principles

1. **Privacy by Default**: IP anonymization and PII sanitization enabled from day one
2. **User Control**: Easy opt-out and data deletion mechanisms
3. **Transparency**: Clear disclosure of data collection in privacy policy
4. **Data Minimization**: Only collect properties necessary for product decisions
5. **Automated Protection**: PII sanitization prevents human error

### Our Commitment

- **GDPR Compliant**: Full compliance with EU data protection regulations
- **User First**: Users control their data, not us
- **No Surprises**: Transparent data practices, clearly communicated
- **Secure by Design**: Multiple layers of privacy protection

---

## GDPR Compliance Overview

### Legal Basis for Processing (Article 6)

**Consent** (Primary basis):
- Explicit opt-in via cookie consent banner
- Users can withdraw consent at any time
- Tracking disabled until consent given

**Legitimate Interest** (Secondary, limited use):
- Error tracking (critical for service functionality)
- Security monitoring (fraud prevention)
- Still respects user opt-out

### GDPR Articles Covered

| Article | Requirement | Implementation | Status |
|---------|-------------|----------------|--------|
| Art. 6 | Lawful basis | User consent | ✅ |
| Art. 7 | Consent conditions | Explicit opt-in banner | ✅ |
| Art. 13 | Information provided | Privacy policy disclosure | ✅ |
| Art. 15 | Right to access | Data export API | ✅ |
| Art. 16 | Right to rectification | User settings (future) | 🔄 |
| Art. 17 | Right to erasure | Data deletion API | ✅ |
| Art. 18 | Right to restriction | Opt-out mechanism | ✅ |
| Art. 20 | Data portability | JSON export format | ✅ |
| Art. 21 | Right to object | Cookie banner decline | ✅ |
| Art. 25 | Data protection by design | IP anonymization, PII sanitization | ✅ |
| Art. 30 | Records of processing | Privacy policy, this document | ✅ |

**Status Legend**:
- ✅ Implemented
- 🔄 Planned (future release)

---

## Data Collection Practices

### What We Track

#### User Actions (Events)
- Page views and navigation
- Button clicks and interactions
- Feature usage (interviews, dashboard, charts)
- Conversion events (signup, activation)
- Performance metrics (page load, connection quality)
- Errors and technical issues

#### User Properties (Persistent)
- User ID (UUID, not PII)
- Email domain only (e.g., "gmail.com", NOT "user@gmail.com")
- Signup method (google | email)
- Account creation date
- Engagement metrics (total sessions, avg score)

#### Technical Metadata (Automatic)
- Browser and OS (for compatibility)
- Device type (desktop/mobile)
- Screen resolution
- Session ID (for user journey tracking)

### What We NEVER Track

❌ **Never Collected or Stored**:
- Full email addresses
- User names
- Passwords (encrypted, never logged)
- IP addresses (anonymized by PostHog)
- Precise geolocation (city-level max)
- Credit card numbers
- Social Security Numbers
- Phone numbers
- Any Personally Identifiable Information (PII)

### Privacy-Safe Alternatives

Instead of tracking PII, we use privacy-safe proxies:

| Prohibited | Safe Alternative | Example |
|------------|------------------|---------|
| Email address | Email domain | "gmail.com" |
| User name | User ID (UUID) | "user-uuid-123" |
| IP address | Country + City | "United States, San Francisco" |
| Full phone | Country code only | "+1" (US) |

---

## User Consent Management

### Cookie Consent Banner

**When Shown**: First visit to meelni.com (all users)

**Options Presented**:
1. **Accept**: Enable analytics tracking
2. **Decline**: Disable all analytics (full app functionality remains)
3. **Learn More**: Link to privacy policy

**Banner Text** (example):
```
We use cookies to improve your experience and analyze usage.
Your privacy matters to us.

[Accept] [Decline] [Learn More]
```

### Consent State Management

**Storage**: localStorage + Server-side sync (for logged-in users)

**Key**: `cookie-consent`

**Values**:
- `"accepted"` - User opted in
- `"denied"` - User opted out
- (null) - No decision yet (show banner)

**PostHog Behavior**:
```javascript
// If accepted
posthog.opt_in_capturing()

// If denied
posthog.opt_out_capturing()
```

### Withdrawing Consent

**Where**: Settings page (future) or Privacy Policy page

**Process**:
1. User clicks "Disable Analytics"
2. Consent state set to "denied"
3. PostHog immediately stops tracking
4. Banner reappears if user changes mind

### Consent Across Devices

- **Logged In**: Consent synced across devices via database
- **Logged Out**: Consent per-browser (localStorage)

---

## PII Protection

### Automated PII Sanitization

All event properties pass through PII detection before sending to PostHog.

**Patterns Detected & Redacted**:

| Pattern | Regex | Redaction |
|---------|-------|-----------|
| Email | `/[\w.-]+@[\w.-]+\.\w+/g` | `[REDACTED_EMAIL]` |
| Phone (US) | `/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g` | `[REDACTED_PHONE]` |
| SSN | `/\b\d{3}-\d{2}-\d{4}\b/g` | `[REDACTED_SSN]` |
| Credit Card | `/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g` | `[REDACTED_CREDIT_CARD]` |

**Example**:
```javascript
// Before sanitization
{ error: "Signup failed for john.doe@example.com with card 1234-5678-9012-3456" }

// After sanitization
{ error: "Signup failed for [REDACTED_EMAIL] with card [REDACTED_CREDIT_CARD]" }
```

**Code Location**: `/lib/analytics/pii-sanitization.ts`

### IP Anonymization

**PostHog Configuration**:
```typescript
posthog.init(POSTHOG_KEY, {
  api_host: POSTHOG_HOST,
  loaded: (posthog) => {
    posthog.set_config({
      ip: false,                    // Disable IP capture
      property_denylist: ['$ip'],   // Block IP from all events
    })
  }
})
```

**Result**: IP addresses never leave the browser, even for geolocation

**Geolocation**: PostHog infers country/city from IP *before* discarding IP

### Session Recording Privacy

**Disabled Pages**:
- `/auth/signin` - Password entry
- `/auth/signup` - Registration form
- `/auth/reset-password` - Password reset
- `/billing/*` (future) - Payment information
- `/settings/account` (future) - Personal details

**Masked Elements** (data attributes):
- `data-ph-no-capture` - Exclude from recording
- `data-ph-mask` - Blur/redact in recordings

**Example**:
```html
<!-- Password field - never recorded -->
<input type="password" data-ph-no-capture />

<!-- User name - recorded but masked -->
<span data-ph-mask>{user.name}</span>
```

### Email Domain Extraction

**Safe Email Processing**:
```javascript
// User email: john.doe@company.com

// Extract domain only
const emailDomain = email.split('@')[1]
// Result: "company.com"

// NEVER track
const fullEmail = email  // ❌ BLOCKED
```

**Use Case**: Segment consumer (gmail.com) vs enterprise (company.com) users

---

## User Rights & Data Requests

### Right to Access (Art. 15)

**User Request**: "What data do you have on me?"

**Response Time**: Within 7 days (target), 30 days max (GDPR limit)

**Data Export Format**: JSON

**API Endpoint**: `GET /api/user/analytics-data`

**Response Includes**:
- All tracked events (last 90 days)
- User properties
- Consent status
- Session data

**Example Response**:
```json
{
  "user_id": "user-uuid-123",
  "email_domain": "gmail.com",
  "created_at": "2025-11-18T10:00:00Z",
  "consent_status": "accepted",
  "events": [
    {
      "event": "interview_started",
      "timestamp": "2025-11-18T11:00:00Z",
      "properties": {
        "session_id": "session-uuid-456",
        "interview_type": "product_sense"
      }
    }
  ],
  "user_properties": {
    "total_sessions": 5,
    "avg_score": 78.5,
    "signup_method": "google"
  }
}
```

### Right to Erasure (Art. 17)

**User Request**: "Delete all my data"

**Response Time**: Within 7 days (immediate for analytics, 30 days for backups)

**API Endpoint**: `DELETE /api/user/analytics-delete`

**What Gets Deleted**:
- All PostHog events for user (distinct_id)
- All user properties
- Session recordings
- Aggregate data (de-identified, retained)

**Process**:
1. User requests deletion via settings or support
2. API call to PostHog: `posthog.deletePerson(user_id)`
3. Confirmation email sent
4. User removed from all cohorts
5. Analytics tracking disabled for user

**Exceptions** (GDPR-compliant):
- Aggregate statistics (anonymized, no user ID)
- Legal/compliance records (audit logs)
- Backup data (purged within 90 days)

### Right to Data Portability (Art. 20)

**User Request**: "Give me my data to take elsewhere"

**Format**: JSON (machine-readable)

**Same Endpoint**: `GET /api/user/analytics-data`

**Additional Options** (future):
- CSV export
- PDF report (human-readable)

### Right to Object (Art. 21)

**User Request**: "Stop tracking me"

**Method 1**: Decline cookie banner

**Method 2**: Settings page opt-out (future)

**Effect**:
- PostHog immediately stops capturing events
- User can still use product (no feature loss)
- Consent state persisted across sessions

---

## Data Retention & Deletion

### Retention Periods

| Data Type | Retention | Rationale |
|-----------|-----------|-----------|
| Analytics Events | 90 days | GDPR recommends minimizing retention |
| Session Recordings | 30 days | Shorter retention for sensitive data |
| User Properties | Until deletion request | Needed for personalization |
| Aggregate Reports | Indefinite | De-identified, no privacy risk |

### Automatic Deletion

**PostHog Configuration**:
```typescript
{
  data_retention_days: 90,           // Events auto-delete after 90 days
  session_recording_retention: 30,   // Recordings auto-delete after 30 days
}
```

**Database Cleanup**:
- Soft delete: User account marked as deleted
- Hard delete: Analytics data removed from PostHog
- Backup purge: 90 days after deletion request

### On-Demand Deletion

**Triggers**:
1. User account deletion (settings page)
2. GDPR data deletion request
3. Compliance team request

**Process** (automated):
```javascript
// API route: /api/user/analytics-delete
async function deleteUserAnalytics(userId) {
  // 1. Delete from PostHog
  await posthog.deletePerson(userId)

  // 2. Mark in database
  await db.users.update(userId, { analytics_deleted: true })

  // 3. Log for compliance
  await auditLog.create({ action: 'analytics_deleted', user_id: userId })
}
```

---

## Security Measures

### Data in Transit

**HTTPS Only**:
- All PostHog API calls use HTTPS
- Browser → PostHog: TLS 1.3
- Server → PostHog: TLS 1.3

**Certificate Pinning**: PostHog Cloud (managed)

### Data at Rest

**PostHog Storage**:
- Encrypted at rest (AES-256)
- Data centers: US and EU (compliance with data residency)
- Backups encrypted

**Browser Storage**:
- localStorage (consent state only)
- Automatically cleared on logout

### Access Control

**PostHog Team Access**:
- Role-based access (Admin, Analyst, Viewer)
- MFA required for admin accounts
- Audit log of all data access

**Meelni Team Access**:
- Limited to Data Science + Product teams
- No direct access to raw event data
- Dashboard-only access for most team members

### API Security

**Authentication**:
- PostHog API key (secret, never exposed to browser)
- Server-side API calls only for sensitive operations
- Rate limiting (100 requests/min per user)

---

## Third-Party Data Processing

### PostHog as Data Processor

**Role**: PostHog Inc. is our Data Processor

**DPA Status**: Data Processing Agreement signed ✅

**Key Terms**:
- PostHog processes data only per our instructions
- PostHog implements appropriate security measures
- PostHog notifies us of data breaches within 24 hours
- PostHog deletes data upon request

**Sub-processors**: PostHog may use sub-processors (cloud hosting, analytics tools)

**Location**: PostHog Cloud (US servers by default, EU available)

### Data Transfer Mechanisms

**US → EU Data Transfers**:
- Standard Contractual Clauses (SCCs) in place
- EU data residency option available (self-hosted PostHog)

**Privacy Shield**: Not relied upon (invalidated by Schrems II)

---

## Incident Response

### Privacy Incident Types

1. **PII Leak**: Email, name, or other PII appears in events
2. **Unauthorized Access**: Breach of PostHog account
3. **Data Loss**: Analytics data accidentally deleted
4. **Consent Violation**: Tracking without user consent

### Response Procedure

#### Severity 1: Critical (PII Leak)

**Timeline**: Immediate (within 1 hour)

**Actions**:
1. **Identify**: Which events contain PII?
2. **Quarantine**: Disable affected tracking code
3. **Delete**: Remove PII events from PostHog (irreversible)
4. **Notify**: Inform affected users within 72 hours (GDPR requirement)
5. **Document**: Create incident report for compliance
6. **Prevent**: Update PII sanitization patterns

**Notification Template**:
```
Subject: Privacy Incident Notification

Dear [User],

We are writing to inform you of a privacy incident that may affect your data.

What Happened: On [Date], our analytics system inadvertently captured [data type]
in event logs.

What We Did: We immediately deleted the affected data and updated our systems to
prevent recurrence.

Your Rights: You may request additional information or delete your account at any time.

Contact: privacy@meelni.com
```

#### Severity 2: High (Unauthorized Access)

**Timeline**: Within 24 hours

**Actions**:
1. **Revoke Access**: Rotate PostHog API keys
2. **Audit**: Review access logs for suspicious activity
3. **Notify**: Inform PostHog support
4. **Report**: File incident report with supervisory authority (if EU users affected)

#### Severity 3: Medium (Consent Violation)

**Timeline**: Within 7 days

**Actions**:
1. **Stop Tracking**: Disable analytics for affected users
2. **Notify Users**: Inform of violation and corrective action
3. **Fix Code**: Update consent check logic
4. **Test**: Verify consent enforcement

### Incident Log

All privacy incidents logged in secure spreadsheet:

| Date | Type | Severity | Users Affected | Resolution | Reported To |
|------|------|----------|----------------|------------|-------------|
| (Example) | PII Leak | Critical | 15 | Events deleted, users notified | DPA (Germany) |

---

## Compliance Checklist

### Implementation Checklist

**Privacy by Design**:
- [x] IP anonymization enabled
- [x] PII sanitization automated
- [x] Session recording disabled on sensitive pages
- [x] Data minimization (only necessary properties)

**User Consent**:
- [x] Cookie consent banner implemented
- [x] Consent state persisted
- [x] Opt-in required before tracking
- [x] Easy opt-out mechanism

**User Rights**:
- [x] Data export API (`GET /api/user/analytics-data`)
- [x] Data deletion API (`DELETE /api/user/analytics-delete`)
- [x] Privacy policy published
- [x] Contact email for data requests (privacy@meelni.com)

**Security**:
- [x] HTTPS everywhere
- [x] Data encrypted at rest
- [x] Access controls (role-based)
- [x] Audit logging

**Documentation**:
- [x] Privacy policy updated
- [x] Data Processing Agreement (DPA) signed
- [x] This compliance guide created
- [x] Incident response plan documented

### Ongoing Compliance Tasks

**Monthly**:
- Review PII sanitization effectiveness (spot check events)
- Audit access logs (who viewed what data)
- Check data retention (auto-deletion working?)

**Quarterly**:
- Review privacy policy (updates needed?)
- Test data export/deletion APIs
- Conduct user consent banner A/B test (opt-in rate)

**Annually**:
- Full GDPR compliance audit (external consultant)
- Review DPA with PostHog (terms still acceptable?)
- Update incident response plan
- Train team on privacy best practices

---

## Contact & Support

### Data Protection Officer (DPO)

**Note**: Meelni is not legally required to appoint a DPO (small company, low-risk processing)

**Acting DPO**: Head of Product (interim)

**Contact**: privacy@meelni.com

### User Requests

**Email**: privacy@meelni.com

**Response Time**:
- Acknowledgment: 3 business days
- Resolution: 7 days (target), 30 days max

**Request Types**:
- Data export (Art. 15)
- Data deletion (Art. 17)
- Consent withdrawal (Art. 21)
- Privacy questions

### Supervisory Authority

**If EU Users Affected**:
- Report privacy incidents to relevant EU Data Protection Authority
- Most likely: Ireland (if using PostHog EU servers)

**Contact**: [Irish DPA](https://www.dataprotection.ie/)

---

## Privacy Policy Disclosure

### Required Disclosures (GDPR Art. 13)

**Must Include in Privacy Policy**:

1. **Identity of Controller**: Meelni Inc.
2. **Purpose of Processing**: Product analytics, usage tracking
3. **Legal Basis**: User consent
4. **Data Collected**: Events, user properties (see "What We Track")
5. **Recipients**: PostHog Inc. (data processor)
6. **Retention Period**: 90 days (events), 30 days (recordings)
7. **User Rights**: Access, deletion, portability, objection
8. **Right to Lodge Complaint**: With supervisory authority
9. **Automated Decision-Making**: None (no profiling)

### Privacy Policy Location

**URL**: https://meelni.com/privacy

**Updates**: Notify users 30 days before material changes

---

## Testing & Validation

### Privacy Compliance Tests

**Test 1: PII Sanitization**
```javascript
// Send event with PII
analytics.track('test_event', {
  message: "Contact me at john@example.com or 555-123-4567"
})

// Check PostHog event
// Expected: "Contact me at [REDACTED_EMAIL] or [REDACTED_PHONE]"
```

**Test 2: IP Anonymization**
```javascript
// Check PostHog event properties
const event = posthog.getEvent('test_event')
console.assert(!event.properties.$ip, "IP address should be null")
```

**Test 3: Consent Enforcement**
```javascript
// Decline consent
localStorage.setItem('cookie-consent', 'denied')

// Attempt to track event
analytics.track('should_not_track')

// Verify in PostHog: Event should NOT appear
```

**Test 4: Data Export**
```bash
curl -X GET https://meelni.com/api/user/analytics-data \
  -H "Authorization: Bearer USER_TOKEN"

# Expected: JSON with all user events
```

**Test 5: Data Deletion**
```bash
curl -X DELETE https://meelni.com/api/user/analytics-delete \
  -H "Authorization: Bearer USER_TOKEN"

# Verify in PostHog: User events deleted
```

---

## Appendix: GDPR Articles Reference

### Article 6: Lawfulness of Processing

**Requirements**:
- At least one lawful basis required
- Consent must be freely given, specific, informed, unambiguous

**Our Implementation**: Explicit opt-in via cookie banner

### Article 7: Conditions for Consent

**Requirements**:
- Request must be clear and separate from other matters
- Withdrawal must be as easy as giving consent
- Must be able to prove consent was given

**Our Implementation**:
- Cookie banner separate from terms of service
- One-click opt-out in settings
- Consent state logged with timestamp

### Article 13: Information to be Provided

**Requirements**:
- Identity of controller
- Purpose of processing
- Legal basis
- Retention period
- User rights

**Our Implementation**: Privacy policy covers all requirements

### Article 15: Right of Access

**Requirements**:
- Copy of personal data
- Information about processing
- Free of charge

**Our Implementation**: API endpoint returns all data in JSON format

### Article 17: Right to Erasure

**Requirements**:
- Delete data without undue delay
- Inform third parties if data was disclosed

**Our Implementation**:
- API endpoint deletes from PostHog within 7 days
- Backups purged within 90 days

### Article 25: Data Protection by Design

**Requirements**:
- Privacy measures implemented from the start
- Data minimization by default
- Pseudonymization where possible

**Our Implementation**:
- IP anonymization enabled day one
- PII sanitization automated
- Email domains only (pseudonymization)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-18
**Maintained By**: Legal + Data Science Teams
**Next Review**: 2026-02-18 (Quarterly)

**Related Documents**:
- [Event Catalog](./ANALYTICS_EVENT_CATALOG.md)
- [Data Dictionary](./ANALYTICS_DATA_DICTIONARY.md)
- [Dashboard Guide](./ANALYTICS_DASHBOARD_GUIDE.md)
- [ADR-027: PostHog Analytics Integration](../docs/architecture/adrs/ADR-027-posthog-analytics-integration.md)
- [ADR-028: Analytics Privacy & GDPR Compliance](../docs/architecture/adrs/ADR-028-analytics-privacy-compliance.md)

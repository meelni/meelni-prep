# PostHog Analytics - Testing Guide

**Date**: November 18, 2025
**PostHog Project**: Configured ✅
**API Key**: Added to `.env.local` ✅
**Status**: Ready for Testing

---

## Quick Start

### 1. Start Development Server

```bash
npm run dev
```

The app will run on http://localhost:3000

### 2. Enable PostHog Debug Mode

Open browser console (F12) and run:

```javascript
posthog.debug()
```

You should see: `[PostHog] Debug mode enabled`

### 3. Navigate Through the App

Follow the full user journey to trigger all events:

#### **Landing Page** → 3 events
1. Load homepage → `landing_page_viewed`
2. Click "Start A Mock" → `cta_clicked`
3. Click "Talk to Meelni" → `demo_modal_opened`

#### **Sign Up** → 2-3 events
1. Visit /auth/signup → `auth_signup_started`
2. Sign up with Google or email → `auth_signup_completed`
3. (If error) → `auth_signup_failed`

#### **Dashboard** → 1 event
1. Land on dashboard → `dashboard_viewed` (section: overview)
2. Click sidebar sections → `dashboard_viewed` (section changes)

#### **Interview Setup** → 2 events
1. Visit /setup → `setup_started` (tracked automatically)
2. Select interview type → `interview_type_selected`
3. Click "Start Interview" → `setup_completed`

#### **Interview Session** → 3 events
1. Interview starts → `interview_started`
2. Toggle microphone → `mic_toggled`
3. End interview → `interview_ended`

#### **Sign Out** → 1 event
1. Click sign out → `auth_signout_completed`

---

## Viewing Events in PostHog

### Console (Immediate)
Events appear in browser console when debug mode is enabled:
```
[PostHog] Tracking event: landing_page_viewed
[PostHog] Properties: { referrer: "...", utm_source: "..." }
```

### PostHog Dashboard (5 seconds delay)
1. Go to: https://app.posthog.com
2. Navigate to: **Activity** → **Live events**
3. Watch events appear in real-time stream

### Event Inspector
1. In PostHog dashboard, go to: **Activity** → **Events**
2. Search for specific event names
3. Click event to see full properties
4. Verify no PII in properties (emails, names, etc.)

---

## Testing Checklist

### ✅ Event Tracking

**Landing Page**:
- [ ] `landing_page_viewed` fires on page load
- [ ] UTM parameters captured (test: add ?utm_source=test to URL)
- [ ] Referrer captured correctly
- [ ] `cta_clicked` fires for both hero CTAs
- [ ] Button text, location, destination all correct
- [ ] `demo_modal_opened` fires when clicking "Talk to Meelni"

**Authentication**:
- [ ] `auth_signup_started` fires on /auth/signup page load
- [ ] `auth_signup_completed` fires after successful signup
- [ ] User identified in PostHog (check user ID in events)
- [ ] `auth_signin_completed` fires for returning users
- [ ] `auth_signout_completed` fires on logout
- [ ] PostHog identity reset after signout (new session ID)

**Interview**:
- [ ] `interview_started` fires with correct session_id
- [ ] Interview type, mode, skill_level all captured
- [ ] `mic_toggled` fires when clicking mic button
- [ ] New state (muted/unmuted) correct
- [ ] `interview_ended` fires on session end
- [ ] Duration calculated correctly (in seconds)
- [ ] `ended_naturally` flag accurate

**Dashboard**:
- [ ] `dashboard_viewed` fires on section changes
- [ ] Section name correct (overview, history, analytics, etc.)

### ✅ Privacy & PII

**No PII in Events**:
- [ ] No full email addresses (only email_domain like "gmail.com")
- [ ] No user names in event properties
- [ ] No session tokens or API keys
- [ ] Check all events in PostHog for accidental PII

**Cookie Consent**:
- [ ] Banner appears on first visit
- [ ] "Accept" enables tracking (test: check posthog.has_opted_in_capturing())
- [ ] "Decline" disables tracking (test: check posthog.has_opted_out_capturing())
- [ ] Decision persists on page reload
- [ ] No events sent after declining

**User Identification**:
- [ ] User ID is Supabase UUID (not email)
- [ ] Email domain captured (not full email)
- [ ] Signup method captured correctly (google | email)
- [ ] Created_at timestamp present

### ✅ Technical Validation

**Performance**:
- [ ] Page load time <50ms increase (check Network tab)
- [ ] No blocking requests to PostHog
- [ ] Analytics errors don't break app (test: disable internet)

**Type Safety**:
- [ ] No TypeScript errors in browser console
- [ ] No PostHog warnings in console
- [ ] All event properties match types

**Build**:
- [ ] `npm run build` succeeds
- [ ] No PostHog-related build errors
- [ ] Bundle size increase acceptable (~45KB)

---

## Common Issues & Troubleshooting

### Issue: Events not appearing in PostHog

**Symptoms**: Debug logs show events, but PostHog dashboard empty

**Solutions**:
1. Check API key is correct: `console.log(process.env.NEXT_PUBLIC_POSTHOG_KEY)`
2. Wait 5-10 seconds (events batch every few seconds)
3. Check PostHog project ID matches your account
4. Verify network requests: DevTools → Network → Filter "posthog"

### Issue: Cookie consent banner not showing

**Symptoms**: Banner never appears on first visit

**Solutions**:
1. Clear localStorage: `localStorage.clear()`
2. Reload page
3. Check console for component errors
4. Verify banner not hidden by CSS z-index

### Issue: User not identified after sign-in

**Symptoms**: Events show "Anonymous User" in PostHog

**Solutions**:
1. Check AuthProvider is importing `usePostHog` correctly
2. Verify `posthog.identify()` is called in auth state change handler
3. Check console for PostHog identify logs
4. Ensure PostHogProvider wraps AuthProvider in layout.tsx

### Issue: PII appearing in events

**Symptoms**: Email addresses or names visible in PostHog

**Solutions**:
1. **STOP IMMEDIATELY** - This is a critical privacy issue
2. Check which event is leaking PII
3. Verify PII sanitization is active: Check `analytics-service.ts`
4. Add property to PII_PATTERNS if not covered
5. Delete affected events from PostHog (Settings → Data Management)

### Issue: TypeScript errors on event tracking

**Symptoms**: Red squiggly lines in editor, type errors

**Solutions**:
1. Check event name is defined in `lib/analytics/types.ts`
2. Verify property types match `EventProperties` definition
3. Restart TypeScript server in VS Code (Cmd+Shift+P → Restart TS Server)
4. Check for typos in event names or properties

---

## Advanced Testing

### Testing UTM Parameters

Test landing page UTM tracking:

```
http://localhost:3000?utm_source=google&utm_medium=cpc&utm_campaign=test
```

Verify `landing_page_viewed` event includes:
- `utm_source: "google"`
- `utm_medium: "cpc"`
- `utm_campaign: "test"`

### Testing Session Duration

1. Start interview
2. Wait 30 seconds
3. End interview
4. Check `interview_ended` event
5. Verify `duration_seconds` is ~30

### Testing Error Events

**Simulate Signup Failure**:
1. Go to /auth/signup
2. Use invalid email format
3. Submit form
4. Verify `auth_signup_failed` fires with error message

**Simulate Signin Failure**:
1. Go to /auth/signin
2. Use wrong password
3. Submit form
4. Verify `auth_signin_failed` fires with error message

### Testing Pageview Tracking

Navigate between pages and verify automatic pageview events:
1. Home → /
2. Sign In → /auth/signin
3. Dashboard → /dashboard
4. Setup → /setup

All should fire `$pageview` events (PostHog automatic).

---

## PostHog Dashboard Setup

### Creating Your First Insight

1. Go to: https://app.posthog.com/project/YOUR_PROJECT_ID/insights
2. Click "New insight"
3. Select event: `auth_signup_completed`
4. Chart type: Line chart
5. Save as: "Daily Signups"

### Building Funnels

**Signup Funnel**:
1. Go to: Insights → New insight → Funnel
2. Add steps:
   - Step 1: `landing_page_viewed`
   - Step 2: `auth_signup_started`
   - Step 3: `auth_signup_completed`
3. Save as: "Signup Conversion Funnel"

**Activation Funnel**:
1. Go to: Insights → New insight → Funnel
2. Add steps:
   - Step 1: `auth_signup_completed`
   - Step 2: `setup_started`
   - Step 3: `interview_started`
   - Step 4: `interview_ended`
3. Save as: "User Activation Funnel"

### Creating Dashboards

1. Go to: Dashboards → New dashboard
2. Name: "North Star Metrics"
3. Add insights:
   - Daily Signups (line chart)
   - Signup Conversion Funnel (funnel)
   - Weekly Active Users (unique users)
   - Interview Completion Rate (% of started that ended)

---

## Validation Criteria

### Phase 1 Complete When:

**Tracking Accuracy**:
- [x] All 14+ events implemented
- [ ] 100% event capture rate (no missing events)
- [ ] All properties match schema
- [ ] Timestamps accurate (within 5 seconds)

**Privacy Compliance**:
- [x] Cookie consent banner working
- [ ] Zero PII in any event (QA validation needed)
- [ ] IP anonymization verified in PostHog settings
- [ ] Opt-out mechanism working

**Performance**:
- [x] Build passing
- [x] No TypeScript errors
- [ ] <50ms page load impact (needs measurement)
- [ ] Bundle size <50KB increase (needs verification)

**User Experience**:
- [ ] Analytics never blocks user actions
- [ ] No errors if PostHog unavailable
- [ ] Cookie banner dismissible and remembers choice

---

## Next Steps After Validation

1. **Privacy Audit** (quality-reviewer)
   - Review 100 random events for PII
   - Test opt-out flow thoroughly
   - Verify IP anonymization

2. **Performance Testing**
   - Measure bundle size: `npm run build` + check .next/ folder
   - Lighthouse audit before/after PostHog
   - Test on slow 3G connection

3. **Dashboard Configuration**
   - Create North Star Metrics dashboard
   - Setup signup and activation funnels
   - Configure retention cohorts

4. **Documentation**
   - Event catalog for product team
   - Usage guide for PostHog dashboard
   - Integration guide for engineers

5. **Production Deployment**
   - Add PostHog key to Vercel environment variables
   - Deploy to staging first
   - Monitor events for 24 hours
   - Deploy to production

---

## Contact & Support

**Issues with Testing?**
- Check `.claude/TROUBLESHOOTING.md` (if exists)
- Review `.claude/ARCHITECTURE_REVIEW_POSTHOG.md`
- Reference `.claude/POSTHOG_IMPLEMENTATION_SUMMARY.md`

**PostHog Support**:
- Docs: https://posthog.com/docs
- Community: https://posthog.com/questions
- Support: support@posthog.com

---

**Testing Owner**: Developer + QA
**Last Updated**: 2025-11-18
**Status**: Ready for Testing ✅

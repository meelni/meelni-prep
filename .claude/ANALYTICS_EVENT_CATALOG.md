# Analytics Event Catalog
**Comprehensive Guide for Data Scientists & Analysts**

**Project**: Meelni - AI Mock Interview Platform
**Last Updated**: 2025-11-18
**Total Events**: 28 tracked events
**Analytics Platform**: PostHog
**Privacy Level**: GDPR Compliant

---

## Table of Contents

1. [Landing Page Events](#landing-page-events) (6 events)
2. [Authentication Events](#authentication-events) (9 events)
3. [Setup Flow Events](#setup-flow-events) (4 events)
4. [Interview Events](#interview-events) (5 events)
5. [Dashboard Events](#dashboard-events) (7 events)
6. [Performance Events](#performance-events) (3 events)

---

## Event Categories Overview

| Category | Events | Business Purpose |
|----------|--------|------------------|
| Landing Page | 6 | Measure top-of-funnel conversion and demo engagement |
| Authentication | 9 | Track signup/signin conversion and drop-off points |
| Setup Flow | 4 | Measure activation funnel (signup → first interview) |
| Interview | 5 | Core product engagement and session quality |
| Dashboard | 7 | Feature adoption and user retention indicators |
| Performance | 3 | Monitor technical health and user experience |

---

## Landing Page Events

### 1. `landing_page_viewed`

**When it fires**: User loads the homepage (/)

**Business Purpose**: Measure marketing campaign effectiveness and top-of-funnel traffic quality

**Properties**:
```typescript
{
  referrer?: string            // Source URL (e.g., "https://google.com/search")
  utm_source?: string          // Campaign source (e.g., "google", "twitter")
  utm_medium?: string          // Campaign medium (e.g., "cpc", "organic")
  utm_campaign?: string        // Campaign name (e.g., "launch_week")
}
```

**Example Payload**:
```json
{
  "event": "landing_page_viewed",
  "properties": {
    "referrer": "https://google.com/search?q=mock+interview+ai",
    "utm_source": "google",
    "utm_medium": "cpc",
    "utm_campaign": "pm_interviews_2025"
  },
  "timestamp": "2025-11-18T10:30:00.000Z",
  "distinct_id": "anonymous-uuid-here"
}
```

**Related Events**:
- Next: `cta_clicked`, `demo_modal_opened`

**Analysis Use Cases**:
- Calculate conversion rate by traffic source
- Measure campaign ROI
- Identify highest-quality referrers

**PostHog Query Example**:
```sql
-- Conversion rate by utm_source
SELECT
  properties.utm_source,
  COUNT(DISTINCT distinct_id) as visitors,
  COUNT(DISTINCT CASE WHEN event = 'auth_signup_completed' THEN distinct_id END) as signups,
  (signups / visitors * 100) as conversion_rate
FROM events
WHERE event IN ('landing_page_viewed', 'auth_signup_completed')
  AND timestamp > now() - interval '30 days'
GROUP BY properties.utm_source
ORDER BY conversion_rate DESC
```

---

### 2. `cta_clicked`

**When it fires**: User clicks any call-to-action button on landing page

**Business Purpose**: Measure CTA effectiveness and identify highest-converting placements

**Properties**:
```typescript
{
  button_text: string          // Text on button (e.g., "Start A Mock", "Get Started")
  location: string             // Page section (e.g., "hero", "features", "cta_section")
  destination: string          // Target route (e.g., "/dashboard", "/auth/signup")
}
```

**Example Payload**:
```json
{
  "event": "cta_clicked",
  "properties": {
    "button_text": "Start A Mock",
    "location": "hero",
    "destination": "/dashboard"
  },
  "timestamp": "2025-11-18T10:31:15.000Z"
}
```

**Related Events**:
- Previous: `landing_page_viewed`
- Next: `auth_signup_started` (if unauthenticated), `dashboard_viewed` (if authenticated)

**Analysis Use Cases**:
- A/B test CTA copy effectiveness
- Optimize CTA placement on page
- Measure hero vs. footer CTA performance

---

### 3. `demo_modal_opened`

**When it fires**: User clicks "Talk to Meelni" to start voice demo

**Business Purpose**: Measure demo engagement as predictor of signup intent

**Properties**:
```typescript
{
  trigger_source: string       // Button that opened modal (e.g., "hero_button", "header_cta")
}
```

**Example Payload**:
```json
{
  "event": "demo_modal_opened",
  "properties": {
    "trigger_source": "hero_button"
  },
  "timestamp": "2025-11-18T10:32:00.000Z"
}
```

**Related Events**:
- Previous: `landing_page_viewed`
- Next: `demo_modal_closed`, `demo_completed`, `demo_mic_toggled`

**Funnel Metrics**:
- Landing → Demo Opened: Engagement rate
- Demo Opened → Demo Completed: Demo quality indicator
- Demo Completed → Signup: Demo conversion power

---

### 4. `demo_modal_closed`

**When it fires**: User closes demo modal (X button, outside click, or ESC key)

**Business Purpose**: Measure demo session quality and completion rate

**Properties**:
```typescript
{
  duration_seconds: number     // Time spent in demo (0-300 typical range)
  completed: boolean           // Did user speak with agent? (true/false)
  agent_joined: boolean        // Did LiveKit agent connect? (true/false)
  user_spoke: boolean          // Did user's mic capture audio? (true/false)
}
```

**Example Payload**:
```json
{
  "event": "demo_modal_closed",
  "properties": {
    "duration_seconds": 45,
    "completed": true,
    "agent_joined": true,
    "user_spoke": true
  },
  "timestamp": "2025-11-18T10:32:45.000Z"
}
```

**Value Ranges**:
- `duration_seconds`: 0-300 (0-5 minutes typical)
  - <5s: Accidental open
  - 5-30s: Previewed but didn't engage
  - 30-60s: Completed demo
  - 60s+: Extended conversation
- `completed`: true = spoke with agent
- `agent_joined`: false = technical issue
- `user_spoke`: false = mic permission denied

**Related Events**:
- Previous: `demo_modal_opened`
- Next: `demo_completed` (if completed=true), `auth_signup_started` (if converted)

**Analysis Use Cases**:
- Calculate demo abandonment rate
- Identify technical issues (agent_joined=false)
- Measure average demo duration
- Track mic permission denials

---

### 5. `demo_completed`

**When it fires**: User successfully completes voice demo (speaks with agent for 30+ seconds)

**Business Purpose**: Measure demo-to-signup conversion (strongest signup predictor)

**Properties**:
```typescript
{
  duration_seconds: number     // Total demo time (30-300 typical)
  turn_count?: number          // Conversation turns (agent + user exchanges)
  converted_to_signup: boolean // Did user click "Start Full Interview"? (true/false)
}
```

**Example Payload**:
```json
{
  "event": "demo_completed",
  "properties": {
    "duration_seconds": 58,
    "turn_count": 4,
    "converted_to_signup": true
  },
  "timestamp": "2025-11-18T10:33:30.000Z"
}
```

**Value Ranges**:
- `duration_seconds`: 30-300 (1-5 minutes)
- `turn_count`: 2-10 (typical conversation)
- `converted_to_signup`: true = clicked CTA

**Related Events**:
- Previous: `demo_modal_opened`
- Next: `auth_signup_started` (if converted_to_signup=true)

**Key Metrics**:
- Demo completion rate: (demo_completed / demo_modal_opened)
- Demo-to-signup conversion: (WHERE converted_to_signup=true / demo_completed)
- Average turns per demo: AVG(turn_count)

---

### 6. `demo_mic_toggled`

**When it fires**: User mutes/unmutes microphone during demo

**Business Purpose**: Detect mic permission issues and user behavior patterns

**Properties**:
```typescript
{
  new_state: "muted" | "unmuted"    // Final mic state
  time_in_demo_seconds: number       // When toggle occurred (0-300)
}
```

**Example Payload**:
```json
{
  "event": "demo_mic_toggled",
  "properties": {
    "new_state": "unmuted",
    "time_in_demo_seconds": 15
  },
  "timestamp": "2025-11-18T10:32:15.000Z"
}
```

**Analysis Use Cases**:
- Identify users struggling with mic permissions
- Detect early mute (privacy concern signal)
- Correlate mic toggles with demo abandonment

---

## Authentication Events

### 7. `auth_signup_started`

**When it fires**: User lands on signup page (/auth/signup)

**Business Purpose**: Measure signup funnel drop-off

**Properties**:
```typescript
{
  source?: string              // Referrer source (e.g., "demo_modal", "landing_cta")
}
```

**Example Payload**:
```json
{
  "event": "auth_signup_started",
  "properties": {
    "source": "demo_modal"
  },
  "timestamp": "2025-11-18T10:35:00.000Z"
}
```

**Related Events**:
- Next: `auth_signup_completed`, `auth_signup_failed`

---

### 8. `auth_signup_completed`

**When it fires**: User successfully creates account

**Business Purpose**: Key conversion metric; identifies successful signups

**Properties**:
```typescript
{
  method: "google" | "email"   // Authentication method used
}
```

**Example Payload**:
```json
{
  "event": "auth_signup_completed",
  "properties": {
    "method": "google"
  },
  "timestamp": "2025-11-18T10:35:30.000Z",
  "distinct_id": "user-uuid-123"
}
```

**User Identification**:
- After this event, `distinct_id` switches from anonymous to authenticated user UUID
- User properties set: `email_domain`, `signup_method`, `created_at`

**Related Events**:
- Previous: `auth_signup_started`
- Next: `dashboard_viewed`, `setup_started`

**Key Metrics**:
- Signup conversion rate: (signup_completed / signup_started)
- Google vs Email adoption: GROUP BY method
- Time to signup: (signup_completed timestamp - signup_started timestamp)

---

### 9. `auth_signup_failed`

**When it fires**: Signup attempt fails (validation error, server error, OAuth failure)

**Business Purpose**: Identify friction points in signup flow

**Properties**:
```typescript
{
  method: "google" | "email"   // Attempted method
  error: string                // Error message (PII-sanitized)
}
```

**Example Payload**:
```json
{
  "event": "auth_signup_failed",
  "properties": {
    "method": "email",
    "error": "Password must be at least 8 characters"
  },
  "timestamp": "2025-11-18T10:35:15.000Z"
}
```

**Common Errors** (for filtering):
- "Password must be at least 8 characters"
- "Email already registered"
- "Invalid email format"
- "OAuth provider error"

**Analysis Use Cases**:
- Identify most common signup blockers
- Compare error rates by method
- Track OAuth vs email reliability

---

### 10. `auth_signin_started`

**When it fires**: User lands on signin page (/auth/signin)

**Business Purpose**: Measure returning user activation

**Properties**:
```typescript
{
  source?: string              // Referrer (e.g., "landing_page", "dashboard_redirect")
}
```

---

### 11. `auth_signin_completed`

**When it fires**: User successfully signs in

**Business Purpose**: Measure retention and returning user behavior

**Properties**:
```typescript
{
  method: "google" | "email"   // Auth method used
}
```

**Example Payload**:
```json
{
  "event": "auth_signin_completed",
  "properties": {
    "method": "google"
  },
  "timestamp": "2025-11-19T09:00:00.000Z",
  "distinct_id": "user-uuid-123"
}
```

**Retention Metrics**:
- Daily Active Users (DAU): COUNT DISTINCT users with signin_completed in last 24h
- Weekly Active Users (WAU): COUNT DISTINCT users in last 7 days
- Returning user rate: (signin_completed / (signup_completed + signin_completed))

---

### 12. `auth_signin_failed`

**When it fires**: Signin attempt fails

**Business Purpose**: Identify authentication issues and account lockouts

**Properties**:
```typescript
{
  method: "google" | "email"
  error: string                // Error message (sanitized)
}
```

**Common Errors**:
- "Invalid credentials"
- "Account not found"
- "Email not verified"
- "OAuth provider timeout"

---

### 13. `auth_signout_completed`

**When it fires**: User clicks sign out

**Business Purpose**: Measure session duration and churn signals

**Properties**: (none)

**Analysis Use Cases**:
- Calculate average session duration: (signout - signin timestamp)
- Identify rapid signout (potential quality issue)
- Track signout patterns by time of day

---

### 14. `auth_password_reset_requested`

**When it fires**: User submits password reset request

**Business Purpose**: Measure forgotten password rate (onboarding quality signal)

**Properties**:
```typescript
{
  email_domain?: string        // Email domain only (e.g., "gmail.com")
}
```

**Example Payload**:
```json
{
  "event": "auth_password_reset_requested",
  "properties": {
    "email_domain": "gmail.com"
  },
  "timestamp": "2025-11-18T11:00:00.000Z"
}
```

**Analysis Use Cases**:
- Password reset rate: (reset_requested / signup_completed)
- Identify corporate vs consumer users by domain
- Track reset volume spikes (potential breach indicator)

---

### 15. `auth_error`

**When it fires**: Generic authentication error (catch-all)

**Business Purpose**: Monitor auth system health

**Properties**:
```typescript
{
  error_type: string           // Error category (e.g., "session_expired", "token_invalid")
  auth_method: "google" | "email"
}
```

---

## Setup Flow Events

### 16. `setup_started`

**When it fires**: User lands on interview setup page (/setup)

**Business Purpose**: Measure activation funnel (signup → first interview)

**Properties**:
```typescript
{
  user_id: string                  // Authenticated user UUID
  referrer_page?: string           // Previous page (e.g., "/dashboard")
  user_authenticated: boolean      // Should always be true (protected route)
}
```

**Example Payload**:
```json
{
  "event": "setup_started",
  "properties": {
    "user_id": "user-uuid-123",
    "referrer_page": "/dashboard",
    "user_authenticated": true
  },
  "timestamp": "2025-11-18T10:40:00.000Z"
}
```

**Activation Funnel**:
1. signup_completed
2. setup_started ← Activation begins
3. setup_completed
4. interview_started ← Activation complete

**Key Metric**: Time to setup (setup_started - signup_completed)

---

### 17. `interview_type_selected`

**When it fires**: User selects interview type in setup flow

**Business Purpose**: Measure interview type popularity and user intent

**Properties**:
```typescript
{
  user_id: string
  interview_type: "product_sense" | "behavioral" | "execution" | "strategy"
}
```

**Example Payload**:
```json
{
  "event": "interview_type_selected",
  "properties": {
    "user_id": "user-uuid-123",
    "interview_type": "product_sense"
  },
  "timestamp": "2025-11-18T10:40:15.000Z"
}
```

**Value Distribution**:
- `product_sense`: Most popular (40-50% expected)
- `behavioral`: Common (25-35%)
- `execution`: Moderate (15-20%)
- `strategy`: Niche (5-10%)

**Analysis Use Cases**:
- Prioritize question bank expansion
- Identify underserved interview types
- Track type selection changes (indecision signal)

---

### 18. `skill_level_selected`

**When it fires**: User selects skill level (beginner/intermediate/advanced)

**Business Purpose**: Measure user self-assessment and difficulty preferences

**Properties**:
```typescript
{
  skill_level: "beginner" | "intermediate" | "advanced"
  interview_type: string           // Context for skill level
  is_default_selection: boolean    // Did user keep default? (true/false)
}
```

**Example Payload**:
```json
{
  "event": "skill_level_selected",
  "properties": {
    "skill_level": "intermediate",
    "interview_type": "product_sense",
    "is_default_selection": false
  },
  "timestamp": "2025-11-18T10:40:30.000Z"
}
```

**Value Ranges**:
- `beginner`: 20-30% (new PMs, career switchers)
- `intermediate`: 50-60% (most common, default)
- `advanced`: 15-20% (senior PMs)

**Analysis Use Cases**:
- Measure self-assessed skill distribution
- Track default override rate (engagement signal)
- Correlate skill level with interview scores

---

### 19. `setup_completed`

**When it fires**: User clicks "Start Interview" button

**Business Purpose**: Measure setup completion rate and time to activation

**Properties**:
```typescript
{
  user_id: string
  interview_type: "product_sense" | "behavioral" | "execution" | "strategy"
  skill_level: "beginner" | "intermediate" | "advanced"
  mode: "voice_video"              // Always voice_video (text mode not implemented)
  time_to_complete_seconds: number // Setup flow duration (15-300 typical)
  selections_changed: number        // How many times user changed selections (0-10)
}
```

**Example Payload**:
```json
{
  "event": "setup_completed",
  "properties": {
    "user_id": "user-uuid-123",
    "interview_type": "product_sense",
    "skill_level": "intermediate",
    "mode": "voice_video",
    "time_to_complete_seconds": 45,
    "selections_changed": 2
  },
  "timestamp": "2025-11-18T10:41:00.000Z"
}
```

**Value Ranges**:
- `time_to_complete_seconds`: 10-300 (seconds)
  - <15s: Rushed (potential low engagement)
  - 15-60s: Normal (most users)
  - 60-180s: Deliberate (high intent)
  - 180s+: Confused or indecisive
- `selections_changed`: 0-10
  - 0: Kept defaults (fast activation)
  - 1-3: Normal exploration
  - 4+: Indecisive (potential friction)

**Key Metrics**:
- Setup completion rate: (setup_completed / setup_started)
- Average time to complete: AVG(time_to_complete_seconds)
- Configuration churn: AVG(selections_changed)

---

## Interview Events

### 20. `interview_started`

**When it fires**: LiveKit connection established and interview begins

**Business Purpose**: Core product usage metric; measures activation success

**Properties**:
```typescript
{
  session_id: string               // Database UUID for interview session
  interview_type?: string          // From setup flow
  mode?: string                    // "voice_video"
  skill_level?: string             // From setup flow
}
```

**Example Payload**:
```json
{
  "event": "interview_started",
  "properties": {
    "session_id": "session-uuid-456",
    "interview_type": "product_sense",
    "mode": "voice_video",
    "skill_level": "intermediate"
  },
  "timestamp": "2025-11-18T10:42:00.000Z"
}
```

**Related Events**:
- Previous: `setup_completed`
- Next: `mic_toggled`, `interview_ended`, `interview_completed`

**Activation Metric**:
- New user activation: (interview_started / signup_completed) within 24h
- Time to first interview: (interview_started - signup_completed)

---

### 21. `interview_ended`

**When it fires**: User or system ends interview session

**Business Purpose**: Measure session quality and completion patterns

**Properties**:
```typescript
{
  session_id: string
  duration_seconds: number         // Total session time (60-3600 typical)
  ended_naturally: boolean         // User clicked "End" vs closed tab (true/false)
  interview_type?: string
}
```

**Example Payload**:
```json
{
  "event": "interview_ended",
  "properties": {
    "session_id": "session-uuid-456",
    "duration_seconds": 1247,
    "ended_naturally": true,
    "interview_type": "product_sense"
  },
  "timestamp": "2025-11-18T11:02:47.000Z"
}
```

**Value Ranges**:
- `duration_seconds`: 0-3600 (0-60 minutes)
  - <60s: Technical issue or accidental start
  - 60-300s: Abbreviated session
  - 300-1800s: Normal interview (5-30 min)
  - 1800s+: Extended interview
- `ended_naturally`:
  - true = User clicked "End Interview" button
  - false = Tab closed, browser crash, network issue

**Analysis Use Cases**:
- Calculate average interview duration
- Identify technical issues (ended_naturally=false)
- Track completion rate patterns
- Correlate duration with user satisfaction

---

### 22. `interview_completed`

**When it fires**: Interview session finishes successfully

**Business Purpose**: North Star metric; successful product usage

**Properties**:
```typescript
{
  user_id: string
  session_id: string
  duration_seconds: number
  turn_count: number               // Total conversation turns (10-50 typical)
}
```

**Example Payload**:
```json
{
  "event": "interview_completed",
  "properties": {
    "user_id": "user-uuid-123",
    "session_id": "session-uuid-456",
    "duration_seconds": 1247,
    "turn_count": 23
  },
  "timestamp": "2025-11-18T11:02:47.000Z"
}
```

**Value Ranges**:
- `turn_count`: 5-100
  - <10: Short interaction
  - 10-30: Normal interview
  - 30-50: Detailed discussion
  - 50+: Extended conversation

**North Star Metrics**:
- Weekly completed interviews per user
- Interview completion rate: (completed / started)
- Average turns per interview: AVG(turn_count)
- User retention: % users with 2+ completed interviews

---

### 23. `interview_error`

**When it fires**: Error occurs during interview session

**Business Purpose**: Monitor product quality and technical issues

**Properties**:
```typescript
{
  user_id: string
  session_id?: string
  error_type: string               // Error category (e.g., "livekit_disconnected")
  error_message: string            // Sanitized error message
}
```

**Example Payload**:
```json
{
  "event": "interview_error",
  "properties": {
    "user_id": "user-uuid-123",
    "session_id": "session-uuid-456",
    "error_type": "livekit_disconnected",
    "error_message": "WebRTC connection lost"
  },
  "timestamp": "2025-11-18T10:55:00.000Z"
}
```

**Common Error Types**:
- `livekit_disconnected`: Network issue
- `mic_permission_denied`: User blocked mic
- `agent_failed_to_join`: LiveKit Cloud issue
- `api_timeout`: Backend timeout

---

### 24. `mic_toggled`

**When it fires**: User mutes/unmutes microphone during interview

**Business Purpose**: Detect user engagement patterns and technical issues

**Properties**:
```typescript
{
  session_id: string
  new_state: "muted" | "unmuted"
}
```

**Example Payload**:
```json
{
  "event": "mic_toggled",
  "properties": {
    "session_id": "session-uuid-456",
    "new_state": "muted"
  },
  "timestamp": "2025-11-18T10:50:30.000Z"
}
```

**Analysis Use Cases**:
- Track mic permission issues
- Identify nervous users (frequent toggling)
- Detect background noise issues (mute during agent speech)

---

## Dashboard Events

### 25. `dashboard_viewed`

**When it fires**: User navigates to any dashboard section

**Business Purpose**: Measure feature adoption and navigation patterns

**Properties**:
```typescript
{
  section: "overview" | "history" | "analytics" | "feedback" | "settings" | "questions"
}
```

**Example Payload**:
```json
{
  "event": "dashboard_viewed",
  "properties": {
    "section": "overview"
  },
  "timestamp": "2025-11-18T12:00:00.000Z"
}
```

**Section Popularity** (expected distribution):
- `overview`: 50-60% (default landing)
- `history`: 25-35% (review past sessions)
- `feedback`: 10-15% (check scores)
- `analytics`: 5-10% (advanced users)
- `settings`: 3-5% (configuration)
- `questions`: 2-5% (question bank browsing)

**Key Metrics**:
- Most visited sections: COUNT by section
- Section engagement rate: (section_viewed / dashboard_viewed)
- Navigation patterns: sequence analysis

---

### 26. `session_history_viewed`

**When it fires**: User views list of past interview sessions

**Business Purpose**: Measure retrospective engagement and retention

**Properties**:
```typescript
{
  section: "history" | "overview"  // Where history was viewed
  total_sessions: number            // User's total session count (0-100+)
  has_feedback: boolean             // Any sessions have feedback? (true/false)
}
```

**Example Payload**:
```json
{
  "event": "session_history_viewed",
  "properties": {
    "section": "history",
    "total_sessions": 5,
    "has_feedback": true
  },
  "timestamp": "2025-11-18T12:05:00.000Z"
}
```

**Value Ranges**:
- `total_sessions`: 0-1000
  - 0-1: New user
  - 2-5: Casual user
  - 6-15: Regular user
  - 16+: Power user

---

### 27. `session_details_clicked`

**When it fires**: User clicks to view specific interview session details

**Business Purpose**: Identify high-value sessions users review repeatedly

**Properties**:
```typescript
{
  session_id: string
  interview_type: string
  session_age_days: number         // Days since session (0-365)
  has_feedback: boolean            // Feedback available? (true/false)
}
```

**Example Payload**:
```json
{
  "event": "session_details_clicked",
  "properties": {
    "session_id": "session-uuid-789",
    "interview_type": "product_sense",
    "session_age_days": 3,
    "has_feedback": true
  },
  "timestamp": "2025-11-18T12:10:00.000Z"
}
```

**Value Ranges**:
- `session_age_days`: 0-365
  - 0-1: Recent session review
  - 2-7: Weekly review pattern
  - 8-30: Monthly review
  - 31+: Long-term retrospective

**Analysis Use Cases**:
- Identify most-reviewed sessions (high perceived value)
- Track review frequency patterns
- Correlate feedback availability with review rate

---

### 28. `feedback_viewed`

**When it fires**: User views AI-generated feedback for a session

**Business Purpose**: Measure feedback feature value and engagement

**Properties**:
```typescript
{
  session_id: string
  feedback_available: boolean      // Feedback exists? (true/false)
  overall_score?: number           // Score if available (0-100)
}
```

**Example Payload**:
```json
{
  "event": "feedback_viewed",
  "properties": {
    "session_id": "session-uuid-789",
    "feedback_available": true,
    "overall_score": 78
  },
  "timestamp": "2025-11-18T12:15:00.000Z"
}
```

**Value Ranges**:
- `overall_score`: 0-100
  - 0-50: Below average
  - 51-70: Average
  - 71-85: Good
  - 86-100: Excellent

**Key Metrics**:
- Feedback view rate: (feedback_viewed / interview_completed)
- Average score distribution: histogram(overall_score)
- Score correlation with retention

---

### 29. `chart_interacted`

**When it fires**: User interacts with dashboard charts (hover, click, expand)

**Business Purpose**: Measure dashboard engagement and data-driven decision making

**Properties**:
```typescript
{
  chart_type: "score_chart" | "competency_radar" | "stats_cards" | "interview_type_breakdown"
  interaction_type: "hover" | "click" | "expand"
  data_point?: string              // Specific data point (e.g., "Session 3")
  time_spent_seconds?: number      // Time hovering on chart (1-60)
}
```

**Example Payload**:
```json
{
  "event": "chart_interacted",
  "properties": {
    "chart_type": "score_chart",
    "interaction_type": "hover",
    "data_point": "Session 3",
    "time_spent_seconds": 8
  },
  "timestamp": "2025-11-18T12:20:00.000Z"
}
```

**Chart Types**:
- `score_chart`: Performance trend over time
- `competency_radar`: Skill breakdown radar
- `stats_cards`: Quick metrics cards
- `interview_type_breakdown`: Session distribution by type

**Analysis Use Cases**:
- Measure chart engagement by type
- Track average hover time (attention metric)
- Identify most-clicked data points

---

### 30. `competency_radar_viewed`

**When it fires**: Competency radar chart rendered on dashboard

**Business Purpose**: Track skill assessment feature usage

**Properties**:
```typescript
{
  competencies_count: number       // Number of skills shown (4-8 typical)
  has_scores: boolean              // User has scored sessions? (true/false)
  avg_competency_score?: number   // Average across competencies (0-100)
}
```

**Example Payload**:
```json
{
  "event": "competency_radar_viewed",
  "properties": {
    "competencies_count": 5,
    "has_scores": true,
    "avg_competency_score": 74
  },
  "timestamp": "2025-11-18T12:25:00.000Z"
}
```

---

### 31. `score_trend_analyzed`

**When it fires**: Score trend chart rendered with trend calculation

**Business Purpose**: Measure self-assessment and progress tracking engagement

**Properties**:
```typescript
{
  time_range: "all_time" | "last_7_days" | "last_30_days"
  sessions_in_range: number        // Sessions included in trend (2-100)
  trend_direction: "improving" | "declining" | "stable"
}
```

**Example Payload**:
```json
{
  "event": "score_trend_analyzed",
  "properties": {
    "time_range": "last_30_days",
    "sessions_in_range": 8,
    "trend_direction": "improving"
  },
  "timestamp": "2025-11-18T12:30:00.000Z"
}
```

**Trend Calculation Logic**:
- `improving`: Recent 3 sessions avg +0.5 vs older sessions
- `declining`: Recent 3 sessions avg -0.5 vs older sessions
- `stable`: Within ±0.5 range

**Key Metrics**:
- % users improving: WHERE trend_direction='improving'
- Sessions to improvement: MIN(sessions_in_range) WHERE trend='improving'

---

## Performance Events

### 32. `page_performance`

**When it fires**: Core Web Vitals measured on page load

**Business Purpose**: Monitor technical performance and user experience

**Properties**:
```typescript
{
  page: string                     // Page identifier (e.g., "/", "/dashboard")
  lcp?: number                     // Largest Contentful Paint (ms)
  fid?: number                     // First Input Delay (ms)
  cls?: number                     // Cumulative Layout Shift (score)
  ttfb?: number                    // Time to First Byte (ms)
  fcp?: number                     // First Contentful Paint (ms)
}
```

**Example Payload**:
```json
{
  "event": "page_performance",
  "properties": {
    "page": "/dashboard",
    "lcp": 1842,
    "fid": 12,
    "cls": 0.05,
    "ttfb": 234,
    "fcp": 987
  },
  "timestamp": "2025-11-18T10:30:05.000Z"
}
```

**Value Ranges & Targets**:

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| LCP | <2500ms | 2500-4000ms | >4000ms |
| FID | <100ms | 100-300ms | >300ms |
| CLS | <0.1 | 0.1-0.25 | >0.25 |
| TTFB | <800ms | 800-1800ms | >1800ms |
| FCP | <1800ms | 1800-3000ms | >3000ms |

**Analysis Use Cases**:
- Track performance degradation over time
- Identify slow pages (GROUP BY page)
- Correlate performance with conversion rates
- Set up alerts for performance regressions

**PostHog Query**:
```sql
-- Pages failing Core Web Vitals
SELECT
  properties.page,
  AVG(properties.lcp) as avg_lcp,
  AVG(properties.fid) as avg_fid,
  AVG(properties.cls) as avg_cls
FROM events
WHERE event = 'page_performance'
  AND timestamp > now() - interval '7 days'
GROUP BY properties.page
HAVING avg_lcp > 2500 OR avg_fid > 100 OR avg_cls > 0.1
```

---

### 33. `livekit_connection_established`

**When it fires**: LiveKit WebRTC connection successfully established

**Business Purpose**: Monitor real-time connection quality and regional latency

**Properties**:
```typescript
{
  session_id: string
  connection_time_ms: number       // Time to connect (100-5000ms typical)
  region?: string                  // LiveKit region (e.g., "us-east-1")
  connection_quality: "excellent" | "good" | "poor"
}
```

**Example Payload**:
```json
{
  "event": "livekit_connection_established",
  "properties": {
    "session_id": "session-uuid-456",
    "connection_time_ms": 847,
    "region": "us-east-1",
    "connection_quality": "good"
  },
  "timestamp": "2025-11-18T10:42:00.847Z"
}
```

**Connection Quality Thresholds**:
- **Excellent**: <1000ms (1 second)
- **Good**: 1000-3000ms (1-3 seconds)
- **Poor**: >3000ms (>3 seconds)

**Value Ranges**:
- `connection_time_ms`: 100-10000 (0.1-10 seconds)
  - <500ms: Excellent network
  - 500-1500ms: Good connection
  - 1500-3000ms: Acceptable
  - 3000ms+: Poor quality (potential issue)

**Analysis Use Cases**:
- Track regional latency differences
- Identify connection quality issues
- Correlate poor connections with interview abandonment
- Monitor LiveKit infrastructure health

---

### 34. `error_boundary_triggered`

**When it fires**: React Error Boundary catches component error

**Business Purpose**: Monitor application stability and catch bugs

**Properties**:
```typescript
{
  error_message: string            // Error description (sanitized)
  component_stack?: string         // Component tree (truncated)
  page: string                     // Page where error occurred
  user_action?: string             // Last user action before error
}
```

**Example Payload**:
```json
{
  "event": "error_boundary_triggered",
  "properties": {
    "error_message": "Cannot read property 'map' of undefined",
    "component_stack": "ScoreChart > Dashboard > App",
    "page": "/dashboard",
    "user_action": "clicked_analytics_tab"
  },
  "timestamp": "2025-11-18T12:35:00.000Z"
}
```

**Analysis Use Cases**:
- Identify most common errors
- Track error rate over time
- Prioritize bug fixes by frequency
- Correlate errors with specific pages or actions

**Alert Thresholds**:
- **Warning**: >5 errors per hour
- **Critical**: >20 errors per hour
- **Emergency**: Same error >50 times per hour

---

## Cross-Event Analysis Patterns

### Key Funnels

#### 1. Landing to Signup Funnel
```
landing_page_viewed (100%)
  ↓
demo_modal_opened (30-40%)
  ↓
demo_completed (15-25%)
  ↓
auth_signup_started (10-20%)
  ↓
auth_signup_completed (8-15%)
```

**Optimization Focus**: Demo completion rate

---

#### 2. Activation Funnel
```
auth_signup_completed (100%)
  ↓
dashboard_viewed (95%+)
  ↓
setup_started (70-80%)
  ↓
setup_completed (60-70%)
  ↓
interview_started (55-65%)
  ↓
interview_completed (50-60%)
```

**North Star**: % users completing first interview within 24h

---

#### 3. Retention Funnel
```
interview_completed (Session 1) (100%)
  ↓
auth_signin_completed (within 7 days) (40-50%)
  ↓
interview_started (Session 2) (35-45%)
  ↓
interview_completed (Session 2) (30-40%)
```

**Retention Metric**: % users with 2+ completed interviews in first 30 days

---

### Cohort Definitions

#### By User Lifecycle Stage
- **New**: signup_completed in last 7 days
- **Active**: interview_completed in last 30 days
- **Power User**: 10+ interview_completed total
- **Churned**: No auth_signin_completed in 60+ days

#### By Acquisition Source
- **Demo Converters**: demo_completed = true before signup
- **Direct Signups**: No demo_completed before signup
- **Organic**: utm_source is null
- **Paid**: utm_medium = "cpc"

#### By Product Usage
- **Interview Type Specialists**: >80% sessions in one interview_type
- **Multi-Type Users**: Sessions across 3+ interview types
- **Feedback Seekers**: feedback_viewed rate >70%
- **Dashboard Power Users**: chart_interacted events >10

---

## Privacy & Data Governance

### PII Protection

**What is NEVER tracked**:
- Full email addresses (only domain: "gmail.com")
- User names
- Session tokens or API keys
- Credit card numbers
- Phone numbers
- IP addresses (anonymized by PostHog)

**What IS tracked**:
- User UUID (database ID)
- Email domain (e.g., "gmail.com")
- Timestamp data
- Session IDs (UUIDs)
- Aggregated scores and metrics

### Data Retention
- **Analytics events**: 90 days
- **Session recordings**: 30 days
- **User properties**: Until deletion request
- **Aggregate reports**: Indefinite (de-identified)

### User Rights (GDPR)
- **Export**: `/api/user/analytics-data` returns all user events
- **Delete**: `/api/user/analytics-delete` removes all tracked data
- **Opt-out**: Cookie consent banner allows analytics opt-out

---

## PostHog-Specific Features

### Event Properties vs User Properties

**Event Properties** (specific to one event):
- Captured with each event
- Example: `duration_seconds`, `interview_type`
- Used for filtering and grouping

**User Properties** (persistent across events):
- Set once with `posthog.identify()`
- Example: `signup_method`, `total_sessions`, `email_domain`
- Used for segmentation and cohorts

### Session Tracking

PostHog automatically tracks sessions:
- **Session ID**: Auto-generated per session
- **Session Duration**: Time between first and last event
- **Events per Session**: Count of events in session

**Session Definition**: 30 minutes of inactivity or new day

### Feature Flags (Future Use)

Events can trigger feature flags:
- A/B test new interview types
- Gradually roll out features
- Target power users with advanced features

---

## Next Steps for Data Scientists

1. **Configure PostHog Dashboards** (see `.claude/ANALYTICS_DASHBOARD_GUIDE.md`)
2. **Review Data Dictionary** (see `.claude/ANALYTICS_DATA_DICTIONARY.md`)
3. **Set Up Alerts** for critical metrics
4. **Build Cohorts** for retention analysis
5. **Create Funnels** for conversion optimization

---

**Document Version**: 1.0
**Last Updated**: 2025-11-18
**Maintained By**: Developer Team + Data Science Team
**Questions?**: Refer to `.claude/POSTHOG_TESTING_GUIDE.md` for validation

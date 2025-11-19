# Analytics Data Dictionary
**Property Reference for Data Scientists & Analysts**

**Project**: Meelni - AI Mock Interview Platform
**Last Updated**: 2025-11-18
**Total Unique Properties**: 65+ properties across 28 events
**Analytics Platform**: PostHog

---

## Table of Contents

1. [Core Data Types](#core-data-types)
2. [User Properties](#user-properties)
3. [Event Properties (Alphabetical)](#event-properties-alphabetical)
4. [Derived Metrics](#derived-metrics)
5. [Property Patterns & Conventions](#property-patterns--conventions)
6. [Privacy & PII Handling](#privacy--pii-handling)

---

## Core Data Types

### Standard PostHog Fields

These fields are automatically included with every event:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `event` | string | Event name | "interview_started" |
| `distinct_id` | string | User identifier (UUID or anonymous) | "user-uuid-123" |
| `timestamp` | ISO 8601 | Event occurrence time (UTC) | "2025-11-18T10:30:00.000Z" |
| `$session_id` | string | PostHog session ID | "session-ph-abc123" |
| `$current_url` | string | Page URL when event fired | "https://meelni.com/dashboard" |
| `$device_type` | string | Device category | "Desktop", "Mobile" |
| `$browser` | string | Browser name | "Chrome", "Safari" |
| `$os` | string | Operating system | "Mac OS X", "Windows" |

### Custom Event Metadata

| Field | Type | Description | Notes |
|-------|------|-------------|-------|
| `properties` | object | Custom event properties | Defined per event type |
| `$set` | object | User properties to set | Persistent across events |
| `$set_once` | object | User properties set only once | Never overwritten |

---

## User Properties

**Set with**: `posthog.identify(user_id, properties)`
**Persistence**: Remain attached to user across all events
**Use Case**: Segmentation, cohort analysis, personalization

### User Identification

| Property | Type | Possible Values | Description | Privacy |
|----------|------|-----------------|-------------|---------|
| `user_id` | UUID | `"user-uuid-123"` | Database user UUID | Not PII |
| `email` | SANITIZED | Never sent | Full email NEVER tracked | Blocked |
| `email_domain` | string | `"gmail.com"`, `"company.com"` | Email domain only | Safe |
| `name` | SANITIZED | Never sent | Full name NEVER tracked | Blocked |
| `created_at` | ISO timestamp | `"2025-11-18T10:00:00Z"` | Account creation time | Safe |

### User Lifecycle

| Property | Type | Possible Values | Description | Update Frequency |
|----------|------|-----------------|-------------|------------------|
| `signup_method` | enum | `"google"`, `"email"` | How user signed up | Set once |
| `signup_date` | ISO date | `"2025-11-18"` | Registration date | Set once |
| `signup_source` | enum | `"organic"`, `"referral"`, `"demo_conversion"` | Acquisition channel | Set once |
| `lifecycle_stage` | enum | `"new"`, `"active"`, `"power_user"`, `"churned"` | User engagement level | Updated daily |
| `subscription_tier` | enum | `"free"`, `"pro"` | Billing tier | Updated on change |

### User Engagement Metrics

| Property | Type | Range | Description | Update Frequency |
|----------|------|-------|-------------|------------------|
| `total_sessions` | integer | 0-1000+ | Lifetime completed interviews | After each interview |
| `total_minutes` | integer | 0-100000+ | Total time in interviews (minutes) | After each interview |
| `avg_score` | decimal | 0.00-100.00 | Average interview score | After each scored session |
| `last_session_date` | ISO date | `"2025-11-18"` | Most recent interview | After each interview |
| `days_since_signup` | integer | 0-365+ | Account age in days | Calculated field |
| `days_since_last_session` | integer | 0-365+ | Recency metric | Calculated field |

---

## Event Properties (Alphabetical)

### agent_joined
- **Type**: boolean
- **Values**: `true`, `false`
- **Used in**: `demo_modal_closed`
- **Description**: Did LiveKit agent successfully connect to demo?
- **Analysis**: Track agent connection reliability
- **Alert**: >10% false = infrastructure issue

### avg_competency_score
- **Type**: decimal (optional)
- **Range**: 0.00-100.00
- **Used in**: `competency_radar_viewed`
- **Description**: Average score across all competencies
- **Calculation**: `SUM(competency_scores) / COUNT(competencies)`
- **Null**: User has no scored sessions yet

### button_text
- **Type**: string
- **Values**: `"Start A Mock"`, `"Get Started"`, `"Talk to Meelni"`, etc.
- **Used in**: `cta_clicked`
- **Description**: Text displayed on clicked button
- **Analysis**: A/B test different CTA copy

### chart_type
- **Type**: enum
- **Values**:
  - `"score_chart"` - Performance trend over time
  - `"competency_radar"` - Skill breakdown radar
  - `"stats_cards"` - Quick metrics cards
  - `"interview_type_breakdown"` - Session distribution
- **Used in**: `chart_interacted`
- **Analysis**: Identify most-engaged charts

### cls
- **Type**: decimal (optional)
- **Range**: 0.00-1.00 (lower is better)
- **Used in**: `page_performance`
- **Description**: Cumulative Layout Shift (Core Web Vital)
- **Target**: <0.1 (good), <0.25 (needs improvement), >0.25 (poor)
- **Null**: Metric not yet available (page still loading)

### competencies_count
- **Type**: integer
- **Range**: 4-8
- **Used in**: `competency_radar_viewed`
- **Description**: Number of skills tracked (e.g., structure, clarity, insight)
- **Typical**: 5-6 competencies per interview type

### completed
- **Type**: boolean
- **Values**: `true`, `false`
- **Used in**: `demo_modal_closed`
- **Description**: Did user successfully speak with agent?
- **Calculation**: `user_spoke AND agent_joined AND duration_seconds >= 30`

### component_stack
- **Type**: string (optional, truncated)
- **Example**: `"ScoreChart > Dashboard > App"`
- **Used in**: `error_boundary_triggered`
- **Description**: React component tree where error occurred
- **Truncation**: Max 500 characters

### connection_quality
- **Type**: enum
- **Values**: `"excellent"`, `"good"`, `"poor"`
- **Used in**: `livekit_connection_established`
- **Thresholds**:
  - `excellent`: <1000ms
  - `good`: 1000-3000ms
  - `poor`: >3000ms

### connection_time_ms
- **Type**: integer
- **Range**: 100-10000 (milliseconds)
- **Used in**: `livekit_connection_established`
- **Description**: Time to establish LiveKit WebRTC connection
- **Target**: <1000ms

### converted_to_signup
- **Type**: boolean
- **Values**: `true`, `false`
- **Used in**: `demo_completed`
- **Description**: Did user click "Start Full Interview" after demo?
- **Key Metric**: Demo conversion rate

### data_point
- **Type**: string (optional)
- **Example**: `"Session 3"`, `"Competency: Structure"`
- **Used in**: `chart_interacted`
- **Description**: Specific element user clicked/hovered on chart

### destination
- **Type**: string (route)
- **Example**: `"/dashboard"`, `"/auth/signup"`, `"/interview"`
- **Used in**: `cta_clicked`
- **Description**: Target route for CTA button

### duration_seconds
- **Type**: integer
- **Range**: 0-3600 (seconds)
- **Used in**: `demo_modal_closed`, `demo_completed`, `interview_ended`, `interview_completed`
- **Description**: Time spent in session (seconds)
- **Ranges by Event**:
  - Demo: 0-300 (0-5 minutes)
  - Interview: 0-3600 (0-60 minutes typical)

### email_domain
- **Type**: string (sanitized)
- **Example**: `"gmail.com"`, `"company.com"`, `"edu"`
- **Used in**: `auth_password_reset_requested`, User Properties
- **Privacy**: Domain only, never full email
- **Analysis**: Segment consumer vs enterprise users

### ended_naturally
- **Type**: boolean
- **Values**: `true`, `false`
- **Used in**: `interview_ended`
- **Description**: User clicked "End" button (true) vs closed tab (false)
- **Analysis**: Track intentional vs accidental session exits

### error
- **Type**: string (sanitized)
- **Example**: `"Password must be at least 8 characters"`, `"Invalid credentials"`
- **Used in**: `auth_signup_failed`, `auth_signin_failed`
- **Privacy**: Sanitized to remove PII (emails, tokens, etc.)

### error_message
- **Type**: string (sanitized)
- **Example**: `"Cannot read property 'map' of undefined"`
- **Used in**: `error_boundary_triggered`, `interview_error`
- **Privacy**: Sanitized to remove user data, tokens

### error_type
- **Type**: string
- **Example**: `"livekit_disconnected"`, `"session_expired"`, `"token_invalid"`
- **Used in**: `auth_error`, `interview_error`
- **Description**: Error category for grouping
- **Common Values**:
  - `"livekit_disconnected"` - Network issue
  - `"mic_permission_denied"` - User blocked mic
  - `"agent_failed_to_join"` - LiveKit Cloud issue
  - `"session_expired"` - Auth timeout

### fcp
- **Type**: integer (optional, milliseconds)
- **Range**: 500-5000ms
- **Used in**: `page_performance`
- **Description**: First Contentful Paint (Core Web Vital)
- **Target**: <1800ms (good), <3000ms (needs improvement)
- **Null**: Metric not yet measured

### feedback_available
- **Type**: boolean
- **Values**: `true`, `false`
- **Used in**: `feedback_viewed`
- **Description**: Does session have AI-generated feedback?
- **Generation**: Async after interview (5-60 seconds delay)

### fid
- **Type**: decimal (optional, milliseconds)
- **Range**: 1-1000ms
- **Used in**: `page_performance`
- **Description**: First Input Delay (Core Web Vital)
- **Target**: <100ms (good), <300ms (needs improvement)
- **Null**: User hasn't interacted yet

### has_feedback
- **Type**: boolean
- **Values**: `true`, `false`
- **Used in**: `session_history_viewed`, `session_details_clicked`
- **Description**: Do ANY of user's sessions have feedback?
- **Rollup**: OR across all user sessions

### has_scores
- **Type**: boolean
- **Values**: `true`, `false`
- **Used in**: `competency_radar_viewed`
- **Description**: Has user completed scored sessions?
- **False**: New users with no feedback yet

### interaction_type
- **Type**: enum
- **Values**: `"hover"`, `"click"`, `"expand"`
- **Used in**: `chart_interacted`
- **Description**: Type of chart interaction
- **Analysis**: Measure engagement depth

### interview_type
- **Type**: enum
- **Values**: `"product_sense"`, `"behavioral"`, `"execution"`, `"strategy"`
- **Used in**: Multiple events (setup, interview, dashboard)
- **Distribution** (expected):
  - `product_sense`: 40-50%
  - `behavioral`: 25-35%
  - `execution`: 15-20%
  - `strategy`: 5-10%

### is_default_selection
- **Type**: boolean
- **Values**: `true`, `false`
- **Used in**: `skill_level_selected`
- **Description**: Did user keep default skill level (intermediate)?
- **Analysis**: Measure configuration engagement

### lcp
- **Type**: integer (optional, milliseconds)
- **Range**: 500-10000ms
- **Used in**: `page_performance`
- **Description**: Largest Contentful Paint (Core Web Vital)
- **Target**: <2500ms (good), <4000ms (needs improvement)
- **Null**: Metric not yet measured

### location
- **Type**: string
- **Values**: `"hero"`, `"features"`, `"cta_section"`, `"header"`, `"footer"`
- **Used in**: `cta_clicked`
- **Description**: Page section where CTA was clicked
- **Analysis**: Optimize CTA placement

### method
- **Type**: enum
- **Values**: `"google"`, `"email"`
- **Used in**: Authentication events
- **Description**: Authentication method used
- **Analysis**: Compare conversion rates by method

### mode
- **Type**: enum
- **Values**: `"voice_video"` (only option currently)
- **Used in**: Interview events, setup events
- **Future**: `"text"` mode planned

### new_state
- **Type**: enum
- **Values**: `"muted"`, `"unmuted"`
- **Used in**: `mic_toggled`, `demo_mic_toggled`
- **Description**: Microphone state after toggle

### overall_score
- **Type**: decimal (optional)
- **Range**: 0.00-100.00
- **Used in**: `feedback_viewed`
- **Description**: AI-generated overall interview score
- **Calculation**: Weighted average of competency scores
- **Null**: Feedback not yet generated

### page
- **Type**: string (route)
- **Values**: `"/"`, `"/dashboard"`, `"/setup"`, `"/interview"`, etc.
- **Used in**: `page_performance`, `error_boundary_triggered`
- **Description**: Page route where event occurred

### referrer
- **Type**: string (optional, URL)
- **Example**: `"https://google.com/search?q=..."`, `"https://twitter.com/..."`
- **Used in**: `landing_page_viewed`
- **Privacy**: Full URL may contain search terms (not PII)
- **Analysis**: Track traffic sources

### referrer_page
- **Type**: string (optional, route)
- **Example**: `"/dashboard"`, `"/"`
- **Used in**: `setup_started`
- **Description**: Previous page in app navigation

### region
- **Type**: string (optional)
- **Values**: `"us-east-1"`, `"us-west-1"`, `"eu-central-1"`, etc.
- **Used in**: `livekit_connection_established`
- **Description**: LiveKit server region
- **Analysis**: Identify regional latency issues

### section
- **Type**: enum
- **Values**: `"overview"`, `"history"`, `"analytics"`, `"feedback"`, `"settings"`, `"questions"`
- **Used in**: `dashboard_viewed`, `session_history_viewed`
- **Description**: Dashboard section being viewed

### selections_changed
- **Type**: integer
- **Range**: 0-20 (typical 0-5)
- **Used in**: `setup_completed`
- **Description**: Number of times user changed configuration
- **Analysis**: Measure indecision/exploration

### session_age_days
- **Type**: integer
- **Range**: 0-365+
- **Used in**: `session_details_clicked`
- **Calculation**: `DATEDIFF(now(), session.ended_at)`
- **Analysis**: Track review patterns (immediate vs retrospective)

### session_id
- **Type**: UUID
- **Example**: `"session-uuid-456"`
- **Used in**: All interview-related events
- **Description**: Database UUID for interview session
- **Join Key**: Links events to database session records

### sessions_in_range
- **Type**: integer
- **Range**: 0-1000
- **Used in**: `score_trend_analyzed`
- **Description**: Number of sessions included in trend analysis
- **Minimum**: 2 (need at least 2 for trend)

### skill_level
- **Type**: enum
- **Values**: `"beginner"`, `"intermediate"`, `"advanced"`
- **Used in**: Setup and interview events
- **Default**: `"intermediate"`
- **Distribution** (expected):
  - `beginner`: 20-30%
  - `intermediate`: 50-60%
  - `advanced`: 15-20%

### source
- **Type**: string (optional)
- **Example**: `"demo_modal"`, `"landing_cta"`, `"dashboard_redirect"`
- **Used in**: `auth_signup_started`, `auth_signin_started`, `setup_started`
- **Description**: Referrer context within app

### time_in_demo_seconds
- **Type**: integer
- **Range**: 0-300
- **Used in**: `demo_mic_toggled`
- **Description**: When mic toggle occurred during demo

### time_range
- **Type**: enum
- **Values**: `"all_time"`, `"last_7_days"`, `"last_30_days"`
- **Used in**: `score_trend_analyzed`
- **Description**: Time window for trend calculation

### time_spent_seconds
- **Type**: integer (optional)
- **Range**: 1-300 (typical 2-60)
- **Used in**: `chart_interacted`
- **Description**: Hover duration on chart element
- **Null**: Click event (no hover duration)

### time_to_complete_seconds
- **Type**: integer
- **Range**: 10-600 (typical 15-180)
- **Used in**: `setup_completed`
- **Calculation**: `setup_completed timestamp - setup_started timestamp`
- **Ranges**:
  - <15s: Rushed
  - 15-60s: Normal
  - 60-180s: Deliberate
  - 180s+: Indecisive

### total_sessions
- **Type**: integer
- **Range**: 0-1000+
- **Used in**: `session_history_viewed`, User Properties
- **Description**: User's total completed interview count
- **Cohorts**:
  - 0-1: New user
  - 2-5: Casual user
  - 6-15: Regular user
  - 16+: Power user

### trend_direction
- **Type**: enum
- **Values**: `"improving"`, `"declining"`, `"stable"`
- **Used in**: `score_trend_analyzed`
- **Calculation**:
  - `improving`: Recent 3 sessions avg +0.5 vs older
  - `declining`: Recent 3 sessions avg -0.5 vs older
  - `stable`: Within ±0.5 range

### trigger_source
- **Type**: string
- **Values**: `"hero_button"`, `"header_cta"`
- **Used in**: `demo_modal_opened`
- **Description**: Which button opened demo modal

### ttfb
- **Type**: integer (optional, milliseconds)
- **Range**: 50-5000ms
- **Used in**: `page_performance`
- **Description**: Time to First Byte (Core Web Vital)
- **Target**: <800ms (good), <1800ms (needs improvement)

### turn_count
- **Type**: integer
- **Range**: 0-100 (typical 5-50)
- **Used in**: `demo_completed`, `interview_completed`
- **Description**: Number of conversation turns (user + agent exchanges)
- **Calculation**: COUNT(transcript_turns) WHERE session_id = X

### user_action
- **Type**: string (optional)
- **Example**: `"clicked_analytics_tab"`, `"submitted_form"`
- **Used in**: `error_boundary_triggered`
- **Description**: Last user action before error

### user_authenticated
- **Type**: boolean
- **Values**: `true`, `false`
- **Used in**: `setup_started`
- **Description**: Is user logged in? (should always be true on /setup)

### user_id
- **Type**: UUID
- **Example**: `"user-uuid-123"`
- **Used in**: Multiple events, User Properties
- **Description**: Database user UUID
- **Privacy**: Not PII (randomized UUID)

### user_spoke
- **Type**: boolean
- **Values**: `true`, `false`
- **Used in**: `demo_modal_closed`
- **Description**: Did user's mic capture audio?
- **False**: Mic permission denied or technical issue

### utm_campaign
- **Type**: string (optional)
- **Example**: `"pm_interviews_2025"`, `"launch_week"`
- **Used in**: `landing_page_viewed`
- **Description**: Marketing campaign identifier
- **Source**: URL parameter `?utm_campaign=...`

### utm_medium
- **Type**: string (optional)
- **Example**: `"cpc"`, `"organic"`, `"social"`, `"email"`
- **Used in**: `landing_page_viewed`
- **Description**: Marketing medium
- **Source**: URL parameter `?utm_medium=...`

### utm_source
- **Type**: string (optional)
- **Example**: `"google"`, `"twitter"`, `"newsletter"`
- **Used in**: `landing_page_viewed`
- **Description**: Traffic source
- **Source**: URL parameter `?utm_source=...`

---

## Derived Metrics

These metrics are calculated from event properties, not directly tracked:

### Session Duration
- **Calculation**: `interview_ended.timestamp - interview_started.timestamp`
- **Unit**: Seconds
- **Also Available**: `interview_ended.duration_seconds` (pre-calculated)

### Time to Activation
- **Calculation**: `interview_started.timestamp - auth_signup_completed.timestamp`
- **Unit**: Hours or days
- **Target**: <24 hours for activated users

### Conversion Rate (Landing → Signup)
- **Calculation**: `COUNT(auth_signup_completed) / COUNT(landing_page_viewed)`
- **Unit**: Percentage
- **Target**: 5-15% for organic traffic

### Demo Completion Rate
- **Calculation**: `COUNT(demo_completed) / COUNT(demo_modal_opened)`
- **Unit**: Percentage
- **Target**: 50-70%

### Interview Completion Rate
- **Calculation**: `COUNT(interview_completed) / COUNT(interview_started)`
- **Unit**: Percentage
- **Target**: >85%

### Average Interview Score
- **Calculation**: `AVG(feedback_viewed.overall_score)`
- **Unit**: 0-100 scale
- **Benchmark**: 65-75 typical

### Retention Rate (Day 7)
- **Calculation**: `COUNT(DISTINCT user_id WHERE auth_signin_completed within 7 days of signup) / COUNT(auth_signup_completed)`
- **Unit**: Percentage
- **Target**: 30-40%

### Chart Engagement Rate
- **Calculation**: `COUNT(chart_interacted) / COUNT(dashboard_viewed WHERE section='overview')`
- **Unit**: Percentage
- **Target**: >30%

---

## Property Patterns & Conventions

### Naming Conventions

**Pattern**: `snake_case` for all properties

**Prefixes**:
- `is_` - Boolean flags (e.g., `is_default_selection`)
- `has_` - Boolean existence checks (e.g., `has_feedback`)
- `total_` - Aggregate counts (e.g., `total_sessions`)
- `avg_` - Averages (e.g., `avg_competency_score`)
- `time_to_` - Duration to event (e.g., `time_to_complete_seconds`)

**Suffixes**:
- `_seconds` - Duration in seconds (e.g., `duration_seconds`)
- `_ms` - Milliseconds (e.g., `connection_time_ms`)
- `_days` - Duration in days (e.g., `session_age_days`)
- `_count` - Count of items (e.g., `turn_count`)
- `_score` - Numeric score 0-100 (e.g., `overall_score`)

### Data Type Conventions

| Type | Convention | Example |
|------|------------|---------|
| Boolean | true/false (not 1/0) | `completed: true` |
| Enum | lowercase strings | `"product_sense"` not `"Product Sense"` |
| Duration | Always specify unit suffix | `duration_seconds`, `connection_time_ms` |
| Timestamps | ISO 8601 UTC | `"2025-11-18T10:30:00.000Z"` |
| UUIDs | Lowercase with hyphens | `"user-uuid-123"` |
| URLs | Full URL string | `"https://meelni.com/dashboard"` |

### Optional vs Required Properties

**Required** properties are always present:
- Core identifiers (session_id, user_id)
- Event-specific keys (interview_type, method)
- Boolean flags

**Optional** properties (marked with `?` in TypeScript):
- Calculated metrics (may be null if insufficient data)
- Conditional properties (only present in certain scenarios)
- Performance metrics (may not be available on all browsers)

### Units of Measurement

All numeric properties include unit in property name:

- `_seconds` - Time duration in seconds
- `_ms` - Time duration in milliseconds
- `_days` - Time duration in days
- `_count` - Count of items
- `_score` - Score on 0-100 scale (decimal)
- (no suffix) - Unitless scores like CLS (0.0-1.0)

---

## Privacy & PII Handling

### Automatic PII Sanitization

All event properties pass through PII sanitization before sending to PostHog:

**Patterns Detected & Redacted**:
- Email addresses → `[REDACTED_EMAIL]`
- Phone numbers → `[REDACTED_PHONE]`
- SSNs → `[REDACTED_SSN]`
- Credit cards → `[REDACTED_CREDIT_CARD]`

**Example**:
```javascript
// Before sanitization
{ error: "Signup failed for user@example.com" }

// After sanitization
{ error: "Signup failed for [REDACTED_EMAIL]" }
```

### IP Anonymization

PostHog configured to:
- **Never capture IP addresses**: `ip: false`
- **Block IP from events**: `property_denylist: ['$ip']`
- **City-level geolocation only**: Country and city inferred before IP discarded

### User Consent

**Cookie Consent Banner**:
- Shown on first visit
- Opt-in required before tracking
- Consent state saved in localStorage
- PostHog respects opt-out: `posthog.opt_out_capturing()`

**User Rights**:
- **Export**: Users can request full event history
- **Delete**: Users can request data deletion (removes all events)
- **Opt-out**: Disables all tracking (preserved across sessions)

### Domain-Only Email Tracking

**Never Tracked**:
- `user@example.com` ❌

**Always Tracked**:
- `example.com` ✅

**Use Case**: Segment consumer (gmail.com) vs enterprise (company.com) users without exposing PII

### Session Recording Restrictions

Session recording **disabled** on sensitive pages:
- `/auth/signin` - Password input
- `/auth/signup` - Registration forms
- `/auth/reset-password` - Password reset
- `/billing/*` (future) - Payment info

---

## PostHog-Specific Fields

### Automatically Captured

PostHog adds these properties to every event:

| Property | Type | Description |
|----------|------|-------------|
| `$session_id` | string | PostHog session ID (30min timeout) |
| `$pageview_id` | string | Unique ID for current page view |
| `$current_url` | string | Full URL of current page |
| `$screen_height` | integer | Viewport height (px) |
| `$screen_width` | integer | Viewport width (px) |
| `$device_type` | enum | "Desktop", "Mobile", "Tablet" |
| `$browser` | string | Browser name and version |
| `$os` | string | Operating system |
| `$lib` | string | "posthog-js" (SDK version) |

### User Properties (Set with identify())

PostHog persists these across events after `posthog.identify()`:

| Property | Source | Update Frequency |
|----------|--------|------------------|
| `email` | Never sent | Blocked |
| `email_domain` | Sanitized from email | Set once |
| `signup_method` | auth_signup_completed | Set once |
| `total_sessions` | interview_completed | After each interview |
| `avg_score` | feedback_viewed | After each scored session |
| `created_at` | User registration | Set once |

---

## Query Examples

### PostHog SQL Syntax

PostHog uses ClickHouse SQL. Here are common query patterns:

#### Count Events by Type
```sql
SELECT
  event,
  COUNT(*) as event_count
FROM events
WHERE timestamp > now() - interval '7 days'
GROUP BY event
ORDER BY event_count DESC
```

#### Calculate Funnel Conversion
```sql
-- Signup to First Interview Funnel
SELECT
  COUNT(DISTINCT CASE WHEN event = 'auth_signup_completed' THEN distinct_id END) as signups,
  COUNT(DISTINCT CASE WHEN event = 'interview_completed' THEN distinct_id END) as completed_first_interview,
  (completed_first_interview / signups * 100) as conversion_rate
FROM events
WHERE timestamp > now() - interval '30 days'
  AND event IN ('auth_signup_completed', 'interview_completed')
```

#### Average Property by Segment
```sql
-- Average interview duration by interview type
SELECT
  properties.interview_type,
  AVG(properties.duration_seconds) as avg_duration,
  COUNT(*) as session_count
FROM events
WHERE event = 'interview_ended'
  AND timestamp > now() - interval '30 days'
GROUP BY properties.interview_type
ORDER BY avg_duration DESC
```

#### User Cohort Analysis
```sql
-- Retention: % of Day 0 users who returned Day 7
WITH day_0_users AS (
  SELECT DISTINCT distinct_id
  FROM events
  WHERE event = 'auth_signup_completed'
    AND timestamp BETWEEN '2025-11-11' AND '2025-11-12'
),
day_7_returns AS (
  SELECT DISTINCT distinct_id
  FROM events
  WHERE event = 'auth_signin_completed'
    AND timestamp BETWEEN '2025-11-18' AND '2025-11-19'
    AND distinct_id IN (SELECT distinct_id FROM day_0_users)
)
SELECT
  (SELECT COUNT(*) FROM day_7_returns) / (SELECT COUNT(*) FROM day_0_users) * 100 as day_7_retention
```

---

## Frequently Asked Questions

### How do I filter out test events?

Use `distinct_id` filtering:
```sql
WHERE distinct_id NOT LIKE '%test%'
  AND distinct_id NOT LIKE '%admin%'
```

### How do I join events to user properties?

PostHog automatically joins user properties to events. Access via `person.properties`:
```sql
SELECT
  distinct_id,
  person.properties.signup_method,
  COUNT(*) as event_count
FROM events
WHERE event = 'interview_completed'
GROUP BY distinct_id, person.properties.signup_method
```

### How do I calculate session duration without using the property?

```sql
SELECT
  session_id,
  MAX(timestamp) - MIN(timestamp) as session_duration
FROM events
WHERE session_id IS NOT NULL
  AND timestamp > now() - interval '7 days'
GROUP BY session_id
```

### How do I handle null/optional properties?

Use `COALESCE` or `IS NOT NULL`:
```sql
-- Default value for nulls
SELECT
  COALESCE(properties.utm_source, 'organic') as source,
  COUNT(*) as count
FROM events
WHERE event = 'landing_page_viewed'
GROUP BY source

-- Filter out nulls
SELECT *
FROM events
WHERE event = 'page_performance'
  AND properties.lcp IS NOT NULL
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-18
**Maintained By**: Developer Team + Data Science Team
**Questions?**: Refer to `.claude/ANALYTICS_EVENT_CATALOG.md` for event details

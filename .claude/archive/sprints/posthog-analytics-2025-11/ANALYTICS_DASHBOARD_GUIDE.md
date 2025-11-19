# Analytics Dashboard Guide
**Building PostHog Dashboards for Meelni**

**Audience**: Data Scientists, Product Managers, Analysts
**Last Updated**: 2025-11-18
**PostHog Version**: Cloud (latest)

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [North Star Metrics Dashboard](#north-star-metrics-dashboard)
3. [Funnel Dashboards](#funnel-dashboards)
4. [Performance Monitoring Dashboards](#performance-monitoring-dashboards)
5. [User Segmentation](#user-segmentation)
6. [Alerts & Notifications](#alerts--notifications)
7. [Advanced Techniques](#advanced-techniques)

---

## Quick Start

### Accessing PostHog

1. Navigate to: https://app.posthog.com
2. Select Meelni project
3. Go to **Dashboards** in left sidebar

### Creating Your First Dashboard

**Step 1**: Create New Dashboard
```
Dashboards → New Dashboard
Name: "North Star Metrics"
Description: "Key product health metrics"
```

**Step 2**: Add First Insight
```
+ New Insight → Trends
Event: auth_signup_completed
Chart Type: Line chart
Time Period: Last 30 days
Save as: "Daily Signups"
```

**Step 3**: Customize Layout
- Drag insights to arrange
- Resize with corner handles
- Add text cards for context

---

## North Star Metrics Dashboard

### Overview

This dashboard tracks the 5 most important metrics for Meelni's product health.

**Recommended Cadence**: Check daily, review weekly with team

### Metric 1: Daily Active Users (DAU)

**Purpose**: Measure overall product engagement

**PostHog Setup**:
```
Insight Type: Trends
Event: auth_signin_completed OR interview_started
Unique Users: Checked
Time Period: Last 30 days
Chart Type: Line chart
Breakdown: None
```

**Targets**:
- **Week 1**: 10-20 DAU
- **Month 1**: 50-100 DAU
- **Month 3**: 200-500 DAU

**Alert**: Drop >20% week-over-week

---

### Metric 2: Weekly Active Users (WAU)

**Purpose**: Track weekly engagement and growth trends

**PostHog Setup**:
```
Insight Type: Trends
Events:
  - auth_signin_completed
  - interview_started
  - dashboard_viewed
Unique Users: Checked
Time Period: Last 90 days
Interval: Week
Chart Type: Line chart
```

**Formula** (for display):
```
WAU = UNIQUE users with any tracked event in last 7 days
```

**Targets**:
- **Month 1**: 100-200 WAU
- **Month 3**: 500-1000 WAU
- **Month 6**: 2000-5000 WAU

---

### Metric 3: Interview Completion Rate

**Purpose**: Core product quality metric - % of started interviews completed

**PostHog Setup**:
```
Insight Type: Funnel
Steps:
  1. interview_started
  2. interview_completed
Time Window: 1 hour (between steps)
Display: Conversion %
```

**Calculation**:
```
Completion Rate = (interview_completed / interview_started) × 100
```

**Targets**:
- **Good**: >85%
- **Acceptable**: 75-85%
- **Concerning**: <75%

**Troubleshooting Low Rates**:
- Check `interview_error` events for technical issues
- Review `interview_ended.ended_naturally=false` (network drops)
- Segment by `interview_type` to identify problem areas

---

### Metric 4: Activation Rate (Signup → First Interview within 24h)

**Purpose**: Measure onboarding effectiveness

**PostHog Setup**:
```
Insight Type: Funnel
Steps:
  1. auth_signup_completed
  2. setup_completed
  3. interview_started
Time Window: 24 hours
Display: Conversion %
Breakdown: By signup_method (google vs email)
```

**Targets**:
- **Good**: >60%
- **Acceptable**: 45-60%
- **Needs Improvement**: <45%

**Optimization Levers**:
- Email onboarding sequence
- In-app prompts
- Setup flow friction reduction

---

### Metric 5: User Retention (Day 1, Day 7, Day 30)

**Purpose**: Long-term product-market fit indicator

**PostHog Setup** (Day 7 Retention):
```
Insight Type: Retention
Event A (start): auth_signup_completed
Event B (return): auth_signin_completed OR interview_started
Retention Period: 7 days
Time Range: Last 90 days
Chart Type: Retention table
```

**Targets**:
| Period | Good | Acceptable | Poor |
|--------|------|------------|------|
| Day 1 | >40% | 30-40% | <30% |
| Day 7 | >30% | 20-30% | <20% |
| Day 30 | >20% | 10-20% | <10% |

**Analysis**:
- Cohort by `signup_source` (demo vs direct)
- Segment by `interview_type` preference
- Track retention by `skill_level`

---

## Funnel Dashboards

### Acquisition Funnel (Landing → Signup)

**Purpose**: Optimize marketing conversion

**Funnel Steps**:
```
1. landing_page_viewed         (100%)
2. cta_clicked                 (30-40% target)
3. demo_modal_opened           (20-30% target)
4. demo_completed              (15-20% target)
5. auth_signup_started         (12-18% target)
6. auth_signup_completed       (10-15% target)
```

**PostHog Setup**:
```
Insight Type: Funnel
Steps: [as above]
Time Window: 1 hour
Breakdown: By utm_source
Display: Trend over time
```

**Key Metrics**:
- **Overall Conversion**: landing → signup
- **Demo Impact**: Compare demo_completed vs no demo
- **Source Quality**: Best converting utm_source

**Optimization Questions**:
- Which traffic source has highest conversion?
- Does demo improve signup rate?
- Where is biggest drop-off?

---

### Activation Funnel (Signup → First Interview)

**Purpose**: Measure onboarding effectiveness

**Funnel Steps**:
```
1. auth_signup_completed       (100%)
2. dashboard_viewed            (95%+ target)
3. setup_started               (70-80% target)
4. setup_completed             (60-70% target)
5. interview_started           (55-65% target)
6. interview_completed         (50-60% target)
```

**PostHog Setup**:
```
Insight Type: Funnel
Steps: [as above]
Time Window: 24 hours
Breakdown: By signup_method
Display: Conversion over time
```

**Drop-off Analysis**:

**setup_started → setup_completed**:
- Check `time_to_complete_seconds` distribution
- Review `selections_changed` (high = confusion)
- Test simplified default flow

**setup_completed → interview_started**:
- LiveKit connection issues?
- Check `livekit_connection_established` errors
- Test mic permission flow

---

### Engagement Funnel (Demo → Full Interview)

**Purpose**: Measure demo conversion power

**Funnel Steps**:
```
1. demo_modal_opened           (100%)
2. demo_completed              (60-70% target)
3. auth_signup_completed       (20-30% target)
4. interview_started           (15-25% target)
```

**PostHog Setup**:
```
Insight Type: Funnel
Steps: [as above]
Time Window: 1 hour
Filter: demo_completed.converted_to_signup = true
```

**Insights**:
- **Demo Quality**: `demo_completed.duration_seconds` correlation
- **Turn Count Impact**: Does higher `turn_count` predict conversion?
- **Timing**: How quickly do demo users signup after?

---

## Performance Monitoring Dashboards

### Web Vitals Dashboard

**Purpose**: Monitor page performance and user experience

#### Chart 1: LCP by Page
```
Insight Type: Trends
Event: page_performance
Y-axis: AVG(properties.lcp)
Breakdown: By page
Filter: lcp < 10000 (exclude outliers)
Target Line: 2500ms (good threshold)
```

**Alert**: AVG(lcp) > 4000ms on any page

#### Chart 2: FID Distribution
```
Insight Type: Histogram
Event: page_performance
Property: fid
Bins: 10 (0-1000ms)
Target: >75% under 100ms
```

#### Chart 3: CLS Over Time
```
Insight Type: Trends
Event: page_performance
Y-axis: AVG(properties.cls)
Filter: cls < 1 (exclude errors)
Target Line: 0.1 (good threshold)
```

**Recommended Actions**:
| Metric | Threshold | Action |
|--------|-----------|--------|
| LCP > 4s | Page-specific | Optimize images, lazy-load |
| FID > 300ms | Global | Reduce JavaScript execution |
| CLS > 0.25 | Page-specific | Reserve space for dynamic content |

---

### LiveKit Connection Quality Dashboard

**Purpose**: Monitor real-time interview infrastructure

#### Chart 1: Connection Time Trend
```
Insight Type: Trends
Event: livekit_connection_established
Y-axis: AVG(properties.connection_time_ms)
Breakdown: By connection_quality
Time Period: Last 7 days
```

**Targets**:
- **Excellent (<1s)**: >70% of connections
- **Good (1-3s)**: >90% of connections
- **Poor (>3s)**: <5% of connections

#### Chart 2: Connection Quality Distribution
```
Insight Type: Pie Chart
Event: livekit_connection_established
Breakdown: By connection_quality
Time Period: Last 30 days
```

#### Chart 3: Regional Latency
```
Insight Type: Trends
Event: livekit_connection_established
Y-axis: AVG(connection_time_ms)
Breakdown: By region
```

**Alert Conditions**:
- >10% connections rated "poor"
- Any region AVG > 3000ms
- Spike in `interview_error` with `error_type: livekit_disconnected`

---

### Error Monitoring Dashboard

**Purpose**: Track application stability and user-facing errors

#### Chart 1: Error Rate Over Time
```
Insight Type: Trends
Events:
  - error_boundary_triggered
  - interview_error
  - auth_error
Y-axis: Count
Chart Type: Line
Alert: >5 errors per hour
```

#### Chart 2: Top Errors (Last 7 Days)
```
Insight Type: Table
Event: error_boundary_triggered
Columns:
  - error_message
  - COUNT()
  - UNIQUE(distinct_id)
Group By: error_message
Sort By: COUNT DESC
Limit: 20
```

#### Chart 3: Errors by Page
```
Insight Type: Bar Chart
Event: error_boundary_triggered
X-axis: properties.page
Y-axis: COUNT()
Sort: Descending
```

**Prioritization**:
1. **Critical**: Affects >10% of users
2. **High**: Recurring (>10 occurrences/day)
3. **Medium**: Isolated to specific page
4. **Low**: <5 occurrences, no user impact

---

## User Segmentation

### Cohorts

PostHog cohorts enable powerful user segmentation. Create these for analysis:

#### Cohort 1: Power Users
```
Name: Power Users
Criteria:
  - Performed: interview_completed
  - At least: 10 times
  - In the last: 30 days
```

**Use Cases**:
- Feature beta testing
- Retention benchmarks
- Testimonial outreach

---

#### Cohort 2: At-Risk Users
```
Name: At-Risk Churners
Criteria:
  - Performed: auth_signin_completed
  - At least: 1 time
  - In the last: 60 days
  AND
  - Did NOT perform: interview_completed
  - In the last: 14 days
```

**Use Cases**:
- Re-engagement campaigns
- Churn prediction modeling
- Win-back email sequences

---

#### Cohort 3: Demo Converters
```
Name: Demo to Signup Converters
Criteria:
  - Performed: demo_completed
  - In the last: 7 days
  AND
  - Performed: auth_signup_completed
  - Within: 1 hour after demo_completed
```

**Use Cases**:
- Measure demo effectiveness
- Optimize demo flow
- A/B test demo variants

---

#### Cohort 4: Product Sense Specialists
```
Name: Product Sense Specialists
Criteria:
  - Performed: interview_completed
  - At least: 5 times
  - Where: interview_type = "product_sense"
  - In the last: 30 days
```

**Use Cases**:
- Content recommendations
- Feature targeting
- User research recruitment

---

### User Properties for Segmentation

Use these properties in dashboards for deeper analysis:

| Property | Segmentation Use Case |
|----------|---------------------|
| `signup_method` | Compare Google vs Email conversion |
| `email_domain` | Consumer (gmail) vs Enterprise users |
| `signup_source` | Organic vs Demo vs Referral quality |
| `lifecycle_stage` | New, Active, Power User, Churned |
| `total_sessions` | User maturity cohorts |
| `avg_score` | High/Medium/Low performers |

---

## Alerts & Notifications

### Setting Up Alerts in PostHog

**Navigation**: Insights → [Your Insight] → Alerts

### Critical Alerts (Slack/Email)

#### Alert 1: Signup Drop
```
Insight: Daily Signups (auth_signup_completed)
Condition: Drops below 80% of 7-day average
Frequency: Check every 1 hour
Channel: #product-alerts Slack
```

#### Alert 2: Poor Connection Quality
```
Insight: LiveKit Connection Quality
Condition: "poor" connections > 10%
Frequency: Check every 30 minutes
Channel: #engineering-alerts Slack
```

#### Alert 3: High Error Rate
```
Insight: Error Boundary Triggers
Condition: > 5 errors in 1 hour
Frequency: Check every 15 minutes
Channel: #engineering-critical Slack
```

#### Alert 4: Interview Completion Rate Drop
```
Insight: Interview Completion Funnel
Condition: Conversion < 75%
Frequency: Check every 6 hours
Channel: #product-alerts Slack
```

---

### Warning Alerts (Email only)

#### Alert 5: Activation Rate Decline
```
Insight: Activation Funnel (Signup → First Interview)
Condition: Conversion < 50%
Frequency: Check daily
Channel: Email to PM
```

#### Alert 6: Demo Abandonment Spike
```
Insight: Demo Completion Rate
Condition: demo_completed / demo_modal_opened < 50%
Frequency: Check every 3 hours
Channel: Email to PM
```

---

## Advanced Techniques

### Calculating Custom Metrics

#### Average Session Length
```
Insight Type: Formula
A = Sum of interview_ended.duration_seconds
B = Count of interview_ended events
Formula: A / B
Display: Number with "seconds" unit
```

#### Time to First Interview
```
Insight Type: SQL Query
Query:
SELECT
  AVG(TIMESTAMPDIFF(hour, signup.timestamp, first_interview.timestamp)) as avg_hours
FROM (
  SELECT distinct_id, MIN(timestamp) as timestamp
  FROM events
  WHERE event = 'auth_signup_completed'
  GROUP BY distinct_id
) signup
JOIN (
  SELECT distinct_id, MIN(timestamp) as timestamp
  FROM events
  WHERE event = 'interview_started'
  GROUP BY distinct_id
) first_interview
ON signup.distinct_id = first_interview.distinct_id
```

---

### A/B Testing with Feature Flags

**Example**: Test new onboarding flow

**Step 1**: Create Feature Flag
```
PostHog → Feature Flags → New Flag
Name: new_onboarding_flow
Rollout: 50% of users
Variant A: control (old flow)
Variant B: treatment (new flow)
```

**Step 2**: Track Events with Flag Context
```javascript
// In code
const variant = posthog.getFeatureFlag('new_onboarding_flow')
analytics.track('setup_completed', {
  ab_test_variant: variant
})
```

**Step 3**: Compare Metrics by Variant
```
Insight Type: Trends
Event: interview_started (within 24h of signup)
Breakdown: By ab_test_variant
Compare: Conversion rate by variant
```

---

### Session Recording Analysis

**Use Cases**:
1. Debug user-reported issues
2. Understand drop-off points in funnels
3. Identify UX friction

**Best Practices**:
- Filter recordings by error events
- Watch recordings of churned users
- Focus on conversion drop-off points

**Privacy**: Sessions NOT recorded on:
- /auth/* pages (password entry)
- /billing/* pages (payment info)

**Viewing Recordings**:
```
PostHog → Session Replay
Filters:
  - Event: interview_error
  - Time Range: Last 7 days
  - Limit: 20
```

---

### Retention Curves

**Purpose**: Visualize long-term retention patterns

**Setup**:
```
Insight Type: Retention
Event A: auth_signup_completed
Event B: Any activity event
Periods: Day 0, 1, 7, 14, 30, 60, 90
Display: Retention curve
Breakdown: By signup_source
```

**Interpretation**:
- **Steep early drop**: Onboarding issue
- **Gradual decline**: Natural churn
- **Plateau**: Strong product-market fit

**Benchmark** (SaaS averages):
- Day 1: 40-60%
- Day 7: 25-35%
- Day 30: 15-25%

---

### Multi-Touch Attribution

**Scenario**: User visits from Google, tries demo, returns from email, signs up

**Tracking**:
1. **First Touch**: Google (landing_page_viewed.utm_source)
2. **Demo**: demo_completed
3. **Last Touch**: Email (auth_signup_started.source)

**Setup**:
```
Insight Type: Paths
Starting Point: landing_page_viewed
Goal: auth_signup_completed
Max Depth: 10 steps
Show: All paths
```

**Analysis**: Most common conversion journeys

---

## Dashboard Templates

### Template 1: Executive Summary Dashboard

**Widgets**:
1. WAU trend (last 90 days)
2. Interview completion rate (% gauge)
3. Activation rate (% gauge)
4. Day 7 retention (% gauge)
5. Top traffic sources (table)
6. Revenue (future - placeholder)

**Audience**: CEO, VP Product

---

### Template 2: Product Health Dashboard

**Widgets**:
1. DAU/WAU ratio (stickiness metric)
2. Activation funnel (conversion %)
3. Feature adoption (chart interactions, feedback views)
4. Interview type distribution (pie chart)
5. Average session duration trend
6. Completion rate by interview type

**Audience**: Product Manager, Product Team

---

### Template 3: Engineering Health Dashboard

**Widgets**:
1. Page performance (LCP, FID, CLS)
2. LiveKit connection quality
3. Error rate over time
4. Top errors (table)
5. API response times (future)
6. Deployment markers (overlays)

**Audience**: Engineering Manager, DevOps

---

### Template 4: Growth Dashboard

**Widgets**:
1. Signups by source (stacked area chart)
2. Demo conversion rate
3. Referral funnel (future)
4. Viral coefficient (future)
5. CAC by channel (future)
6. LTV:CAC ratio (future)

**Audience**: Head of Growth, Marketing Team

---

## Best Practices

### Dashboard Design Principles

1. **One Goal per Dashboard**: Don't mix metrics for different audiences
2. **Top 3 Metrics First**: Most important insights above the fold
3. **Use Color Sparingly**: Red for bad, green for good, gray for neutral
4. **Include Context**: Add text cards explaining calculations
5. **Set Baselines**: Show target lines on charts
6. **Compare Periods**: Week-over-week, month-over-month trends
7. **Filter Options**: Add date range and segment filters

### Performance Tips

- Limit dashboards to <15 insights (faster load)
- Use cached insights when possible
- Set appropriate date ranges (90 days max for real-time)
- Archive unused dashboards

### Naming Conventions

**Dashboards**:
- `[Team] - [Purpose]` (e.g., "Product - North Star Metrics")

**Insights**:
- `[Metric Name] ([Detail])` (e.g., "DAU (Last 30 Days)")

---

## Frequently Asked Questions

### How often should dashboards refresh?

- **Real-time**: Every 5 minutes (for alerts)
- **Standard**: Every 1 hour (for daily review)
- **Reports**: Daily snapshot (for weekly reviews)

### Can I export dashboard data?

Yes:
- CSV export per insight
- Dashboard PDF export
- API access for automated reporting

### How do I share dashboards with stakeholders?

1. **Public Link**: Dashboard → Share → Create public link
2. **Scheduled Email**: Dashboard → Subscribe → Email digest
3. **Embed**: Dashboard → Share → Get embed code

### How do I track dashboard usage?

PostHog tracks:
- Dashboard views
- Insight interactions
- Who viewed what (internal team only)

Access: Team → Activity Log

---

## Next Steps

1. **Create North Star Dashboard** (30 minutes)
2. **Set Up Critical Alerts** (15 minutes)
3. **Build Acquisition Funnel** (20 minutes)
4. **Create Executive Summary** (15 minutes)
5. **Schedule Weekly Review** (recurring calendar event)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-18
**Maintained By**: Data Science Team
**Related Docs**:
- [Event Catalog](./ANALYTICS_EVENT_CATALOG.md)
- [Data Dictionary](./ANALYTICS_DATA_DICTIONARY.md)
- [Privacy Guide](./ANALYTICS_PRIVACY_GUIDE.md)

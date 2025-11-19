# Product Strategy: Dashboard Section Differentiation

**Author**: Product Manager Agent
**Date**: 2025-11-09

---

## Executive Summary

The current dashboard conflates **operational status** (Overview) with **performance insights** (Analytics). We need to separate "what's happening" from "how am I performing."

---

## Section 1: Overview - Session Command Center

### Purpose
**Answer: "What's my current status and what should I do next?"**

Tactical command center for active engagement - shows real-time status, recent activity, and action-oriented guidance.

### Core User Story
> "As a PM candidate, I want to quickly see my recent activity and understand what action to take next (start a new mock, review feedback, continue practicing a weak area) so I can maintain momentum in my interview prep."

### Primary Widgets

1. **Session Stats Card** (Quick Metrics)
   - Total Sessions, Total Minutes, Last Session Date
   - **Action CTA**: "Start New Mock Interview"

2. **Recent Sessions Timeline** (Last 5-7 sessions)
   - Session date/time, interview type, overall score
   - Quick access: "View Transcript" / "See Feedback"

3. **Active Recommendations** (AI-driven)
   - "Practice Product Sense - you haven't done one in 2 weeks"
   - "Review feedback from your last Strategy session (scored 3.2/5.0)"
   - Purpose: Nudge toward optimal practice patterns

4. **Quick Access Panel**
   - Most recent interview type (one-click restart)
   - Bookmarked questions (future)
   - Scheduled mocks (future)

### What Does NOT Belong
❌ Historical trend charts
❌ Competency breakdowns
❌ Interview type distribution
❌ Comparative analysis

→ These are analytical insights, move to Analytics

---

## Section 2: Analytics - Performance Intelligence

### Purpose
**Answer: "How am I improving and where should I focus my learning?"**

Strategic insights hub for understanding performance patterns, identifying strengths/weaknesses, tracking progress over time.

### Core User Story
> "As a PM candidate, I want to analyze my interview performance trends, understand which competencies need work, and see if my practice is translating to measurable improvement so I can optimize my study plan."

### Primary Visualizations

1. **Performance Trend Chart** (Score over time)
   - Line chart: Overall score across last 10-30 sessions
   - Trendline, segmented by interview type
   - **Insight**: "Your Product Sense scores improved 18% this month"

2. **Competency Breakdown** (Radar chart)
   - Structure, Clarity, Insight, Communication, Leadership
   - Current avg vs Previous period (delta)
   - **Insight**: "Communication is your strongest skill (4.2/5.0)"

3. **Interview Type Distribution** (Pie/bar chart)
   - % of sessions by type, avg score by type
   - **Insight**: "You've practiced Strategy 2x more than Leadership"

4. **Time Investment Analysis**
   - Total minutes (trend over weeks)
   - Practice consistency heatmap
   - **Insight**: "You practice most on Sundays (avg 45 min)"

5. **Strengths & Gaps Matrix** (2x2 grid)
   - Frequency vs Performance
   - Auto-recommend next practice area

6. **Difficulty Progression** (if tracked)
   - % of Junior/Intermediate/Senior sessions
   - Score by difficulty level

### What Does NOT Belong
❌ "Start New Mock" CTA
❌ Recent sessions list
❌ Real-time activity feed

→ These are operational, keep in Overview

---

## Data Allocation Table

| Metric/Widget | Overview | Analytics | Rationale |
|---------------|----------|-----------|-----------|
| Total Sessions Count | ✅ Quick stat | ✅ Trend chart | Both: Overview = count, Analytics = trend |
| Recent 5 Sessions | ✅ Timeline | ❌ | Operational |
| Score Over Time | ❌ | ✅ | Analytical |
| Competency Radar | ❌ | ✅ | Analytical |
| Interview Type Pie | ❌ | ✅ | Analytical |
| "Start Mock" CTA | ✅ | ❌ | Operational |
| AI Recommendations | ✅ | ❌ | Operational |
| Strengths/Gaps Matrix | ❌ | ✅ | Analytical |

---

## Implementation Priority

### Phase 1 (MVP Analytics)
1. Move existing charts to Analytics
2. Simplify Overview (stats, timeline, CTA only)
3. Add date range filter to Analytics

### Phase 2 (Enhanced Analytics)
4. Strengths/Gaps Matrix
5. Practice Consistency Heatmap
6. Difficulty Progression

### Phase 3 (Advanced Insights)
7. Comparative Benchmarks
8. Drill-Down Tables
9. Goal Setting & Tracking

---

## Success Metrics

**Overview Section:**
- % users who click "Start New Mock" within 30s
- % users who return within 7 days
- Avg time to start new session

**Analytics Section:**
- % users who visit Analytics after 3+ sessions
- Avg time spent on Analytics page
- % users who change practice focus after viewing

---

## Design Principles

### Overview: Action-Oriented
- Large CTAs
- Minimal cognitive load
- Fresh data focus
- Mobile-first

### Analytics: Insight-Oriented
- Chart-heavy
- Deep analysis
- Historical perspective
- Interactive exploration

---

**Last Updated**: 2025-11-09

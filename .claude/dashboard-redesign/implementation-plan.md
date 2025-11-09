# Implementation Plan: 5-Week Phased Rollout

**Start Date**: 2025-11-09
**Target Completion**: 2025-12-13

---

## Phase 1: Foundation (Week 1)
**Goal**: Get Analytics section functional with highest-impact charts

### Tasks
1. **Setup** (Day 1)
   - [ ] Install recharts 2.15.4: `npm install recharts@2.15.4`
   - [ ] Create `/components/charts/` directory
   - [ ] Copy 7 EvilChart component files
   - [ ] Add color variables to `globals.css`
   - **Effort**: 1-2 hours

2. **ClippedAreaChart - Performance Trend** (Days 1-2)
   - [ ] Create `/components/dashboard/charts/performance-trend.tsx`
   - [ ] Fetch session data with scores
   - [ ] Map to chart format (date, score 0-100 scale)
   - [ ] Add hover/click interactions
   - [ ] Test responsive layout
   - **Effort**: 3-4 hours

3. **GlowingStrokeRadarChart - Competency Breakdown** (Day 2)
   - [ ] Create `/components/dashboard/charts/competency-breakdown.tsx`
   - [ ] Calculate avg scores for 5 competencies
   - [ ] Replace existing CompetencyRadar component
   - [ ] Add glow effect with hover
   - [ ] Wire up click-to-filter
   - **Effort**: 2-3 hours

4. **Analytics Section Structure** (Day 3)
   - [ ] Update `/components/dashboard/sections/analytics.tsx`
   - [ ] Add filters bar (date range, type toggles)
   - [ ] Create grid layout (2-col desktop, 1-col mobile)
   - [ ] Add loading skeletons
   - [ ] Add empty states
   - **Effort**: 4-5 hours

**Deliverable**: Analytics section with 2 working charts + filters

---

## Phase 2: Distribution & Comparison (Week 2)
**Goal**: Add charts showing practice patterns and comparisons

### Tasks
1. **RoundedPieChart - Type Distribution** (Days 1-2)
   - [ ] Create `/components/dashboard/charts/type-distribution.tsx`
   - [ ] Aggregate sessions by round_type
   - [ ] Map to pie chart with 4 colors
   - [ ] Add hover expand animation
   - [ ] Wire up click-to-filter
   - **Effort**: 2-3 hours

2. **DefaultMultipleBarChart - Score by Type** (Days 2-3)
   - [ ] Create `/components/dashboard/charts/score-by-type.tsx`
   - [ ] Calculate avg score per interview type
   - [ ] Add comparison bars (user vs platform avg - future)
   - [ ] Add dotted background pattern
   - [ ] Wire up interactions
   - **Effort**: 3-4 hours

3. **GradientBarChart - Time Investment** (Days 3-4)
   - [ ] Create `/components/dashboard/charts/time-investment.tsx`
   - [ ] Implement date grouping (by week)
   - [ ] Calculate total minutes per week
   - [ ] Add gradient bar styling
   - [ ] Add expandable session list on click
   - **Effort**: 4-5 hours

4. **Filter Integration** (Day 5)
   - [ ] Wire all charts to filter state
   - [ ] Add URL param persistence (`?type=analytical&range=30d`)
   - [ ] Test filter combinations
   - [ ] Add "Clear Filters" button
   - **Effort**: 2-3 hours

**Deliverable**: 5 charts in Analytics, full filtering working

---

## Phase 3: Advanced Insights (Week 3)
**Goal**: Add predictive and progression charts

### Tasks
1. **Forecast Logic** (Days 1-2)
   - [ ] Create `/lib/analytics/forecast.ts`
   - [ ] Implement simple linear regression
   - [ ] Calculate 5 future session projections
   - [ ] Add confidence interval calculation
   - **Effort**: 3-4 hours

2. **PartialLineChart - Score Improvement** (Days 2-3)
   - [ ] Create `/components/dashboard/charts/score-improvement.tsx`
   - [ ] Integrate forecast logic
   - [ ] Map actual vs forecast data
   - [ ] Style solid/dashed line segments
   - [ ] Replace existing ScoreChart
   - **Effort**: 3-4 hours

3. **Schema Update - Difficulty Field** (Day 3)
   - [ ] Add migration: `ALTER TABLE interview_session ADD COLUMN difficulty TEXT`
   - [ ] Update setup page to capture difficulty
   - [ ] Update session creation API
   - [ ] Backfill existing sessions (default: 'intermediate')
   - **Effort**: 2-3 hours

4. **GlowingBarVerticalChart - Difficulty Progression** (Days 4-5)
   - [ ] Create `/components/dashboard/charts/difficulty-progression.tsx`
   - [ ] Group sessions by month + difficulty
   - [ ] Create stacked horizontal bars
   - [ ] Add property filter dropdown
   - [ ] Add glow effects
   - **Effort**: 4-5 hours

**Deliverable**: 7 charts complete, forecast working, difficulty tracking

---

## Phase 4: Overview Refinement (Week 4)
**Goal**: Polish Overview section with micro-interactions

### Tasks
1. **MiniTrendSparkline** (Day 1)
   - [ ] Create `/components/dashboard/widgets/mini-trend-sparkline.tsx`
   - [ ] CSS-only implementation (no chart library)
   - [ ] Show last 7 session scores
   - [ ] Add to Overview section
   - **Effort**: 1-2 hours

2. **AIRecommendations Card** (Days 1-2)
   - [ ] Create `/components/dashboard/widgets/ai-recommendations.tsx`
   - [ ] Create `/lib/analytics/recommendations.ts`
   - [ ] Implement recommendation logic:
     - Identify weakest interview type
     - Check practice frequency patterns
     - Generate 3 actionable tips
   - [ ] Add CTAs (e.g., "Practice Analytical Now")
   - **Effort**: 4-5 hours

3. **Badge Trend Indicators** (Day 3)
   - [ ] Update StatsCards component
   - [ ] Calculate trend (↑ improving, ↓ declining, → stable)
   - [ ] Add colored badges (green/red/gray)
   - [ ] Show percentage change
   - **Effort**: 1-2 hours

4. **Weekly Goal Progress** (Day 3)
   - [ ] Create `/components/dashboard/widgets/weekly-goal-progress.tsx`
   - [ ] Radial progress indicator (CSS-only)
   - [ ] Calculate sessions this week vs goal (default: 3)
   - [ ] Add to Overview section
   - **Effort**: 2-3 hours

5. **Overview Layout Cleanup** (Days 4-5)
   - [ ] Remove all charts from Overview
   - [ ] Reorganize: Stats → Sparkline/Recs → Timeline → CTAs
   - [ ] Add animations (Framer Motion)
   - [ ] Test mobile responsive
   - **Effort**: 3-4 hours

**Deliverable**: Complete dashboard with Overview + Analytics

---

## Phase 5: Polish & Optimization (Week 5)
**Goal**: Production-ready performance, accessibility, responsiveness

### Tasks
1. **Mobile Responsive Testing** (Days 1-2)
   - [ ] Test all charts on mobile (320px to 768px)
   - [ ] Fix any layout issues
   - [ ] Adjust chart heights for mobile
   - [ ] Test touch interactions
   - **Effort**: 4-6 hours

2. **Loading & Error States** (Day 2)
   - [ ] Add skeleton screens for all charts
   - [ ] Add error boundaries
   - [ ] Add retry logic for failed data fetches
   - [ ] Add empty state illustrations
   - **Effort**: 3-4 hours

3. **Accessibility Audit** (Day 3)
   - [ ] Add `aria-label` to all charts
   - [ ] Test keyboard navigation (Tab, Enter, Escape)
   - [ ] Verify color contrast (WCAG AA)
   - [ ] Add screen reader announcements
   - [ ] Add focus indicators
   - **Effort**: 3-4 hours

4. **Performance Optimization** (Day 4)
   - [ ] Memoize chart data calculations
   - [ ] Add React.memo to chart components
   - [ ] Lazy load charts (IntersectionObserver)
   - [ ] Optimize Recharts bundle size
   - [ ] Test page load time (<3s target)
   - **Effort**: 4-5 hours

5. **Animation Polish** (Day 5)
   - [ ] Tune Framer Motion spring physics
   - [ ] Add stagger animations to chart grids
   - [ ] Add page transition animations
   - [ ] Test 60fps performance
   - [ ] Add reduced-motion support
   - **Effort**: 2-3 hours

**Deliverable**: Production-ready dashboard

---

## Progress Tracking

Track daily progress in `progress.md`:
- Tasks completed
- Blockers encountered
- Key decisions made
- Screenshots/demos

---

## Total Estimated Effort

| Phase | Days | Hours |
|-------|------|-------|
| Phase 1 | 5 | 12-14 |
| Phase 2 | 5 | 11-15 |
| Phase 3 | 5 | 12-16 |
| Phase 4 | 5 | 11-16 |
| Phase 5 | 5 | 16-22 |
| **Total** | **25** | **62-83** |

**Timeline**: 5 weeks (assuming ~12-17 hours/week)

---

## Dependencies & Risks

### Dependencies
- Recharts library (install Week 1)
- Difficulty field in database (Week 3)
- Existing session/feedback data

### Risks
- **Chart performance**: May need optimization if many sessions
  - Mitigation: Pagination, virtualization, lazy loading
- **Forecast accuracy**: Simple linear regression may not be accurate
  - Mitigation: Start simple, enhance later with better ML
- **Mobile UX**: Complex charts may not work well on small screens
  - Mitigation: Simplify mobile layouts, hide less critical charts

---

**Last Updated**: 2025-11-09

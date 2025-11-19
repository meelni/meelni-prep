# Dashboard Charts Redesign Project

**Branch**: `saviii/dashboard-charts-redesign`
**Start Date**: 2025-11-09
**Status**: In Progress

---

## Project Overview

Redesigning the Overview and Analytics sections to:
1. **Differentiate sections** - Overview (action-oriented) vs Analytics (insight-oriented)
2. **Integrate EvilChart library** - Modern, interactive charts with tactical aesthetic
3. **Improve UX** - Clear purpose, no redundancy, better data visualization

---

## Team Structure

- **Product Manager**: Strategic direction, section differentiation, user stories
- **UI Designer**: Chart selection, design system, responsive layouts
- **Developer**: Implementation (you!)

---

## Key Deliverables

### Product Strategy
- [x] Overview Section: Tactical command center ("What should I do now?")
- [x] Analytics Section: Performance intelligence ("How am I improving?")
- [x] Clear data allocation between sections
- [x] User stories and success metrics

### Design Specifications
- [x] 7 EvilChart components selected and mapped to metrics
- [x] Color scheme adapted to Meelni purple-blue theme
- [x] Responsive layouts (mobile + desktop)
- [x] Interaction patterns with Framer Motion
- [x] Component migration plan

### Implementation
- [ ] Phase 1: Foundation (Week 1)
- [ ] Phase 2: Distribution & Comparison (Week 2)
- [ ] Phase 3: Advanced Insights (Week 3)
- [ ] Phase 4: Overview Refinement (Week 4)
- [ ] Phase 5: Polish & Optimization (Week 5)

---

## Documentation Structure

```
.claude/dashboard-redesign/
├── README.md                    # This file - project overview
├── product-strategy.md          # PM's strategic brief
├── design-specification.md      # Designer's comprehensive spec
├── implementation-plan.md       # Phased rollout with tasks
├── progress.md                  # Daily progress tracking
└── decisions.md                 # Key decisions and trade-offs
```

---

## Quick Reference

### Selected Charts
1. **ClippedAreaChart** → Performance Trend (scores over time)
2. **GlowingStrokeRadarChart** → Competency Breakdown (5 skills)
3. **RoundedPieChart** → Interview Type Distribution
4. **GradientBarChart** → Time Investment (minutes/week)
5. **DefaultMultipleBarChart** → Score by Interview Type
6. **GlowingBarVerticalChart** → Difficulty Progression
7. **PartialLineChart** → Score Improvement + Forecast

### Primary Colors
- `--chart-1`: `oklch(0.70 0.22 285)` (Meelni purple-blue)
- `--chart-2`: `oklch(0.65 0.20 240)` (Deeper blue)
- `--chart-3`: `oklch(0.75 0.18 300)` (Lighter purple)

### Data Requirements
- ✅ Available: session scores, competencies, types, timestamps
- ⚠️ Missing: `difficulty` field (need schema update for Phase 3)

---

## Success Metrics

- **Time on Analytics**: 2-3 min (up from 30s)
- **Chart interactions**: 5+ per session
- **Return rate**: +10% increase
- **Mobile usage**: 40%+ of views

---

## Next Steps

1. Install recharts 2.15.4
2. Copy EvilChart components to `/components/charts/`
3. Add color variables to `globals.css`
4. Implement first chart: ClippedAreaChart (Performance Trend)

---

**Last Updated**: 2025-11-09

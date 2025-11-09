# Key Decisions & Trade-offs

---

## Decision Log

### D-001: EvilChart Library Selection
**Date**: 2025-11-09
**Decision**: Use EvilChart components (recharts-based) instead of building custom charts
**Rationale**:
- Pre-built components match tactical aesthetic
- Saves ~20-30 hours of chart development
- Professional animations and interactions included
- Based on recharts (proven, stable library)

**Trade-offs**:
- Less control over exact behavior
- Need to adapt color scheme to match Meelni brand
- Bundle size increase (~100KB for recharts)

**Outcome**: Accepted - value outweighs trade-offs

---

### D-002: Section Differentiation Strategy
**Date**: 2025-11-09
**Decision**: Strictly separate Overview (action) from Analytics (insight)
**Rationale**:
- User feedback: sections feel redundant
- Different user mindsets: "What should I do?" vs "How am I doing?"
- Reduces cognitive load in Overview

**Trade-offs**:
- More navigation clicks (switch between sections)
- Some data duplication (e.g., total sessions in both)

**Outcome**: Accepted - clear purpose more important than convenience

---

### D-003: Replace Existing CompetencyRadar
**Date**: 2025-11-09
**Decision**: Replace current CompetencyRadar with GlowingStrokeRadarChart
**Rationale**:
- Superior visual design (glow effect)
- Better matches tactical aesthetic
- Existing component is basic

**Trade-offs**:
- Migration effort (~2-3 hours)
- Potential data mapping changes

**Outcome**: Accepted - minimal effort, significant UX improvement

---

### D-004: Add Forecast to Score Chart
**Date**: 2025-11-09
**Decision**: Replace simple line chart with PartialLineChart (includes forecast)
**Rationale**:
- Shows trajectory, more motivational
- Helps users see progress trend
- PartialLineChart has solid/dashed line feature

**Trade-offs**:
- Need to implement forecast logic (linear regression)
- Forecast may not be accurate with <10 sessions
- Additional complexity

**Outcome**: Accepted - start with simple linear regression, enhance later

---

### D-005: Defer Difficulty Field to Phase 3
**Date**: 2025-11-09
**Decision**: Don't block Phase 1/2 on difficulty field, add in Phase 3
**Rationale**:
- Schema changes require migration
- Most charts don't depend on difficulty
- Can deliver value faster without it

**Trade-offs**:
- Can't implement GlowingBarVerticalChart until Phase 3
- Need to backfill data later

**Outcome**: Accepted - phased approach reduces risk

---

### D-006: CSS-Only Sparkline for Overview
**Date**: 2025-11-09
**Decision**: Use CSS-only sparkline instead of mini chart library
**Rationale**:
- Overview should be minimal charts
- CSS implementation is simpler (~50 lines)
- No additional bundle size

**Trade-offs**:
- Less interactive than full chart
- No tooltips or animations

**Outcome**: Accepted - aligns with Overview philosophy

---

### D-007: Mobile-First Responsive Approach
**Date**: 2025-11-09
**Decision**: Design mobile layouts first, then enhance for desktop
**Rationale**:
- 40%+ of users may access dashboard on mobile
- Charts harder to design for mobile (limited space)
- Forces simplification

**Trade-offs**:
- Desktop layouts may not use full space
- Some charts may need mobile-specific versions

**Outcome**: Accepted - better to ensure mobile works well

---

### D-008: Phased 5-Week Rollout
**Date**: 2025-11-09
**Decision**: Ship incrementally over 5 weeks instead of big-bang release
**Rationale**:
- Reduces risk (can test each phase)
- Gets value to users faster
- Easier to debug and iterate

**Trade-offs**:
- Users see incomplete dashboard during rollout
- Need to maintain both old and new code temporarily

**Outcome**: Accepted - incremental delivery preferred

---

## Open Questions

### Q-001: Platform Average Scores
**Question**: Should we show platform-wide average scores for comparison?
**Status**: Deferred to Phase 2+
**Notes**: Need to calculate anonymized averages, privacy considerations

### Q-002: Export Functionality
**Question**: Should charts be exportable (PNG, PDF)?
**Status**: Deferred to Phase 5
**Notes**: Nice-to-have, not MVP

### Q-003: Real-time Updates
**Question**: Should charts update in real-time as sessions complete?
**Status**: Deferred
**Notes**: Would need WebSocket or polling, adds complexity

---

**Last Updated**: 2025-11-09

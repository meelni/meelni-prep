# Design Specification: EvilChart Integration

**Author**: UI Designer Agent
**Date**: 2025-11-09

---

## Chart Mapping Summary

| Metric | EvilChart Component | Rationale |
|--------|---------------------|-----------|
| Performance Trend | ClippedAreaChart | Gradient fill + clipping animation, interactive value display |
| Competency Breakdown | GlowingStrokeRadarChart | Perfect for multi-dimensional skills, premium glow effect |
| Interview Type Distribution | RoundedPieChart | Standard part-to-whole, rounded corners match brand |
| Time Investment | GradientBarChart | Best for time-series comparison, gradient adds polish |
| Score by Interview Type | DefaultMultipleBarChart | Compare personal vs avg, dotted background = tactical |
| Difficulty Progression | GlowingBarVerticalChart | Stacked horizontal bars show progression, glow effect |
| Score Improvement + Forecast | PartialLineChart | Solid/dashed segments for actual/projected |

---

## Color Scheme

### CSS Variables (add to globals.css)

```css
:root {
  /* Primary chart colors */
  --chart-1: 186 75% 70%; /* oklch(0.70 0.22 285) - Meelni purple-blue */
  --chart-2: 207 70% 65%; /* Deeper blue */
  --chart-3: 260 68% 75%; /* Lighter purple */
  --chart-4: 225 63% 68%; /* Muted blue-purple */
  --chart-5: 225 40% 50%; /* Muted gray-blue */
  --chart-6: 186 80% 75%; /* Bright accent */

  /* Gradient stops */
  --chart-gradient-from: oklch(0.70 0.22 285 / 0.8);
  --chart-gradient-to: oklch(0.70 0.22 285 / 0.1);

  /* Glow effect */
  --chart-glow: oklch(0.70 0.22 285 / 0.5);
}
```

---

## Layout Grids

### Analytics Section (Desktop ≥1024px)

```
Row 1: Performance Trend | Competency Radar     (400px height)
Row 2: Score Improvement (full-width)           (480px height)
Row 3: Type Distribution | Score by Type        (400px height)
Row 4: Time Investment (full-width)             (400px height)
Row 5: Difficulty Progression (full-width)      (400px height)
```

### Mobile (<768px)
Single column, same order, heights 300px each.

---

## Component Migration

### Replace: CompetencyRadar → GlowingStrokeRadarChart
- **Effort**: Low (2-3 hours)
- **Data mapping**: Convert 1-5 scores to 0-100 scale
- **Color**: Single series, chart-1 with glow

### Replace: ScoreChart → PartialLineChart
- **Effort**: Medium (4-6 hours)
- **Data mapping**: Actual + forecast (linear regression)
- **Color**: Solid (actual) + dashed 50% opacity (forecast)

### Keep: StatsCards, SessionList
- No changes needed
- Add trend badges (↑ ↓ →)

---

## Interaction Patterns

### Global Standards
- **Hover**: `transition-all duration-200`, scale-[1.005], tooltip with spring
- **Click**: Ripple effect, navigate or filter
- **Animation**: Framer Motion spring (stiffness: 400, damping: 30)

### Per-Chart Interactions

**ClippedAreaChart**:
- Hover: Vertical crosshair, tooltip `{date}: {score}/5.0`
- Click: Navigate to session detail

**GlowingStrokeRadarChart**:
- Hover axis: Highlight, show score tooltip
- Click axis: Filter by competency
- Glow pulse on hover (1s cycle)

**RoundedPieChart**:
- Hover: Expand segment 10px, show `{type}: {count} ({%})`
- Click: Filter to that type

**GradientBarChart**:
- Hover: Darken gradient, show `{minutes} min ({count} sessions)`
- Click: Expand to session list modal

---

## Responsive Design

### Chart Heights
```typescript
const chartHeights = {
  mobile: "h-[300px]",
  desktop: "h-[400px]",
  wide: "h-[480px]", // Trend charts
};
```

### Grid Classes
```tsx
// Analytics Section
<div className="grid gap-6">
  {/* Row 1 */}
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <Card>{performanceTrend}</Card>
    <Card>{competencyRadar}</Card>
  </div>

  {/* Row 2 - full width */}
  <Card>{scoreImprovement}</Card>

  {/* Row 3 */}
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <Card>{typeDist}</Card>
    <Card>{scoreByType}</Card>
  </div>
</div>
```

---

## Data Mappings

### ClippedAreaChart (Performance Trend)
```typescript
data = sessions.map(s => ({
  date: format(s.started_at, 'MMM d'),
  score: s.feedback.overall_score * 20 // 1-5 → 0-100
}))
```

### GlowingStrokeRadarChart (Competency)
```typescript
data = [
  { competency: 'Structure', score: avgStructure * 20 },
  { competency: 'Clarity', score: avgClarity * 20 },
  { competency: 'Insight', score: avgInsight * 20 },
  { competency: 'Communication', score: avgCommunication * 20 },
  { competency: 'Leadership', score: avgLeadership * 20 },
]
```

### RoundedPieChart (Type Distribution)
```typescript
data = [
  { type: 'Product Sense', count: psCount, fill: 'var(--chart-1)' },
  { type: 'Analytical', count: anCount, fill: 'var(--chart-2)' },
  { type: 'Leadership', count: ldCount, fill: 'var(--chart-3)' },
  { type: 'Strategy', count: stCount, fill: 'var(--chart-4)' },
]
```

---

## Implementation Checklist

**Phase 1 (Week 1)**:
- [ ] Install recharts 2.15.4
- [ ] Copy 7 EvilChart components to `/components/charts/`
- [ ] Add color variables to globals.css
- [ ] Implement ClippedAreaChart wrapper
- [ ] Replace CompetencyRadar with GlowingStrokeRadarChart
- [ ] Create Analytics section with filters bar

**Phase 2 (Week 2)**:
- [ ] Implement RoundedPieChart
- [ ] Implement DefaultMultipleBarChart
- [ ] Implement GradientBarChart
- [ ] Wire up filter interactions

**Phase 3 (Week 3)**:
- [ ] Implement PartialLineChart + forecast logic
- [ ] Add difficulty field to schema
- [ ] Implement GlowingBarVerticalChart

---

## Success Metrics

- **Time on Analytics**: 2-3 min (up from 30s)
- **Chart interactions**: 5+ per session
- **Filter usage**: 60%+ apply filters
- **Mobile usage**: 40%+ of views

---

**Last Updated**: 2025-11-09

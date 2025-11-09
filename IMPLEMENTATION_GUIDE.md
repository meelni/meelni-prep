# Implementation Guide: Optimized Setup Flow

## Overview

This document provides step-by-step implementation instructions for the optimized single-page setup flow described in `UX_REVIEW_REPORT.md`.

---

## Implementation Phases

### Phase 1: Core Components (Priority: HIGH)

#### 1.1 Create Optimized Components Directory

```bash
mkdir -p /Users/savi/conductor/meelni-prep/app/setup/components-optimized
```

**Files to create:**
- `interview-type-selector.tsx`
- `difficulty-selector.tsx`
- `advanced-settings-panel.tsx`
- `setup-summary-card.tsx`
- `start-button.tsx`

#### 1.2 Interview Type Selector Component

**File:** `app/setup/components-optimized/interview-type-selector.tsx`

**Key Features:**
- Reuses existing `ROUND_TYPES` config
- Grid layout: 4 columns on desktop, 2 on tablet, 1 on mobile
- Visual selection state with checkmark
- Hover effects and transitions

**Changes from existing `round-selector.tsx`:**
- Simpler prop interface (no need for step navigation)
- More compact card design
- Clearer "REQUIRED" messaging

#### 1.3 Difficulty Selector Component

**File:** `app/setup/components-optimized/difficulty-selector.tsx`

**Key Features:**
- Default value: "intermediate"
- Visual "RECOMMENDED" badge on intermediate option
- 3-column grid layout
- Clear visual hierarchy

**New compared to existing:**
- Pre-selected state with recommendation indicator
- Smaller, more compact design
- Integrated explanation of recommendation

#### 1.4 Setup Summary Card Component

**File:** `app/setup/components-optimized/setup-summary-card.tsx`

**Purpose:** Display smart defaults being used

**Content:**
```tsx
interface SetupSummaryCardProps {
  config: InterviewConfig;
}

export function SetupSummaryCard({ config }: SetupSummaryCardProps) {
  return (
    <Card className="border-muted bg-muted/30">
      <div className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <InfoIcon className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Using smart defaults:</h3>
        </div>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Current Trends questions (2024)</li>
          <li>• Tessa voice (professional, natural)</li>
          <li>• Feedback at end of interview</li>
          <li>• {config.duration} minute session</li>
        </ul>
      </div>
    </Card>
  );
}
```

#### 1.5 Start Button Component

**File:** `app/setup/components-optimized/start-button.tsx`

**Key Features:**
- Full-width primary button
- Disabled state when required fields missing
- Loading spinner during session creation
- Clear error messaging

**Props:**
```tsx
interface StartButtonProps {
  onClick: () => void;
  disabled: boolean;
  isLoading: boolean;
}
```

---

### Phase 2: Advanced Settings Panel (Priority: MEDIUM)

#### 2.1 Collapsible Panel Component

**File:** `app/setup/components-optimized/advanced-settings-panel.tsx`

**Structure:**
```tsx
<Card>
  <CardHeader onClick={onToggle}>
    <div className="flex items-center justify-between">
      <div>
        <h3>Advanced Settings</h3>
        <Badge>Optional</Badge>
      </div>
      <ChevronDownIcon />
    </div>
  </CardHeader>

  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
      >
        <CardContent>
          {/* All existing advanced settings */}
          <QuestionPoolSelector />
          <VoiceSelector />
          <DurationOptions />
          <FeedbackModeSelector />
          <SpeechSpeedSlider />
          <VolumeSlider />
          <EmotionSelector />
        </CardContent>
      </motion.div>
    )}
  </AnimatePresence>
</Card>
```

**Reuse existing components:**
- `question-pool-selector.tsx`
- `voice-selector.tsx`
- Advanced settings from `advanced-settings.tsx`

**Changes:**
- Wrap all in collapsible container
- Add header with "Optional" badge
- Smooth expand/collapse animation

---

### Phase 3: Main Page Refactor (Priority: HIGH)

#### 3.1 Replace Multi-Step Logic with Single-Page

**File:** `app/setup/page.tsx`

**State Simplification:**

**Before:**
```tsx
const [step, setStep] = useState(1);
const [roundType, setRoundType] = useState<RoundType | null>(null);
const [difficulty, setDifficulty] = useState<DifficultyLevel | null>(null);
const [config, setConfig] = useState<InterviewConfig>(DEFAULT_CONFIG);
```

**After:**
```tsx
const [selections, setSelections] = useState({
  roundType: null as RoundType | null,
  difficulty: 'intermediate' as DifficultyLevel,
  showAdvanced: false,
  config: DEFAULT_CONFIG,
});
```

**Remove:**
- Step navigation state and logic
- Progress indicator (5-step stepper)
- `canProceedToStep2`, `canProceedToStep3` validation flags
- Step-based AnimatePresence switching

**Add:**
- Single-page layout with all sections visible
- Scroll-based user experience
- Simpler validation: `canStartInterview = roundType !== null`

---

### Phase 4: Responsive Design (Priority: MEDIUM)

#### 4.1 Breakpoints

```css
/* Mobile: < 768px */
.interview-type-grid {
  grid-template-columns: repeat(1, 1fr);
}

.difficulty-grid {
  grid-template-columns: repeat(1, 1fr);
}

/* Tablet: 768px - 1024px */
@media (min-width: 768px) {
  .interview-type-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .difficulty-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* Desktop: > 1024px */
@media (min-width: 1024px) {
  .interview-type-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

#### 4.2 Mobile Optimizations

- Increase touch target sizes (min 44x44px)
- Stack all sections vertically
- Full-width buttons
- Larger text for better readability
- Reduce animations on mobile for performance

---

### Phase 5: Analytics & Tracking (Priority: MEDIUM)

#### 5.1 Event Tracking

**Events to implement:**

```typescript
// Page view
trackEvent('setup_page_viewed', {
  user_id: user.id,
  timestamp: Date.now(),
});

// Interview type selected
trackEvent('interview_type_selected', {
  type: roundType,
  timestamp: Date.now(),
});

// Difficulty changed from default
if (difficulty !== 'intermediate') {
  trackEvent('difficulty_changed', {
    from: 'intermediate',
    to: difficulty,
  });
}

// Advanced settings expanded
trackEvent('advanced_settings_expanded', {
  timestamp: Date.now(),
});

// Individual advanced setting changed
trackEvent('advanced_setting_changed', {
  setting: 'voice',
  value: newVoice,
});

// Setup completed
trackEvent('setup_completed', {
  duration: timeToComplete,
  customized: didCustomize,
  round_type: roundType,
  difficulty: difficulty,
  advanced_expanded: showAdvanced,
});

// Setup abandoned
window.addEventListener('beforeunload', () => {
  if (selections.roundType && !sessionStarted) {
    trackEvent('setup_abandoned', {
      last_step: 'incomplete',
      round_type: selections.roundType,
    });
  }
});
```

#### 5.2 Metrics Dashboard

**Track in analytics:**
- Setup completion rate (started → completed)
- Time to complete (median, p50, p95)
- Advanced settings usage rate
- Default acceptance rate (no customization)
- Mobile vs. desktop completion rates
- Drop-off points (interview type not selected, etc.)

---

### Phase 6: Testing & Validation (Priority: HIGH)

#### 6.1 Unit Tests

**Test files:**
```
app/setup/components-optimized/__tests__/
├── interview-type-selector.test.tsx
├── difficulty-selector.test.tsx
├── advanced-settings-panel.test.tsx
├── setup-summary-card.test.tsx
└── start-button.test.tsx
```

**Key test cases:**

```typescript
// Interview Type Selector
describe('InterviewTypeSelector', () => {
  it('renders all 4 interview types', () => {
    // Assert 4 cards rendered
  });

  it('calls onSelect when type clicked', () => {
    // Simulate click, assert callback
  });

  it('shows selected state visually', () => {
    // Assert checkmark, border color
  });
});

// Difficulty Selector
describe('DifficultySelector', () => {
  it('defaults to intermediate', () => {
    // Assert intermediate pre-selected
  });

  it('shows RECOMMENDED badge on intermediate', () => {
    // Assert badge visible
  });

  it('allows changing difficulty', () => {
    // Click beginner, assert selected
  });
});

// Start Button
describe('StartButton', () => {
  it('is disabled when interview type not selected', () => {
    // Assert button disabled
  });

  it('shows loading state when isLoading=true', () => {
    // Assert spinner visible
  });

  it('calls onClick when clicked', () => {
    // Simulate click, assert callback
  });
});
```

#### 6.2 Integration Tests

**Test file:** `app/setup/__tests__/setup-flow.test.tsx`

```typescript
describe('Setup Flow Integration', () => {
  it('completes full setup with defaults', async () => {
    render(<SetupPage />);

    // Select interview type
    const productSenseCard = screen.getByText('Product Sense');
    fireEvent.click(productSenseCard);

    // Start button should be enabled
    const startButton = screen.getByText('Start Interview');
    expect(startButton).not.toBeDisabled();

    // Click start
    fireEvent.click(startButton);

    // Assert navigation to interview
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith(
        expect.stringContaining('/interview')
      );
    });
  });

  it('allows customizing advanced settings', async () => {
    render(<SetupPage />);

    // Expand advanced settings
    const advancedHeader = screen.getByText('Advanced Settings');
    fireEvent.click(advancedHeader);

    // Assert settings visible
    expect(screen.getByText('Question Pool')).toBeInTheDocument();

    // Change a setting
    const voiceSelector = screen.getByLabelText('Voice');
    fireEvent.change(voiceSelector, { target: { value: 'british-male' } });

    // Assert config updated
    expect(selections.config.voice).toBe('british-male');
  });
});
```

#### 6.3 E2E Tests

**Test file:** `e2e/setup-flow.spec.ts` (Playwright)

```typescript
test('user can complete setup and start interview', async ({ page }) => {
  // Navigate to setup
  await page.goto('/setup');

  // Wait for page load
  await page.waitForSelector('text=Setup Your Mock Interview');

  // Select interview type
  await page.click('text=Product Sense');

  // Verify difficulty defaults to intermediate
  await expect(page.locator('text=RECOMMENDED')).toBeVisible();

  // Click start
  await page.click('button:has-text("Start Interview")');

  // Wait for navigation to interview page
  await page.waitForURL(/.*interview.*/);

  // Assert interview page loaded
  await expect(page.locator('text=Interview Session')).toBeVisible();
});

test('advanced settings are collapsible', async ({ page }) => {
  await page.goto('/setup');

  // Advanced settings should be collapsed initially
  await expect(page.locator('text=Question Pool')).not.toBeVisible();

  // Expand advanced settings
  await page.click('text=Advanced Settings');

  // Now settings should be visible
  await expect(page.locator('text=Question Pool')).toBeVisible();

  // Collapse again
  await page.click('text=Advanced Settings');

  // Settings hidden
  await expect(page.locator('text=Question Pool')).not.toBeVisible();
});
```

---

### Phase 7: Deployment Strategy (Priority: HIGH)

#### 7.1 Feature Flag Setup

**Environment variable:**
```bash
# .env.local
NEXT_PUBLIC_ENABLE_OPTIMIZED_SETUP=true
```

**Implementation:**
```typescript
// app/setup/page.tsx
import SetupPageOptimized from './page-optimized';
import SetupPageLegacy from './page-legacy';

export default function SetupPage() {
  const useOptimized = process.env.NEXT_PUBLIC_ENABLE_OPTIMIZED_SETUP === 'true';

  return useOptimized ? <SetupPageOptimized /> : <SetupPageLegacy />;
}
```

#### 7.2 Rollout Plan

**Week 1:**
- Deploy with feature flag OFF (default to legacy)
- Internal testing with team
- Fix critical bugs

**Week 2:**
- Enable for 10% of users (A/B test)
- Monitor metrics:
  - Setup completion rate
  - Time to complete
  - Error rates
  - User feedback

**Week 3:**
- If metrics positive: Increase to 50%
- Continue monitoring

**Week 4:**
- If metrics still positive: Roll out to 100%
- Remove legacy code after 2 weeks of 100% rollout

#### 7.3 Rollback Procedure

**If critical issues detected:**

1. Set `NEXT_PUBLIC_ENABLE_OPTIMIZED_SETUP=false` in environment
2. Redeploy (takes ~5 minutes)
3. All users immediately revert to legacy flow
4. Investigate issues, fix, and re-test

---

## Code Quality Checklist

### Before Deployment

- [ ] All TypeScript types defined (no `any`)
- [ ] ESLint passes with no warnings
- [ ] Prettier formatting applied
- [ ] Unit tests pass (>80% coverage)
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Accessibility audit (WCAG 2.1 AA compliance)
- [ ] Mobile responsive tested on real devices
- [ ] Performance audit (Lighthouse score >90)
- [ ] Analytics events implemented and tested
- [ ] Error boundaries in place
- [ ] Loading states defined for all async operations

### Accessibility Requirements

- [ ] All interactive elements have ARIA labels
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Focus states visible
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Screen reader tested (VoiceOver, NVDA)
- [ ] Form validation announces errors
- [ ] Skip links for keyboard users

---

## Performance Targets

### Lighthouse Scores (Desktop)
- **Performance:** >90
- **Accessibility:** 100
- **Best Practices:** 100
- **SEO:** >90

### Core Web Vitals
- **LCP (Largest Contentful Paint):** <2.5s
- **FID (First Input Delay):** <100ms
- **CLS (Cumulative Layout Shift):** <0.1

### Bundle Size
- **Setup page JS:** <100KB gzipped
- **Total page weight:** <500KB
- **Code-split advanced settings:** Lazy-loaded

---

## Documentation Updates

### Files to Update

1. **README.md** - Update setup flow screenshots
2. **CLAUDE.md** - Document new component structure
3. **docs/user-guide.md** - Update setup instructions
4. **CHANGELOG.md** - Add entry for setup flow optimization

### Help Center Articles

- "How to set up your first mock interview"
- "Understanding difficulty levels"
- "Customizing your interview settings"
- "What are smart defaults?"

---

## Success Criteria

### Launch Ready When:

✅ All unit/integration/E2E tests passing
✅ Accessibility audit complete (WCAG AA)
✅ Performance targets met (Lighthouse >90)
✅ Mobile responsive on iOS/Android
✅ Analytics tracking verified
✅ Error handling tested
✅ Feature flag implemented
✅ Rollback plan documented
✅ User testing completed (5+ participants)
✅ Stakeholder approval obtained

---

## Post-Launch Monitoring

### Week 1 Metrics (Daily)
- Setup completion rate vs. legacy
- Average time to complete
- Error rates and types
- Advanced settings usage
- Support tickets related to setup

### Week 2-4 Metrics (Weekly)
- User satisfaction surveys
- A/B test results (if applicable)
- Mobile vs. desktop performance
- Browser compatibility issues
- Conversion rate impact

### Iteration Triggers

**If completion rate decreases >10%:**
- Review analytics for drop-off points
- Conduct user interviews
- Consider UX tweaks

**If time-to-complete increases:**
- Investigate performance issues
- Review user confusion points
- Simplify further if needed

**If advanced settings usage >40%:**
- Consider surfacing more options by default
- Re-evaluate what should be "advanced"

---

## Appendix: Component Code Snippets

### Interview Type Selector (Simplified)

```tsx
"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { ROUND_TYPES, RoundType } from "@/lib/interview-config";
import { fadeInUp, staggerContainer } from "@/lib/animations";

interface InterviewTypeSelectorProps {
  selected: RoundType | null;
  onSelect: (type: RoundType) => void;
}

export function InterviewTypeSelector({ selected, onSelect }: InterviewTypeSelectorProps) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="initial"
      animate="animate"
      className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
    >
      {(Object.keys(ROUND_TYPES) as RoundType[]).map((type) => {
        const config = ROUND_TYPES[type];
        const isSelected = selected === type;

        return (
          <motion.div key={type} variants={fadeInUp}>
            <Card
              className={`
                cursor-pointer transition-all duration-200 p-5
                hover:scale-[1.02] hover:shadow-md
                ${isSelected ? "border-primary ring-2 ring-primary/20" : "border-border"}
              `}
              onClick={() => onSelect(type)}
            >
              {/* Card content */}
            </Card>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
```

### Difficulty Selector (With Default)

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { DIFFICULTY_LEVELS, DifficultyLevel } from "@/lib/interview-config";

interface DifficultySelectorProps {
  selected: DifficultyLevel;
  onSelect: (difficulty: DifficultyLevel) => void;
}

export function DifficultySelector({ selected, onSelect }: DifficultySelectorProps) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {(Object.keys(DIFFICULTY_LEVELS) as DifficultyLevel[]).map((level) => {
        const config = DIFFICULTY_LEVELS[level];
        const isSelected = selected === level;
        const isRecommended = level === 'intermediate';

        return (
          <Card
            key={level}
            className={`
              cursor-pointer transition-all p-5
              ${isSelected ? "border-primary ring-2 ring-primary/20" : "border-border"}
            `}
            onClick={() => onSelect(level)}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">{config.label}</h4>
                {isRecommended && (
                  <Badge variant="outline" className="text-xs">
                    RECOMMENDED
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{config.description}</p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
```

---

**Document Version:** 1.0
**Last Updated:** 2025-11-07
**Implementation Status:** Ready for development

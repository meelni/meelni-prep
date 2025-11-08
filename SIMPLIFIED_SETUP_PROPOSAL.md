# Simplified Setup Flow Proposal

**Date:** 2025-11-07
**Issue:** #70 - UX Review: Simplify interview setup flow
**Philosophy:** Users want to practice interviews, not configure AI systems

---

## Executive Summary

**Current State:** 5-step wizard with ~10 configuration parameters, ~3 minutes to start
**Proposed State:** 2-step flow with 2 user choices, ~20 seconds to start
**Impact:** -90% time to start, +50% conversion rate (estimated)

**Key Insight:** We're the experts on voice quality, models, and technical parameters. Users shouldn't configure these - we should optimize them on the backend.

---

## The Problem with Advanced Controls

### What Users Currently Configure (but shouldn't)
- ❌ Voice model selection (Tessa, British Male, etc.)
- ❌ Speech speed (0.6x - 1.5x slider)
- ❌ Emotion selection (6 options)
- ❌ Volume control (0.5x - 2.0x)
- ❌ STT/TTS/LLM model selection
- ❌ Feedback mode (real-time vs end-only)

### Why This Is Wrong
1. **Users don't know what optimal settings are** - They guess, often incorrectly
2. **Bad settings = bad experience** - Users blame the product, not their config
3. **Conversion killer** - 5 steps with 10+ parameters = high abandonment
4. **Mobile unfriendly** - Sliders and dropdowns don't work well on mobile
5. **Prevents iteration** - Can't A/B test backend improvements without UI changes

---

## Proposed Solution: 2-Step Setup

### Step 1: Interview Type (Required)
4 clear options with descriptions:

```
┌─────────────┐  ┌─────────────┐
│ 💡 Product  │  │ 👥 Behavioral│
│    Sense    │  │              │
│             │  │              │
│ Design &    │  │ Leadership & │
│ Strategy    │  │ STAR Stories │
└─────────────┘  └─────────────┘

┌─────────────┐  ┌─────────────┐
│ 🎯 Execution│  │ 📈 Strategy  │
│             │  │              │
│ Metrics &   │  │ Market &     │
│ Roadmaps    │  │ Business     │
└─────────────┘  └─────────────┘
```

### Step 2: Difficulty Level (Required)
3 clear levels mapped to experience:

```
┌──────────────────────────────────────┐
│ 🌱 Junior/APM (0-2 years)            │
│    Patient coaching, learning mode   │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ ⚡ IC PM (2-4 years)                 │
│    Balanced, standard interview bar  │
└──────────────────────────────────────┘

┌──────────────────────────────────────┐
│ 🏆 Senior PM (5+ years)              │
│    High bar, strategic deep-dives    │
└──────────────────────────────────────┘
```

**That's it. Click "Start Interview" and go.**

**Total clicks:** 3 (type → difficulty → start)
**Total time:** ~20 seconds
**Technical decisions:** 0

---

## System-Managed Defaults

### Voice & Speech Configuration
```typescript
const OPTIMAL_DEFAULTS = {
  // Voice model (we picked the best one)
  voice: "6ccbfb76-1fc6-48f7-b71d-91ac6298247b", // Tessa - emotive, professional
  tts_model: "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b",

  // Speech parameters (optimized through testing)
  speed: 1.0,          // Natural speaking pace
  emotion: "professional", // Balanced, trustworthy tone
  volume: 1.0,         // Standard volume

  // Models (best quality/cost ratio)
  stt_model: "deepgram/nova-3",     // Best ASR accuracy
  llm_model: "openai/gpt-4.1-mini", // Cost-effective dialogue
};
```

### Interview Duration (Smart Defaults)
```typescript
const SMART_DURATION = {
  behavioral: 30,     // STAR stories need time
  product_sense: 45,  // Design problems are longer
  execution: 40,      // Metrics analysis needs depth
  strategy: 45,       // Strategic thinking requires exploration
};
// Auto-set based on interview type - users don't choose
```

### Question Pool (Always Recent)
```typescript
const SMART_QUESTIONS = {
  recency: "very_recent", // Last 1 year (2024 questions)
  recentDays: 365,
};
// Can add user toggle later if needed, but default is best
```

### Feedback Mode (End-Only)
```typescript
const OPTIMAL_FEEDBACK = {
  feedback_mode: "end_only", // Don't interrupt flow
};
// Real-time feedback is distracting - save it for the end
```

---

## Impact Analysis

| Metric | Current (5 steps) | Proposed (2 steps) | Delta |
|--------|-------------------|--------------------|-------|
| User choices | ~10 parameters | **2 parameters** | **-80%** |
| Steps to complete | 5 steps | **2 steps** | **-60%** |
| Time to start | ~3 minutes | **~20 seconds** | **-90%** |
| Clicks required | ~7-8 clicks | **3 clicks** | **-60%** |
| Conversion rate | ~60% (est.) | **~90% (est.)** | **+50%** |
| Mobile-friendly | ❌ Complex forms | ✅ **Tap and go** | ✅ |
| Backend control | ❌ Users configure | ✅ **We optimize** | ✅ |

---

## What About Power Users?

### Phase 1: Ship Simple (Now)
- Launch 2-step flow
- Monitor user feedback
- Track feature requests
- **Don't assume users need knobs**

### Phase 2: Add Optional Preferences (Maybe Later)
If users actually ask for customization:
- Add collapsed "Preferences" section (hidden by default)
- **Only** expose high-level choices like:
  - Question pool recency ("Latest trends" vs "Broader practice")
  - Feedback timing ("After each answer" vs "End only")
- **Still hide** technical parameters (voice, models, etc.)

### Never Expose
These are infrastructure concerns, not user features:
- ❌ Voice model selection
- ❌ Speech speed/emotion/volume sliders
- ❌ STT/LLM/TTS model configuration
- ❌ Any technical parameters

**Why?** Because 99% of users don't care, and the 1% who do would likely optimize incorrectly.

---

## Implementation Plan

### Phase 1: Cleanup (Remove Complexity)

#### 1.1 Delete Unnecessary Components
```bash
# Remove these files entirely
rm /app/setup/components/voice-selector.tsx
rm /app/setup/components/advanced-settings.tsx
rm /app/setup/components/setup-summary.tsx
```

#### 1.2 Simplify Config Interface
```typescript
// Old interface (too complex)
export interface InterviewConfig {
  roundType: RoundType;
  difficulty: DifficultyLevel;
  voice: string;          // ❌ Remove
  speed: number;          // ❌ Remove
  emotion: string;        // ❌ Remove
  volume: number;         // ❌ Remove
  duration: number;       // ❌ Remove (auto-set)
  feedback_mode: string;  // ❌ Remove (always end_only)
  questionPreference: {   // ❌ Remove (always recent)
    recency: string;
    recentDays: number;
  };
  stt_model: string;      // ❌ Remove (system default)
  llm_model: string;      // ❌ Remove (system default)
  tts_model: string;      // ❌ Remove (system default)
}

// New interface (minimal)
export interface MinimalInterviewConfig {
  // User choices only
  roundType: RoundType;
  difficulty: DifficultyLevel;
}

// System defaults (not exposed to users)
export const SYSTEM_DEFAULTS = {
  voice: "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
  speed: 1.0,
  emotion: "professional",
  volume: 1.0,
  stt_model: "deepgram/nova-3",
  llm_model: "openai/gpt-4.1-mini",
  tts_model: "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
  feedback_mode: "end_only",
  questionPreference: {
    recency: "very_recent",
    recentDays: 365,
  },
};
```

#### 1.3 Update `/app/setup/page.tsx`
```typescript
// Old: 5-step wizard with useState for each step
// New: 2-step flow with minimal state

export default function SetupPage() {
  const [step, setStep] = useState<1 | 2>(1);
  const [roundType, setRoundType] = useState<RoundType | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyLevel | null>(null);

  const handleStart = () => {
    // Merge user choices with system defaults
    const config = {
      roundType,
      difficulty,
      ...SYSTEM_DEFAULTS,
      duration: SMART_DURATION[roundType], // Auto-set based on type
    };

    // Navigate to interview with config
    router.push(`/interview?config=${encodeURIComponent(JSON.stringify(config))}`);
  };

  return (
    <div>
      {step === 1 && <InterviewTypeSelector value={roundType} onChange={setRoundType} />}
      {step === 2 && <DifficultySelector value={difficulty} onChange={setDifficulty} />}

      <div className="actions">
        {step === 2 && <Button onClick={() => setStep(1)}>← Back</Button>}
        {step === 1 && roundType && <Button onClick={() => setStep(2)}>Continue →</Button>}
        {step === 2 && difficulty && <Button onClick={handleStart}>Start Interview →</Button>}
      </div>
    </div>
  );
}
```

### Phase 2: Backend Auto-Configuration

#### 2.1 Update `/api/session/start`
```typescript
export async function POST(req: Request) {
  const { roundType, difficulty } = await req.json();

  // Expand minimal user choices into full config
  const fullConfig = {
    ...SYSTEM_DEFAULTS,
    roundType,
    difficulty,
    duration: SMART_DURATION[roundType], // Auto-set
  };

  // Create session with full config
  const session = await createInterviewSession(userId, fullConfig);

  return NextResponse.json({ sessionId: session.id, config: fullConfig });
}
```

#### 2.2 Update Agent Prompt Builder
```typescript
// Agent already supports difficulty levels (ADR-023)
// Just pass through the user's choice
const instructions = build_interview_prompt({
  interview_type: roundType,
  difficulty: difficulty, // "junior" | "intermediate" | "senior"
});
```

### Phase 3: Testing & Deployment

#### 3.1 Test Coverage
- [ ] Unit tests: Config merging works correctly
- [ ] Integration tests: Session creation with minimal config
- [ ] E2E tests: Full flow from setup → interview
- [ ] Mobile testing: Works on iOS/Android

#### 3.2 Analytics Tracking
```typescript
// Track simplified flow metrics
analytics.track("setup_started", { version: "v2_minimal" });
analytics.track("setup_completed", {
  roundType,
  difficulty,
  timeToComplete: elapsedSeconds,
  version: "v2_minimal",
});
```

#### 3.3 Feature Flag (Optional)
```typescript
// A/B test old vs new flow
const useSimplifiedSetup = featureFlags.get("simplified_setup_v2");

if (useSimplifiedSetup) {
  return <MinimalSetupFlow />;
} else {
  return <LegacySetupFlow />;
}
```

---

## Success Metrics

### Primary KPIs
1. **Setup Completion Rate**
   - Current: ~60% (estimated)
   - Target: >90%
   - Measure: % of users who complete setup and start interview

2. **Time to First Interview**
   - Current: ~3 minutes
   - Target: <30 seconds
   - Measure: Time from landing on /setup to /interview start

3. **User Satisfaction**
   - Current: Unknown
   - Target: >4.5/5.0
   - Measure: Post-setup survey "How easy was it to start?"

### Secondary Metrics
1. **Mobile Conversion**
   - Track setup completion on mobile vs desktop
   - Target: >85% on mobile (vs ~40% estimated now)

2. **Drop-off Points**
   - Current: Users abandon at voice selection, advanced settings
   - Target: <5% drop-off between steps

3. **Default Acceptance**
   - Track: Do users accept our defaults or request changes?
   - Target: >95% accept defaults (validates our choices)

---

## Rollback Plan

If simplified flow performs worse:

1. **Immediate Rollback**
   - Feature flag toggle to restore old flow
   - No code deployment needed

2. **Hybrid Approach**
   - Keep 2-step flow as default
   - Add "Advanced Setup" link for power users
   - Monitor usage split

3. **Incremental Refinement**
   - A/B test with 50/50 split
   - Iterate on messaging/UI
   - Don't assume failure = concept is wrong

---

## FAQs

### Q: What if users want to choose their voice?
**A:** They don't. Users want good results, not configuration. We chose Tessa because she's the best - users trust us to make that choice.

### Q: What about accessibility (speed, volume)?
**A:** System-level accessibility settings (OS-level) handle this better than in-app sliders. If users need slower speech, they can enable it globally.

### Q: Won't power users be frustrated?
**A:** The 1% who care can email us. We'll add a preferences page later if there's real demand. Don't optimize for edge cases.

### Q: How do we test different voices/models?
**A:** Backend A/B testing. Randomly assign 10% of users to Voice B, measure satisfaction. No UI changes needed.

### Q: What if our defaults are wrong?
**A:** We iterate on the backend. Update `SYSTEM_DEFAULTS` and deploy. Users get better experience automatically.

---

## Recommendation

**✅ Ship the 2-step flow immediately.**

**Why This Will Work:**
1. **Reduces friction** - 3 clicks vs 8 clicks
2. **Increases trust** - "We've optimized everything for you"
3. **Enables iteration** - Backend changes don't require UI updates
4. **Better on mobile** - No sliders, just taps
5. **Higher conversion** - Less decision fatigue

**What NOT to Do:**
- ❌ Keep advanced settings "just in case"
- ❌ Add a "Simple vs Advanced" toggle
- ❌ Expose technical parameters to users
- ❌ Assume power users need customization

**Next Steps:**
1. Delete advanced components
2. Simplify `/app/setup/page.tsx`
3. Ship behind feature flag
4. Monitor conversion rates
5. Celebrate when it works

---

## Appendix: Before/After Comparison

### Before (Current Flow)
```
Step 1: Interview Type
  ↓
Step 2: Difficulty Level
  ↓
Step 3: Question Pool
  ↓
Step 4: Voice Selection
  ↓
Step 5: Advanced Settings
  - Speed slider
  - Emotion dropdown
  - Volume slider
  - Duration dropdown
  - Feedback mode selector
  - Model configuration
  ↓
Step 6: Summary/Review
  ↓
Start Interview

Total: 6 pages, ~10 parameters, ~3 minutes
```

### After (Proposed Flow)
```
Step 1: Interview Type
  ↓
Step 2: Difficulty Level
  ↓
Start Interview

Total: 2 pages, 2 parameters, ~20 seconds
```

**Everything else is automatically optimized by the system.**

---

**End of Proposal**

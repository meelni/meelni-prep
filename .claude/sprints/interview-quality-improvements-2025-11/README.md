# Sprint: Interview Quality Improvements

**Sprint ID**: interview-quality-improvements-2025-11
**Start Date**: 2025-11-19
**Status**: Investigation Complete - Ready for Implementation
**Owner**: AI Agent (Architect role)

---

## Sprint Goal

Transform interview system from producing **inconsistent, thin responses** to **consistent, rich, professional-quality interviews** through three major improvements:

1. **Timing System**: Add programmatic time tracking to all interviews
2. **Prompt Quality**: Rewrite all framework prompts with tactical execution guidance
3. **Framework Coverage**: Complete all 4 interview types (Product Sense, Analytical, Behavioral, Strategy)

---

## Problem Statement

After analyzing expert interview examples, identified three critical gaps:

### 1. Timing System
- **Current**: "Interview Duration: 45 minutes - pace yourself"
- **Problem**: No programmatic tracking, warnings, or auto-termination
- **Impact**: Interviews ending at 10-15 min instead of 30-45 min

### 2. Prompt Quality (All Frameworks)
- **Current**: 10-18 line framework outlines (cheat sheets)
- **Problem**: Tell agent WHAT to do, not HOW to execute it
- **Impact**: Thin responses (1 sentence), no structure, vague outputs

### 3. Missing Tactical Patterns
- **Current**: Mentions concepts like "creative names" or "Reach × Underserved"
- **Problem**: Doesn't teach table formats, 2-3 sentence descriptions, V1 structure
- **Impact**: Agent doesn't follow expert patterns shown in examples

---

## Investigation Documents

### Timing System
1. **`INTERVIEW_TIMING_INVESTIGATION.md`** - Complete technical analysis
   - Current state analysis
   - Demo agent reference (proven pattern)
   - Recommended solution with code examples
   - Implementation plan (Phases 1-3)

2. **`TIMING_SUMMARY_FOR_USER.md`** - Executive summary
   - Problem overview
   - Solution architecture
   - Expected impact

### Product Sense Framework
3. **`PROMPT_IMPROVEMENT_ANALYSIS.md`** - Complete deep dive
   - Current prompt: 10 lines
   - Needed prompt: 300 lines with tactical execution guide
   - Section-by-section gap analysis
   - Complete rewritten prompt (ready to use)

4. **`PROMPT_IMPROVEMENT_SUMMARY.md`** - Executive summary
   - Key missing instructions
   - Expected impact

### Analytical Thinking Framework
5. **`ANALYTICAL_THINKING_PROMPT_ANALYSIS.md`** - Complete deep dive
   - Current prompt: 18 lines
   - Needed prompt: 400 lines with table/emoji structures
   - Ecosystem, NSM, AARRR, Guardrails, Tradeoffs analysis
   - Complete rewritten prompt (ready to use)

### Leadership & Drive (Behavioral) Framework
6. **`BEHAVIORAL_LEADERSHIP_PROMPT_ANALYSIS.md`** - Complete deep dive
   - Current prompt: 13 lines
   - Needed prompt: 350 lines with probing patterns
   - STAR + Learning structure
   - Probing question guidance, depth indicators
   - Complete rewritten prompt (ready to use)

### Overall Summary
7. **`INVESTIGATION_SUMMARY.md`** - Consolidated overview
   - All three investigations combined
   - Implementation plan with priorities
   - Success metrics
   - Risk assessment

---

## Key Findings

### The Pattern (Consistent Across All Three)

**Root cause**: We tell the agent WHAT to do, not HOW to execute it.

**Examples**:
- **Timing**: "Pace yourself" → Need: Programmatic tracking with milestones
- **Product Sense**: "Segments (creative names)" → Need: Table format, 2-3 sentences, persona
- **Analytical**: "North Star metric" → Need: Icon + definition + why + strengths/drawbacks
- **Behavioral**: "STAR method" → Need: Probing questions, depth indicators, learning extraction

### Missing Tactical Patterns

**Product Sense & Analytical Thinking**:
- ✅ Tables for ALL prioritization decisions
- ✅ Creative names ("Weekend Warriors" not "Busy professionals")
- ✅ Rich descriptions (2-3 sentences minimum)
- ✅ Strategic rationale (not just scores)
- ✅ Structured V1/NSM formats
- ✅ Emoji systems (Analytical Thinking)

**Behavioral (Different Pattern)**:
- ✅ Probing questions by STAR section
- ✅ Depth indicators (when to probe vs. move on)
- ✅ Failure story assessment (accountability, growth mindset)
- ✅ Learning extraction (specific behavioral changes)
- ✅ Application stories (when did you use this lesson?)

---

## Implementation Plan

### High Priority (~12-15 hours)

#### 1. Product Sense Framework Rewrite (2-3 hours)
**File**: `agent/shared/prompts.py` - `PRODUCT_SENSE_FRAMEWORK`
**Transform**: 10-line outline → 300-line tactical guide
**Includes**:
- 7 sections with timing and structure
- Table formats (Segmentation, Problems, Solutions)
- Creative naming patterns
- V1 structure (Entry Points, Core Flow, Success, Moonshot)
- Timing checkpoints

**Status**: Ready to implement (complete rewrite in analysis doc)

#### 2. Analytical Thinking Framework Rewrite (3-4 hours)
**File**: `agent/shared/prompts.py` - `ANALYTICAL_THINKING_FRAMEWORK`
**Transform**: 18-line outline → 400-line tactical guide
**Includes**:
- 9 sections with timing and structure
- 4-column ecosystem table with emojis
- NSM structure (icon + definition + why + strengths/drawbacks)
- AARRR proxy metrics with emojis
- Guardrails with risk explanations
- Tradeoff table with "Reconsider if" pattern

**Status**: Ready to implement (complete rewrite in analysis doc)

#### 3. Behavioral Framework Rewrite (2-3 hours)
**File**: `agent/shared/prompts.py` - `LEADERSHIP_DRIVE_FRAMEWORK`
**Transform**: 13-line definition → 350-line coaching guide
**Includes**:
- 6-part story structure (Opening, STAR, Learning, Connection)
- Time budgets for multiple stories (15 min, 12 min, 5 min)
- Probing question patterns by section
- Depth indicators (shallow vs. deep responses)
- Failure story assessment criteria
- Green/red flags with probing responses

**Status**: Ready to implement (complete rewrite in analysis doc)

#### 4. Interview Timing System (3-4 hours)
**File**: `agent/interview/agent.py`
**Implements**:
- Time tracking state (start_time, warning flags)
- Background monitoring task
- Dynamic warning times (halfway, 5-min, 2-min, grace period)
- Context update messages (not hard warnings)
- Hard stop at duration + 2 min

**Status**: Architecture designed (copy demo agent pattern)

### Medium Priority (~2-4 hours)

#### 5. Enhanced Mode Prompts (1-2 hours each)
**Files**: `agent/shared/prompts.py` - mode functions
**Enhances**:
- `get_mock_interview_prompt()` - Section-specific coaching
- `get_practice_mode_prompt()` - Feedback patterns
- `get_learning_mode_prompt()` - Teaching examples

**Status**: Designed (section-specific guidance patterns)

### Optional (~2-3 hours)

#### 6. Frontend Time Display
**File**: `app/interview/components/audio-visualizer.tsx`
**Adds**:
- Elapsed time display (MM:SS)
- Remaining time indicator
- Tactical UI styling

**Status**: Nice-to-have (not critical for core quality)

---

## Expected Impact

### Before (Current State)
- ❌ Interviews ending at 10-15 min (too short)
- ❌ Thin responses (1 sentence per item)
- ❌ No tables or structure
- ❌ Generic names ("Segment A", "Problem 1")
- ❌ Vague V1/NSM descriptions
- ❌ Weak behavioral probing (no depth)
- ❌ Agent guessing time

### After (With All Improvements)
- ✅ Consistent 30-45 min interviews
- ✅ Rich descriptions (2-3 sentences minimum)
- ✅ Tables for all prioritization decisions
- ✅ Creative, memorable names
- ✅ Structured outputs (V1, NSM, Tradeoffs)
- ✅ Deep behavioral stories with metrics and learnings
- ✅ Precise time awareness with countdown

---

## Success Metrics

### Quantitative
1. **Duration consistency**: % of interviews finishing within ±10% of target
2. **Framework adherence**: % completing all required sections
3. **Table usage**: % using prioritization tables (Product Sense, Analytical)
4. **Emoji usage**: % using required emojis (Analytical)
5. **Behavioral depth**: Average metrics cited per story, % extracting learnings
6. **Component completeness**: % covering all AARRR, guardrails, etc.

### Qualitative
1. **User feedback**: "Felt structured" vs. "felt random"
2. **Language quality**: Natural vs. robotic
3. **Strategic depth**: Rich rationale vs. thin justifications
4. **Growth mindset**: For behavioral, accountability and learning extraction

---

## Risk Assessment

### Low Risk ✅
- All improvements based on proven patterns
- More detail = better LLM performance
- No breaking changes to architecture
- Incremental implementation possible

### Medium Risk ⚠️
- **Prompt length**: Longer prompts may dilute key points
  - **Mitigation**: Use clear headers, bold instructions
- **Over-prescription**: Too rigid may feel scripted
  - **Mitigation**: Emphasize natural, conversational flow

---

## Files Modified

### Agent Code
- `agent/interview/agent.py` - Add time tracking
- `agent/shared/prompts.py` - Rewrite all 3 frameworks
- `agent/shared/utils/prompt_builder.py` - Add timing instructions

### Documentation (This Sprint)
- All investigation documents in this sprint folder
- Will create ADRs after implementation

### Future Documentation (Post-Implementation)
- ADRs for timing system and prompt rewrites
- Feature guides for improved interview quality
- Update CLAUDE.md with new capabilities

---

## Next Steps

1. ✅ **Investigation complete** (all documents ready)
2. **Get approval** on overall approach
3. **Choose implementation order** (recommend: Product Sense → Analytical → Behavioral → Timing)
4. **Implement Phase 1** (framework rewrites)
5. **Test with sample questions** (3-5 per framework)
6. **Implement Phase 2** (timing system)
7. **Deploy to production**
8. **Monitor metrics**
9. **Create ADRs** documenting decisions
10. **Archive sprint**

---

## Related Documentation

- **CLAUDE.md** - System overview and documentation map
- **PRD.md** - Product requirements
- **Sprint Template** - `docs/templates/SPRINT_TEMPLATE/`

---

## Notes

- This sprint follows the sprint documentation pattern established in docs/templates/SPRINT_TEMPLATE
- All investigation documents include ready-to-use code/prompts
- Total implementation effort: ~12-15 hours (high priority items)
- Expected completion: 1-2 weeks with testing

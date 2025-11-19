# Product Sense Prompt Improvement - Summary

**Date**: 2025-11-19
**Status**: Analysis Complete - Ready for Implementation

---

## The Core Problem

After analyzing your example interviews, I found that our current prompt is a **framework cheat sheet** when we need **tactical coaching instructions**.

### Current Prompt (10 lines):
```
## Product Sense: 5 steps

1. Setup - Scope, market, constraints, game plan
2. Why now - Market signal, user pain, our advantage
3. Users - Segments (creative names), prioritize (Reach × Underserved)
4. Problem - Journey map, prioritize (Frequency × Severity)
5. Solution - Brainstorm 3+, pick one (Impact × Effort), describe V1
```

**Problem**: This tells the agent **what** the framework is, not **how to execute it**.

---

## What the Examples Show

The expert interviews have **explicit tactical instructions** that we're not providing:

### 1. Section-by-Section Execution Guide

**Example segmentation section:**
- ✅ "Present 3 segments in a table with Reach × Underserved"
- ✅ "Give each segment a creative name like 'Weekend Warriors'"
- ✅ "Describe each in 2-3 sentences (who, what they need, why underserved)"
- ✅ "Choose one with explicit rationale"
- ✅ "Create detailed persona with name, age, job, specific needs"

**Our current prompt:**
- ❌ "Users - Segments (creative names), prioritize (Reach × Underserved)"

**Gap**: We mention these elements but don't teach **how to structure them**.

---

### 2. Explicit Time Budgets

**Example timing:**
```
✅ 5 min: Assumptions + Motivation
✅ 13 min: Segmentation complete
✅ 21 min: Problems prioritized
✅ 30 min: Solution + V1 described
✅ 32 min: Risks addressed
```

**Our current prompt:**
```
"Interview Duration: 45 minutes - pace yourself accordingly"
"Track time naturally: 'We've got about 10 minutes left'"
```

**Gap**: Agent has no idea segmentation should take 8 minutes or that V1 should be done by 30 minutes.

---

### 3. Tactical Patterns Throughout

**Examples use:**

#### Tables for Every Prioritization
- Segmentation: | Segment | Reach | Underserved |
- Problems: | Problem | Frequency | Severity |
- Solutions: | Solution | Impact | Effort |

**Our prompt**: Mentions the criteria but not the table format

#### Creative Names
- "Weekend Warriors" not "Busy professionals"
- "Discovery Overwhelm" not "Search problem"
- "Volunteer Squads" not "Group feature"

**Our prompt**: Says "creative names" but gives no examples

#### Rich Descriptions
- Each segment: 2-3 sentences
- Each problem: 2-3 sentences with examples
- Each solution: 1-2 sentence explanation

**Our prompt**: Doesn't mention this depth requirement

#### Structured V1 Format
```
Entry Points:
- [Platform touchpoint 1]
- [Platform touchpoint 2]

Core Flow:
1. [Step 1]
2. [Step 2]
... (5-8 steps)

Success looks like: [Concrete scenario]

Moonshot: [AI agent enhancement]
```

**Our prompt**: Just says "describe V1"

---

### 4. Natural Language Patterns

**Examples lead with insights:**
- "The reality is, volunteering sits at this fascinating intersection..."
- "What's interesting here is..."
- "We're at this inflection point where..."

**Use approximations:**
- "Most people say they want to volunteer but very few actually do"
- NOT: "73% of users express intent but only 12% convert"

**Our prompt**: Lists 2 examples but doesn't explain the **principle**

---

### 5. Explicit Transitions with Pauses

**Example pattern:**
```
[Finishes segmentation]
"Now let me map Sarah's journey"
[PAUSE - Wait for acknowledgment]
[Start problem identification]
```

**Our prompt**: Says "give them space to think" but doesn't teach transition mechanics

---

## The Solution

Transform our **10-line framework cheat sheet** into a **300-line tactical execution guide**.

### Structure:

```
## SECTION 1: Opening & Assumptions (45 seconds)
Goal: [What this section accomplishes]
What to say: [Specific language patterns with examples]
Format: [How to structure this section]
Timing checkpoint: [When should this be done]
Example: [Full example of what to say]

## SECTION 2: Product Motivation (4 minutes)
[Same structure as above]

## SECTION 3: Segmentation (8 minutes)
[Detailed step-by-step with table formats, examples, etc.]

... [Continue for all 7 sections]

## KEY TACTICAL PATTERNS TO USE THROUGHOUT
Pattern 1: Tables for Prioritization
Pattern 2: Creative Names
Pattern 3: Rich Descriptions
Pattern 4: Strategic Rationale
Pattern 5: Structured V1
Pattern 6: Natural Language
Pattern 7: Explicit Transitions

## TIMING DISCIPLINE
[Time budgets per section with guardrails]
```

---

## Key Missing Instructions

### For Segmentation:
1. ❌ "Use a table format with columns for Reach and Underserved"
2. ❌ "Give each segment a creative name"
3. ❌ "Describe each segment in 2-3 sentences"
4. ❌ "Explain your choice with specific rationale"
5. ❌ "Create a detailed persona with name, age, job, needs"

### For Problem Identification:
1. ❌ "Map 5-7 journey steps with clear names"
2. ❌ "Present 3 problems in a Frequency × Severity table"
3. ❌ "Describe each problem with concrete examples"
4. ❌ "Choose with strategic fit (not just scores)"

### For Solution Development:
1. ❌ "Present 3 solutions in Impact × Effort table"
2. ❌ "Structure V1 with Entry Points, Core Flow, Success Criteria"
3. ❌ "List 3-4 specific platform touchpoints as entry points"
4. ❌ "Describe core flow as 5-8 numbered steps"
5. ❌ "Add a moonshot AI enhancement"

### For Execution:
1. ❌ "Verbally signal transitions: 'Let me now think about...'"
2. ❌ "Pause 1-2 seconds after each section"
3. ❌ "Check time at key milestones and adjust pacing"
4. ❌ "Use natural language, not corporate speak"

---

## Expected Impact

### Before (Current State):
- ❌ Agent knows the framework exists but not how to execute it
- ❌ Responses are thin (1 sentence per segment/problem/solution)
- ❌ No tables or structured prioritization
- ❌ Generic names ("Segment A", "Problem 1")
- ❌ Vague V1 descriptions ("build a feature that...")
- ❌ Inconsistent pacing (some sections skipped, others too long)

### After (With New Prompt):
- ✅ Agent executes each section with specific structure
- ✅ Rich descriptions (2-3 sentences minimum)
- ✅ Tables for all prioritization decisions
- ✅ Creative, memorable names
- ✅ Structured V1 with entry points, flow, success, moonshot
- ✅ Consistent timing (32-35 minute interviews)
- ✅ Natural, conversational language throughout

---

## Implementation Plan

### Phase 1: Rewrite Product Sense Framework (HIGH PRIORITY)
**File**: `agent/shared/prompts.py`
**What**: Replace 10-line framework with 300-line execution guide
**Effort**: 2-3 hours
**Impact**: Massive - this is the core coaching guide

### Phase 2: Enhance Mode Prompts (MEDIUM PRIORITY)
**File**: `agent/shared/prompts.py`
**What**: Add section-specific coaching guidance
**Effort**: 1-2 hours
**Impact**: High - teaches agent how to guide, not just what to guide

### Phase 3: Integrate Timing (ALREADY DESIGNED)
**File**: `agent/shared/utils/prompt_builder.py`
**What**: Add time budgets per section from timing investigation
**Effort**: Included in timing work
**Impact**: High - ensures consistent pacing

**Total Effort**: ~4-6 hours for Phases 1-2

---

## Success Metrics

### Quantitative:
1. **Framework adherence**: % of interviews completing all 5 sections
2. **Table usage**: % using prioritization tables
3. **Timing consistency**: % finishing in 32-37 minutes
4. **Description depth**: Avg. sentences per segment/problem/solution

### Qualitative:
1. **User feedback**: "Felt structured" vs. "felt random"
2. **Language quality**: Natural vs. robotic
3. **Strategic thinking**: Clear rationale vs. arbitrary choices

---

## Risk Assessment

**Low risk** ✅
- More detail = better LLM performance
- Clear examples improve consistency
- Structured format reduces ambiguity

**Medium risk** ⚠️
- Longer prompt may dilute key points
  - Mitigation: Use clear headers, bold key instructions

- Over-prescription may feel scripted
  - Mitigation: Emphasize natural, conversational flow

---

## Key Insight

The examples show that excellent product sense interviews aren't about **knowing the framework** - they're about **executing it with specific tactical patterns**.

Our current prompt is like giving someone a recipe that says:
```
1. Prepare ingredients
2. Cook
3. Serve
```

When they need:
```
1. Prepare ingredients (10 min):
   - Dice onions into 1/4-inch pieces
   - Mince 3 cloves of garlic
   - Measure 2 cups of stock
   [etc.]
```

**We need to provide the detailed recipe, not just the high-level steps.**

---

## Next Steps

1. **Review analysis** ✅ (see `PROMPT_IMPROVEMENT_ANALYSIS.md`)
2. **Approve approach**
3. **Implement Phase 1**: Rewrite framework (2-3 hours)
4. **Test with sample questions**
5. **Compare quality**: Current vs. new prompt
6. **Implement Phase 2**: Enhanced coaching (1-2 hours)
7. **Deploy**

---

**Ready to start rewriting the prompt when you give the go-ahead!** 🚀

The full analysis with detailed examples is in `PROMPT_IMPROVEMENT_ANALYSIS.md`.

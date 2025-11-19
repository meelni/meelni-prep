# Product Sense Prompt Improvement Analysis

**Date**: 2025-11-19
**Branch**: `interview-timing-controls`
**Status**: Analysis Complete - Ready for Prompt Rewrite

---

## Executive Summary

After analyzing two expert-level product sense interview transcripts, I've identified **critical gaps** in our current prompt that prevent the agent from conducting interviews at the same quality level.

**The core issue**: Our prompt is too **condensed and abstract**. The examples show that excellent product sense interviews require:
1. **Explicit narrative structure** with specific language patterns
2. **Detailed tactical instructions** for each framework step
3. **Concrete examples** of what to say and how to say it
4. **Strategic pacing** with clear time allocations per section

Our current prompt says "5 steps" but doesn't teach the agent **how to actually guide someone through those steps**.

---

## What Makes the Example Interviews Excellent

### 1. Natural, Strategic Language Patterns

**Example uses:**
```
"The reality is, volunteering sits at this fascinating intersection..."
"What's interesting here is..."
"So looking at this..."
"There's this huge gap between intention and action"
```

**Our prompt says:**
```
Use natural PM language:
- "So looking at this..."
- "The way I see it..."
```

**Problem**: We list examples but don't explain **when** to use them or **why** they work.

---

### 2. Explicit Section-by-Section Structure

**Example interview structure:**

```
Opening & Assumptions (45 seconds)
├─ State the gap/tension ("huge gap between intention and action")
├─ Make 3-4 specific assumptions
├─ State game plan
└─ Confirm with interviewer [PAUSE]

Product Motivation (4 minutes)
├─ Describe the market reality
├─ Explain why company is uniquely positioned
├─ Analyze competition landscape
├─ State mission statement
└─ Connect to company mission [PAUSE]

Segmentation (8 minutes)
├─ List ecosystem players
├─ Declare focus (demand/supply/platform)
├─ Present 3 segments in table format (Reach × Underserved)
├─ Describe each segment richly
├─ Choose one with rationale
└─ Create detailed persona [PAUSE]

Problem Identification (8 minutes)
├─ Map user journey (7 steps)
├─ Present 3 problems in table (Frequency × Severity)
├─ Describe each problem with examples
├─ Choose one with rationale
└─ Explain strategic fit [PAUSE]

Solution Development (9 minutes)
├─ Brainstorm 3 solutions in table (Impact × Effort)
├─ Describe each solution
├─ Choose one with rationale
├─ Describe V1 with entry points, core flow, success criteria
└─ Add moonshot AI enhancement [PAUSE]

Risks & Mitigation (2 minutes)
├─ State 2-3 risks
└─ Provide mitigation for each

Closing (30 seconds)
├─ Summarize approach
├─ State success metrics
└─ Ask for questions
```

**Our prompt says:**
```
## Product Sense: 5 steps

1. Setup - Scope, market, constraints, game plan
2. Why now - Market signal, user pain, our advantage
3. Users - Segments (creative names), prioritize (Reach × Underserved)
4. Problem - Journey map, prioritize (Frequency × Severity)
5. Solution - Brainstorm 3+, pick one (Impact × Effort), describe V1
```

**Problem**: This is a **bullet point outline**, not actionable coaching instructions. The agent doesn't know:
- How much time to spend on each section
- What specifically to say at each step
- When to pause for confirmation
- How to transition between sections

---

### 3. Rich Tactical Details for Each Framework Step

#### Example: Segmentation Section

**What the expert does:**

```markdown
"Breaking down potential volunteers, I see three distinct segments:

| Segment | Reach | Underserved |
|---------|-------|-------------|
| "The Weekend Warriors" | High | High |
| "The Skill Sharers" | Medium | High |
| "The Crisis Responders" | Medium | Medium |

The Weekend Warriors - These are parents and working professionals who
genuinely want to help but need volunteering to fit their packed schedules.
They're looking for flexible, family-friendly opportunities they can do on
Saturday mornings.

[Describes other 2 segments with same depth...]

I'll focus on the Weekend Warriors. They have the highest reach and are
highly underserved. Current platforms don't address their need for flexibility
and social coordination.

Persona: Sarah, 38, marketing manager with two kids. She wants to teach her
children about giving back but needs activities that work for the whole family,
don't require long-term commitments, and ideally involve her friend group."
```

**What our prompt says:**

```
Users - Segments (creative names), prioritize (Reach × Underserved)
```

**Gap Analysis:**

| What's Needed | Current Prompt | Expert Example |
|---------------|----------------|----------------|
| **Table format** | Not mentioned | ✅ Explicitly uses table |
| **Creative names** | Mentioned | ✅ "Weekend Warriors", "Skill Sharers" |
| **Rich descriptions** | Not mentioned | ✅ Full paragraphs per segment |
| **Prioritization rationale** | Mentioned | ✅ "highest reach + underserved" |
| **Detailed persona** | Not mentioned | ✅ Name, age, job, specific needs |

**Missing instructions**:
1. Use a prioritization matrix (table format)
2. Give segments memorable names (not "Segment A")
3. Describe each segment in 2-3 sentences (who, what they need, why underserved)
4. Explain prioritization logic explicitly
5. Create a persona with name, demographics, and specific pain points

---

#### Example: Problem Identification Section

**What the expert does:**

```markdown
"Walking through Sarah's volunteering journey:

1. Motivation spark - Sees news or friend's post about local need
2. Research - Googles local opportunities
3. Evaluation - Tries to understand time commitment and requirements
4. Coordination - Attempts to involve family/friends
5. Commitment - Signs up (or doesn't)
6. Participation - Shows up to volunteer
7. Continuation - Decides whether to do it again

Key problems I'm seeing:

| Problem | Frequency | Severity |
|---------|-----------|----------|
| Discovery Overwhelm | High | High |
| Social Coordination Friction | High | High |
| Commitment Anxiety | Medium | High |

[Describes each problem in detail with examples...]

I'll tackle the Social Coordination Friction. It's both high frequency and
severity, and it's something Meta's uniquely positioned to solve given our
social graph."
```

**What our prompt says:**

```
Problem - Journey map, prioritize (Frequency × Severity)
```

**Gap Analysis:**

| What's Needed | Current Prompt | Expert Example |
|---------------|----------------|----------------|
| **Journey map format** | Mentioned but no format | ✅ Numbered list (7 steps) |
| **Journey step names** | Not mentioned | ✅ "Motivation spark", "Research", etc. |
| **Problem table** | Not mentioned | ✅ Frequency × Severity matrix |
| **Problem descriptions** | Not mentioned | ✅ 2-3 sentences each with examples |
| **Strategic rationale** | Not mentioned | ✅ "Meta's uniquely positioned..." |

**Missing instructions**:
1. Map 5-7 journey steps with clear names
2. Present 3 problems in a table with Frequency × Severity
3. Describe each problem with concrete examples
4. Explain choice with strategic reasoning (not just scores)
5. Connect to company strengths

---

#### Example: Solution Development Section

**What the expert does:**

```markdown
"Thinking about different approaches to social coordination:

| Solution | Impact | Effort |
|----------|--------|--------|
| Volunteer Squads | High | Medium |
| Community Challenge Feeds | High | High |
| Smart Calendar Matching | Medium | Medium |

[Describes each solution in 1-2 sentences...]

I'll go with Volunteer Squads because it has high impact with manageable
effort and creates the sticky social dynamics that keep people engaged.

V1 Description:

Entry Points:
- Prompt in Facebook Groups when volunteer posts appear
- Instagram Stories sticker: "Starting a Volunteer Squad"
- Messenger group suggestions for existing group chats

Core Flow:
1. Sarah creates a squad, names it (like "The Helping Hands")
2. Invites 3-8 friends/family members
3. Squad sets preferences: family-friendly, weekends, 2-hour max
4. System suggests matched opportunities each week
5. Members vote on which to do
6. One-tap RSVP for the whole squad
7. Post-volunteer, automatic photo album and impact summary created

Success looks like: Sarah's squad doing monthly volunteer activities
together, with kids understanding community service as a fun, social
activity rather than an obligation.

Moonshot AI Agent Addition:
Imagine 'VolunteerBot' - an AI agent that proactively monitors your
squad's calendars, local community needs, and member interests..."
```

**What our prompt says:**

```
Solution - Brainstorm 3+, pick one (Impact × Effort), describe V1
```

**Gap Analysis:**

| What's Needed | Current Prompt | Expert Example |
|---------------|----------------|----------------|
| **Solution table** | Not mentioned | ✅ Impact × Effort matrix |
| **Solution descriptions** | Not mentioned | ✅ 1-2 sentences each |
| **V1 structure** | Mentioned but no format | ✅ Entry Points, Core Flow, Success |
| **Entry points** | Not mentioned | ✅ Specific platform touchpoints |
| **Step-by-step flow** | Not mentioned | ✅ Numbered user journey |
| **Success definition** | Not mentioned | ✅ Concrete success scenario |
| **Moonshot addition** | Not mentioned | ✅ AI agent enhancement |

**Missing instructions**:
1. Present 3 solutions in Impact × Effort table
2. Describe each solution briefly
3. Structure V1 with: Entry Points, Core Flow, Success Criteria
4. List 3-4 specific entry points (platform touchpoints)
5. Describe core flow as numbered steps (5-8 steps)
6. Define success with a concrete scenario
7. Add a moonshot AI enhancement

---

### 4. Strategic Use of Pauses

**Example pattern:**

```
[Describes assumptions]
"Sound good?"
[PAUSE - Wait for confirmation] ⏸️

[Describes motivation]
"Let me now think about the ecosystem"
[PAUSE - "Let me now think about the ecosystem"] ⏸️

[Finishes segmentation]
"Now let me map Sarah's journey"
[PAUSE - "Now let me map Sarah's journey"] ⏸️
```

**Our prompt says:**

```
- Give them space to think
- If they're stuck, nudge—don't answer for them
```

**Problem**: We don't teach the agent to **explicitly checkpoint** after each major section. The examples show the interviewer:
1. Verbally signals transition ("Let me now think about...")
2. Pauses to let candidate interject or confirm
3. Maintains control without being robotic

**Missing instructions**:
- After each section, verbally signal the next section
- Pause briefly (1-2 seconds) for candidate acknowledgment
- Examples: "Sound good?", "Make sense?", "Let me now move to..."

---

### 5. Time Management and Pacing

**Example shows:**

```
📊 Timing Breakdown:
✅ 5 min: Assumptions + Motivation
✅ 15 min: Segmentation complete
✅ 23 min: Problems prioritized
✅ 32 min: Solution + V1 described
✅ 35 min: Risks addressed + wrapped up
```

**Our prompt says:**

```
Interview Duration: 45 minutes - pace yourself accordingly.
Track time naturally: "We've got about 10 minutes left"
```

**Problem**: Agent has no idea how long each section **should** take. The examples show:
- Setup: 45 seconds (not 5 minutes!)
- Motivation: 4 minutes
- Segmentation: 8 minutes
- Problems: 8 minutes
- Solutions: 9 minutes
- Risks: 2 minutes
- Closing: 30 seconds

**Missing instructions**:
- Explicit time budget for each section
- Pacing guardrails (e.g., "If segmentation takes >10 min, move on")
- Transition prompts (e.g., "We're 15 minutes in, time to lock in a segment")

---

### 6. Language That Sounds Human, Not Robotic

**Example uses authentic approximations:**

```
"Most people say they want to volunteer more, but very few actually follow through"
(Not: "73% of users express intent but only 12% convert")

"The reality is, volunteering sits at this fascinating intersection..."
(Not: "I would like to explain that volunteering has multiple dimensions")

"We're seeing younger generations increasingly value purpose-driven activities"
(Not: "Research shows Gen Z prioritizes meaningful work")
```

**Our prompt says:**

```
When discussing data, use natural approximations:
- "Most people say they want to... but very few actually do"
- "There's a huge gap between intention and action"
```

**Problem**: We give 2 examples but don't explain the **principle**:
- Use conversational language ("The reality is...", "What's interesting...")
- Speak in approximations, not exact numbers
- Sound like you're explaining to a friend, not presenting a deck

**Missing instructions**:
- Lead with insights, not data dumps
- Use phrases like "The reality is...", "What's interesting here..."
- Avoid corporate speak ("I would approach this by...")
- No exact percentages unless directly asked

---

## Current Prompt Deficiencies

### 1. Framework Is Too Condensed

**Current:**
```python
PRODUCT_SENSE_FRAMEWORK = """
## Product Sense: 5 steps

1. Setup - Scope, market, constraints, game plan
2. Why now - Market signal, user pain, our advantage
3. Users - Segments (creative names), prioritize (Reach × Underserved)
4. Problem - Journey map, prioritize (Frequency × Severity)
5. Solution - Brainstorm 3+, pick one (Impact × Effort), describe V1

## Green flags:
User research → clear segments → prioritized problem → creative solutions → V1 definition with risks

## Red flags:
No user data, feature list without justification, skipped segmentation, ignored constraints, no metrics
"""
```

**Problems**:
- ❌ No time allocations
- ❌ No specific examples of what to say
- ❌ No table format instructions
- ❌ No pause/transition guidance
- ❌ No detail on V1 structure
- ❌ Green/red flags are for evaluators, not performers

**This is a framework cheat sheet, not coaching instructions.**

---

### 2. Mode Prompt Doesn't Teach Execution

**Current:**
```python
def get_mock_interview_prompt(interview_type: str) -> str:
    return f"""{BASE_INTERVIEWER_SYSTEM}

## Your role: Mock interviewer

Act like a real PM interviewer—professional, curious, direct.

{framework}

## How you run this:
- Ask one thing at a time
- Use backchannels naturally: "mm-hmm", "got it", "interesting"
- Probe for metrics, constraints, trade-offs, risks
- Give them space to think
- If they're stuck, nudge—don't answer for them
- Track time naturally: "We've got about 10 minutes left"

## Important:
- Some pressure is realistic—don't over-comfort
- Silence is okay—let them think
"""
```

**Problems**:
- ❌ Says "probe for metrics" but doesn't explain **when** or **how**
- ❌ Says "use backchannels" but doesn't show **where** they fit in the flow
- ❌ Says "ask one thing at a time" but the framework has multiple sub-tasks per step
- ❌ No guidance on how to guide someone through segmentation vs. problem identification

**This tells the agent what to do, not how to do it.**

---

### 3. Missing Tactical Patterns

**What the examples show that we don't teach:**

#### Tables as a Standard Pattern
- Segmentation: Reach × Underserved
- Problems: Frequency × Severity
- Solutions: Impact × Effort

**Our prompt**: Mentions these terms in bullet points, doesn't say "present this as a table"

#### Rich Descriptive Paragraphs
- Each segment gets 2-3 sentences
- Each problem gets examples
- Each solution gets a brief explanation

**Our prompt**: Doesn't teach this level of detail

#### Structured V1 Format
- Entry Points (3-4 specific touchpoints)
- Core Flow (5-8 numbered steps)
- Success Criteria (concrete scenario)
- Moonshot Enhancement (AI agent idea)

**Our prompt**: Just says "describe V1"

#### Rationale for Choices
- "I'll focus on Weekend Warriors because they have highest reach and are underserved"
- "I'll tackle Social Coordination Friction because it's high frequency/severity AND Meta's uniquely positioned"

**Our prompt**: Says "prioritize" but doesn't teach how to **explain the choice**

---

## Recommended Prompt Improvements

### Improvement 1: Expand Framework to Tactical Execution Guide

**Instead of this:**
```python
PRODUCT_SENSE_FRAMEWORK = """
## Product Sense: 5 steps

1. Setup - Scope, market, constraints, game plan
2. Why now - Market signal, user pain, our advantage
3. Users - Segments (creative names), prioritize (Reach × Underserved)
4. Problem - Journey map, prioritize (Frequency × Severity)
5. Solution - Brainstorm 3+, pick one (Impact × Effort), describe V1
"""
```

**Do this:**
```python
PRODUCT_SENSE_FRAMEWORK = """
## Product Sense Interview: Complete Execution Guide

You will guide the candidate through a structured 35-minute product sense interview.
Below is the exact structure, timing, and language patterns to use.

---

### SECTION 1: Opening & Assumptions (45 seconds)

**Goal**: Set scope and get alignment on approach

**What to say**:
1. Start with a high-level insight or tension
   - Example: "This is interesting because there's a huge gap between [X] and [Y]"
   - Example: "We're at this inflection point where [trend] but [reality]"

2. State 3-4 specific assumptions:
   - Platform assumption: "I'll assume we're building within [company]'s ecosystem"
   - Market assumption: "I'll focus on [geographic market] initially"
   - Audience assumption: "I'll target [consumer/enterprise/SMB]"
   - Scope assumption: "Rather than [alternative], I'll focus on [chosen scope]"

3. State your game plan:
   - "Here's my plan: I'll walk through [1] why this matters, [2] identify users,
     [3] pinpoint problems, [4] develop solutions with a V1."

4. Confirm alignment:
   - End with: "Sound good?" or "Make sense?"
   - PAUSE for 2 seconds to let them respond

**Timing checkpoint**: Should complete by 1-minute mark

**Example opening**:
"So looking at [topic] - this is interesting because [insight about gap/tension].
Let me make a few quick assumptions to focus our discussion. I'll assume [assumption 1],
[assumption 2], and [assumption 3]. My game plan: [state 4-step plan]. Sound good?"

---

### SECTION 2: Product Motivation (4 minutes)

**Goal**: Explain why this product matters and why this company should build it

**What to cover** (in order):
1. Market reality / insight (1 min):
   - "The reality is, [describe current state and tension]"
   - "We're seeing [trend], but [problem with current solutions]"

2. Company's unique position (1 min):
   - "[Company] is uniquely positioned because [unique assets]"
   - Example: "We already have 3B users and understand their [behaviors]"

3. Competitive landscape (1.5 min):
   - List 2-3 competitors
   - Briefly state what they do well
   - Identify the gap: "What's missing is [X]"

4. Mission statement (30 sec):
   - "Mission statement: 'To [verb] [audience] by [approach]'"
   - Connect to company mission: "This directly supports [company]'s mission of [X]"

**Transition**: "Let me now think about the ecosystem" [PAUSE]

**Timing checkpoint**: Should complete by 5-minute mark

---

### SECTION 3: Segmentation (8 minutes)

**Goal**: Identify user segments and choose which to focus on

**Step 1**: List ecosystem players (1 min)
- "The [product area] ecosystem has several key players:"
- List 4 types: demand-side, supply-side, platform, partners
- Declare focus: "I'll focus on [demand/supply] because [rationale]"

**Step 2**: Create segmentation table (3 min)
- "Breaking down [user type], I see three distinct segments:"
- Present as table:

```
| Segment | Reach | Underserved |
|---------|-------|-------------|
| "[Creative Name 1]" | High/Med/Low | High/Med/Low |
| "[Creative Name 2]" | High/Med/Low | High/Med/Low |
| "[Creative Name 3]" | High/Med/Low | High/Med/Low |
```

**Step 3**: Describe each segment (3 min)
- For each segment, provide 2-3 sentences:
  - Who they are (demographics/psychographics)
  - What they need
  - Why current solutions fail them

**Step 4**: Choose segment and create persona (1 min)
- "I'll focus on [Segment Name]. They have [highest reach/underserved/strategic fit]."
- State rationale clearly
- Create detailed persona:
  - "Persona: [Name], [age], [job]. [Describe their specific needs and constraints]"

**Transition**: "Now let me map [Name]'s journey" [PAUSE]

**Timing checkpoint**: Should complete by 13-minute mark

---

### SECTION 4: Problem Identification (8 minutes)

**Goal**: Map user journey and prioritize key problems

**Step 1**: Map user journey (3 min)
- "Walking through [Name]'s [activity] journey:"
- List 5-7 steps with clear names:
  1. [Trigger stage] - [Brief description]
  2. [Search stage] - [Brief description]
  3. [Evaluation stage] - [Brief description]
  ... (continue to 5-7 steps)

**Step 2**: Create problem table (2 min)
- "Key problems I'm seeing:"
- Present as table:

```
| Problem | Frequency | Severity |
|---------|-----------|----------|
| [Problem 1 Name] | High/Med/Low | High/Med/Low |
| [Problem 2 Name] | High/Med/Low | High/Med/Low |
| [Problem 3 Name] | High/Med/Low | High/Med/Low |
```

**Step 3**: Describe each problem (2 min)
- For each problem, provide 2-3 sentences with concrete examples:
  - What the problem is
  - When it happens in the journey
  - Why it's painful

**Step 4**: Choose problem with strategic rationale (1 min)
- "I'll tackle [Problem Name]. It's [high frequency/severity], and it's something
   [Company] is uniquely positioned to solve given our [unique asset]."

**Transition**: "Let me brainstorm solutions" [PAUSE]

**Timing checkpoint**: Should complete by 21-minute mark

---

### SECTION 5: Solution Development (9 minutes)

**Goal**: Generate solutions, choose one, and describe V1

**Step 1**: Create solution table (2 min)
- "Thinking about different approaches to [problem]:"
- Present as table:

```
| Solution | Impact | Effort |
|----------|--------|--------|
| [Solution 1 Name] | High/Med/Low | High/Med/Low |
| [Solution 2 Name] | High/Med/Low | High/Med/Low |
| [Solution 3 Name] | High/Med/Low | High/Med/Low |
```

**Step 2**: Describe each solution briefly (2 min)
- 1-2 sentences per solution explaining the core concept

**Step 3**: Choose solution with rationale (1 min)
- "I'll go with [Solution Name] because it has [high impact] with [manageable effort]
   and [additional strategic reason]"

**Step 4**: Describe V1 in structured format (4 min)

Use this exact structure:

**V1 Description:**

**Entry Points:**
- [Platform touchpoint 1]: [Specific trigger]
- [Platform touchpoint 2]: [Specific trigger]
- [Platform touchpoint 3]: [Specific trigger]

**Core Flow:**
1. [User action 1]
2. [User action 2]
3. [User action 3]
4. [User action 4]
5. [User action 5]
... (5-8 steps total)

**Success looks like:**
[Describe a concrete scenario showing what success means for your persona]

**Moonshot AI Agent Addition:**
"Imagine '[Agent Name]' - an AI agent that [describe proactive behavior and value]"

**Timing checkpoint**: Should complete by 30-minute mark

---

### SECTION 6: Risks & Mitigation (2 minutes)

**Goal**: Show you've thought about what could go wrong

**Format**:
- State 2-3 concrete risks
- For each risk, provide specific mitigation

**Example**:
"Risk 1: [Describe risk]
Mitigation: [Specific approach to address it]

Risk 2: [Describe risk]
Mitigation: [Specific approach to address it]"

**Timing checkpoint**: Should complete by 32-minute mark

---

### SECTION 7: Closing (30 seconds)

**Goal**: Summarize and invite questions

**What to say**:
"To summarize - we're building [solution name] to solve [problem] for [segment].
This leverages [company]'s unique strength in [asset] while directly supporting our
mission of [mission].

The V1 focuses on [key features], with clear metrics around [metric 1], [metric 2],
and [metric 3].

What questions do you have about this approach?"

**Timing checkpoint**: Should complete by 33-minute mark

---

## KEY TACTICAL PATTERNS TO USE THROUGHOUT

### Pattern 1: Tables for Prioritization
- **Always use table format** when comparing options
- Segmentation: Reach × Underserved
- Problems: Frequency × Severity
- Solutions: Impact × Effort

### Pattern 2: Creative Names
- Segments: "The Weekend Warriors" not "Busy professionals"
- Problems: "Discovery Overwhelm" not "Search problem"
- Solutions: "Volunteer Squads" not "Group feature"

### Pattern 3: Rich Descriptions
- Each segment: 2-3 sentences (who, what they need, why underserved)
- Each problem: 2-3 sentences with examples
- Each solution: 1-2 sentences explaining concept

### Pattern 4: Strategic Rationale
- Don't just say "I choose X"
- Say "I choose X because [metric scores] AND [strategic fit]"
- Example: "High reach + underserved AND Meta's uniquely positioned"

### Pattern 5: Structured V1
- Entry Points: 3-4 specific platform touchpoints
- Core Flow: 5-8 numbered user actions
- Success: Concrete scenario with persona
- Moonshot: AI agent enhancement

### Pattern 6: Natural Language
- Lead with insights: "The reality is..."
- Use approximations: "Most people" not "73% of users"
- Speak conversationally, not like a deck
- Avoid: "I would approach this by..."

### Pattern 7: Explicit Transitions
- After each section, verbally signal next section
- Examples: "Let me now think about...", "Now let me map...", "Let me brainstorm..."
- Pause for 1-2 seconds after transitions

---

## TIMING DISCIPLINE

**Critical**: This is a 35-minute interview with specific time budgets per section.

**If running behind**:
- At 6-min mark: If still on motivation, wrap up quickly
- At 14-min mark: If still on segmentation, pick segment immediately
- At 22-min mark: If still on problems, pick problem and move to solutions
- At 31-min mark: If still on V1, skip moonshot and jump to risks

**Natural time check-ins**:
- Around 15-min mark: "We're about halfway through - let me move to problems"
- Around 25-min mark: "We've got about 10 minutes left - let me develop the solution"

---

## GREEN FLAGS (What excellent looks like)

✅ Used tables for all prioritization matrices
✅ Creative, memorable segment/problem/solution names
✅ Rich descriptions (2-3 sentences minimum per item)
✅ Strategic rationale for choices (not just scores)
✅ Structured V1 with entry points, flow, success, moonshot
✅ Natural, conversational language throughout
✅ Clear transitions between sections
✅ Finished in 32-35 minutes

## RED FLAGS (What to avoid)

❌ Skipped any of the 5 main sections
❌ Used generic names ("Segment A", "Problem 1")
❌ Thin descriptions (one sentence per item)
❌ No rationale for choices ("I pick this one")
❌ Vague V1 ("build a feature that...")
❌ Robotic language ("I would approach this by...")
❌ Ran over 35 minutes or rushed through in <25 minutes
❌ No tables/structure for prioritization

"""
```

---

### Improvement 2: Add Execution Coaching to Mode Prompts

**Instead of this:**
```python
## How you run this:
- Ask one thing at a time
- Use backchannels naturally: "mm-hmm", "got it", "interesting"
- Probe for metrics, constraints, trade-offs, risks
```

**Do this:**
```python
## How you guide them through the interview:

### Your Coaching Approach:
1. **Let them lead, you guide**: They speak 80%, you speak 20%
2. **Use backchannels during their responses**: "mm-hmm", "got it", "interesting"
3. **Prompt when stuck**: "What about [X]?" not "Have you thought about [X]?"
4. **Track framework progress**: Know which section they're in and nudge if skipping steps

### Section-Specific Guidance:

**During Segmentation**:
- If they list segments without names: "Give them creative names"
- If they skip table: "How would you prioritize these? Maybe in a table?"
- If descriptions are thin: "Tell me more about the Weekend Warriors - who are they exactly?"
- If no persona: "Create a specific persona for your chosen segment"

**During Problem Identification**:
- If no journey map: "Walk me through their journey step by step"
- If problems are vague: "Give that problem a name - what would you call it?"
- If no prioritization: "Which problem is most frequent and severe?"
- If no strategic fit: "Why is [Company] uniquely positioned to solve this?"

**During Solution Development**:
- If only one solution: "Give me 2-3 alternatives to compare"
- If no table: "How do these compare on impact and effort?"
- If V1 is vague: "Be specific - what are the entry points? What's the flow?"
- If no success criteria: "What does success look like for your persona?"

### When to Probe:
- **Missing metrics**: "How would you measure that?"
- **Missing constraints**: "What constraints are you working with?"
- **Missing trade-offs**: "What are you giving up with this choice?"
- **Missing risks**: "What could go wrong here?"

### When to Let Silence Exist:
- After asking a question (5-10 seconds)
- When they're clearly thinking through something
- After they finish a section (1-2 seconds before confirming)

### DO NOT:
- Answer for them
- Give them the framework structure explicitly (guide, don't tell)
- Rush them (let sections breathe)
- Over-praise ("That's amazing!" - be balanced)
```

---

### Improvement 3: Add Explicit Timing Instructions

**Add this section to the prompt:**

```python
## ⏱️ INTERVIEW TIMING & PACING

This is a 35-minute product sense interview with specific time budgets.

### Time Budget Per Section:
- Opening & Assumptions: 45 seconds (by 1-min mark)
- Product Motivation: 4 minutes (by 5-min mark)
- Segmentation: 8 minutes (by 13-min mark)
- Problem Identification: 8 minutes (by 21-min mark)
- Solution Development: 9 minutes (by 30-min mark)
- Risks & Mitigation: 2 minutes (by 32-min mark)
- Closing: 30 seconds (by 33-min mark)

### How to Track Time:
- You will receive automatic time updates at key milestones
- Use these to gauge pacing: "We're about halfway through"
- Natural check-ins: "Let's make sure we have time for solutions"

### If Running Behind:
- **6-min mark, still on motivation**: "Let's move to segmentation"
- **14-min mark, still on segmentation**: "Let's lock in a segment and move forward"
- **22-min mark, still on problems**: "Pick your problem so we have time for solutions"
- **31-min mark, still on V1**: "Let's talk about risks quickly"

### If Running Ahead:
- **Finished segmentation by 10-min mark**: Good pace, encourage depth on problems
- **Finished problems by 18-min mark**: Excellent, they can be thorough with solutions
- **Finished V1 by 28-min mark**: Ask about additional considerations or moonshot ideas

### Natural Time Language:
- "We're about 15 minutes in - let's move to problems"
- "We've got about 10 minutes left - time to develop the solution"
- "Let's make sure we cover risks - we have a few minutes left"
```

---

## Implementation Priority

### Phase 1: Expand Product Sense Framework (HIGH PRIORITY)
**File**: `agent/shared/prompts.py` - `PRODUCT_SENSE_FRAMEWORK`
**Effort**: 2-3 hours
**Impact**: Massive - this is the core coaching guide

**What to do**:
1. Replace current 10-line framework with full 300-line execution guide
2. Include all tactical patterns (tables, creative names, V1 structure)
3. Add specific language examples for each section
4. Include timing checkpoints

### Phase 2: Enhance Mode Prompts (MEDIUM PRIORITY)
**File**: `agent/shared/prompts.py` - `get_mock_interview_prompt()`
**Effort**: 1-2 hours
**Impact**: High - teaches agent **how** to guide (not just what to guide)

**What to do**:
1. Add section-specific coaching guidance
2. Add "when to probe" instructions
3. Add "when to let silence exist" guidance

### Phase 3: Add Timing Section (COMPLETED IN TIMING WORK)
**File**: `agent/shared/utils/prompt_builder.py`
**Effort**: Already designed in timing investigation
**Impact**: High - ensures consistent pacing

**What to do**:
1. Use timing instructions from `INTERVIEW_TIMING_INVESTIGATION.md`
2. Integrate with product sense time budgets

---

## Success Metrics

### Quantitative:
1. **Framework adherence rate**: % of interviews that complete all 5 sections
2. **Time distribution**: Actual time spent per section vs. target
3. **Completion rate**: % of interviews that finish in 32-37 minutes
4. **Table usage**: % of interviews where agent uses prioritization tables

### Qualitative:
1. **User feedback**: "Interview felt structured" vs. "felt random"
2. **Language quality**: Natural conversation vs. robotic responses
3. **Depth**: Rich descriptions vs. thin bullet points
4. **Strategic thinking**: Clear rationale vs. arbitrary choices

---

## Risk Analysis

### Low Risk ✅
- Expanding prompt with more detail (more context = better performance)
- Adding tactical examples (LLMs learn well from examples)
- Structured format (clear structure improves consistency)

### Medium Risk ⚠️
- **Prompt length**: Longer prompts may dilute key instructions
  - **Mitigation**: Use clear section headers, bold key instructions
  - **Testing**: Compare current vs. new prompt on same question

- **Over-prescription**: Too rigid structure may feel scripted
  - **Mitigation**: Emphasize "natural language" and "conversational flow"
  - **Testing**: Review sample sessions for conversational quality

### High Risk 🚨
None identified. This is improving existing instructions, not changing approach.

---

## Next Steps

1. **Review this analysis** ✅ (you're here)
2. **Approve approach**
3. **Implement Phase 1**: Rewrite PRODUCT_SENSE_FRAMEWORK (2-3 hours)
4. **Test with sample questions**: Run 3-5 test interviews
5. **Compare quality**: Current prompt vs. new prompt
6. **Implement Phase 2**: Enhanced mode prompts (1-2 hours)
7. **Deploy to production**

---

## Conclusion

The current prompt is a **framework cheat sheet** when we need **tactical coaching instructions**.

The examples show that excellent product sense interviews require:
- **Section-by-section execution guides** with specific language patterns
- **Explicit tactical patterns** (tables, creative names, V1 structure, strategic rationale)
- **Clear time budgets** per section with pacing guardrails
- **Transition mechanics** (verbal signals + pauses)

By expanding our prompt from 10 lines to 300 lines of actionable coaching, we can enable the agent to conduct interviews at the quality level shown in the examples.

**Key insight**: The agent doesn't need to memorize the framework - it needs to know **exactly what to do and say** at each step.

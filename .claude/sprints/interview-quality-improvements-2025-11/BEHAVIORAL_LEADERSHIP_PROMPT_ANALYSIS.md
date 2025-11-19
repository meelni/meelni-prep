# Leadership & Drive (Behavioral) Prompt Improvement Analysis

**Date**: 2025-11-19
**Branch**: `interview-timing-controls`
**Status**: Analysis Complete - Ready for Prompt Rewrite

---

## Executive Summary

After analyzing the expert Leadership & Drive behavioral interview example, I found the same pattern as the other frameworks: our prompt is **too condensed** and lacks **tactical execution guidance** for conducting STAR-based behavioral interviews.

**Key difference from other frameworks**: Behavioral interviews are **story-based** rather than framework-driven, requiring different coaching patterns focused on **probing for depth**, **extracting metrics**, and **assessing growth mindset**.

---

## Current Prompt (13 lines)

```python
LEADERSHIP_DRIVE_FRAMEWORK = """
## Leadership & Drive: STAR behavioral

**STAR:** Situation → Task → Action → Result

**Probe for:** Impact, collaboration, customer focus, innovation, ownership, adaptability, communication

## Green flags:
Concrete examples → quantified results → learning from failures → cross-functional collaboration

## Red flags:
Vague generalizations, no metrics, blame others, no trade-offs discussed
"""
```

**Problem**: This is a **definition** of STAR, not **coaching instructions** for conducting behavioral interviews.

---

## What the Example Shows

### Overall Structure (15-minute behavioral interview)

```
Opening & Context (30 sec) - Set the stage
Situation (2 min) - Rich context with metrics
Task (1 min) - Clear mandate
Action (4-5 min) - Detailed decisions and mistakes
Result (2-3 min) - Honest impact (good and bad)
Learning & Growth (3-4 min) - Lessons and application
Meta Connection (1 min) - Relevance to role
```

**Total**: ~15 minutes per story (behavioral interviews typically cover 2-3 stories in 35 min)

**Our prompt**: Says "STAR" but doesn't teach **how long each section should be** or **what depth to expect**.

---

## Section-by-Section Analysis

### SECTION 1: Opening & Context (30 seconds)

**What the expert does:**
```
"I'll share a significant failure from my time as Senior PM at [Previous Company]
that fundamentally changed how I approach product launches. This was about 18
months ago when I led the launch of our AI-powered recommendation engine - a
project I was passionate about but ultimately mismanaged.

Let me walk you through what happened and what I learned."
```

**Pattern**:
- Lead with impact: "fundamentally changed how I..."
- Timeframe: "18 months ago"
- Role: "Senior PM at [Company]"
- Outcome preview: "project I was passionate about but ultimately mismanaged"
- Structure preview: "Let me walk you through..."

**Our prompt**: Doesn't mention opening structure at all

**Gap**: No instruction on how to frame the story before diving into STAR

---

### SECTION 2: Situation (2 minutes)

**What the expert does:**
```
"So the context - our e-commerce platform was losing ground to competitors
who had better product discovery. Our CEO made personalization the top
company priority for 2023. We had about 2 million monthly active users,
but engagement was declining - people were browsing less, bounce rates were
up 30%.

I was asked to lead a tiger team to build an AI recommendation engine.
This was high visibility - board-level attention, $3 million budget, and
a promise to investors that we'd have it live by Q3.

The team included 8 engineers, 2 designers, a data scientist, and myself.
Half were contractors brought in specifically for their ML expertise.

The stakes were high - our Series B funding literally depended on showing
traction with this feature."
```

**Key elements covered**:
1. **Business context**: "losing ground to competitors," "CEO priority"
2. **Metrics**: "2 million MAU," "bounce rates up 30%," "$3M budget"
3. **Visibility/stakes**: "board-level attention," "Series B funding depended on it"
4. **Team composition**: "8 engineers, 2 designers, 1 data scientist"
5. **Timeline**: "by Q3"
6. **Why it mattered**: Stakes explicitly stated

**Our prompt says:**
```
Situation → Task → Action → Result
```

**Gap**: No instruction to probe for:
- Specific metrics (not "engagement was declining" but "bounce rates up 30%")
- Stakes (what was riding on this?)
- Team composition (who was involved?)
- Timeline constraints
- Business context

**Missing probing questions**:
- "What were the specific metrics showing?"
- "How big was the team?"
- "What was riding on this?"
- "What was the timeline?"

---

### SECTION 3: Task (1 minute)

**What the expert does:**
```
"My mandate was clear: Build and ship a recommendation engine that would
increase average session time by 40% and drive a 20% increase in conversion
rate within 6 months.

But beyond the metrics, I needed to:
- Coordinate between three different teams who'd never worked together
- Manage contractors alongside full-time employees
- Navigate the technical complexity of real-time ML at scale
- Keep stakeholders aligned while moving fast

I was both the PM and effectively the team lead since we didn't have an
engineering manager allocated."
```

**Key elements**:
1. **Clear success criteria**: "40% increase in session time, 20% conversion rate"
2. **Bullet list of responsibilities**: 4 specific challenges
3. **Role clarity**: "PM and effectively team lead"

**Our prompt says:**
```
Task
```

**Gap**: No instruction to extract:
- Specific success metrics/KPIs
- Multiple responsibilities (not just "build a feature")
- Role clarity (what were YOU responsible for vs. team?)
- Constraints or challenges

**Missing probing questions**:
- "What was the specific goal?"
- "What were you personally responsible for?"
- "What made this challenging?"

---

### SECTION 4: Action (4-5 minutes) - MOST IMPORTANT SECTION

**What the expert does:**
```
"Here's where I made my critical mistakes.

First mistake - I got seduced by technical sophistication. The ML
contractors proposed this cutting-edge collaborative filtering algorithm.
It was impressive, published-paper-worthy stuff. I thought, 'This will
blow our competitors away.' So I advocated for it hard, even though our
senior engineers expressed concerns about complexity.

Second mistake - I managed up but not across. I was so focused on
impressing the CEO with our progress that I held weekly exec demos
showing amazing results on our test data. But I wasn't spending enough
time with our infrastructure team who'd have to actually deploy this
thing. I assumed they'd figure it out when the time came.

Third mistake - I ignored early warning signs. About 8 weeks in, our QA
engineer mentioned the model was taking 400 milliseconds to return
recommendations - 4x our latency budget. I said 'we'll optimize later'
and kept pushing for more features. The data scientist warned me about
model drift in production. I noted it but didn't act.

What I actually did:
- Ran daily standups focused on feature delivery, not system health
- Celebrated complexity as innovation in stakeholder updates
- Pushed the team to add more signals to the model - user history,
  social signals, trending items
- Built beautiful dashboards showing theoretical lift in conversion

By week 14, we had this impressive model that worked perfectly in our
test environment."
```

**Pattern for failure stories**:
- **Lead with accountability**: "Here's where I made my critical mistakes"
- **Numbered mistakes**: "First mistake," "Second mistake," "Third mistake"
- **Specific decisions**: Not "I prioritized wrong" but "I said 'we'll optimize later'"
- **Concrete actions**: Bullet list of things actually done
- **Timeline markers**: "8 weeks in," "week 14"

**Our prompt says:**
```
Action
Probe for: Impact, collaboration, customer focus, innovation, ownership, adaptability, communication
```

**Gap**: No instruction on:
- How to structure action section (numbered mistakes, bullet lists)
- How to probe for specifics ("What exactly did you say/do?")
- How to extract accountability (not "the team failed" but "I decided X")
- Timeline markers to show progression

**Missing probing questions**:
- "Walk me through what you actually did"
- "What was your specific decision?"
- "What did you say when that warning came up?"
- "How did you prioritize?"

---

### SECTION 5: Result (2-3 minutes)

**What the expert does:**
```
"Launch day was a disaster.

Within 2 hours of going live, our site latency increased 300%. The
recommendation engine was making 50 API calls per page load. Pages that
loaded in 1 second now took 4 seconds. Mobile was basically unusable.

But worse - the recommendations were wrong. The model that worked
beautifully on historical data was recommending winter coats in July,
suggesting men's shoes to users who'd only bought women's clothing. The
model drift we'd ignored hit us hard.

We had to roll back within 6 hours.

The immediate impact:
- Lost 15% of our daily active users that week
- Conversion rate actually dropped 8% due to trust issues
- Two contractors' contracts weren't renewed
- The senior engineer who'd warned about complexity transferred teams

The longer-term impact:
- Delayed our Series B by 6 months
- Had to rebuild with a simpler algorithm - took another 4 months
- My credibility took a huge hit - I wasn't given another high-visibility
  project for a year"
```

**Pattern**:
- **Dramatic opening**: "Launch day was a disaster"
- **Specific technical failures**: "300% latency increase," "50 API calls per page"
- **Business impact metrics**: "Lost 15% DAU," "conversion dropped 8%"
- **People impact**: "Two contractors let go," "senior engineer transferred"
- **Immediate vs. long-term**: Two separate sections
- **Personal impact**: "My credibility took a huge hit," "not given another project for a year"

**Our prompt says:**
```
Result
```

**Gap**: No instruction to extract:
- **Immediate impact** (what happened right away?)
- **Longer-term impact** (what happened 3-6 months later?)
- **Quantified metrics** (not "some users left" but "lost 15% DAU")
- **People impact** (how did this affect team/career?)
- **Honesty about failure** (for failure stories: what went wrong?)

**Missing probing questions**:
- "What was the immediate impact?"
- "What were the specific metrics?"
- "How did this affect the team?"
- "What happened 6 months later?"
- "How did this affect you personally?"

---

### SECTION 6: Learning & Growth (3-4 minutes) - CRITICAL FOR BEHAVIORAL

**What the expert does:**
```
"This failure taught me three crucial lessons that I apply to every
project now:

First - Perfect is the enemy of shipped. Now I always ask: 'What's the
simplest version that delivers value?' For that recommendation engine,
we could've started with basic collaborative filtering and iterated.
Instead, I chased perfection and shipped nothing.

Second - Technical impressiveness means nothing if it doesn't work at
scale. Now I have a rule: any algorithm or system has to prove itself
at 10x current load before we commit. I actually have a checklist I
run through with engineers before any architectural decision.

Third - Silent stakeholders are dangerous stakeholders. The infrastructure
team I ignored? They're the ones who know where bodies are buried. Now I
do what I call 'concentric circle stakeholder management' - I map every
team that touches my product and have explicit check-ins.

How I've applied these lessons:
At my current role, I recently led another personalization project.
This time:
- Started with simple rules-based recommendations - shipped in 4 weeks
- Set up load testing from day 1 - caught issues early
- Had infrastructure team as core members, not consultants
- Result: 25% increase in engagement, smooth launch, promoted to Senior PM

The failure was painful, but it made me a fundamentally better PM. I'm
actually grateful for it now - better to learn these lessons on a $3
million project than a $30 million one."
```

**Pattern**:
- **Numbered lessons**: "First," "Second," "Third"
- **Specific behavioral changes**: Not "I communicate better" but "I have a checklist I run through"
- **Application story**: Concrete example of using lessons
- **Results of application**: "25% increase, smooth launch, promoted"
- **Growth mindset**: "I'm actually grateful for it now"

**Our prompt says:**
```
Probe for: [...] learning from failures [...]
Green flags: [...] learning from failures [...]
```

**Gap**: No instruction on:
- How to structure learnings (numbered list)
- How to probe for **specific behavioral changes** (not "I communicate more" but "I do X checklist")
- How to extract **application stories** (when did you use this lesson?)
- How to assess **growth mindset** (are they grateful for failures?)

**Missing probing questions**:
- "What did you learn from this?"
- "How do you do things differently now?"
- "Give me a specific example of applying this lesson"
- "How did that turn out?"

---

### SECTION 7: Meta Connection (1 minute) - OPTIONAL BUT POWERFUL

**What the expert does:**
```
"This experience is particularly relevant to Meta because you operate
at unprecedented scale. When Reels launches a new feature, it's
immediately hitting billions of users. There's no room for the kind
of mistakes I made.

That's why I'm excited about Meta's culture of 'Move Fast and Build
Things' - it's not just about speed, but sustainable speed. My failure
taught me the difference.

I'd love to hear about how Meta handles the tension between innovation
and stability at scale. How do teams here balance pushing technical
boundaries with reliability?"
```

**Pattern**:
- Connect lessons to company's challenges
- Show company knowledge (culture, scale, etc.)
- Turn it into a question (shows genuine interest, not just performance)

**Our prompt**: Doesn't mention this pattern

**Gap**: No instruction to coach candidates to connect their stories to the role/company

---

## Tactical Patterns for Behavioral Interviews

### Pattern 1: Probing Questions by STAR Section

**Situation Probes**:
- "What were the specific metrics?"
- "How big was the team?"
- "What was the timeline?"
- "What was riding on this?"

**Task Probes**:
- "What was YOUR specific responsibility?"
- "What were the success criteria?"
- "What made this challenging?"

**Action Probes**:
- "Walk me through what YOU actually did" (not the team)
- "What was your specific decision at that moment?"
- "What did you say when X happened?"
- "How did you prioritize between X and Y?"

**Result Probes**:
- "What was the immediate impact?"
- "What were the specific metrics?"
- "What happened 3-6 months later?"
- "How did this affect you personally?"

**Learning Probes**:
- "What did you learn from this?"
- "How do you do things differently now?"
- "Give me a concrete example of applying this lesson"
- "How did that turn out?"

### Pattern 2: Depth Indicators (What to Listen For)

**Shallow response** (probe deeper):
- Vague: "We increased engagement" → Probe: "By how much?"
- Team-focused: "The team decided..." → Probe: "What did YOU decide?"
- No metrics: "It went well" → Probe: "What does 'well' mean in numbers?"
- No timeline: "Eventually we shipped" → Probe: "How long did this take?"

**Deep response** (green flags):
- Specific metrics: "15% of DAU," "300% latency increase"
- Personal accountability: "I decided," "I said," "I advocated"
- Timeline markers: "8 weeks in," "within 6 hours"
- Concrete actions: "I ran daily standups," "I built dashboards"

### Pattern 3: Failure Story Assessment

**What great failure stories have**:
- ✅ Full accountability (no blaming others)
- ✅ Specific mistakes enumerated ("First mistake," "Second mistake")
- ✅ Honest impact (metrics on what went wrong)
- ✅ Growth arc (specific lessons learned and applied)
- ✅ Evidence of application (later success using lessons)

**Red flags in failure stories**:
- ❌ Blaming others: "The engineers didn't listen"
- ❌ Vague learnings: "I learned to communicate better"
- ❌ No metrics: "It didn't go well"
- ❌ No application: Can't cite example of using lessons

### Pattern 4: Time Management for Multiple Stories

**35-minute behavioral interview typically covers**:
- **Opening** (1 min): Explain interview structure
- **Story 1** (15 min): Deep dive (usually failure or complex challenge)
- **Story 2** (12 min): Medium depth (leadership without authority, conflict)
- **Story 3** (5 min): Quick story (feedback, minor success)
- **Closing** (2 min): Candidate questions

**Pacing indicators**:
- If Situation > 3 min: "Let's move to what you did"
- If Action < 3 min: Probe deeper ("Walk me through your specific decisions")
- If no Result metrics by 12-min mark: "What were the specific outcomes?"
- If no Learning by 14-min mark: "What did you learn from this?"

---

## Current Prompt Deficiencies

### 1. No Interview Structure Guidance

**Current**:
```
STAR: Situation → Task → Action → Result
```

**Problem**: This defines STAR but doesn't tell the agent:
- How long each section should be (S: 2 min, T: 1 min, A: 4-5 min, R: 2-3 min, L: 3-4 min)
- That Learning/Growth is a required 6th section
- That opening/context is needed before diving into STAR
- How to manage time across 2-3 stories

### 2. No Probing Question Guidance

**Current**:
```
Probe for: Impact, collaboration, customer focus, innovation, ownership, adaptability, communication
```

**Problem**: Lists **what** to probe for, not **how** to probe:
- No specific probing questions listed
- No guidance on when to probe (shallow vs. deep indicators)
- No examples of good vs. bad probing

### 3. No Depth Assessment Criteria

**Current**:
```
Green flags: Concrete examples → quantified results → learning from failures → cross-functional collaboration
Red flags: Vague generalizations, no metrics, blame others, no trade-offs discussed
```

**Problem**: Lists flags but doesn't teach **how to coach toward green flags**:
- How to extract metrics when candidate says "it went well"
- How to redirect when candidate blames others
- How to probe for concrete examples when candidate is vague

### 4. No Failure Story Coaching

**Current**: No mention of failure stories

**Problem**: Failure stories require different coaching:
- Need to probe for accountability (not blame)
- Need to extract specific mistakes (not "things went wrong")
- Need to assess growth mindset (grateful for lessons?)
- Need application stories (when did you use what you learned?)

---

## Recommended Prompt Structure

```python
LEADERSHIP_DRIVE_FRAMEWORK = """
## Leadership & Drive (Behavioral) Interview: Complete Execution Guide

You will guide the candidate through 2-3 STAR behavioral stories in a
35-minute interview. Your role is to probe for depth, extract metrics, and
assess growth mindset.

---

### INTERVIEW STRUCTURE (35 minutes)

**Time allocation**:
- Opening (1 min): Explain structure, put candidate at ease
- Story 1 (15 min): Deep dive on major challenge or failure
- Story 2 (12 min): Medium depth on leadership/conflict
- Story 3 (5 min): Quick story on feedback or minor success
- Closing (2 min): Candidate questions

**Critical**: Behavioral interviews are story-driven, not framework-driven.
Your job is to help the candidate tell their story with depth and specificity.

---

### OPENING (1 minute)

**What to say**:
"Let's start with a behavioral interview. I'll ask you to share specific
examples from your experience. I'm looking for concrete details - what
you personally did, the impact you had, and what you learned.

I might interrupt to ask follow-up questions - that's me digging deeper,
not a sign you're off track. Ready?"

**Transition**: "Tell me about [question]"

---

### STORY STRUCTURE: STAR + Learning (15 minutes per story)

Each story follows this 6-part structure:

#### SECTION 1: Opening & Context (30 seconds)
**Candidate should**:
- Frame the story: "I'll share a [type] from my time at [company]"
- Timeframe: "About [X] months/years ago"
- Outcome preview: "This was a [success/failure/challenge] that..."

**If missing**: "Before you dive in, give me quick context - when was this and where?"

---

#### SECTION 2: Situation (2 minutes)

**Goal**: Get rich context with metrics and stakes

**What to listen for**:
- ✅ Specific metrics (not "engagement declined" but "bounce rate up 30%")
- ✅ Stakes (what was riding on this?)
- ✅ Team composition (how many people?)
- ✅ Timeline constraints
- ✅ Business context (why did this matter?)

**Probing questions** (use when shallow):
- "What were the specific metrics showing?"
- "How big was the team?"
- "What was riding on this project?"
- "What was the timeline?"
- "Why did this matter to the business?"

**Red flags** (probe immediately):
- Vague: "Engagement was down" → "By how much?"
- No stakes: "It was an important project" → "What made it important?"
- No numbers: "A large team" → "How many people?"

**Timing**: If > 3 minutes, move on: "Got it. What were you responsible for?"

---

#### SECTION 3: Task (1 minute)

**Goal**: Understand candidate's specific responsibility

**What to listen for**:
- ✅ Clear success criteria with numbers
- ✅ Personal responsibility (not team goals)
- ✅ Multiple challenges/constraints
- ✅ Role clarity (what were YOU accountable for?)

**Probing questions**:
- "What was YOUR specific responsibility?"
- "What were the success metrics?"
- "What made this challenging?"
- "What were you personally accountable for?"

**Red flags**:
- Team-focused: "We had to..." → "What were YOU responsible for?"
- Vague goals: "Make it better" → "Better how? What was the goal?"

**Timing**: Should be brief (1 min max). If longer, redirect: "What did you do?"

---

#### SECTION 4: Action (4-5 minutes) - MOST IMPORTANT SECTION

**Goal**: Extract specific decisions, actions, and thought process

**What to listen for**:
- ✅ First-person actions: "I decided," "I said," "I advocated"
- ✅ Specific decisions with reasoning
- ✅ Concrete actions (not "communicated more" but "held daily standups")
- ✅ Timeline markers: "Week 3," "After 2 months"
- ✅ Trade-offs considered

**For failure stories, listen for**:
- ✅ Numbered mistakes: "First mistake," "Second mistake"
- ✅ Accountability: "I made the mistake of..."
- ✅ Specific bad decisions: "I said 'we'll optimize later'"

**Probing questions** (use frequently):
- "Walk me through what YOU actually did" (not the team)
- "What was your specific decision at that moment?"
- "What did you say when [X] happened?"
- "How did you prioritize between [X] and [Y]?"
- "What did you consider before deciding?"
- "What trade-offs did you make?"

**Red flags** (probe aggressively):
- Team-focused: "We decided" → "What did YOU decide?"
- Vague: "I communicated" → "What exactly did you say?"
- Passive: "It was decided" → "What was your role in that decision?"
- No reasoning: "I did X" → "Why did you choose X over Y?"

**Timing**: This is the heart of the story - spend 4-5 minutes here. If < 3 minutes,
they're being too high-level: "Give me more detail on your specific decisions"

---

#### SECTION 5: Result (2-3 minutes)

**Goal**: Understand impact (positive or negative) with metrics

**What to listen for**:
- ✅ Immediate impact (what happened right away?)
- ✅ Long-term impact (3-6 months later)
- ✅ Quantified metrics: percentages, numbers, timelines
- ✅ People impact (how did this affect team/career?)
- ✅ For failures: Honest about what went wrong

**Probing questions**:
- "What was the immediate impact?"
- "What were the specific numbers?"
- "What happened 3-6 months later?"
- "How did this affect the team?"
- "How did this affect you personally?"

**For failure stories, probe for**:
- "What went wrong specifically?"
- "What were the metrics showing?"
- "How did this impact the business?"
- "How did this affect your career?"

**Red flags**:
- Vague: "It went well" → "What does 'well' mean in numbers?"
- No metrics: "Big impact" → "How big? Give me specific numbers"
- For failures: Downplaying → "Walk me through what actually happened"
- Blaming: "The team didn't..." → "What was your role in that?"

**Timing**: 2-3 minutes. If they skip metrics, probe: "Give me the specific numbers"

---

#### SECTION 6: Learning & Growth (3-4 minutes) - CRITICAL FOR ASSESSMENT

**Goal**: Assess growth mindset and ability to learn from experience

**What to listen for**:
- ✅ Numbered lessons: "First lesson," "Second lesson"
- ✅ Specific behavioral changes (not "I communicate better" but "I now do X checklist")
- ✅ Application story (concrete example of using lesson)
- ✅ Results of application (how did it turn out?)
- ✅ Growth mindset (for failures: grateful for lessons?)

**Probing questions** (ALWAYS ask these):
- "What did you learn from this?"
- "How do you do things differently now?"
- "Give me a specific example of applying this lesson"
- "How did that turn out?"
- For failures: "How do you think about this failure now?"

**What great learning looks like**:
```
"This taught me three lessons:
First - [Lesson with specific behavioral change]
Second - [Lesson with tool/process created]
Third - [Lesson with new approach]

How I applied this:
[Concrete story with situation, what they did differently, results]"
```

**Red flags**:
- Vague: "I learned to communicate better" → "What specifically do you do differently?"
- No application: Can't cite example → "When have you used this lesson?"
- No evidence: "It made me better" → "How did you know it worked?"
- For failures: Still bitter/blaming → Growth mindset concern

**Timing**: This is critical - spend 3-4 minutes here. If they try to skip, insist:
"Before we move on, what did you learn from this experience?"

---

#### SECTION 7: Meta Connection (1 minute) - OPTIONAL BUT IMPRESSIVE

**If time permits**, encourage candidate to connect story to role:
- "How is this relevant to what you'd do here?"
- "What does this tell you about how you'd approach [company challenge]?"

**Green flag**: They connect lessons to company's specific challenges

---

### PROBING PATTERNS BY ASSESSMENT AREA

**Impact**:
- "What were the specific numbers?"
- "How did you measure success?"
- "What was the before and after?"

**Collaboration**:
- "Who else was involved?"
- "How did you work with [other team]?"
- "What conflicts came up and how did you resolve them?"

**Customer Focus**:
- "How did this affect users?"
- "What customer feedback did you get?"
- "How did you validate this was the right problem?"

**Innovation**:
- "What alternatives did you consider?"
- "Why was this approach novel?"
- "What risks did you take?"

**Ownership**:
- "What did YOU personally decide?"
- "When things went wrong, what did YOU do?"
- "What would you do differently?"

**Adaptability**:
- "When did plans change?"
- "How did you respond?"
- "What did you learn to do differently?"

**Communication**:
- "How did you keep stakeholders aligned?"
- "How did you handle disagreement?"
- "What did you say when [X] happened?"

---

### TIMING MANAGEMENT ACROSS STORIES

**Story 1 (15 min)** - Deep dive:
- Usually a failure or major challenge
- Spend full time on all 6 sections
- Probe deeply for specifics and learnings

**Story 2 (12 min)** - Medium depth:
- Leadership without authority, conflict resolution
- Less time on Situation (1.5 min)
- Still full Action section (3-4 min)
- Full Learning section (2-3 min)

**Story 3 (5 min)** - Quick story:
- Feedback received, minor success
- Situation + Task (1 min combined)
- Action (2 min)
- Result + Learning (2 min)

**Pacing indicators**:
- At 5-min mark (Story 1): Should be past Situation/Task, into Action
- At 10-min mark (Story 1): Should be in Result or Learning
- At 20-min mark (Story 2): Should be in Action section
- At 27-min mark (Story 3): Decide if there's time for story 3

**If running behind**:
- "Let's make sure we get to what you learned" (prioritize Learning section)
- "Give me the headlines on results" (compress Result section)
- "One more quick story..." (cut to 2 stories if needed)

---

### DEPTH INDICATORS (When to Probe vs. Move On)

**Shallow response** (PROBE DEEPER):
- ❌ "We increased engagement" → "By how much?"
- ❌ "The team decided..." → "What did YOU decide?"
- ❌ "It went well" → "What does 'well' mean in numbers?"
- ❌ "Eventually we shipped" → "How long did this take?"
- ❌ "I communicated more" → "What specifically did you do differently?"

**Deep response** (GREEN FLAG, move on):
- ✅ "Lost 15% of our DAU that week"
- ✅ "I decided to advocate for the complex algorithm"
- ✅ "Within 6 hours we had to roll back"
- ✅ "Now I run this checklist with engineers before any architectural decision"

---

### FAILURE STORY ASSESSMENT (Special Pattern)

Failure stories are the most revealing. Look for these elements:

**Accountability** (Critical):
- ✅ "I made the mistake of..."
- ✅ "Here's where I went wrong..."
- ❌ "The team didn't listen..." (red flag - blaming)

**Specific mistakes**:
- ✅ Numbered: "First mistake," "Second mistake"
- ✅ Concrete: "I said 'we'll optimize later'"
- ❌ Vague: "We didn't plan well"

**Honest impact**:
- ✅ "Lost 15% DAU, delayed Series B by 6 months, my credibility took a huge hit"
- ❌ "It didn't work out as planned"

**Growth arc**:
- ✅ Specific lessons with behavioral changes
- ✅ Application story with results
- ✅ Grateful for the lesson ("I'm actually grateful now...")
- ❌ Still bitter or defensive

**Probing for failure stories**:
- "What specifically did you do wrong?"
- "How did you contribute to this failure?"
- "What would you do differently?"
- "How do you think about this failure now?"

---

### GREEN FLAGS (What Excellence Looks Like)

✅ **Specific metrics throughout**: "30% bounce rate," "15% DAU loss," "4-5 min latency"
✅ **First-person accountability**: "I decided," "I advocated," "I made the mistake"
✅ **Timeline markers**: "Week 8," "Within 6 hours," "18 months ago"
✅ **Concrete actions**: Not "communicated" but "held daily standups focused on X"
✅ **Numbered structures**: "First mistake," "Second lesson," "Three key decisions"
✅ **Trade-offs discussed**: "I chose X over Y because..."
✅ **Growth mindset**: For failures, grateful for lessons and can show application
✅ **Application stories**: Can cite concrete example of using lessons learned
✅ **Meta connection**: Connects story to company's challenges unprompted

---

### RED FLAGS (What to Probe Immediately)

❌ **Vague generalizations**: "We improved things" → Probe: "By how much?"
❌ **No metrics**: "It went well" → Probe: "What does 'well' mean in numbers?"
❌ **Blaming others**: "The team didn't..." → Probe: "What was YOUR role?"
❌ **Passive voice**: "It was decided" → Probe: "What did YOU decide?"
❌ **No trade-offs**: Only describes what happened → Probe: "What alternatives did you consider?"
❌ **No learning**: Skips growth section → Insist: "What did you learn from this?"
❌ **Can't apply lessons**: No example of using lessons → Red flag for growth mindset
❌ **Still defensive about failures**: Blames others, makes excuses → Major red flag

---

### YOUR INTERVIEWER PERSONA

**Be warm but probing**:
- "That's interesting - tell me more about YOUR specific decision there"
- "I want to understand your thought process - walk me through that moment"
- "What did YOU personally do when that happened?"

**Interrupt when needed**:
- "Before we go further, what were the specific metrics?"
- "Hold on - what was YOUR decision vs. the team's?"
- "Let's pause there - what did you learn from this?"

**Show genuine interest**:
- "Mm-hmm" (active listening)
- "That's a tough situation" (empathy)
- "What happened next?" (curiosity)

**Balance probing with encouragement**:
- After deep answer: "Great level of detail - what was the result?"
- After vulnerability: "I appreciate the honesty - what did you learn?"

**Manage time professionally**:
- "We've got about 5 minutes left - let's make sure we cover what you learned"
- "In the interest of time, give me the headline on results"

---

## TIMING DISCIPLINE

**Critical**: Behavioral interviews require strict time management across multiple stories.

**Time budget per story**:
- **Story 1 (failure/major challenge)**: 15 minutes
  - Opening: 30 sec
  - Situation: 2 min
  - Task: 1 min
  - Action: 4-5 min
  - Result: 2-3 min
  - Learning: 3-4 min

- **Story 2 (leadership/conflict)**: 12 minutes
  - Situation + Task: 1.5 min
  - Action: 3-4 min
  - Result: 2 min
  - Learning: 2-3 min

- **Story 3 (quick story)**: 5 minutes
  - Situation + Task: 1 min
  - Action: 2 min
  - Result + Learning: 2 min

**Pacing checkpoints**:
- 5-min mark: Should be in Action section
- 10-min mark: Should be in Result or Learning
- 15-min mark: Story 1 complete, start Story 2
- 27-min mark: Decide if time for Story 3
- 33-min mark: Wrap up, leave time for candidate questions

**If running behind**:
- Compress Situation: "Give me the quick context"
- Maintain Action depth: "Tell me more about your specific decisions"
- Insist on Learning: "Before we move on, what did you learn?"

"""
```

---

## Implementation Priority

### High Priority: Rewrite Leadership & Drive Framework
**File**: `agent/shared/prompts.py` - `LEADERSHIP_DRIVE_FRAMEWORK`
**Effort**: 2-3 hours
**Impact**: High - behavioral interviews are common and currently poorly coached

**What to include**:
1. Complete 6-part story structure (Opening, STAR, Learning, Connection)
2. Time budgets for multiple stories (15 min, 12 min, 5 min)
3. Probing question patterns by section
4. Depth indicators (when to probe vs. move on)
5. Failure story assessment criteria
6. Green/red flags with probing responses

---

## Success Metrics

### Quantitative:
1. **Story depth**: Average number of metrics cited per story
2. **Accountability**: % using first-person language ("I decided" vs. "We decided")
3. **Learning extraction**: % of stories where learning section is covered
4. **Application stories**: % where candidate cites specific example of using lessons

### Qualitative:
1. **Growth mindset**: For failure stories, shows gratitude and application
2. **Specificity**: Concrete actions vs. vague generalizations
3. **Ownership**: Takes responsibility vs. blames others

---

## Key Insight

Behavioral interviews are **fundamentally different** from framework-driven interviews (Product Sense, Analytical Thinking):

- **Product Sense/Analytical**: Agent guides through structured framework with tables and prioritization
- **Behavioral**: Agent extracts stories through **probing questions** and **depth assessment**

The coaching skill is not "follow these steps" but "probe until you get specifics."

**Current prompt** defines STAR but doesn't teach **how to probe for depth** or **assess growth mindset**.

---

## Next Steps

1. **Review this analysis** ✅
2. **Approve approach**
3. **Implement rewrite**: Leadership & Drive framework (2-3 hours)
4. **Test with sample behavioral questions**
5. **Deploy**

---

**Ready to rewrite when you are!** This will complete the full suite of interview framework rewrites (Product Sense, Analytical Thinking, Leadership & Drive).

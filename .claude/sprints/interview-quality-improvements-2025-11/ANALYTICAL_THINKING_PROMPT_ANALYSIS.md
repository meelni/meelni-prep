# Analytical Thinking Prompt Improvement Analysis

**Date**: 2025-11-19
**Branch**: `interview-timing-controls`
**Status**: Analysis Complete - Ready for Prompt Rewrite

---

## Executive Summary

After analyzing the expert Analytical Thinking interview (Instagram Reels goal-setting), I found the **same pattern** as Product Sense: our prompt is a condensed framework outline when we need detailed tactical execution instructions.

**Key difference from Product Sense**: Analytical Thinking has **more structured components** (NSM, Proxies, Guardrails, Tradeoffs) that require **even more explicit formatting guidance**.

---

## Current Prompt (18 lines)

```python
ANALYTICAL_THINKING_FRAMEWORK = """
## Analytical Thinking: Goal-setting & tradeoffs

1. Setup - Scope, constraints, game plan
2. Why now - Market signal, competitive advantage
3. Ecosystem - 4 players (demand/supply/platform/partners), pick focus
4. North Star - 1-2 simple metrics with clear business tie
5. Proxies - 3-4 leading indicators (AARRR: Acquisition/Activation/Retention/Revenue/Referral)
6. Guardrails - Simple business metrics (user health, content quality, revenue, ecosystem balance)
7. Goal - Journey map → prioritize (Influence × Impact) → "[Metric] from X to Y in Z timeframe"
8. Tradeoffs - Pros/cons both options → decision with rationale

## Green flags:
Simple NSM with clear business tie → thoughtful guardrails → journey-based goal → structured tradeoff analysis

## Red flags:
Complex composite NSM, no proxy metrics, missing guardrails, vague goals, weak tradeoff rationale
"""
```

**Problem**: This lists **what** to do, not **how** to structure and present each component.

---

## What the Example Shows (Line-by-Line Breakdown)

### SECTION 1: Opening & Assumptions (45 seconds)

**What the expert does:**
```markdown
"So Reels - this is Meta's answer to TikTok, launched in 2020, now a core
part of Instagram's strategy. We're talking about short-form video content,
up to 90 seconds, with creation tools, music, and effects.

Quick assumptions: I'm focusing on Instagram Reels specifically, not Facebook
Reels. Geographic focus on global markets but I'll use U.S. examples. I'm
assuming current state where Reels is established but still growing, not
launch phase.

My approach: I'll review why Reels exists strategically, map the ecosystem
and stakeholders, define a North Star metric with proxy metrics and guardrails,
then set specific team goals and work through a tradeoff. Sound good?"
```

**Our prompt says:**
```
Setup - Scope, constraints, game plan
```

**Gap**: No instruction to:
- Start with product context (what it is, when launched, current state)
- State 3-4 specific scoping assumptions
- Explicitly list the 8-step plan as a verbal roadmap

---

### SECTION 2: Product Rationale (4 minutes)

**What the expert does:**
```markdown
"The reality is, Reels exists because TikTok fundamentally changed how
people consume content. We went from curated feeds of people you know to
AI-driven entertainment from anyone. Instagram had to evolve or become
irrelevant to Gen Z.

Why Reels matters strategically:
First, it's about attention retention. Users were leaving Instagram for
TikTok - average session time was declining. Reels keeps users in our
ecosystem.

Second, creator ecosystem. We were losing the next generation of creators
to TikTok. Without creators, we have no content. Without content, we have
no users.

Third, advertising evolution. Short-form video ads are the future - more
engaging, better for direct response. Reels creates new ad inventory that
commands premium prices.

Current state: Reels is now 40% of time spent on Instagram, but we're
still playing catch-up on recommendation quality and creator tools compared
to TikTok.

Mission for Reels: 'To entertain and inspire through short-form video while
fostering authentic creator expression and community connection.'"
```

**Our prompt says:**
```
Why now - Market signal, competitive advantage
```

**Gap**: No instruction to:
- Lead with strategic context (why product exists)
- Use "First, Second, Third" structure for strategic pillars
- State current performance metrics
- End with mission statement

---

### SECTION 3: Ecosystem Mapping (7 minutes) - CRITICAL SECTION

**What the expert does:**

#### 3.1: Four-Player Table

```markdown
| Player | Value They Get | Must-Take Actions | Health Metrics |
|--------|----------------|-------------------|----------------|
| Viewers 🛒 | Entertainment, discovery, inspiration | Watch, engage, share | Time spent, retention, satisfaction |
| Creators 📦 | Reach, monetization, creative expression | Create quality content consistently | Follower growth, earnings, posting frequency |
| Instagram 🏢 | User engagement, ad revenue, competitive position | Surface relevant content, provide tools | DAU, revenue per user, market share |
| Advertisers 🤝 | Targeted reach, conversions, brand awareness | Create engaging ad content | ROAS, conversion rates, reach |
```

**Our prompt says:**
```
Ecosystem - 4 players (demand/supply/platform/partners), pick focus
```

**Gap**: No instruction to:
- ✅ Use a **4-column table** (Player, Value, Actions, Metrics)
- ✅ Use emojis for player types (🛒 demand, 📦 supply, 🏢 platform, 🤝 partners)
- ✅ Describe each player's value exchange
- ✅ State must-take actions for each player
- ✅ List health metrics for each player

#### 3.2: Ecosystem Tension Statement

**What the expert does:**
```markdown
"The tension here: Viewers want endless entertainment, creators want
monetization and reach, Instagram needs revenue and engagement,
advertisers want performance. The magic is balancing all four."
```

**Our prompt**: Doesn't mention this pattern at all

**Gap**: No instruction to articulate the fundamental tension between stakeholders

#### 3.3: Focus Declaration with Rationale

**What the expert does:**
```markdown
"I'll focus on the creator ecosystem because they're the supply side -
without thriving creators, everything else falls apart. TikTok's winning
because they made unknown creators famous. We need to match that."
```

**Our prompt says:**
```
pick focus
```

**Gap**: No instruction to explain **why** you're focusing on that player (supply-side criticality, competitive dynamics, etc.)

---

### SECTION 4: North Star Metric (3 minutes) - HIGHLY STRUCTURED

**What the expert does:**

#### 4.1: NSM Declaration with Icon

```markdown
📊 NSM: Weekly Active Creators (WAC)
This is the number of unique users who post at least one Reel per week.
```

**Our prompt says:**
```
North Star - 1-2 simple metrics with clear business tie
```

**Gap**: No instruction to:
- Use an icon (📊)
- State metric name and abbreviation
- Provide precise operational definition

#### 4.2: Why This NSM Works (4-Point Structure)

**What the expert does:**
```markdown
Why this NSM works:
1. Captures supply-side health - more creators means more diverse content
2. Weekly frequency ensures consistent content flow
3. Simple to measure and explain to teams
4. Directly controllable through creator tools and incentives
```

**Our prompt**: Doesn't mention this structure

**Gap**: No instruction to articulate **why** this metric works (4 reasons minimum)

#### 4.3: Strengths & Drawbacks

**What the expert does:**
```markdown
Strengths:
- Leading indicator of content variety
- Correlates with viewer engagement long-term
- Easy to track and influence

Drawbacks:
- Doesn't capture content quality
- Could incentivize spam if not careful
- Misses passive viewers who drive ad revenue
```

**Our prompt**: Doesn't mention this pattern

**Gap**: No instruction to explicitly list strengths (3) and drawbacks (3) of the chosen NSM

---

### SECTION 5: Proxy Metrics (2 minutes) - AARRR FRAMEWORK

**What the expert does:**

```markdown
Leading indicators using AARRR framework:

🆕 Acquisition: New creators posting first Reel (weekly)
- Shows creator funnel top growth

✨ Activation: % of new creators posting 2nd Reel within 7 days
- Shows if creation experience resonates

🔄 Retention: 4-week creator retention rate
- Shows sustainable creator satisfaction

💰 Revenue: Creator fund payouts per creator
- Shows monetization health

📈 Referral: % creators using collaborative features
- Shows network effects
```

**Our prompt says:**
```
Proxies - 3-4 leading indicators (AARRR: Acquisition/Activation/Retention/Revenue/Referral)
```

**Gap**: No instruction to:
- ✅ Use emoji icons for each stage (🆕 ✨ 🔄 💰 📈)
- ✅ Format as: **[Stage Name]: [Specific Metric]**
- ✅ Add 1-sentence "Shows [insight]" explanation per metric
- ✅ Cover all 5 AARRR stages (we say "3-4" but example uses all 5)

---

### SECTION 6: Guardrails (2 minutes) - FOUR CATEGORIES

**What the expert does:**

```markdown
Simple business metrics to prevent NSM gaming:

😊 Viewer satisfaction: Average watch time per session
- Ensures we're not sacrificing viewer experience

✅ Content quality: Violation rate per 1000 Reels
- Prevents spam content

💵 Business health: Revenue per thousand views (RPM)
- Ensures monetization isn't suffering

⚖️ Ecosystem balance: Viewer-to-creator ratio
- Maintains healthy supply/demand
```

**Our prompt says:**
```
Guardrails - Simple business metrics (user health, content quality, revenue, ecosystem balance)
```

**Gap**: No instruction to:
- ✅ Use emoji icons (😊 ✅ 💵 ⚖️)
- ✅ Format as: **[Category]: [Specific Metric]**
- ✅ Add 1-sentence "Ensures/Prevents [risk]" explanation per guardrail
- ✅ Cover all 4 categories explicitly

**Note**: Our prompt **does** list the 4 categories, but doesn't teach the formatting or explanation pattern.

---

### SECTION 7: Team Goals (4 minutes) - JOURNEY-BASED

**What the expert does:**

#### 7.1: Journey to NSM

```markdown
Creator journey to NSM:
1. 🚪 Discovers Reels creation tools
2. 💡 Gets inspired to create
3. 🎬 Creates first Reel
4. 📊 Sees performance
5. 🔄 Creates regularly (NSM event)
```

**Our prompt says:**
```
Goal - Journey map → prioritize (Influence × Impact) → "[Metric] from X to Y in Z timeframe"
```

**Gap**: No instruction to:
- Map 5-step journey with emoji icons
- Label final step as "NSM event"

#### 7.2: Goal Options Table

**What the expert does:**

```markdown
Goal options evaluation:

| Goal | Our Influence | NSM Impact |
|------|---------------|------------|
| Simplify creation tools | High | High |
| Increase creator fund | Medium | High |
| Improve discovery algorithm | High | Medium |
```

**Our prompt says:**
```
prioritize (Influence × Impact)
```

**Gap**: No instruction to:
- ✅ Present 3 goal options in a table
- ✅ Use "Our Influence" and "NSM Impact" as column headers
- ✅ Score each as High/Medium/Low

#### 7.3: Prioritized Goal with Rationale

**What the expert does:**

```markdown
📌 Prioritized Goal:
"Increase first-time creator success rate from 15% to 25% in Q1"

Success rate = % of first Reels getting >1000 views

Why this goal:
- Directly influences creator retention
- We control the algorithm completely
- Early success drives habit formation
- Measurable and time-bound
```

**Our prompt says:**
```
"[Metric] from X to Y in Z timeframe"
```

**Gap**: No instruction to:
- ✅ Use 📌 icon for prioritized goal
- ✅ Define operational metric (what "success rate" means)
- ✅ Explain "why this goal" with 4 bullet points

---

### SECTION 8: Tradeoff Analysis (8 minutes) - MOST COMPLEX SECTION

**What the expert does:**

#### 8.1: Scenario Statement

```markdown
Scenario:
"Reels engagement is growing, but time spent on Stories is declining 30% YoY.
What do you do?"
```

**Our prompt**: Doesn't mention how scenarios are typically presented

#### 8.2: Clarify the Tradeoff

**What the expert does:**
```markdown
"Let me clarify the tradeoff here. We're seeing Reels cannibalizing Stories -
users have finite time and they're choosing Reels entertainment over Stories
sharing. The question is whether we fight this or lean into it.
```

**Our prompt**: Doesn't teach this "restate in your own words" pattern

**Gap**: No instruction to reframe the scenario in strategic terms

#### 8.3: Common Goal Statement

**What the expert does:**
```markdown
Common goal: Both formats aim to increase overall Instagram engagement and
provide value to users and creators.
```

**Our prompt**: Doesn't mention this pattern

**Gap**: No instruction to state what both options are trying to achieve

#### 8.4: Pros/Cons Table

**What the expert does:**

```markdown
| Option A: Protect Stories | Option B: Accelerate Reels |
|---------------------------|----------------------------|
| **Pros ✅** | **Pros ✅** |
| • Preserves intimate sharing behavior | • Rides consumer preference wave |
| • Maintains differentiation from TikTok | • Stronger competitive position |
| • Protects existing ad revenue | • Higher engagement rates overall |
| **Cons ❌** | **Cons ❌** |
| • Fighting user behavior | • Loses unique Instagram DNA |
| • May slow Reels growth | • Some creators abandoned |
| • Could lose to TikTok | • Risk of becoming TikTok clone |
```

**Our prompt says:**
```
Pros/cons both options → decision with rationale
```

**Gap**: No instruction to:
- ✅ Use a **2-column table** (Option A vs. Option B)
- ✅ Use ✅ and ❌ emoji headers
- ✅ List 3 pros and 3 cons per option
- ✅ Make pros/cons strategic (not just feature-level)

#### 8.5: Decision with Rationale

**What the expert does:**

```markdown
My decision: I'd choose Option B - Accelerate Reels but with a twist.

Rationale: User behavior has spoken - they want entertainment over
documentation. But we shouldn't abandon Stories entirely. Instead, I'd
integrate them: 'Reels can now be shared as Stories' and 'Stories can be
remixed into Reels.' This creates a bridge between formats.

Reconsider if: Stories decline exceeds 50% or we see Daily Active Users
dropping, suggesting users are leaving entirely rather than just shifting
behavior.
```

**Our prompt says:**
```
decision with rationale
```

**Gap**: No instruction to:
- State decision clearly ("I'd choose Option B")
- Provide strategic rationale (2-3 sentences)
- Add a "but with a twist" nuance (don't just pick one blindly)
- Include "Reconsider if" conditions (when would you reverse this decision?)

---

## Key Tactical Patterns (Analytical Thinking Specific)

### Pattern 1: Emoji Icons Throughout
- 📊 for NSM
- 🆕 ✨ 🔄 💰 📈 for AARRR stages
- 😊 ✅ 💵 ⚖️ for guardrail categories
- 🚪 💡 🎬 📊 🔄 for journey steps
- 📌 for prioritized goal
- ✅ ❌ for pros/cons

**Our prompt**: Doesn't mention emojis at all

### Pattern 2: Tables for All Structured Components
1. Ecosystem table (4 columns: Player, Value, Actions, Metrics)
2. Goal options table (3 columns: Goal, Influence, Impact)
3. Tradeoff table (2 columns: Option A Pros/Cons, Option B Pros/Cons)

**Our prompt**: Mentions tables implicitly but not explicitly

### Pattern 3: Strengths & Drawbacks for NSM
- List 3 strengths of chosen metric
- List 3 drawbacks (shows critical thinking)

**Our prompt**: Doesn't mention this pattern

### Pattern 4: "Why This Works" Explanations
- After NSM: 4 reasons why metric was chosen
- After Goal: 4 reasons why goal was prioritized
- After Decision: Strategic rationale with "Reconsider if" clause

**Our prompt**: Doesn't emphasize this depth of explanation

### Pattern 5: Tension Statements
- After ecosystem: State the fundamental tension between players
- After tradeoff scenario: Reframe the core dilemma

**Our prompt**: Doesn't mention this pattern

---

## Missing Structural Guidance

### Current Prompt Says:
```
4. North Star - 1-2 simple metrics with clear business tie
```

### What It Should Say:
```
## SECTION 4: North Star Metric (3 minutes)

**Goal**: Define the one metric that best represents product success

**Step 1**: Declare your NSM (30 sec)
- Format: "📊 NSM: [Metric Name] ([Abbreviation])"
- Example: "📊 NSM: Weekly Active Creators (WAC)"
- Add operational definition: "This is the number of..."

**Step 2**: Explain why this NSM works (1 min)
- List 4 reasons this metric is the right choice
- Format: "Why this NSM works:"
  1. [Reason 1 with strategic insight]
  2. [Reason 2]
  3. [Reason 3]
  4. [Reason 4]

**Step 3**: List strengths and drawbacks (1 min)
- Strengths (3 bullet points):
  - Shows critical thinking
  - Demonstrates you understand metric limitations
- Drawbacks (3 bullet points):
  - What the metric doesn't capture
  - Potential gaming risks
  - Trade-offs made

**Timing checkpoint**: Should complete by 20-minute mark
```

---

## Comparison: Current vs. Needed

| Component | Current Prompt | Expert Example | Gap |
|-----------|----------------|----------------|-----|
| **Ecosystem Table** | "4 players" | 4-column table with emojis | ❌ No format guidance |
| **Ecosystem Tension** | Not mentioned | "The tension here..." | ❌ Missing pattern |
| **NSM Structure** | "1-2 simple metrics" | Icon + definition + why + strengths/drawbacks | ❌ No structure |
| **Proxy Metrics** | "AARRR" | 5 metrics with icons + explanations | ⚠️ Format not specified |
| **Guardrails** | Lists 4 categories | 4 metrics with icons + explanations | ⚠️ Format not specified |
| **Journey Map** | Mentioned | 5 steps with emoji icons | ❌ No format |
| **Goal Options** | "Influence × Impact" | Table with 3 options scored | ❌ No table format |
| **Tradeoff Table** | "Pros/cons" | 2-column table with ✅/❌ | ❌ No table format |
| **Decision Rationale** | "decision with rationale" | Strategic reasoning + "Reconsider if" | ⚠️ Depth not specified |

**Key**: ✅ Good, ⚠️ Partial, ❌ Missing

---

## Time Budget Analysis

**Example shows:**
```
✅ 5 min: Rationale complete
✅ 12 min: Ecosystem mapped (7 min for ecosystem section)
✅ 20 min: All metrics defined (8 min for NSM + Proxies + Guardrails)
✅ 24 min: Goals set (4 min for goals section)
✅ 32 min: Tradeoff complete (8 min for tradeoffs)
✅ 35 min: Total time
```

**Our prompt:**
```
[No timing guidance at all]
```

**Recommended time budgets**:
1. Opening: 45 seconds
2. Rationale: 4 minutes
3. Ecosystem: 7 minutes
4. NSM: 3 minutes
5. Proxies: 2 minutes
6. Guardrails: 2 minutes
7. Goals: 4 minutes
8. Tradeoff: 8 minutes
9. Closing: 30 seconds

**Total: 31-32 minutes** (leaving 3-4 minutes buffer in 35-minute interview)

---

## Recommended Prompt Structure

```python
ANALYTICAL_THINKING_FRAMEWORK = """
## Analytical Thinking Interview: Complete Execution Guide

You will guide the candidate through a structured 35-minute analytical thinking
interview focused on goal-setting, metrics, and tradeoffs.

---

### SECTION 1: Opening & Assumptions (45 seconds)

**Goal**: Set context and scope

**What to say**:
1. Product context (2-3 sentences):
   - What the product is
   - When it launched / current state
   - Key features or positioning

2. State 3-4 assumptions:
   - Platform scope: "I'm focusing on [X], not [Y]"
   - Geographic scope: "Focus on [region] but using [region] examples"
   - Timing scope: "Assuming [current state/launch phase/mature product]"

3. State your 8-step plan:
   - "My approach: I'll review [1] strategic rationale, [2] map ecosystem,
     [3] define North Star with [4] proxies and [5] guardrails, [6] set goals,
     [7] work through a tradeoff. Sound good?"

**Transition**: [PAUSE for confirmation]

---

### SECTION 2: Product Rationale (4 minutes)

**Goal**: Explain why this product exists and why metrics matter

**Structure**:
1. Strategic context (1 min):
   - "The reality is, [product] exists because [market shift/competitive threat]"
   - "We went from [old state] to [new state]"

2. Three strategic pillars (2 min):
   - Use "First, Second, Third" structure
   - Each pillar: 2-3 sentences on why product matters
   - Example pillars: retention, ecosystem, monetization

3. Current state (30 sec):
   - State 1-2 performance metrics
   - Example: "Reels is now 40% of time spent on Instagram"

4. Mission statement (30 sec):
   - Format: "Mission for [product]: 'To [verb] [audience] by [approach]'"

**Transition**: "Now let me map the ecosystem" [PAUSE]

---

### SECTION 3: Ecosystem Mapping (7 minutes)

**Goal**: Identify stakeholders and choose focus area

**Step 1**: Create ecosystem table (4 min)

Use this exact table format:

| Player | Value They Get | Must-Take Actions | Health Metrics |
|--------|----------------|-------------------|----------------|
| [Demand] 🛒 | [What they get] | [What they do] | [How to measure] |
| [Supply] 📦 | [What they get] | [What they do] | [How to measure] |
| [Platform] 🏢 | [What they get] | [What they do] | [How to measure] |
| [Partners] 🤝 | [What they get] | [What they do] | [How to measure] |

**Required**:
- Use emojis: 🛒 (demand), 📦 (supply), 🏢 (platform), 🤝 (partners)
- 4 columns: Player, Value They Get, Must-Take Actions, Health Metrics
- Each cell: 2-4 items listed

**Step 2**: State ecosystem tension (1 min)
- "The tension here: [Player 1] wants [X], [Player 2] wants [Y],
   [Player 3] wants [Z]. The magic is balancing all [N]."

**Step 3**: Declare focus with rationale (2 min)
- "I'll focus on [player] because [strategic reason]"
- Explain why that player is critical (supply-side, competitive dynamics, etc.)

**Transition**: "Let me define our North Star" [PAUSE]

**Timing checkpoint**: Should complete by 12-minute mark

---

### SECTION 4: North Star Metric (3 minutes)

**Goal**: Define the one metric representing product success

**Step 1**: Declare NSM (30 sec)
- Format: "📊 NSM: [Metric Name] ([Abbreviation])"
- Add definition: "This is the [operational definition]"
- Example: "📊 NSM: Weekly Active Creators (WAC)"
  "This is the number of unique users who post at least one Reel per week."

**Step 2**: Explain why this NSM works (1 min)
- List 4 reasons:
  "Why this NSM works:
  1. [Reason with strategic insight]
  2. [Reason]
  3. [Reason]
  4. [Reason]"

**Step 3**: Strengths and drawbacks (1.5 min)
- Strengths (3 bullet points):
  - What the metric captures well
  - Why it's actionable
  - How it aligns with business

- Drawbacks (3 bullet points):
  - What the metric doesn't capture
  - Potential gaming risks
  - Trade-offs made

**Timing checkpoint**: Should complete by 15-minute mark

---

### SECTION 5: Proxy Metrics (2 minutes)

**Goal**: Define leading indicators using AARRR framework

**Format**: List all 5 AARRR stages with icons:

```
Leading indicators using AARRR framework:

🆕 Acquisition: [Specific metric]
- Shows [what this indicates]

✨ Activation: [Specific metric]
- Shows [what this indicates]

🔄 Retention: [Specific metric]
- Shows [what this indicates]

💰 Revenue: [Specific metric]
- Shows [what this indicates]

📈 Referral: [Specific metric]
- Shows [what this indicates]
```

**Required**:
- Use emoji icons: 🆕 ✨ 🔄 💰 📈
- Each metric: 1-line "Shows [insight]" explanation
- Cover all 5 stages (not just 3-4)

**Timing checkpoint**: Should complete by 17-minute mark

---

### SECTION 6: Guardrails (2 minutes)

**Goal**: Define metrics to prevent NSM gaming

**Format**: List 4 guardrail categories with icons:

```
Simple business metrics to prevent NSM gaming:

😊 [Stakeholder] satisfaction: [Specific metric]
- Ensures [what we're protecting]

✅ Content/Product quality: [Specific metric]
- Prevents [what we're avoiding]

💵 Business health: [Specific metric]
- Ensures [what we're maintaining]

⚖️ Ecosystem balance: [Specific metric]
- Maintains [what equilibrium]
```

**Required**:
- Use emoji icons: 😊 ✅ 💵 ⚖️
- 4 categories: Satisfaction, Quality, Business, Balance
- Each metric: 1-line "Ensures/Prevents [risk]" explanation

**Transition**: "Now for specific team goals" [PAUSE]

**Timing checkpoint**: Should complete by 19-minute mark

---

### SECTION 7: Team Goals (4 minutes)

**Goal**: Set specific team goal tied to NSM

**Step 1**: Map journey to NSM (1 min)
- List 5 steps with emoji icons
- Label final step as "(NSM event)"

Example:
```
[User type] journey to NSM:
1. 🚪 [Discovery step]
2. 💡 [Motivation step]
3. 🎬 [Action step]
4. 📊 [Feedback step]
5. 🔄 [Repeat step] (NSM event)
```

**Step 2**: Create goal options table (1.5 min)

```
| Goal | Our Influence | NSM Impact |
|------|---------------|------------|
| [Option 1] | High/Med/Low | High/Med/Low |
| [Option 2] | High/Med/Low | High/Med/Low |
| [Option 3] | High/Med/Low | High/Med/Low |
```

**Step 3**: State prioritized goal with rationale (1.5 min)
- Format: "📌 Prioritized Goal:"
  "[Increase/Decrease] [specific metric] from [X] to [Y] in [timeframe]"
- Define operational metric if needed
- List 4 reasons "Why this goal:"
  - Strategic impact
  - Our control/influence
  - Measurability
  - Time-bound

**Timing checkpoint**: Should complete by 23-minute mark

---

### SECTION 8: Tradeoff Analysis (8 minutes)

**Goal**: Analyze a strategic tradeoff and make a decision

**Scenario**: [Interviewer provides tradeoff scenario]

**Step 1**: Clarify the tradeoff (1 min)
- Restate scenario in your own words
- Frame the core dilemma: "The question is whether to [X] or [Y]"

**Step 2**: State common goal (30 sec)
- "Common goal: Both options aim to [shared objective]"

**Step 3**: Create pros/cons table (4 min)

```
| Option A: [Name] | Option B: [Name] |
|------------------|------------------|
| **Pros ✅** | **Pros ✅** |
| • [Pro 1] | • [Pro 1] |
| • [Pro 2] | • [Pro 2] |
| • [Pro 3] | • [Pro 3] |
| **Cons ❌** | **Cons ❌** |
| • [Con 1] | • [Con 1] |
| • [Con 2] | • [Con 2] |
| • [Con 3] | • [Con 3] |
```

**Required**:
- 2-column table (Option A vs. Option B)
- Use ✅ and ❌ headers
- 3 pros and 3 cons per option (strategic, not feature-level)

**Step 4**: Make decision with rationale (2.5 min)
- "My decision: I'd choose [Option X] but with a twist."
- Provide strategic rationale (2-3 sentences)
- Add nuance: "But we shouldn't [abandon other option entirely]"
- State "Reconsider if" conditions (when would you reverse?)

**Timing checkpoint**: Should complete by 31-minute mark

---

### SECTION 9: Closing (30 seconds)

**Goal**: Summarize and invite questions

**Format**:
"To summarize: We're measuring [product] success through [NSM] as our North Star,
with proxy metrics tracking [key funnel] and guardrails protecting [key stakeholders].
Our [timeframe] goal focuses on [goal] to [strategic outcome].

The [tradeoff topic] shows we need to [key insight from tradeoff].

What aspects would you like me to dive deeper on?"

**Timing checkpoint**: Should complete by 32-minute mark

---

## KEY TACTICAL PATTERNS

### Pattern 1: Emoji Icons (Required Throughout)
- 📊 for NSM declaration
- 🛒 📦 🏢 🤝 for ecosystem players
- 🆕 ✨ 🔄 💰 📈 for AARRR proxy metrics
- 😊 ✅ 💵 ⚖️ for guardrail categories
- 🚪 💡 🎬 📊 🔄 for journey steps
- 📌 for prioritized goal
- ✅ ❌ for pros/cons

### Pattern 2: Tables for All Structured Components
1. **Ecosystem**: 4 columns (Player, Value, Actions, Metrics)
2. **Goal Options**: 3 columns (Goal, Our Influence, NSM Impact)
3. **Tradeoff**: 2 columns (Option A Pros/Cons, Option B Pros/Cons)

### Pattern 3: "Why This Works" Explanations
- After NSM: 4 reasons why metric was chosen
- After Goal: 4 reasons why goal was prioritized
- After Decision: Strategic rationale + "Reconsider if"

### Pattern 4: Strengths & Drawbacks
- List 3 strengths of chosen NSM
- List 3 drawbacks (shows critical thinking)

### Pattern 5: Tension Statements
- After ecosystem: State fundamental tension between players
- After tradeoff scenario: Reframe core dilemma

### Pattern 6: Natural Language
- Lead with strategic insights: "The reality is..."
- Use "First, Second, Third" for structured lists
- Avoid: "I would approach this by..."

---

## TIMING DISCIPLINE

**Critical**: This is a 32-minute interview with specific time budgets.

### Time Budget Per Section:
- Opening: 45 seconds (by 1-min mark)
- Rationale: 4 minutes (by 5-min mark)
- Ecosystem: 7 minutes (by 12-min mark)
- NSM: 3 minutes (by 15-min mark)
- Proxies: 2 minutes (by 17-min mark)
- Guardrails: 2 minutes (by 19-min mark)
- Goals: 4 minutes (by 23-min mark)
- Tradeoff: 8 minutes (by 31-min mark)
- Closing: 30 seconds (by 32-min mark)

### If Running Behind:
- **6-min mark, still on rationale**: "Let's move to ecosystem"
- **13-min mark, still on ecosystem**: "Let's define our North Star"
- **20-min mark, still on metrics**: "Let's set specific goals"
- **25-min mark, still on goals**: "Let's tackle the tradeoff"

### Natural Time Check-ins:
- Around 12-min mark: "We're about one-third through - let me define metrics"
- Around 23-min mark: "We've got about 10 minutes left - let me work through a tradeoff"

---

## GREEN FLAGS (What Excellence Looks Like)

✅ Used 4-column ecosystem table with emojis
✅ Stated ecosystem tension explicitly
✅ NSM has clear definition + why it works + strengths/drawbacks
✅ All 5 AARRR proxy metrics with explanations
✅ All 4 guardrail categories with risk explanations
✅ Journey map with 5 steps leading to NSM
✅ Goal options in table format
✅ Tradeoff pros/cons in 2-column table with ✅/❌
✅ Decision includes "Reconsider if" clause
✅ Finished in 31-33 minutes

## RED FLAGS (What to Avoid)

❌ No ecosystem table (just verbal list)
❌ Complex composite NSM (should be simple)
❌ Skipped proxy metrics or guardrails
❌ No table for goal options or tradeoff
❌ Weak tradeoff rationale ("I like this one better")
❌ No "Reconsider if" conditions
❌ Ran over 35 minutes or rushed through in <28 minutes
❌ Missing emoji icons throughout

"""
```

---

## Implementation Priority

### Phase 1: Rewrite Analytical Thinking Framework (HIGH PRIORITY)
**File**: `agent/shared/prompts.py` - `ANALYTICAL_THINKING_FRAMEWORK`
**Effort**: 3-4 hours
**Impact**: Massive - transforms 18-line outline into 400-line tactical guide

**What to include**:
1. All 9 sections with timing and structure
2. All 6 tactical patterns (emojis, tables, explanations, etc.)
3. Timing checkpoints throughout
4. Example formats for every structured component

---

## Success Metrics

### Quantitative:
1. **Table usage**: % of interviews using ecosystem table, goal options table, tradeoff table
2. **Emoji usage**: % of interviews using required emoji icons
3. **Component completeness**: % covering all AARRR stages, all guardrail categories
4. **Timing**: % finishing in 31-33 minutes

### Qualitative:
1. **Strategic depth**: NSM has "why it works" + strengths/drawbacks
2. **Tradeoff quality**: Includes "Reconsider if" conditions
3. **Natural language**: Uses "First, Second, Third" structure

---

## Key Insight

Analytical Thinking interviews are **more structured** than Product Sense because they have explicit components (NSM, AARRR, Guardrails, Tradeoffs) that require **table formats and emoji icons**.

Our current prompt **lists these components** but doesn't teach **how to present them** (tables, icons, explanations).

**The fix**: Provide the exact table structures, emoji patterns, and explanation formats that make these components clear and memorable.

---

## Next Steps

1. **Review this analysis** ✅
2. **Approve approach**
3. **Implement rewrite**: Analytical Thinking framework (3-4 hours)
4. **Test with sample questions**
5. **Deploy**

---

**Ready to rewrite when you are!** This will be the same transformation as Product Sense: condensed outline → detailed tactical guide.

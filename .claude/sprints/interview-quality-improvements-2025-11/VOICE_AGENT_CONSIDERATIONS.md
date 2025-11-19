# Voice Agent Prompt Considerations & Architecture Review

**Date**: 2025-11-19
**Purpose**: Assess whether tables/emojis make sense for voice agents and evaluate current prompt architecture

---

## Question 1: Do Tables/Emojis Make Sense for Voice Agents?

### TL;DR: **YES, they absolutely help** - but not for the reasons you might think.

---

### Why Tables/Emojis Work for Voice Agents

#### 1. **LLMs "See" the Prompt, Users Hear the Output**

The key insight: **The LLM reads the prompt with all formatting, but only speaks the content.**

**Example from our prompts** (line 67):
```python
## Important:
- NO emojis, asterisks, or markdown in speech
```

**What this means**:
- ✅ Prompt can have: Tables, emojis, markdown, bold text
- ❌ Agent output can't have: Emojis, asterisks, markdown

**Why this works**:
```
Prompt (what LLM sees):
📊 NSM: Weekly Active Creators (WAC)
- Shows creator funnel health
- Correlates with engagement

Agent speech (what user hears):
"For our North Star metric, I'm choosing Weekly Active Creators, or WAC.
This shows creator funnel health and correlates with engagement..."
```

The emoji helps the **LLM** understand structure, but the **agent** naturally speaks it.

---

#### 2. **Tables Provide Visual Structure for LLMs**

**Research shows**: LLMs process structured data (tables, lists, hierarchies) better than paragraphs.

**Example from Analytical Thinking**:

**With table**:
```
| Player | Value They Get | Must-Take Actions | Health Metrics |
|--------|----------------|-------------------|----------------|
| Viewers 🛒 | Entertainment | Watch, engage | Time spent |
| Creators 📦 | Reach, money | Create content | Follower growth |
```

**LLM processes this as**:
- 4 distinct entities
- 3 attributes per entity
- Clear relationships

**Without table** (paragraph):
```
Viewers want entertainment and they watch and engage, measured by time spent.
Creators want reach and money and create content, measured by follower growth.
```

**LLM processes this as**:
- Harder to parse relationships
- May miss attributes
- Less clear structure

**Result**: Agent is more likely to **remember and structure** their spoken response when prompt uses tables.

---

#### 3. **Emojis Are Semantic Anchors**

Emojis help LLMs **chunk and recall** information.

**Example**:
```
🆕 Acquisition: New creators posting first Reel
✨ Activation: % posting 2nd Reel within 7 days
🔄 Retention: 4-week creator retention
💰 Revenue: Creator fund payouts
📈 Referral: % using collaborative features
```

**Why this helps**:
- Each emoji creates a **visual anchor** in the LLM's "attention"
- Easier to remember "💰 Revenue" than "the fourth proxy metric"
- Natural clustering: "Let me talk about the five AARRR metrics..."

**Agent speech output**:
```
"For proxy metrics, I'll use the AARRR framework.
First, acquisition - new creators posting their first Reel.
Second, activation - the percentage posting a second Reel within 7 days.
Third, retention..."
```

No emojis spoken, but the structure is **preserved** because the LLM saw the emoji anchors.

---

#### 4. **Real-World Evidence: Our Current Prompts Already Use This**

**Line 67** (from `prompts.py`):
```python
## Important:
- NO emojis, asterisks, or markdown in speech
```

This proves we **already know** formatting in prompts ≠ formatting in speech.

**Line 35-71**: BASE_INTERVIEWER_SYSTEM uses:
- Markdown headers (##)
- Bullet lists (-)
- Bold text (**)
- Structured sections

**None of this gets spoken** - the agent naturally converts to conversational speech.

---

### Counter-Argument: "Too Complex for Voice Context"

**Concern**: Tables might confuse the LLM in real-time voice conversation.

**Reality**: Voice agents need **more** structure, not less.

**Why**:
1. **No visual reference**: Users can't see the framework, so agent must be precise
2. **Memory load**: Agent must track "where we are" in the structure
3. **Transitions**: Agent needs clear section markers to guide candidate

**Example without structure**:
```
Agent: "Let's talk about users. Who are they? Pick one."
Candidate: *confused* "Pick one what?"
```

**Example with table structure in prompt**:
```
Prompt:
| Segment | Reach | Underserved |
|---------|-------|-------------|
| [Name]  | H/M/L | H/M/L       |

Agent: "Let's segment potential users. I'll want you to identify 3 segments,
give each a creative name, and prioritize based on reach and how underserved
they are. Think of it like a table with columns for segment name, reach,
and underserved level. Ready?"
```

The **table in the prompt** helped the agent **explain** the structure verbally.

---

### Conclusion on Tables/Emojis

**Recommendation**: **Keep tables and emojis in prompts**

**Why**:
1. ✅ LLMs process structured data better
2. ✅ Helps agent remember framework components
3. ✅ Creates semantic anchors for recall
4. ✅ Agent naturally converts to speech (we already block visual formatting)
5. ✅ Provides clear structure for agent to explain verbally

**Examples to keep**:
- 📊 NSM icon → Agent says "For our North Star metric..."
- Ecosystem table → Agent says "Let me break down the four players in a 2x2..."
- AARRR emojis → Agent says "Using the AARRR framework..."

**What changes**:
- Nothing! Agent already strips formatting when speaking
- We just make prompts **more structured** to help agent think better

---

## Question 2: Is Current Prompt Architecture Sound?

### Current Architecture Analysis

**Structure**:
```
agent/
├── shared/
│   ├── prompts.py              # ← All framework definitions
│   ├── utils/prompt_builder.py # ← Assembles prompts
│   └── config.py               # ← Metadata parser
├── demo/agent.py               # ← Demo agent (uses shared)
└── interview/agent.py          # ← Main agent (uses shared)
```

**How it works**:
1. `prompts.py` defines:
   - Framework templates (PRODUCT_SENSE_FRAMEWORK, etc.)
   - Mode functions (get_mock_interview_prompt, etc.)
   - Base system role (BASE_INTERVIEWER_SYSTEM)

2. `prompt_builder.py` assembles:
   - Picks framework based on interview_type
   - Picks mode based on user selection
   - Adds question if provided
   - Adds timing context
   - Returns complete prompt string

3. Agent uses:
   ```python
   instructions = build_agent_prompt(round_type, config, question)
   session = AgentSession(llm=llm_model, ...)
   await session.start(agent=InterviewAgent(instructions))
   ```

---

### Architectural Assessment

#### ✅ **What's Good**

**1. Modular Design**
- Frameworks separated from modes
- Shared code between demo and interview agents
- Easy to add new frameworks or modes

**2. Single Source of Truth**
- All prompts in `prompts.py`
- No duplication
- Changes propagate to all agents

**3. Runtime Composition**
- Prompts assembled dynamically
- Supports question injection
- Supports configuration overrides

**4. Type Safety**
- Dataclasses for configuration
- Helper functions with clear signatures

**5. Separation of Concerns**
- `prompts.py` = content (what to say)
- `prompt_builder.py` = logic (how to assemble)
- `config.py` = metadata (what's configured)

---

#### ⚠️ **What Could Be Better**

**1. Framework Size Will Explode**

**Current**:
- PRODUCT_SENSE_FRAMEWORK: ~10 lines
- ANALYTICAL_THINKING_FRAMEWORK: ~18 lines
- LEADERSHIP_DRIVE_FRAMEWORK: ~13 lines

**After our improvements**:
- PRODUCT_SENSE_FRAMEWORK: ~300 lines
- ANALYTICAL_THINKING_FRAMEWORK: ~400 lines
- LEADERSHIP_DRIVE_FRAMEWORK: ~350 lines
- STRATEGY_FRAMEWORK: ~300 lines (not yet written)

**Total**: ~1,350 lines in a single file!

**Problem**: `prompts.py` will become massive and hard to navigate.

**Solution Options**:

**Option A: Keep Single File with Better Organization** ⭐ RECOMMENDED
```python
# prompts.py
"""
Meelni Interview Prompt Templates
Modular prompt system for different interview modes and types
"""

# ==========================================
# SECTION 1: BASE SYSTEM
# ==========================================
BASE_INTERVIEWER_SYSTEM = """..."""

# ==========================================
# SECTION 2: PRODUCT SENSE FRAMEWORK
# ==========================================
PRODUCT_SENSE_FRAMEWORK = """
... (300 lines)
"""

# ==========================================
# SECTION 3: ANALYTICAL THINKING FRAMEWORK
# ==========================================
ANALYTICAL_THINKING_FRAMEWORK = """
... (400 lines)
"""

# ... etc
```

**Pros**:
- ✅ Single source of truth maintained
- ✅ Easy to find all prompts
- ✅ No import complexity
- ✅ Clear sections with comments

**Cons**:
- ⚠️ Large file (~1,500 lines)
- ⚠️ Scrolling to find sections

**Option B: Split into Framework Files**
```python
agent/shared/prompts/
├── __init__.py              # Exports all
├── base.py                  # BASE_INTERVIEWER_SYSTEM
├── product_sense.py         # PRODUCT_SENSE_FRAMEWORK
├── analytical_thinking.py   # ANALYTICAL_THINKING_FRAMEWORK
├── behavioral.py            # LEADERSHIP_DRIVE_FRAMEWORK
├── strategy.py              # STRATEGY_FRAMEWORK
└── modes.py                 # get_mock_interview_prompt, etc.
```

**Pros**:
- ✅ Smaller files
- ✅ Easy to work on single framework
- ✅ Clear organization

**Cons**:
- ⚠️ More files to manage
- ⚠️ Import complexity
- ⚠️ Easy to forget to export in __init__.py

**Option C: Hybrid (Framework Files, Modes in Main)**
```python
agent/shared/
├── prompts.py               # Modes + imports
└── frameworks/
    ├── __init__.py
    ├── product_sense.py
    ├── analytical_thinking.py
    ├── behavioral.py
    └── strategy.py
```

**Pros**:
- ✅ Frameworks separated
- ✅ Mode logic stays with main file
- ✅ Backward compatible (prompts.py still exists)

**Cons**:
- ⚠️ Two places to look (prompts.py vs. frameworks/)

---

**My Recommendation**: **Option A (Single File with Sections)**

**Why**:
1. **Simplicity**: All prompts in one place
2. **Git diffs**: Easy to see all prompt changes in one file
3. **Navigation**: Modern editors (VSCode) have outline views for large files
4. **Maintenance**: No import path issues
5. **Testing**: Easy to test all prompts from single file

**How to make it work**:
- Add **clear section headers** (like we already have)
- Use **table of contents** at top of file
- Use **fold markers** for editor code folding
- Keep **alphabetical order** of frameworks

---

**2. No Prompt Versioning**

**Current**: Prompts are strings in Python file.

**Problem**: Hard to:
- Track prompt changes over time
- A/B test prompt variations
- Roll back to previous version

**Not a problem for MVP**, but consider later:
- Versioned prompt storage (DB or JSON files)
- Prompt templates with variables
- A/B testing framework

**Recommendation**: **Don't change now** - single file works for MVP. Add versioning if you scale to 1000s of users.

---

**3. No Prompt Testing**

**Current**: No automated tests for prompts.

**Problem**: Easy to break prompts with typos or malformed syntax.

**Solution**: Add simple tests:
```python
# tests/test_prompts.py
def test_all_frameworks_defined():
    assert PRODUCT_SENSE_FRAMEWORK
    assert ANALYTICAL_THINKING_FRAMEWORK
    assert LEADERSHIP_DRIVE_FRAMEWORK
    assert STRATEGY_FRAMEWORK

def test_frameworks_have_sections():
    assert "## Product Sense:" in PRODUCT_SENSE_FRAMEWORK
    assert "SECTION 1:" in PRODUCT_SENSE_FRAMEWORK
    # etc.

def test_prompt_builder_works():
    prompt = build_agent_prompt("product_sense", {...})
    assert "Product Sense" in prompt
    assert "SECTION 1:" in prompt
```

**Recommendation**: Add basic tests **after** implementing new prompts. Not critical for MVP.

---

**4. Mode Functions Are Repetitive**

**Current**: Each mode function (get_mock_interview_prompt, etc.) has similar structure:
```python
def get_mock_interview_prompt(interview_type: str) -> str:
    framework = _get_framework_for_type(interview_type)
    return f"""{BASE_INTERVIEWER_SYSTEM}
    ## Your role: Mock interviewer
    {framework}
    ## How you run this: ...
    """
```

**Problem**: Lots of duplication.

**Not a real problem**: Only 6 mode functions, easy to maintain.

**Recommendation**: **Keep as-is**. The duplication is minimal and makes each mode's behavior explicit.

---

### Architectural Conclusion

**Current architecture is SOUND** ✅

**Strengths**:
- ✅ Modular (frameworks separate from modes)
- ✅ Single source of truth (prompts.py)
- ✅ Runtime composition (dynamic assembly)
- ✅ Type safety (dataclasses)
- ✅ Shared code (demo + interview agents)

**Minor improvements to consider**:
- Add section headers in prompts.py for navigation
- Add table of contents at top of file
- Add basic prompt tests (later)
- Consider versioning (much later, when scaling)

**No architectural changes needed for prompt improvements!**

---

## Final Recommendations

### 1. **Keep Tables/Emojis in Prompts** ✅

**Why**:
- LLMs process structure better
- Agent already strips formatting when speaking
- Helps agent explain structure verbally
- Proven pattern (we already do this)

**Action**: Use tables, emojis, markdown freely in prompts. Agent will handle.

---

### 2. **Keep Single File Architecture** ✅

**Why**:
- Simple, maintainable
- All prompts in one place
- Easy git diffs
- Works well up to ~2,000 lines

**Action**: Implement new prompts in same `prompts.py` file with clear section headers.

---

### 3. **Add Navigation Helpers**

**Add to top of `prompts.py`**:
```python
"""
Meelni Interview Prompt Templates
Modular prompt system for different interview modes and types

TABLE OF CONTENTS:
1. Base System Role (line 35)
2. Product Sense Framework (line 74)
3. Analytical Thinking Framework (line 400)
4. Leadership & Drive Framework (line 850)
5. Strategy Framework (line 1250)
6. Mode Functions (line 1600)
"""
```

**Why**: Makes 1,500-line file navigable.

---

### 4. **Implementation Approach**

**Step 1**: Implement new prompts in `prompts.py`
- Replace PRODUCT_SENSE_FRAMEWORK with 300-line version
- Replace ANALYTICAL_THINKING_FRAMEWORK with 400-line version
- Replace LEADERSHIP_DRIVE_FRAMEWORK with 350-line version

**Step 2**: Test with voice output
- Run sample interviews
- Verify agent speaks naturally (no tables/emojis in speech)
- Verify agent follows structure

**Step 3**: No architectural changes needed
- `prompt_builder.py` works as-is
- `agent.py` works as-is
- Just better prompts!

---

## Architecture Diagram (Current)

```
┌─────────────────────────────────────────────────────────┐
│ prompts.py (Single File)                                │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ BASE_INTERVIEWER_SYSTEM (personality, voice rules) │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Frameworks (what to teach)                          │ │
│ │ - PRODUCT_SENSE_FRAMEWORK (~300 lines)              │ │
│ │ - ANALYTICAL_THINKING_FRAMEWORK (~400 lines)        │ │
│ │ - LEADERSHIP_DRIVE_FRAMEWORK (~350 lines)           │ │
│ │ - STRATEGY_FRAMEWORK (~300 lines)                   │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                           │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Mode Functions (how to teach)                       │ │
│ │ - get_mock_interview_prompt()                       │ │
│ │ - get_practice_mode_prompt()                        │ │
│ │ - get_learning_mode_prompt()                        │ │
│ │ - get_feedback_mode_prompt()                        │ │
│ │ - get_demonstration_mode_prompt()                   │ │
│ │ - get_interactive_coaching_prompt()                 │ │
│ └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ prompt_builder.py (Assembly Logic)                      │
│                                                           │
│ build_agent_prompt(round_type, config, question):       │
│   1. Pick framework (product_sense, analytical, etc.)   │
│   2. Pick mode (mock, practice, etc.)                   │
│   3. Add question if provided                           │
│   4. Add timing context                                 │
│   5. Return complete prompt string                      │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│ Agent (interview/agent.py, demo/agent.py)               │
│                                                           │
│ instructions = build_agent_prompt(...)                  │
│ session = AgentSession(llm=..., tts=...)                │
│ await session.start(agent=InterviewAgent(instructions)) │
└─────────────────────────────────────────────────────────┘
```

**Key**: Single file works great. No changes needed. Just better content.

---

## Summary

### Tables/Emojis for Voice? **YES!** ✅

- LLM sees structure, user hears natural speech
- Agent already strips formatting (line 67: "NO emojis in speech")
- Helps LLM remember and structure responses
- Proven pattern we already use

### Current Architecture? **SOUND!** ✅

- Single file with sections works well
- Modular, maintainable, type-safe
- No architectural changes needed
- Just add better content to existing structure

### Action Items

1. ✅ Keep tables/emojis in prompts
2. ✅ Implement new prompts in same `prompts.py` file
3. ✅ Add table of contents for navigation
4. ✅ Test voice output (verify no tables/emojis spoken)
5. ⏸️ Add prompt tests (later, not critical)
6. ⏸️ Consider versioning (much later, when scaling)

**Bottom line**: Your concerns are valid, but the solutions already exist in your architecture. Tables/emojis help LLMs think better, and the agent knows not to speak them. Current single-file approach is perfect for your scale. Just implement the better prompts and you're good to go!

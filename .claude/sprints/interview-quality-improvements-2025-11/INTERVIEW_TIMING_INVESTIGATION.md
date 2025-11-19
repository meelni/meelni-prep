# Interview Timing System Investigation & Recommendations

**Date**: 2025-11-19
**Branch**: `interview-timing-controls`
**Status**: Investigation Complete - Ready for Implementation

---

## Executive Summary

The main interview agent has **configuration-level time awareness** but **no programmatic timing enforcement**. Interviews are ending too quickly because:

1. **No time tracking mechanism**: Agent doesn't track elapsed time
2. **No countdown warnings**: Agent relies on LLM to guess remaining time
3. **No auto-termination**: Interviews can run indefinitely or end prematurely
4. **Passive timing hints**: Only has "Interview Duration: X minutes - pace yourself accordingly" in prompt

**Solution**: Implement the proven timing system from the demo agent (5-minute sessions) but adapted for longer 30-45 minute interviews.

---

## Current State Analysis

### 1. Timing Configuration (GOOD ✅)

**File**: `lib/interview-config.ts`

```typescript
export const SMART_DURATION = {
  behavioral: 30,      // 30 minutes
  product_sense: 45,   // 45 minutes (LONGEST)
  execution: 40,       // 40 minutes
  strategy: 45,        // 45 minutes (LONGEST)
}
```

- ✅ Type-aware durations configured
- ✅ Passed to agent via room metadata
- ✅ Available in agent config parser

### 2. Prompt Integration (WEAK ⚠️)

**File**: `agent/shared/utils/prompt_builder.py:147-148`

```python
# Add duration context
base_prompt += f"\n\nInterview Duration: {duration} minutes - pace yourself accordingly."
```

**Problems**:
- Single line mention buried in prompt
- No emphasis or structure
- LLM has no concept of actual elapsed time
- Says "track time naturally" but provides no mechanism

**Current prompt also says** (line 191 in `prompts.py`):
```python
"## How you run this:
- Track time naturally: "We've got about 10 minutes left"
```

This is asking the LLM to hallucinate time awareness!

### 3. Agent Implementation (MISSING ❌)

**File**: `agent/interview/agent.py`

```python
class InterviewAgent(Agent):
    """PM Interview Coach Agent with dynamic instructions"""

    def __init__(self, instructions: str) -> None:
        super().__init__(instructions=instructions)
        # ❌ No self.start_time
        # ❌ No self.warning_sent
        # ❌ No self.section_times
```

**What's missing**:
- No time tracking attributes
- No background monitoring task
- No warning system
- No termination logic

### 4. Database Schema (GOOD ✅)

**File**: `lib/db/schema.ts:36-70`

```typescript
{
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
  status: text("status").default("in_progress").notNull(),
  // status: in_progress, completed, abandoned, too_short, error
}
```

- ✅ Has timestamps for start/end
- ✅ Has actual duration field
- ✅ Has "too_short" status validation
- ❌ No "too_long" status validation

---

## Demo Agent Reference (PROVEN PATTERN ✅)

**File**: `agent/demo/agent.py`

### Time Tracking Implementation

```python
class DemoAgent(Agent):
    def __init__(self, instructions: str) -> None:
        super().__init__(instructions=instructions)
        self.start_time = None
        self.warning_sent = False  # 4:45 warning
        self.ending_sent = False   # 5:00 hard stop
        self.session_ended = False
```

### Background Monitoring Task

```python
async def monitor_session_time(ctx, demo_agent, session):
    WARNING_TIME = 285  # 4 minutes 45 seconds
    END_TIME = 300      # 5 minutes
    CHECK_INTERVAL = 5  # Check every 5 seconds

    while not demo_agent.session_ended:
        await asyncio.sleep(CHECK_INTERVAL)
        elapsed = time.time() - demo_agent.start_time

        # Send 4:45 warning
        if elapsed >= WARNING_TIME and not demo_agent.warning_sent:
            demo_agent.warning_sent = True
            await ctx.room.local_participant.publish_data(
                json.dumps({
                    "type": "time_warning",
                    "message": "We're running out of time...",
                    "elapsed": elapsed
                }).encode("utf-8"),
                topic="demo_control"
            )

        # Auto-terminate at 5:00
        elif elapsed >= END_TIME and not demo_agent.ending_sent:
            demo_agent.ending_sent = True
            await ctx.room.disconnect()
```

**Why this works**:
- ✅ Programmatic time tracking (not LLM guessing)
- ✅ Deterministic warnings (always at 4:45)
- ✅ Hard cutoff (always at 5:00)
- ✅ Graceful termination

---

## Recommended Solution

### Timing Architecture for Main Interview Agent

#### 1. Time Tracking State (Add to InterviewAgent)

```python
class InterviewAgent(Agent):
    def __init__(self, instructions: str, duration: int) -> None:
        super().__init__(instructions=instructions)
        self.start_time = None
        self.duration_minutes = duration  # 30, 40, or 45
        self.duration_seconds = duration * 60

        # Warning thresholds (dynamic based on duration)
        self.halfway_sent = False        # 50% mark
        self.five_min_warning_sent = False  # duration - 5 min
        self.two_min_warning_sent = False   # duration - 2 min
        self.grace_period_sent = False      # duration + 2 min (soft end)

        self.session_ended = False
```

#### 2. Dynamic Warning Times

```python
def get_warning_times(duration_minutes: int) -> dict:
    """Calculate warning times based on interview duration"""
    total_seconds = duration_minutes * 60

    return {
        "halfway": total_seconds * 0.5,           # 50% mark
        "five_min_warning": total_seconds - 300,  # 5 min before end
        "two_min_warning": total_seconds - 120,   # 2 min before end
        "target_end": total_seconds,              # Planned end time
        "grace_period_end": total_seconds + 120,  # Hard stop (+2 min grace)
    }

# Examples:
# 30-min interview: warnings at 15min, 25min, 28min, end at 30min, hard stop at 32min
# 45-min interview: warnings at 22.5min, 40min, 43min, end at 45min, hard stop at 47min
```

#### 3. Background Monitoring Task (Adapted from Demo)

```python
async def monitor_interview_time(ctx, interview_agent, session):
    """
    Background task to monitor interview duration and inject time warnings.
    Adapted from demo agent but with dynamic timing for longer interviews.
    """
    CHECK_INTERVAL = 10  # Check every 10 seconds (less frequent than demo)

    times = get_warning_times(interview_agent.duration_minutes)

    while not interview_agent.session_ended:
        await asyncio.sleep(CHECK_INTERVAL)

        if interview_agent.start_time is None:
            continue

        elapsed = time.time() - interview_agent.start_time

        # Halfway point (informational, not urgent)
        if elapsed >= times["halfway"] and not interview_agent.halfway_sent:
            interview_agent.halfway_sent = True
            await send_time_context(ctx, "halfway", elapsed)

        # 5-minute warning (start wrapping up)
        elif elapsed >= times["five_min_warning"] and not interview_agent.five_min_warning_sent:
            interview_agent.five_min_warning_sent = True
            await send_time_context(ctx, "five_min_warning", elapsed)

        # 2-minute warning (final question/wrap up)
        elif elapsed >= times["two_min_warning"] and not interview_agent.two_min_warning_sent:
            interview_agent.two_min_warning_sent = True
            await send_time_context(ctx, "two_min_warning", elapsed)

        # Target end time (natural conclusion)
        elif elapsed >= times["target_end"] and not interview_agent.grace_period_sent:
            # Don't hard stop yet - give 2 min grace for natural conclusion
            interview_agent.grace_period_sent = True
            await send_time_context(ctx, "target_end", elapsed)

        # Hard stop (grace period expired)
        elif elapsed >= times["grace_period_end"]:
            interview_agent.session_ended = True
            await send_time_context(ctx, "hard_stop", elapsed)
            await asyncio.sleep(2)  # Let final message deliver
            await ctx.room.disconnect()
            break
```

#### 4. Time Context Messages (Not Hard Warnings)

**IMPORTANT**: Unlike demo agent, we don't send hard warnings like "WE'RE RUNNING OUT OF TIME!"

Instead, we send **context updates** that the LLM incorporates naturally:

```python
async def send_time_context(ctx, warning_type, elapsed):
    """Send time context to agent via data channel (LLM will see this)"""

    messages = {
        "halfway": "Context update: You're halfway through the interview. Continue at current pace.",
        "five_min_warning": "Context update: 5 minutes remaining. Begin moving toward conclusion if you haven't already.",
        "two_min_warning": "Context update: 2 minutes remaining. Wrap up current question and provide closing remarks.",
        "target_end": "Context update: Planned interview time reached. Conclude naturally in next 1-2 minutes.",
        "hard_stop": "CRITICAL: Interview must end NOW. Say brief closing remarks and thank the candidate.",
    }

    await ctx.room.local_participant.publish_data(
        json.dumps({
            "type": "time_context",
            "warning_type": warning_type,
            "message": messages[warning_type],
            "elapsed": elapsed,
        }).encode("utf-8"),
        topic="interview_control"
    )
```

**Why this approach**:
- ✅ Doesn't interrupt natural conversation
- ✅ LLM can incorporate context smoothly
- ✅ No jarring "TIME'S UP!" moments
- ✅ Matches coaching philosophy (guide, don't dictate)

#### 5. Enhanced Prompt Instructions

**File**: `agent/shared/utils/prompt_builder.py`

Replace this:
```python
base_prompt += f"\n\nInterview Duration: {duration} minutes - pace yourself accordingly."
```

With this:
```python
timing_instructions = f"""

## ⏱️ INTERVIEW TIMING SYSTEM

This is a {duration}-minute interview. You have programmatic time tracking enabled.

### Time Structure:
- Total duration: {duration} minutes
- You will receive automatic time context updates at key milestones
- DO NOT guess or estimate time - you will be informed precisely

### Time Context Updates You Will Receive:
1. **Halfway mark** ({duration/2} min): "You're halfway through"
   - Continue at current pace
   - No urgency yet

2. **5 minutes remaining** ({duration-5} min): "5 minutes remaining"
   - Start moving toward conclusion if not already
   - Finish current question, then begin wrap-up

3. **2 minutes remaining** ({duration-2} min): "2 minutes remaining"
   - Wrap up current question
   - Provide closing feedback/summary
   - Thank candidate and set expectations for what's next

4. **Target end time** ({duration} min): "Planned interview time reached"
   - Conclude naturally in next 1-2 minutes
   - You have grace period to finish thought

5. **Hard stop** ({duration+2} min): "Interview must end NOW"
   - Say brief closing remarks immediately
   - Thank candidate
   - Session will terminate automatically

### How to Use Time Context:
- When you receive a time update, incorporate it NATURALLY into your coaching
- Examples:
  - "We're about halfway through—you're doing great. Let's move to the next section."
  - "We've got about 5 minutes left. Let me ask you one more question."
  - "That's our time! You did well today. Keep practicing with these frameworks."

### Important:
- NEVER say "I think we have about X minutes" - you will be told precisely
- NEVER extend interview beyond hard stop (session terminates automatically)
- ALWAYS acknowledge time context when received (work it into conversation naturally)
"""

base_prompt += timing_instructions
```

---

## Implementation Plan

### Phase 1: Core Time Tracking (High Priority)

**Goal**: Add programmatic time tracking to main interview agent

**Files to modify**:
1. `agent/interview/agent.py`
   - Add time tracking attributes to `InterviewAgent`
   - Create `monitor_interview_time()` background task
   - Create `get_warning_times()` helper
   - Create `send_time_context()` helper
   - Start monitoring task in `entrypoint()`

**Estimated effort**: 2-3 hours

**Testing**:
- Run 5-minute test interview (should hit all warnings)
- Run 30-minute interview (verify halfway point)
- Verify hard stop terminates session

### Phase 2: Enhanced Prompt Instructions (Medium Priority)

**Goal**: Replace vague timing hint with structured timing system

**Files to modify**:
1. `agent/shared/utils/prompt_builder.py`
   - Replace line 147-148 with detailed timing instructions
   - Add section about time context updates
   - Add examples of natural time incorporation

**Estimated effort**: 1 hour

**Testing**:
- Verify agent responds to time contexts naturally
- Check that agent doesn't guess time anymore

### Phase 3: Frontend Time Display (Optional)

**Goal**: Show elapsed/remaining time to user during interview

**Files to modify**:
1. `app/interview/components/audio-visualizer.tsx`
   - Add elapsed time display (MM:SS)
   - Add remaining time indicator
   - Style to match tactical UI

**Estimated effort**: 2-3 hours

**Testing**:
- Verify time display updates every second
- Check that time matches server-side tracking

### Phase 4: Analytics & Validation (Low Priority)

**Goal**: Track actual vs. expected duration, flag too-long sessions

**Files to modify**:
1. Database queries
   - Add "too_long" status validation
   - Calculate duration variance metrics
   - Track average completion time per interview type

**Estimated effort**: 1-2 hours

---

## Expected Outcomes

### Before Implementation:
- ❌ Interviews ending in 10-15 minutes instead of 30-45 minutes
- ❌ Agent saying "I think we have about 10 minutes left" (wrong)
- ❌ No programmatic time enforcement
- ❌ No clear signal to wrap up

### After Implementation:
- ✅ Interviews consistently hitting target duration (30-45 min)
- ✅ Agent receives precise time context (no guessing)
- ✅ Predictable warning system (5 min, 2 min, hard stop)
- ✅ Graceful termination (not abrupt cutoff)
- ✅ Better pacing (agent knows when to move forward)

---

## Risk Analysis

### Low Risk ✅
1. **Time tracking logic**: Proven pattern from demo agent
2. **Background task**: Standard asyncio pattern in LiveKit
3. **Data channel communication**: Already used for transcripts

### Medium Risk ⚠️
1. **LLM response to time context**: Depends on prompt quality
   - **Mitigation**: Test with multiple LLMs (GPT-4o, GPT-4.1-mini)
   - **Fallback**: Add explicit examples in prompt

2. **Grace period tuning**: 2 minutes may be too short/long
   - **Mitigation**: Make grace period configurable
   - **Testing**: Try 1 min, 2 min, 3 min grace periods

### High Risk 🚨
None identified. This is a well-understood problem with proven solutions.

---

## Open Questions

1. **Should frontend display time?**
   - Pro: User knows how much time is left
   - Con: May create pressure/anxiety
   - **Recommendation**: Start without UI, add in Phase 3 if users request it

2. **Should we allow time extensions?**
   - Scenario: User is mid-answer at hard stop
   - Option A: Hard cutoff (current plan)
   - Option B: Allow 1-2 minute extension if user is speaking
   - **Recommendation**: Start with hard cutoff, add extension logic if users complain

3. **Should halfway warning be sent?**
   - Pro: Helps with pacing
   - Con: May feel unnecessary for 30-min interviews
   - **Recommendation**: Keep it, but make it gentle/informational

4. **What about section-based timing?**
   - Example: Product Sense has 5 steps, allocate time per step
   - Pro: More structured pacing
   - Con: More complex, may feel rigid
   - **Recommendation**: Post-MVP enhancement

---

## Success Metrics

### Quantitative:
1. **Average interview duration** (per type):
   - Target: ±10% of configured duration
   - Example: 30-min → 27-33 min actual
   - Example: 45-min → 40.5-49.5 min actual

2. **Completion rate**:
   - Target: >90% of interviews reach hard stop
   - Current: Unknown (likely <50% reach expected duration)

3. **Duration variance**:
   - Target: Standard deviation <5 minutes
   - Current: Unknown (likely high variance)

### Qualitative:
1. **User feedback**: "Interview felt like right length"
2. **Agent behavior**: Stops guessing time, responds to contexts naturally
3. **Session quality**: Consistent structure across all interviews

---

## Next Steps

1. **Approve architecture** ✅ (this document)
2. **Implement Phase 1**: Core time tracking (2-3 hours)
3. **Test in dev**: Run 5-min, 30-min, 45-min test interviews
4. **Deploy to Cloud**: Update interview agent
5. **Monitor metrics**: Track duration improvements
6. **Iterate**: Adjust grace period, warning times based on data

---

## Conclusion

The main interview agent needs **programmatic time tracking** to solve the "interviews ending too quickly" problem. The demo agent provides a proven pattern that can be adapted for longer 30-45 minute interviews.

**Key changes**:
1. Add time tracking state to `InterviewAgent`
2. Create background monitoring task
3. Send time context updates (not hard warnings)
4. Enhance prompt with timing system instructions

**Expected impact**:
- Interviews will consistently hit target duration
- Agent will pace naturally with precise time awareness
- Better user experience (predictable session length)

**Implementation effort**: ~4-6 hours (Phases 1-2)

**Risk level**: Low (proven pattern, well-understood problem)

---

**Ready to proceed with implementation?** See "Implementation Plan" section above for step-by-step guide.

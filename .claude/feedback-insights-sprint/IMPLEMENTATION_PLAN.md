# Implementation Plan: Interview Flow Fixes

**Generated**: 2025-11-06
**Status**: Active
**Priority Order**: Critical → Major → Minor

---

## ✅ Phase A: Critical Fixes (COMPLETED)

### 1. Interview Type Mismatch ✅
- **Issue**: Behavioral/Execution/Strategy interviews all get Product Sense prompts
- **Root Cause**: API sends `roundType` (camelCase), agent expects `round_type` (snake_case)
- **Fix**: Updated `/app/api/session/start/route.ts` line 175
- **Status**: ✅ DONE
- **Testing**: Start behavioral interview, verify correct prompt is used

### 2. Build Error in Signin Page ✅
- **Issue**: `useSearchParams()` not wrapped in Suspense boundary
- **Root Cause**: Next.js 14+ requires Suspense for search params in client components
- **Fix**: Wrapped component in Suspense boundary
- **Status**: ✅ DONE
- **Testing**: Run `npm run build` - should succeed

### 3. TTS Configuration Not Applied ✅
- **Issue**: User's voice/speed/emotion/volume selections ignored
- **Root Cause**: Agent used string-based TTS model instead of configured instance
- **Fix**: Created `cartesia.TTS()` instance with user config before `AgentSession`
- **Status**: ✅ DONE
- **Testing**: Select different voice/speed in setup, verify agent uses them

---

## 🔴 Phase 2: Transcript Capture Implementation (HIGH PRIORITY)

### Estimated Time: 8-12 hours

### Task 1: Agent-Side Transcript Publishing
**File**: `/agent/agent.py`

**Implementation Steps**:

1. Add transcript event handlers to `entrypoint()` function:
```python
async def entrypoint(ctx: JobContext):
    # ... existing setup code ...

    # Subscribe to conversation events for transcript capture
    session.on("user_speech_committed", lambda event: handle_user_speech(ctx, event))
    session.on("agent_speech_committed", lambda event: handle_agent_speech(ctx, event))

    await session.start(agent=InterviewAgent(instructions=instructions), room=ctx.room)
```

2. Create transcript event handlers:
```python
async def handle_user_speech(ctx: JobContext, event):
    """Publish user speech to frontend via data track"""
    transcript_data = {
        "speaker": "user",
        "text": event.text,
        "timestamp": event.timestamp,
        "section": event.section if hasattr(event, 'section') else None,
    }

    # Publish via LiveKit data track
    await ctx.room.local_participant.publish_data(
        json.dumps(transcript_data),
        topic="transcript"
    )
    logger.info(f"Published user transcript: {event.text[:50]}...")

async def handle_agent_speech(ctx: JobContext, event):
    """Publish agent speech to frontend via data track"""
    transcript_data = {
        "speaker": "agent",
        "text": event.text,
        "timestamp": event.timestamp,
        "section": event.section if hasattr(event, 'section') else None,
    }

    await ctx.room.local_participant.publish_data(
        json.dumps(transcript_data),
        topic="transcript"
    )
    logger.info(f"Published agent transcript: {event.text[:50]}...")
```

**Notes**:
- Need to verify exact event API in LiveKit Agents SDK docs
- May need to use `session.on_user_turn_end` instead of `on_user_speech_committed`
- Check if `AgentSession` exposes turn-level events

**Validation**:
- Add logging to confirm events are firing
- Check LiveKit dashboard for data track activity

---

### Task 2: Frontend Data Track Subscription
**File**: `/components/interview/livekit-room.tsx`

**Implementation Steps**:

1. Import `useDataChannel` hook:
```typescript
import { useDataChannel } from "@livekit/components-react";
```

2. Subscribe to transcript data track:
```typescript
function LiveKitRoom() {
  const { message } = useDataChannel("transcript");

  useEffect(() => {
    if (message) {
      try {
        const transcriptTurn = JSON.parse(new TextDecoder().decode(message));
        handleTranscriptUpdate(transcriptTurn);
      } catch (error) {
        console.error("Failed to parse transcript data:", error);
      }
    }
  }, [message]);

  // ... rest of component
}
```

3. Update `handleTranscriptUpdate()` in `/app/interview/page.tsx`:
```typescript
const handleTranscriptUpdate = useCallback(async (turn: TranscriptTurn) => {
  // Add to local state immediately for real-time display
  setTranscript(prev => [...prev, turn]);

  // Save to database
  if (sessionId) {
    try {
      await fetch("/api/session/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          turns: [turn],
        }),
      });
    } catch (error) {
      console.error("Failed to save transcript turn:", error);
    }
  }
}, [sessionId]);
```

**Validation**:
- Open browser console, verify transcript events are received
- Check network tab for POST requests to `/api/session/transcript`
- Check Supabase database for `transcript_turn` inserts

---

### Task 3: Database Optimization
**Optional**: Batch transcript saves every 5 turns instead of individual inserts

```typescript
// In interview page
const transcriptBuffer = useRef<TranscriptTurn[]>([]);

const handleTranscriptUpdate = useCallback(async (turn: TranscriptTurn) => {
  setTranscript(prev => [...prev, turn]);
  transcriptBuffer.current.push(turn);

  // Flush every 5 turns
  if (transcriptBuffer.current.length >= 5) {
    const turns = [...transcriptBuffer.current];
    transcriptBuffer.current = [];

    await fetch("/api/session/transcript", {
      method: "POST",
      body: JSON.stringify({ sessionId, turns }),
    });
  }
}, [sessionId]);

// On unmount, flush remaining turns
useEffect(() => {
  return () => {
    if (transcriptBuffer.current.length > 0) {
      fetch("/api/session/transcript", {
        method: "POST",
        body: JSON.stringify({ sessionId, turns: transcriptBuffer.current }),
      });
    }
  };
}, [sessionId]);
```

**Validation**:
- Verify no transcript turns are lost on session end
- Check database for batch inserts (5 rows at a time)

---

### Task 4: Testing & Validation

**Test Cases**:
1. ✅ Start interview, speak → verify transcript appears in UI
2. ✅ Agent responds → verify agent turn appears in UI
3. ✅ Check database → verify `transcript_turn` table has rows
4. ✅ End interview → verify feedback generation succeeds (no "empty transcript" error)
5. ✅ Refresh page during interview → verify transcript reloads from DB
6. ✅ Check console for errors → should be none

**Success Criteria**:
- Real-time transcript display working
- Database inserts happening (verify in Supabase dashboard)
- Feedback generation no longer fails with "empty transcript" error

---

## 🟡 Phase 3: Voice Visualizer UX Polish (MEDIUM PRIORITY)

### Estimated Time: 4-6 hours

### Task 1: Replace Custom Canvas with LiveKit BarVisualizer
**File**: `/app/interview/components/audio-visualizer.tsx`

**Implementation**:
- Use the implementation from the UI designer agent's report (Option 1)
- Import `BarVisualizer` from `@livekit/components-react`
- Add avatar as focal point
- Conditional rendering (show only when speaking)
- Framer Motion animations with spring physics

**Key Changes**:
- Height: `h-32` (128px) instead of 500px
- Width: `max-w-2xl` (672px)
- Bar count: 60 instead of 40
- Remove custom canvas implementation entirely

**Validation**:
- Visual comparison: should match demo modal smoothness
- Check performance: 60fps with no jank
- Test on mobile: should be responsive

---

### Task 2: Update Interview Page Layout
**File**: `/app/interview/page.tsx`

**Changes**:
- Reduce visualizer container from `max-h-[500px]` to `max-h-[400px]`
- Update grid layout if needed for better balance

**Validation**:
- Desktop: visualizer doesn't dominate screen
- Mobile: layout remains usable

---

## ⚠️ Phase 4: Additional Bugs from QA Audit (MINOR PRIORITY)

### Estimated Time: 12-16 hours

### 1. Audio Permission Request (2 hours)
**Issue**: No explicit audio permission request before interview starts
**Fix**: Add `navigator.mediaDevices.getUserMedia()` prompt in setup page
**File**: `/app/setup/page.tsx`

### 2. Duration Not Enforced (1 hour)
**Issue**: User can select 15/30/45 min but timer never stops interview
**Fix**: Add `useEffect` with timeout to auto-end session
**File**: `/app/interview/page.tsx`

### 3. Connection Quality Indicator (3 hours)
**Issue**: No visual feedback for poor connection
**Fix**: Use `useConnectionQuality()` hook, display indicator
**File**: `/components/interview/livekit-room.tsx`

### 4. Session Resume on Refresh (4 hours)
**Issue**: Refreshing page during interview loses state
**Fix**: Check for active session on mount, rejoin room if exists
**File**: `/app/interview/page.tsx`

### 5. Voice Preview Not Working (2 hours)
**Issue**: "Preview" button in setup does nothing
**Fix**: Implement TTS preview with selected voice
**File**: `/app/setup/page.tsx`

### 6. Better Error Handling (3 hours)
**Issue**: Generic loading screen shown for all errors
**Fix**: Distinguish between network errors, agent timeout, auth errors
**File**: `/app/interview/page.tsx`

### 7. Missing Confirmations (1 hour)
**Issue**: No "Are you sure?" when ending interview early
**Fix**: Add confirmation dialog before ending session
**File**: `/app/interview/page.tsx`

### 8. Mobile Testing (2 hours)
**Issue**: Mobile experience not tested
**Fix**: Test on iOS/Android, fix responsive issues
**Files**: All interview flow pages

---

## 📊 Phase 5: Full QA Report Delivery

**Output**: Comprehensive test report with:
- All 18 issues categorized by severity
- Step-by-step reproduction instructions
- Code examples and file locations
- Recommended fixes with priority
- Test cases for validation

**Deliverable**: `/Users/REDACTED/conductor/meelni-prep/.conductor/managua/.claude/QA_REPORT.md`

---

## 🎯 Recommended Execution Order

### Sprint 1 (Week 1):
1. ✅ Phase A: Critical Fixes (DONE)
2. 🔲 Phase 2: Transcript Capture Implementation
3. 🔲 Test & validate transcript flow end-to-end

### Sprint 2 (Week 2):
4. 🔲 Phase 3: Voice Visualizer UX Polish
5. 🔲 Phase 4: Fix top 3 minor bugs (audio permission, duration, connection quality)

### Sprint 3 (Week 3):
6. 🔲 Phase 4: Fix remaining 5 minor bugs
7. 🔲 Phase 5: Full QA testing and report
8. 🔲 Deploy to production

---

## 📈 Success Metrics

### Before Fixes:
- ❌ 3 out of 4 interview types broken
- ❌ 0% transcript capture working
- ❌ 0% TTS configuration applied
- ❌ Build failing due to Suspense error
- ❌ Visualizers too large and erratic

### After Phase 1-2:
- ✅ 100% interview types working correctly
- ✅ 100% transcript capture working
- ✅ 100% TTS configuration applied
- ✅ Build succeeding
- 🔲 Visualizers pending (Phase 3)

### After Phase 3-4:
- ✅ Visualizers smooth and professional
- ✅ All critical + major bugs fixed
- ✅ Mobile experience validated
- ✅ Production-ready interview flow

---

## 🚨 Risk Assessment

### High Risk:
- **Transcript capture**: Agent event API may differ from assumptions
  - **Mitigation**: Check LiveKit Agents SDK docs, test early
- **LiveKit data tracks**: May have size limits or rate limits
  - **Mitigation**: Batch sends, monitor data track usage

### Medium Risk:
- **TTS instance config**: Cartesia plugin may not support all parameters
  - **Mitigation**: Test voice/speed/emotion overrides in dev
- **Mobile testing**: May uncover new layout issues
  - **Mitigation**: Budget extra time for responsive fixes

### Low Risk:
- **Build error**: Suspense fix is standard Next.js pattern
- **Interview type**: Simple string mapping fix

---

## 📞 Support Needed

### From LiveKit:
- Confirm `AgentSession` conversation event API for transcript capture
- Verify data track best practices (batching, size limits)
- Check if `cartesia.TTS()` supports all parameters (voice, speed, emotion, volume)

### From Team:
- Test transcript capture on staging before production
- Validate TTS voices sound correct per user preferences
- Mobile testing on real devices (iOS/Android)

---

**End of Implementation Plan**

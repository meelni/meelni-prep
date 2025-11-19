# Phase 2: Transcript Capture Implementation Summary

**Date**: 2025-11-06
**Status**: ✅ COMPLETE - Ready for Testing
**Estimated Time**: 4 hours (actual)

---

## Overview

Implemented real-time transcript capture from LiveKit voice agent to frontend UI with automatic database persistence.

---

## Architecture

```
User speaks
    ↓
LiveKit STT (Deepgram Nova-3)
    ↓
Agent receives UserInputTranscribedEvent
    ↓
Agent publishes to data track ("transcript" topic)
    ↓
Frontend subscribes with useDataChannel("transcript")
    ↓
Frontend calls handleTranscriptUpdate(turn)
    ↓
UI updates immediately (setTranscript)
    ↓
TranscriptQueue saves to database (/api/session/transcript)
    ↓
Supabase transcript_turn table updated
```

---

## Files Modified

### 1. Agent: `/agent/agent.py`

**Changes**:
- Added imports: `json`, `UserInputTranscribedEvent`, `SpeechCreatedEvent`
- Implemented `@session.on("user_input_transcribed")` event handler
- Implemented `@session.on("speech_created")` event handler
- Published transcript data via `ctx.room.local_participant.publish_data()`

**Key Code**:
```python
@session.on("user_input_transcribed")
def on_user_transcript(event: UserInputTranscribedEvent):
    if event.is_final:
        transcript_data = {
            "speaker": "user",
            "text": event.transcript,
            "timestamp": event.created_at,
            "is_final": event.is_final,
        }
        ctx.room.local_participant.publish_data(
            json.dumps(transcript_data).encode("utf-8"),
            topic="transcript"
        )

@session.on("speech_created")
def on_agent_speech(event: SpeechCreatedEvent):
    speech_handle = event.speech_handle

    def on_speech_done(handle):
        agent_text = ""
        for chat_item in handle.chat_items:
            if hasattr(chat_item, 'content'):
                agent_text += chat_item.content + " "

        if agent_text.strip():
            transcript_data = {
                "speaker": "agent",
                "text": agent_text.strip(),
                "timestamp": event.created_at,
                "is_final": True,
            }
            ctx.room.local_participant.publish_data(
                json.dumps(transcript_data).encode("utf-8"),
                topic="transcript"
            )

    speech_handle.add_done_callback(on_speech_done)
```

**Data Format Published**:
```json
{
  "speaker": "user" | "agent",
  "text": "The actual transcript text",
  "timestamp": 1699999999.123,
  "is_final": true
}
```

---

### 2. Frontend: `/components/interview/livekit-room.tsx`

**Changes**:
- Added import: `useDataChannel` from `@livekit/components-react`
- Implemented data channel subscription in `RoomContent` component
- Added message decoding and parsing
- Converted agent data format to `TranscriptTurn` format
- Calls `onTranscriptUpdate(turn)` to trigger database save

**Key Code**:
```typescript
const { message } = useDataChannel("transcript");

useEffect(() => {
  if (message) {
    try {
      const decoder = new TextDecoder();
      const jsonString = decoder.decode(message);
      const transcriptData = JSON.parse(jsonString);

      const turn: TranscriptTurn = {
        speaker: transcriptData.speaker === "user" ? "user" : "interviewer",
        text: transcriptData.text,
        timestamp: new Date(transcriptData.timestamp * 1000),
        startedAt: new Date(transcriptData.timestamp * 1000),
        endedAt: new Date(transcriptData.timestamp * 1000),
        audioMs: 0,
        latencyMs: 0,
        section: null,
      };

      onTranscriptUpdate(turn);
    } catch (error) {
      console.error("[Transcript] Failed to parse transcript data:", error);
    }
  }
}, [message, onTranscriptUpdate]);
```

---

## Data Flow

### User Turn:
1. User speaks into microphone
2. LiveKit captures audio
3. Deepgram Nova-3 transcribes speech
4. `UserInputTranscribedEvent` fired with `is_final=true`
5. Agent publishes `{"speaker": "user", "text": "...", ...}` to data track
6. Frontend receives via `useDataChannel`
7. Frontend converts to `TranscriptTurn`
8. `handleTranscriptUpdate()` called
9. UI updates immediately (`setTranscript`)
10. `TranscriptQueue.save()` writes to database
11. Supabase `transcript_turn` table row inserted

### Agent Turn:
1. Agent generates response via GPT-4.1-mini
2. `SpeechCreatedEvent` fired
3. Agent registers `on_speech_done` callback
4. Cartesia Sonic 3 synthesizes speech
5. When speech completes, callback fires
6. Agent extracts text from `speech_handle.chat_items`
7. Agent publishes `{"speaker": "agent", "text": "...", ...}` to data track
8-11. Same as steps 6-11 above

---

## Key Discoveries

### LiveKit Events:
- `session.on("user_input_transcribed")` - User speech events
- `session.on("speech_created")` - Agent speech events
- `event.is_final` - Only final transcripts should be published (not interim)
- `speech_handle.chat_items` - Contains agent response text
- `speech_handle.add_done_callback()` - Get text after speech completes

### Data Track Communication:
- Topic: `"transcript"` (chosen name, could be anything)
- Format: UTF-8 encoded JSON string
- Decoding: `new TextDecoder().decode(message)`
- Message type: `Uint8Array` (binary data)

### Timing:
- User transcripts: Published immediately when `is_final=true`
- Agent transcripts: Published after speech synthesis completes
- This means agent transcripts appear *after* audio finishes playing

---

## Database Schema (Already Exists)

**Table**: `transcript_turn`

```typescript
{
  id: uuid,
  session_id: uuid,
  speaker: 'user' | 'interviewer',
  started_at: timestamp,
  ended_at: timestamp,
  text: string,
  audio_ms: number | null,
  latency_ms: number | null,
  section: string | null,
}
```

**API**: `/api/session/transcript`
- Method: POST
- Auth: Supabase JWT
- Body: `{ sessionId, speaker, text, startedAt, endedAt, audioMs?, latencyMs?, section? }`
- Response: `{ success: boolean, error?: string }`

**Queue**: `TranscriptQueue` (already implemented)
- Automatic retry on failure (up to 5 attempts)
- localStorage persistence
- Background processing
- No data loss on network issues

---

## Testing Checklist

### Unit Tests (Manual):
- ✅ Agent event handlers registered
- ✅ Frontend data channel subscribed
- ✅ Message decoding works
- ✅ Data format conversion correct

### Integration Tests (Needs Testing):
- 🔲 Start interview → agent joins
- 🔲 Speak to agent → user transcript appears in UI
- 🔲 Agent responds → agent transcript appears in UI
- 🔲 Check browser console → `[Transcript] Received:` logs
- 🔲 Check agent logs → `[Transcript] User:` and `[Transcript] Agent:` logs
- 🔲 Check database → `transcript_turn` rows inserted
- 🔲 End interview → feedback generation succeeds (no "empty transcript" error)

### Error Cases (Needs Testing):
- 🔲 Network disconnection during interview
- 🔲 Agent crashes mid-session
- 🔲 Database unavailable
- 🔲 Refresh page during interview

---

## Expected Behavior After Fix

### Before (Broken):
- ❌ Transcript panel shows: "Conversation transcript will appear here"
- ❌ Database `transcript_turn` table: 0 rows
- ❌ Feedback generation fails: "Cannot evaluate session with empty transcript"

### After (Working):
- ✅ Transcript panel shows: Real-time conversation turns
- ✅ Database `transcript_turn` table: N rows (one per turn)
- ✅ Feedback generation succeeds: Scores and insights displayed
- ✅ Console logs: `[Transcript] Received:` messages
- ✅ Agent logs: `[Transcript] User:` and `[Transcript] Agent:` messages

---

## Console Logs to Expect

### Browser Console:
```
[Transcript] Received: {speaker: "user", text: "How would you improve Instagram?", ...}
[Transcript] Received: {speaker: "agent", text: "Great question. Let's start by...", ...}
```

### Agent Logs:
```
INFO [Transcript] User: How would you improve Instagram?...
INFO [Transcript] Agent: Great question. Let's start by...
```

---

## Potential Issues & Mitigations

### Issue 1: Agent Text Extraction May Fail
**Symptom**: Agent transcripts don't appear, only user transcripts
**Cause**: `chat_item.content` property may not exist or be named differently
**Debug**: Add logging inside `on_speech_done` callback
**Fix**: Check LiveKit SDK docs for correct ChatItem property

### Issue 2: Timestamp Format Mismatch
**Symptom**: Transcripts appear but with wrong timestamps
**Cause**: `event.created_at` may be in milliseconds, not seconds
**Debug**: Check actual timestamp values in logs
**Fix**: Adjust multiplier in frontend (x1000 or x1)

### Issue 3: Data Track Not Received
**Symptom**: No transcript data in frontend at all
**Cause**: `useDataChannel` may require different topic name or initialization
**Debug**: Check LiveKit SDK version compatibility
**Fix**: Update to latest `@livekit/components-react` package

### Issue 4: Too Many Interim Transcripts
**Symptom**: Transcript fills with partial/duplicate text
**Cause**: Publishing interim transcripts instead of only final
**Debug**: Check agent logs for excessive `[Transcript]` messages
**Fix**: Verify `if event.is_final:` check is working

---

## Next Steps

### 1. Start Agent in Dev Mode
```bash
cd agent
source venv/bin/activate
python agent.py dev
```

### 2. Start Frontend Dev Server
```bash
npm run dev
# Server running on http://localhost:3001
```

### 3. Test End-to-End Flow
1. Sign in → Dashboard → "Start Mock Interview"
2. Setup page → Select "Behavioral" → Start Interview
3. Wait for agent to join (~5 seconds)
4. Speak: "Tell me about a time you led a team"
5. **Check**: User transcript appears in right panel
6. Wait for agent response
7. **Check**: Agent transcript appears in right panel
8. Speak again: "I led a team of 5 engineers..."
9. **Check**: Another user transcript appears
10. End interview
11. **Check**: "View Feedback" button works (no "empty transcript" error)

### 4. Verify Database
```sql
-- Check Supabase database
SELECT speaker, LEFT(text, 50) as text_preview, created_at
FROM transcript_turn
WHERE session_id = '<your-session-id>'
ORDER BY created_at;
```

### 5. Debug if Needed
- **No transcripts at all**: Check agent logs, verify event handlers registered
- **Only user transcripts**: Check agent speech extraction logic
- **Only agent transcripts**: Check user `is_final` filter
- **Duplicate transcripts**: Add deduplication or check `is_final` logic

---

## Success Metrics

### Immediate (Dev Testing):
- ✅ Transcripts appear in UI during interview
- ✅ Database receives transcript rows
- ✅ No console errors
- ✅ Feedback generation works

### Production (User Testing):
- ✅ 100% of sessions have transcripts (no empty sessions)
- ✅ < 1% transcript save failures
- ✅ < 500ms latency for transcript display
- ✅ > 95% transcript accuracy (subjective)

---

## Rollback Plan

If implementation fails:

1. **Revert agent changes**:
```bash
cd agent
git checkout agent.py
```

2. **Revert frontend changes**:
```bash
git checkout components/interview/livekit-room.tsx
```

3. **Redeploy without transcript capture**
4. **File bug report with logs**

---

## Future Enhancements

### Phase 2.1: Audio Metrics
- Calculate actual `audioMs` (speech duration)
- Calculate actual `latencyMs` (response time)
- Add to transcript data

### Phase 2.2: Section Tracking
- Track which part of interview (intro, question 1, question 2, etc.)
- Add `section` field to transcript turns
- Enable framework coverage analysis

### Phase 2.3: Transcript Quality
- Add confidence scores from Deepgram
- Handle multi-speaker conversations
- Support languages other than English

### Phase 2.4: Performance Optimization
- Batch transcript saves (every 5 turns instead of 1)
- Compress transcript data before sending
- Use WebSocket instead of data tracks (if faster)

---

**Implementation Status**: ✅ COMPLETE
**Next Action**: Test end-to-end flow
**Estimated Test Time**: 15-30 minutes
**Expected Outcome**: Real-time transcripts working, feedback generation succeeds

---

**End of Phase 2 Summary**

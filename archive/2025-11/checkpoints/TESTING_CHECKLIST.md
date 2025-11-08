# Transcript Persistence Testing Checklist

Quick reference for testing the transcript persistence implementation.

## Prerequisites

- [ ] Database connection working (`DATABASE_URL` set)
- [ ] Supabase Auth configured
- [ ] LiveKit credentials configured
- [ ] User account created (Google OAuth)

---

## Test 1: Basic Persistence (Happy Path)

**Goal**: Verify transcripts are saved to database during normal operation

### Steps:
1. [ ] Sign in to MockMate
2. [ ] Start a mock interview session
3. [ ] Speak 3-5 sentences and wait for AI responses
4. [ ] Check browser console - should see no errors
5. [ ] End the interview session
6. [ ] Run database query:

```sql
SELECT
  id,
  speaker,
  text,
  started_at,
  ended_at
FROM transcript_turn
WHERE session_id = 'YOUR_SESSION_ID'
ORDER BY started_at ASC;
```

### Expected Results:
- [ ] No errors in browser console
- [ ] Database has transcript turns (count > 0)
- [ ] All turns have timestamps (started_at, ended_at)
- [ ] Speaker alternates between 'user' and 'interviewer'
- [ ] Text field populated for all turns

---

## Test 2: Network Failure Recovery

**Goal**: Verify queue system handles network errors

### Steps:
1. [ ] Start a mock interview session
2. [ ] Open browser DevTools → Network tab
3. [ ] Speak one sentence (verify it saves normally)
4. [ ] Enable "Offline" mode in DevTools
5. [ ] Speak 2-3 more sentences
6. [ ] Check browser console - should see queue warnings
7. [ ] Check localStorage:

```javascript
JSON.parse(localStorage.getItem('transcript_queue'))
```

8. [ ] Disable "Offline" mode
9. [ ] Wait 3-5 seconds
10. [ ] Check browser console - should see success messages
11. [ ] Check database - all turns should now be saved

### Expected Results:
- [ ] Orange/amber badge appears in header during offline mode
- [ ] Console shows "[TranscriptQueue] Failed to save..." messages
- [ ] localStorage has queued items
- [ ] Badge disappears after going online
- [ ] Console shows "[TranscriptQueue] Successfully saved..." messages
- [ ] All transcript turns in database (none lost)

---

## Test 3: Queue Persistence Across Refresh

**Goal**: Verify queue survives page refreshes

### Steps:
1. [ ] Start a mock interview session
2. [ ] Enable "Offline" mode in DevTools
3. [ ] Speak 2-3 sentences
4. [ ] Verify localStorage has queue items:

```javascript
localStorage.getItem('transcript_queue')
```

5. [ ] Refresh the page (F5 or Cmd+R)
6. [ ] Check localStorage again - items should still be there
7. [ ] Disable "Offline" mode
8. [ ] Wait for background processing
9. [ ] Verify queue drains and items are saved to database

### Expected Results:
- [ ] Queue persists across page refresh
- [ ] Items are saved after going back online
- [ ] No duplicate saves in database

---

## Test 4: Error Indicator UI

**Goal**: Verify visual error indicator works correctly

### Steps:
1. [ ] Start a mock interview session
2. [ ] Verify no error badge in header initially
3. [ ] Enable "Offline" mode
4. [ ] Speak one sentence
5. [ ] Verify orange/amber badge appears in header
6. [ ] Disable "Offline" mode
7. [ ] Wait for queue to process
8. [ ] Verify badge disappears

### Expected Results:
- [ ] Badge shows "Saving transcript..." on desktop
- [ ] Badge shows error count on mobile
- [ ] Badge has AlertCircle icon
- [ ] Badge auto-hides when saves succeed

---

## Test 5: Retry Logic

**Goal**: Verify exponential backoff retry logic

### Steps:
1. [ ] Start interview session
2. [ ] Enable "Offline" mode
3. [ ] Speak one sentence
4. [ ] Open browser console
5. [ ] Monitor console logs for retry attempts
6. [ ] After 5 failed retries, verify item is dropped

### Expected Results:
- [ ] Console shows retry attempts with delays
- [ ] Delays increase: 2s, 2s, 2s, 2s, 2s (5 attempts)
- [ ] After 5 failures, item dropped with warning
- [ ] No infinite retry loop

---

## Test 6: Validation

**Goal**: Verify data validation works

### Steps:
1. [ ] Open browser console
2. [ ] Try to save invalid data:

```javascript
const queue = require('@/lib/utils/transcript-queue').getTranscriptQueue();

// Invalid speaker
queue.add({
  sessionId: 'test-id',
  speaker: 'invalid',
  text: 'Test',
});
// Expected: Validation error in console
```

### Expected Results:
- [ ] Invalid speaker rejected
- [ ] Invalid session ID rejected
- [ ] Validation errors logged to console
- [ ] Invalid items not added to queue

---

## Test 7: Performance

**Goal**: Verify save latency meets requirements (< 1 second)

### Steps:
1. [ ] Start interview session
2. [ ] Open browser DevTools → Network tab
3. [ ] Speak one sentence
4. [ ] Check network request to `/api/session/transcript`
5. [ ] Verify response time

### Expected Results:
- [ ] Request completes in < 1 second
- [ ] No UI freezing during save
- [ ] Transcript appears in UI immediately

---

## Test 8: Batch Save (Future)

**Goal**: Verify batch saving multiple turns

### Steps:
1. [ ] Enable "Offline" mode
2. [ ] Speak 5+ sentences
3. [ ] Verify queue has multiple items
4. [ ] Disable "Offline" mode
5. [ ] Monitor network requests
6. [ ] Check if items are batched or individual

### Expected Results:
- [ ] Currently: Individual POST requests per turn
- [ ] Future: Single POST with batch array

---

## Database Validation Queries

### Count Total Turns
```sql
SELECT COUNT(*) FROM transcript_turn;
```

### Check Recent Sessions
```sql
SELECT
  session_id,
  COUNT(*) as turn_count,
  MIN(started_at) as first_turn,
  MAX(ended_at) as last_turn
FROM transcript_turn
GROUP BY session_id
ORDER BY MAX(ended_at) DESC
LIMIT 10;
```

### Find Missing Data
```sql
-- Missing timestamps
SELECT COUNT(*) FROM transcript_turn WHERE started_at IS NULL OR ended_at IS NULL;

-- Missing text
SELECT COUNT(*) FROM transcript_turn WHERE text IS NULL OR text = '';

-- Invalid speakers
SELECT COUNT(*) FROM transcript_turn WHERE speaker NOT IN ('user', 'interviewer');
```

### Performance Check
```sql
-- Average latency by speaker
SELECT
  speaker,
  AVG(latency_ms) as avg_latency_ms,
  MAX(latency_ms) as max_latency_ms
FROM transcript_turn
WHERE latency_ms IS NOT NULL
GROUP BY speaker;
```

---

## Console Debug Commands

### Check Queue Status
```javascript
const queue = getTranscriptQueue();
const status = queue.getStatus();
console.log('Queue length:', status.queueLength);
console.log('Processing:', status.isProcessing);
console.log('Items:', status.items);
```

### Clear Queue
```javascript
const queue = getTranscriptQueue();
queue.clear();
console.log('Queue cleared');
```

### Force Queue Processing
```javascript
const queue = getTranscriptQueue();
// Queue processes automatically every 2 seconds
// No manual trigger needed
```

---

## Common Issues & Solutions

### Issue: Transcripts not saving
**Check**:
- [ ] DATABASE_URL environment variable set
- [ ] User is authenticated (check Supabase session)
- [ ] Session ID is valid
- [ ] Network DevTools shows successful POST requests

**Solution**:
```bash
# Check database connection
psql $DATABASE_URL -c "SELECT 1;"

# Check API route
curl -X POST http://localhost:3000/api/session/transcript \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test","speaker":"user","text":"test"}'
```

### Issue: Queue not draining
**Check**:
- [ ] localStorage has items (`localStorage.getItem('transcript_queue')`)
- [ ] Network is online
- [ ] API route is responding (200 status)

**Solution**:
```javascript
// Check queue status
const queue = getTranscriptQueue();
console.log(queue.getStatus());

// Clear queue if needed
queue.clear();
```

### Issue: Duplicate transcripts
**Check**:
- [ ] Only one browser tab open for interview
- [ ] No multiple LiveKit connections

**Solution**:
- Close duplicate tabs
- Use unique room names

---

## Success Criteria

All tests should pass with:
- ✅ No data loss during network failures
- ✅ All transcripts saved to database
- ✅ Save latency < 1 second
- ✅ Error indicator shows during failures
- ✅ Queue persists across page refreshes
- ✅ Retry logic works with exponential backoff
- ✅ No UI crashes or freezing

---

**Last Updated**: 2025-11-06
**Status**: Ready for testing ✅

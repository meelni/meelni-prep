# API Endpoint Test Scenarios for /api/interview/end

## P1-004: Session End API Endpoint Testing

This document outlines manual testing scenarios for the `/api/interview/end` endpoint.

---

## Test Scenario 1: Valid Full Session (25 min, 28 turns)

**Setup:**
- Create session with 28 turns (14 user, 14 interviewer)
- Session duration: 25 minutes (1500 seconds)
- 12 substantive user responses (>10 words each)

**Request:**
```json
POST /api/interview/end
{
  "sessionId": "session-full-123"
}
```

**Expected Response (200 OK):**
```json
{
  "status": "queued",
  "estimatedTime": 60,
  "feedbackId": "feedback-uuid",
  "tier": "full",
  "stats": {
    "totalTurns": 28,
    "userTurns": 14,
    "totalWords": 1200,
    "durationSeconds": 1500,
    "substantiveResponses": 12
  },
  "recommendations": [
    "Excellent session length - you'll receive detailed feedback"
  ]
}
```

**Database Changes:**
1. `interview_session.endedAt` set to current timestamp
2. `interview_session.totalTurns` = 28
3. `interview_session.totalWords` = 1200
4. `interview_session.durationSeconds` = 1500
5. `feedback` record created with status="pending"

**Inngest Job:**
- Event `feedback/generate.requested` triggered
- Payload includes sessionId, userId, tier="full"

---

## Test Scenario 2: Valid Partial Session (10 min, 8 turns)

**Setup:**
- Create session with 8 turns (4 user, 4 interviewer)
- Session duration: 10 minutes (600 seconds)
- 3 substantive user responses

**Request:**
```json
POST /api/interview/end
{
  "sessionId": "session-partial-456"
}
```

**Expected Response (200 OK):**
```json
{
  "status": "queued",
  "estimatedTime": 45,
  "feedbackId": "feedback-uuid",
  "tier": "partial",
  "stats": {
    "totalTurns": 8,
    "userTurns": 4,
    "totalWords": 350,
    "durationSeconds": 600,
    "substantiveResponses": 3
  },
  "recommendations": [
    "For comprehensive feedback, aim for 20+ minutes and 20+ exchanges",
    "This session qualifies for basic feedback"
  ]
}
```

**Database Changes:**
1. Session updated with endedAt and stats
2. Feedback record created with status="pending"

**Inngest Job:**
- Event triggered with tier="partial"

---

## Test Scenario 3: Too-Short Session (2 min, 2 turns)

**Setup:**
- Create session with 2 turns (1 user, 1 interviewer)
- Session duration: 2 minutes (120 seconds)
- 0 substantive user responses

**Request:**
```json
POST /api/interview/end
{
  "sessionId": "session-short-789"
}
```

**Expected Response (200 OK - Skipped):**
```json
{
  "status": "skipped",
  "reason": "Too few turns: 2 < 5 required",
  "tier": "insufficient",
  "stats": {
    "totalTurns": 2,
    "userTurns": 1,
    "totalWords": 25,
    "durationSeconds": 120,
    "substantiveResponses": 0
  },
  "recommendations": [
    "Aim for at least 10 minutes and 5 substantive exchanges for feedback",
    "Provide detailed answers (aim for 50-100 words per response)"
  ],
  "feedbackId": "feedback-uuid"
}
```

**Database Changes:**
1. Session updated with endedAt, stats, and status="too_short"
2. Feedback record created with status="skipped" and statusReason

**Inngest Job:**
- NO event triggered (skipped)

---

## Test Scenario 4: Abandoned Session (0 turns)

**Setup:**
- Create session with 0 turns
- User never spoke

**Request:**
```json
POST /api/interview/end
{
  "sessionId": "session-abandoned-999"
}
```

**Expected Response (200 OK - Skipped):**
```json
{
  "status": "skipped",
  "reason": "Session abandoned: No conversation turns recorded",
  "tier": "abandoned",
  "stats": {
    "totalTurns": 0,
    "userTurns": 0,
    "totalWords": 0,
    "durationSeconds": 0,
    "substantiveResponses": 0
  },
  "recommendations": [
    "Start a new interview session",
    "Ensure your microphone is working",
    "Wait for the agent to join before speaking"
  ],
  "feedbackId": "feedback-uuid"
}
```

**Database Changes:**
1. Session updated with status="abandoned"
2. Feedback record created with status="skipped"

---

## Test Scenario 5: Idempotency - Session Already Ended

**Setup:**
- Session already has endedAt timestamp
- Feedback record already exists with status="completed"

**Request:**
```json
POST /api/interview/end
{
  "sessionId": "session-already-ended-111"
}
```

**Expected Response (200 OK):**
```json
{
  "status": "queued",
  "message": "Session was already ended",
  "endedAt": "2024-11-08T10:30:00Z",
  "feedbackId": "existing-feedback-uuid"
}
```

**Database Changes:**
- NO changes (idempotent)

**Inngest Job:**
- NO event triggered (already processed)

---

## Test Scenario 6: Unauthorized User

**Setup:**
- No authentication token provided

**Request:**
```json
POST /api/interview/end
{
  "sessionId": "session-123"
}
```

**Expected Response (401 Unauthorized):**
```json
{
  "error": "Unauthorized"
}
```

---

## Test Scenario 7: User Does Not Own Session

**Setup:**
- User A authenticated
- Session belongs to User B

**Request:**
```json
POST /api/interview/end
{
  "sessionId": "session-owned-by-other-user"
}
```

**Expected Response (403 Forbidden):**
```json
{
  "error": "Session not found or access denied"
}
```

---

## Test Scenario 8: Missing sessionId

**Setup:**
- Valid authentication

**Request:**
```json
POST /api/interview/end
{}
```

**Expected Response (400 Bad Request):**
```json
{
  "error": "sessionId is required"
}
```

---

## Test Scenario 9: Rate Limiting (10 requests/min)

**Setup:**
- Make 11 consecutive requests within 1 minute

**Request 1-10:**
- All succeed with 200 OK

**Request 11:**
```json
POST /api/interview/end
{
  "sessionId": "session-rate-limit"
}
```

**Expected Response (429 Too Many Requests):**
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again in a minute."
}
```

---

## Test Scenario 10: Inngest Job Fails to Queue

**Setup:**
- Valid session ready for feedback
- Inngest service unavailable

**Request:**
```json
POST /api/interview/end
{
  "sessionId": "session-inngest-fail"
}
```

**Expected Response (500 Internal Server Error):**
```json
{
  "error": "Failed to queue feedback generation",
  "message": "Session ended successfully but feedback generation could not be started",
  "feedbackId": "feedback-uuid"
}
```

**Database Changes:**
1. Session updated with endedAt and stats
2. Feedback record created with status="failed" and statusReason="Failed to queue feedback generation job"

---

## Test Execution Checklist

### Authentication (2 scenarios)
- [ ] Scenario 6: Unauthorized user → 401
- [ ] Scenario 7: User does not own session → 403

### Request Validation (1 scenario)
- [ ] Scenario 8: Missing sessionId → 400

### Rate Limiting (1 scenario)
- [ ] Scenario 9: 11 requests in 1 minute → 429 on 11th

### Idempotency (1 scenario)
- [ ] Scenario 5: Already ended session → 200 with message

### Valid Sessions (2 scenarios)
- [ ] Scenario 1: Full session (25 min) → queued
- [ ] Scenario 2: Partial session (10 min) → queued

### Invalid Sessions (2 scenarios)
- [ ] Scenario 3: Too-short session (2 min) → skipped
- [ ] Scenario 4: Abandoned session (0 turns) → skipped

### Error Handling (1 scenario)
- [ ] Scenario 10: Inngest failure → 500

---

## Acceptance Criteria Verification

✅ API endpoint created at `app/api/interview/end/route.ts`
✅ User authentication validated
✅ Session ownership verified
✅ Session stats calculated using P1-002 utilities
✅ Session updated with final stats and status
✅ Session completeness validated
✅ Inngest job triggered if valid
✅ Appropriate status and error messages returned
✅ Idempotency implemented (handles duplicate requests)
✅ Rate limiting implemented (10 requests/min per user)
✅ 10 test scenarios documented and executable

---

## Integration Points

### P1-002: Session Validator
- `calculateSessionStats(sessionId)` - Calculate turns, words, duration
- `validateSessionCompleteness(sessionId)` - Validate session quality

### P1-003: Inngest Worker
- Event: `feedback/generate.requested`
- Payload: `{ sessionId, userId, tier }`

### Database
- Update: `interview_session` (endedAt, stats, status)
- Insert: `feedback` (status, statusReason, rubricVersion)

---

## Manual Testing Instructions

1. **Setup Test Database:**
   ```bash
   # Create test user
   # Create test sessions with various turn counts
   ```

2. **Test Valid Session:**
   ```bash
   curl -X POST http://localhost:3000/api/interview/end \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"sessionId": "session-id-here"}'
   ```

3. **Verify Database:**
   ```sql
   SELECT * FROM interview_session WHERE id = 'session-id-here';
   SELECT * FROM feedback WHERE session_id = 'session-id-here';
   ```

4. **Verify Inngest:**
   - Check Inngest dashboard for triggered event
   - Verify event payload matches expected format

---

## Success Metrics

- ✅ All 10 test scenarios pass
- ✅ API responds within 2 seconds (P95)
- ✅ Rate limiting prevents abuse
- ✅ Idempotency prevents duplicate feedback
- ✅ Error messages are clear and actionable
- ✅ Database updates are atomic
- ✅ Inngest jobs are triggered correctly

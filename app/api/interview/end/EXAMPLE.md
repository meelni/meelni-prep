# Example Usage: /api/interview/end

## P1-004: Session End API Endpoint

This document provides practical examples of using the `/api/interview/end` endpoint.

---

## Example 1: Successful Session End (Valid Full Session)

### Scenario
User completes a 25-minute interview with 28 turns and wants to receive feedback.

### Request
```bash
curl -X POST https://your-domain.com/api/interview/end \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

### Response (200 OK)
```json
{
  "status": "queued",
  "estimatedTime": 60,
  "feedbackId": "feedback-123-456-789",
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

### What Happens Next
1. **Database Updates:**
   - `interview_session.endedAt` = current timestamp
   - `interview_session.totalTurns` = 28
   - `interview_session.totalWords` = 1200
   - `interview_session.durationSeconds` = 1500
   - `interview_session.status` = "in_progress" (will be updated to "completed" by Inngest worker)

2. **Feedback Record Created:**
   ```sql
   INSERT INTO feedback (
     session_id,
     status,
     rubric_version
   ) VALUES (
     '550e8400-e29b-41d4-a716-446655440000',
     'pending',
     '1.0.0'
   );
   ```

3. **Inngest Job Triggered:**
   ```json
   {
     "name": "feedback/generate.requested",
     "data": {
       "sessionId": "550e8400-e29b-41d4-a716-446655440000",
       "userId": "user-abc-123",
       "tier": "full"
     }
   }
   ```

4. **User Experience:**
   - User sees "Feedback generation in progress" message
   - Estimated wait time: 60 seconds
   - User can poll `/api/feedback/{sessionId}` to check status
   - Email notification sent when feedback is ready (if enabled)

---

## Example 2: Session Too Short (Skipped)

### Scenario
User disconnects after 2 minutes with only 2 turns.

### Request
```bash
curl -X POST https://your-domain.com/api/interview/end \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "short-session-123"
  }'
```

### Response (200 OK)
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
    "Provide detailed answers (aim for 50-100 words per response)",
    "Explain your reasoning and thought process"
  ],
  "feedbackId": "feedback-skipped-123"
}
```

### What Happens Next
1. **Database Updates:**
   - `interview_session.endedAt` = current timestamp
   - `interview_session.status` = "too_short"
   - `interview_session.totalTurns` = 2
   - `interview_session.totalWords` = 25
   - `interview_session.durationSeconds` = 120

2. **Feedback Record Created (Skipped):**
   ```sql
   INSERT INTO feedback (
     session_id,
     status,
     status_reason,
     rubric_version
   ) VALUES (
     'short-session-123',
     'skipped',
     'Too few turns: 2 < 5 required, Too short: 2 min < 5 min required',
     '1.0.0'
   );
   ```

3. **NO Inngest Job Triggered** (session doesn't meet minimum requirements)

4. **User Experience:**
   - User sees "Session too short for feedback" message
   - Recommendations displayed to help user improve next time
   - User can start a new session immediately

---

## Example 3: Idempotent Request (Session Already Ended)

### Scenario
User clicks "End Session" button twice accidentally.

### First Request
```bash
curl -X POST https://your-domain.com/api/interview/end \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-already-ended"
  }'
```

### First Response (200 OK)
```json
{
  "status": "queued",
  "estimatedTime": 45,
  "feedbackId": "feedback-original",
  "tier": "partial",
  "stats": { ... }
}
```

### Second Request (Duplicate)
Same request sent 5 seconds later.

### Second Response (200 OK)
```json
{
  "status": "queued",
  "message": "Session was already ended",
  "endedAt": "2024-11-08T10:30:00Z",
  "feedbackId": "feedback-original"
}
```

### What Happens
1. **First Request:**
   - Session ended
   - Feedback queued
   - Inngest job triggered

2. **Second Request:**
   - Detects session already ended
   - Returns existing feedback status
   - NO duplicate processing
   - NO duplicate Inngest job

---

## Example 4: Error - Unauthorized

### Scenario
User tries to end session without authentication token.

### Request
```bash
curl -X POST https://your-domain.com/api/interview/end \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "some-session-id"
  }'
```

### Response (401 Unauthorized)
```json
{
  "error": "Unauthorized"
}
```

---

## Example 5: Error - Session Not Found

### Scenario
User tries to end session they don't own.

### Request
```bash
curl -X POST https://your-domain.com/api/interview/end \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "not-your-session"
  }'
```

### Response (403 Forbidden)
```json
{
  "error": "Session not found or access denied"
}
```

---

## Example 6: Error - Rate Limited

### Scenario
User makes 11 requests within 1 minute (limit is 10/min).

### 11th Request
```bash
curl -X POST https://your-domain.com/api/interview/end \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-id"
  }'
```

### Response (429 Too Many Requests)
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again in a minute."
}
```

---

## Frontend Integration Example

### React Component
```typescript
import { useState } from "react";

interface EndSessionButtonProps {
  sessionId: string;
  onSuccess: (feedbackId: string) => void;
  onSkipped: (reason: string) => void;
}

export function EndSessionButton({
  sessionId,
  onSuccess,
  onSkipped,
}: EndSessionButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleEndSession = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/interview/end", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle errors
        if (response.status === 429) {
          setError("Too many requests. Please wait a moment.");
        } else if (response.status === 403) {
          setError("You don't have access to this session.");
        } else {
          setError(data.error || "Failed to end session");
        }
        return;
      }

      // Handle success
      if (data.status === "queued") {
        onSuccess(data.feedbackId);
        // Show feedback loading UI
        // Poll /api/feedback/{sessionId} for updates
      } else if (data.status === "skipped") {
        onSkipped(data.reason);
        // Show recommendations to user
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleEndSession}
        disabled={loading}
        className="btn-primary"
      >
        {loading ? "Ending Session..." : "End Interview"}
      </button>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
    </div>
  );
}
```

### Feedback Polling
```typescript
async function pollFeedbackStatus(feedbackId: string) {
  const maxAttempts = 30; // 30 attempts = 2.5 minutes max
  const pollInterval = 5000; // 5 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`/api/feedback/${feedbackId}`);
    const data = await response.json();

    if (data.status === "completed") {
      // Feedback ready!
      return data;
    } else if (data.status === "failed") {
      // Generation failed
      throw new Error(data.statusReason || "Feedback generation failed");
    }

    // Still processing, wait and retry
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error("Feedback generation timed out");
}
```

---

## Summary

The `/api/interview/end` endpoint:

1. **Validates** user authentication and session ownership
2. **Calculates** session statistics (turns, words, duration)
3. **Updates** session with final stats
4. **Validates** session completeness (meets minimum requirements?)
5. **Creates** feedback record (pending or skipped)
6. **Triggers** Inngest job for valid sessions
7. **Returns** status, estimated time, and recommendations

Key features:
- ✅ Idempotent (safe to call multiple times)
- ✅ Rate limited (10 requests/min per user)
- ✅ Clear error messages
- ✅ No feedback for sessions that are too short
- ✅ Async processing via Inngest

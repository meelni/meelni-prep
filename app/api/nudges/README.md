# Real-Time Nudges API

## Overview

The Real-Time Nudges API analyzes transcript turns during live interviews and provides coaching nudges based on framework coverage and timing. This enables mid-answer coaching to help users improve their responses in real-time.

**Workstream**: WS #7 - Real-Time Nudges System
**Priority**: HIGH (Unique Differentiator)
**Status**: Implementation Complete ✅

---

## API Endpoint

### POST /api/nudges/analyze

Analyzes a transcript turn and returns whether a nudge should be triggered.

**Authentication**: Required (Supabase Auth JWT)
**Rate Limit**: 1 request per second per session
**Response Time**: < 200ms (critical for UX)

---

## Request Format

```typescript
POST /api/nudges/analyze
Content-Type: application/json
Authorization: Bearer <supabase-jwt-token>

{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "interviewType": "product_sense",
  "currentTurn": {
    "speaker": "user",
    "text": "I think users would like this feature because it's convenient...",
    "timestamp": 1699999999000
  },
  "timeElapsed": 95
}
```

### Request Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string (UUID) | Yes | Interview session identifier |
| `interviewType` | enum | Yes | `product_sense`, `analytical`, `leadership`, or `strategy` |
| `currentTurn.speaker` | enum | Yes | `user` or `interviewer` |
| `currentTurn.text` | string | Yes | Transcribed text of current turn |
| `currentTurn.timestamp` | number | Yes | Timestamp in milliseconds |
| `timeElapsed` | number | Yes | Total seconds elapsed since interview started |

---

## Response Format

### Success Response (Nudge Triggered)

```json
{
  "shouldNudge": true,
  "nudgeType": "metric_missing",
  "message": "You've been speaking for 90 seconds without mentioning any metrics. Can you quantify the impact?",
  "frameworkCoverage": [
    { "element": "Clarify", "covered": true },
    { "element": "Context", "covered": true },
    { "element": "Users", "covered": true },
    { "element": "Problem", "covered": true },
    { "element": "Solution", "covered": false }
  ]
}
```

### Success Response (No Nudge)

```json
{
  "shouldNudge": false,
  "frameworkCoverage": [
    { "element": "Clarify", "covered": true },
    { "element": "Context", "covered": true },
    { "element": "Users", "covered": false },
    { "element": "Problem", "covered": false },
    { "element": "Solution", "covered": false }
  ]
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `shouldNudge` | boolean | Whether a coaching nudge should be triggered |
| `nudgeType` | string? | Type of nudge (only if `shouldNudge: true`) |
| `message` | string? | Coaching message to display/speak (only if `shouldNudge: true`) |
| `frameworkCoverage` | array | Framework elements and their coverage status |
| `frameworkCoverage[].element` | string | Framework element name |
| `frameworkCoverage[].covered` | boolean | Whether element has been covered |

---

## Nudge Types

| Type | Trigger | Example Message |
|------|---------|-----------------|
| `metric_missing` | User speaks >90s without metrics | "Can you quantify the impact with specific numbers?" |
| `move_on` | User spends >2 minutes on one framework element | "You've covered this well. Let's move to the next part." |
| `clarify_first` | User starts answering before clarifying | "Have you asked clarifying questions about the problem?" |
| `framework_element` | Missing critical framework element | "Remember to explain the user's problem before jumping to solutions." |

---

## Error Responses

### 401 Unauthorized

```json
{
  "error": "Unauthorized"
}
```

**Cause**: Missing or invalid authentication token

---

### 400 Bad Request

```json
{
  "error": "Invalid interviewType. Must be one of: product_sense, analytical, leadership, strategy"
}
```

**Causes**:
- Missing required fields (`sessionId`, `interviewType`, `currentTurn`, `timeElapsed`)
- Invalid `interviewType` value
- Invalid `currentTurn` structure

---

### 403 Forbidden

```json
{
  "error": "Session not found or access denied"
}
```

**Cause**: User does not own the session

---

### 429 Too Many Requests

```json
{
  "error": "Rate limit exceeded. Maximum 1 request per second per session.",
  "retryAfter": 0.8
}
```

**Headers**:
```
Retry-After: 0.8
```

**Cause**: Rate limit exceeded (>1 request/second per session)

---

### 500 Internal Server Error (Graceful Degradation)

```json
{
  "shouldNudge": false,
  "error": "Analysis temporarily unavailable",
  "frameworkCoverage": []
}
```

**Note**: Returns HTTP 200 with `shouldNudge: false` to avoid breaking interview flow. Errors are logged server-side but don't interrupt the user experience.

---

## Authentication

Uses Supabase Auth JWT token in Authorization header:

```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**How to get token**:
```typescript
const supabase = createClient();
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;
```

---

## Rate Limiting

**Limit**: 1 request per second per session
**Enforcement**: In-memory rate limiting with automatic cleanup
**Purpose**: Prevent excessive API calls during fast-paced conversations

**Implementation**:
- Track last request timestamp per session ID
- Cleanup entries older than 5 minutes (automatic memory management)
- Return 429 with `Retry-After` header if rate limit exceeded

---

## Performance Optimizations

1. **Singleton Pattern**: `FrameworkTracker` instances are reused per session
2. **In-Memory Tracking**: Framework coverage tracked in memory (no DB queries per turn)
3. **Graceful Degradation**: Errors return `shouldNudge: false` to avoid breaking interviews
4. **Automatic Cleanup**: Old rate limit entries removed after 5 minutes
5. **Target Response Time**: < 200ms (critical for real-time UX)

---

## Integration Example

### From Interview Page (`/app/interview/page.tsx`)

```typescript
import { useCallback, useRef } from "react";

const NudgesIntegration = ({ sessionId, interviewType }) => {
  const lastNudgeTime = useRef<number>(0);
  const NUDGE_INTERVAL_MS = 1000; // Match rate limit

  const analyzeForNudge = useCallback(async (
    speaker: "user" | "interviewer",
    text: string,
    timestamp: number,
    timeElapsed: number
  ) => {
    // Throttle requests to match rate limit
    const now = Date.now();
    if (now - lastNudgeTime.current < NUDGE_INTERVAL_MS) {
      return;
    }
    lastNudgeTime.current = now;

    try {
      const response = await fetch("/api/nudges/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          sessionId,
          interviewType,
          currentTurn: { speaker, text, timestamp },
          timeElapsed,
        }),
      });

      const result = await response.json();

      if (result.shouldNudge) {
        // Show nudge UI overlay
        showNudgeOverlay(result.message, result.nudgeType);
      }

      // Update framework coverage indicator
      updateFrameworkCoverage(result.frameworkCoverage);
    } catch (error) {
      console.error("Nudge analysis error:", error);
      // Graceful failure - don't interrupt interview
    }
  }, [sessionId, interviewType, session]);

  return (
    // Your interview UI with nudge overlay
  );
};
```

---

## Testing

### Manual Testing with curl

```bash
# Get auth token first
export SUPABASE_TOKEN="your-jwt-token-here"
export SESSION_ID="550e8400-e29b-41d4-a716-446655440000"

# Test with product sense interview
curl -X POST http://localhost:3000/api/nudges/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -d '{
    "sessionId": "'$SESSION_ID'",
    "interviewType": "product_sense",
    "currentTurn": {
      "speaker": "user",
      "text": "I think this feature would be useful...",
      "timestamp": 1699999999000
    },
    "timeElapsed": 95
  }'

# Test rate limiting (should return 429 if called twice rapidly)
curl -X POST http://localhost:3000/api/nudges/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -d '{ ... }' && \
curl -X POST http://localhost:3000/api/nudges/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -d '{ ... }'
```

### Health Check

```bash
curl http://localhost:3000/api/nudges/analyze

# Response:
{
  "status": "ok",
  "service": "nudges-analysis",
  "version": "1.0.0"
}
```

---

## Dependencies

This API depends on the **FrameworkTracker** utility:

**File**: `/lib/nudges/framework-tracker.ts`
**Status**: To be implemented by another agent (WS #7 dependency)

**Expected Interface**:
```typescript
interface FrameworkTracker {
  static getInstance(sessionId: string, interviewType: string): FrameworkTracker;
  processTurn(turn: { speaker: string; text: string; timestamp: number }): void;
  analyze(timeElapsed: number): {
    shouldNudge: boolean;
    nudgeType?: string;
    message?: string;
    frameworkCoverage: Array<{ element: string; covered: boolean }>;
  };
}
```

---

## Architecture Decisions

### ADR-001: In-Memory Rate Limiting
**Decision**: Use in-memory Map for rate limiting instead of Redis
**Rationale**:
- MVP simplicity (no Redis infrastructure needed)
- Automatic cleanup prevents memory leaks
- Sufficient for single-instance deployments
**Future**: Migrate to Redis for multi-instance scaling

---

### ADR-002: Graceful Error Handling
**Decision**: Return 200 with `shouldNudge: false` on errors
**Rationale**:
- Nudges are enhancement, not critical feature
- Errors shouldn't break interview flow
- User experience > perfect accuracy
**Consequence**: Must monitor error logs for degraded service

---

### ADR-003: 1-Second Rate Limit
**Decision**: Limit to 1 request per second per session
**Rationale**:
- Prevents excessive API calls during fast conversations
- Allows enough granularity for mid-answer nudges
- Matches typical turn duration (5-60 seconds per turn)
**Future**: Consider adaptive rate limiting based on speech patterns

---

## Future Enhancements

1. **Adaptive Rate Limiting**: Adjust based on speaking speed
2. **Redis-Based Rate Limiting**: For multi-instance scaling
3. **Nudge History**: Track which nudges were shown per session
4. **ML-Based Triggers**: Use ML model instead of rule-based logic
5. **A/B Testing**: Test different nudge messages for effectiveness
6. **Nudge Analytics**: Track which nudges improve scores

---

## Related Files

| File | Purpose |
|------|---------|
| `/app/api/nudges/analyze/route.ts` | This API endpoint |
| `/lib/nudges/framework-tracker.ts` | Framework coverage tracking logic |
| `/lib/nudges/prompt-builder.ts` | Generates nudge messages (future) |
| `/components/interview/nudge-overlay.tsx` | UI for displaying nudges (future) |
| `/app/interview/page.tsx` | Interview page integration |

---

## Support

For questions or issues:
- Check logs: `console.error("Error analyzing nudges:", error)`
- Test with curl commands above
- Verify FrameworkTracker is implemented
- Check Supabase Auth is working

---

**Last Updated**: 2025-11-06
**Version**: 1.0.0
**Workstream**: WS #7 - Real-Time Nudges System

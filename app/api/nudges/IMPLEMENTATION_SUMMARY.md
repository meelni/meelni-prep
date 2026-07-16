# Real-Time Nudges API - Implementation Summary

**Workstream**: WS #7 - Real-Time Nudges System
**Agent**: backend-developer
**Date**: 2025-11-06
**Status**: ✅ Implementation Complete

---

## Overview

Successfully built the real-time nudges analysis API endpoint that analyzes transcript turns during live interviews and returns coaching nudges based on framework coverage and timing.

---

## Files Created

### 1. `/app/api/nudges/analyze/route.ts` (267 lines)

**Purpose**: Main API endpoint for real-time nudge analysis

**Key Features**:

- ✅ POST handler for nudge analysis
- ✅ GET handler for health check
- ✅ Supabase Auth integration (JWT verification)
- ✅ Session ownership verification
- ✅ In-memory rate limiting (1 req/sec per session)
- ✅ Automatic rate limit cleanup (5-minute threshold)
- ✅ Graceful error handling (returns `shouldNudge: false` on errors)
- ✅ Input validation for all required fields
- ✅ Type-safe interview type validation

**Authentication Pattern**:

```typescript
const supabase = await createClient();
const {
  data: { user },
  error: authError,
} = await supabase.auth.getUser();
if (authError || !user) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

**Rate Limiting Pattern**:

```typescript
const sessionRateLimits = new Map<string, number>();
const RATE_LIMIT_MS = 1000; // 1 request per second

function isRateLimited(sessionId: string): {
  limited: boolean;
  retryAfter: number;
} {
  // Check last request time
  // Auto-cleanup old entries
  // Return rate limit status
}
```

**Error Handling Strategy**:

- **Critical Errors** (401, 403, 429, 400): Return appropriate HTTP status
- **Analysis Errors** (500): Return HTTP 200 with `shouldNudge: false` (graceful degradation)
- **Rationale**: Nudges are enhancement, not critical - don't break interview flow

---

### 2. `/app/api/nudges/README.md` (500+ lines)

**Purpose**: Comprehensive API documentation

**Sections**:

- ✅ API endpoint specification
- ✅ Request/response formats with examples
- ✅ Nudge types and triggers
- ✅ All error responses with explanations
- ✅ Authentication guide
- ✅ Rate limiting documentation
- ✅ Performance optimizations
- ✅ Integration examples (React/TypeScript)
- ✅ Testing guide (curl commands)
- ✅ Architecture decision records (3 ADRs)
- ✅ Future enhancements roadmap

**Key ADRs**:

1. **In-Memory Rate Limiting**: Use Map instead of Redis for MVP simplicity
2. **Graceful Error Handling**: Return 200 with no-nudge on errors
3. **1-Second Rate Limit**: Balance between API protection and real-time UX

---

### 3. `/app/api/nudges/IMPLEMENTATION_SUMMARY.md` (this file)

**Purpose**: Implementation summary and handoff documentation

---

## API Specification

### Endpoint: POST /api/nudges/analyze

**Request**:

```typescript
{
  sessionId: string; // UUID
  interviewType: "product_sense" | "analytical" | "leadership" | "strategy";
  currentTurn: {
    speaker: "user" | "interviewer";
    text: string;
    timestamp: number; // milliseconds
  }
  timeElapsed: number; // seconds since interview started
}
```

**Response (Nudge Triggered)**:

```typescript
{
  shouldNudge: true;
  nudgeType: "metric_missing" |
    "move_on" |
    "clarify_first" |
    "framework_element";
  message: string;
  frameworkCoverage: Array<{
    element: string;
    covered: boolean;
  }>;
}
```

**Response (No Nudge)**:

```typescript
{
  shouldNudge: false;
  frameworkCoverage: Array<{
    element: string;
    covered: boolean;
  }>;
}
```

---

## Authentication Approach

Uses the existing Supabase Auth pattern shared by authenticated session routes:

1. **Extract JWT** from Authorization header
2. **Verify user** with `supabase.auth.getUser()`
3. **Check session ownership** with `isSessionOwnedByUser(sessionId, user.id)`
4. **Return 401/403** if auth fails

**Consistent with Codebase**:

- ✅ Uses `@/lib/supabase/server` (same as other API routes)
- ✅ Uses `@/lib/db/sessions` helper functions
- ✅ Follows same error response format

---

## Error Handling Strategy

### 1. **Client Errors (4xx)**

Return appropriate HTTP status and error message:

- **401 Unauthorized**: Missing/invalid JWT
- **403 Forbidden**: User doesn't own session
- **429 Too Many Requests**: Rate limit exceeded
- **400 Bad Request**: Invalid input

### 2. **Server Errors (5xx)**

Return **200 OK** with `shouldNudge: false`:

```typescript
{
  shouldNudge: false,
  error: "Analysis temporarily unavailable",
  frameworkCoverage: []
}
```

**Rationale**:

- Interview flow must not be interrupted by nudge errors
- Nudges are enhancement, not critical feature
- Graceful degradation maintains user experience
- Errors logged server-side for monitoring

---

## Performance Optimizations

### 1. **In-Memory Rate Limiting**

- **Approach**: Map<sessionId, timestamp>
- **Cleanup**: Automatic removal of entries > 5 minutes old
- **Performance**: O(1) lookups, no database queries
- **Trade-off**: Single-instance only (future: migrate to Redis)

### 2. **Target Response Time: < 200ms**

Critical for real-time UX during interviews:

- Minimal validation overhead
- No database queries per request (only auth check)
- Framework analysis delegated to `FrameworkTracker` (optimized)
- Fast-fail on rate limit (early return)

### 3. **Automatic Memory Management**

```typescript
// Cleanup entries older than 5 minutes
sessionRateLimits.forEach((timestamp, sid) => {
  if (now - timestamp > CLEANUP_THRESHOLD) {
    sessionRateLimits.delete(sid);
  }
});
```

**Benefits**:

- Prevents memory leaks
- No manual cleanup needed
- Scales to thousands of concurrent sessions

---

## Dependencies

### External Dependencies (Already Exist)

- ✅ `@/lib/supabase/server` - Supabase client creation
- ✅ `@/lib/db/sessions` - `isSessionOwnedByUser()` function
- ✅ `next` - NextRequest/NextResponse types

### Required Dependency (To Be Built)

- ⏳ `/lib/nudges/framework-tracker.ts` - Framework coverage tracking

**Expected Interface**:

```typescript
export class FrameworkTracker {
  static getInstance(
    sessionId: string,
    interviewType: string
  ): FrameworkTracker;
  processTurn(turn: { speaker: string; text: string; timestamp: number }): void;
  analyze(timeElapsed: number): {
    shouldNudge: boolean;
    nudgeType?:
      | "metric_missing"
      | "move_on"
      | "clarify_first"
      | "framework_element";
    message?: string;
    frameworkCoverage: Array<{ element: string; covered: boolean }>;
  };
}
```

**Rationale for Singleton**:

- Framework state must persist across multiple API calls in same session
- Avoid re-analyzing entire transcript on every turn
- Memory-efficient (one tracker per active session)

---

## Integration Example

From `/app/interview/page.tsx` (future implementation):

```typescript
const analyzeForNudge = useCallback(
  async (
    speaker: "user" | "interviewer",
    text: string,
    timestamp: number,
    timeElapsed: number
  ) => {
    // Throttle to 1 req/sec (match rate limit)
    if (Date.now() - lastNudgeTime.current < 1000) return;
    lastNudgeTime.current = Date.now();

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
        showNudgeOverlay(result.message, result.nudgeType);
      }

      updateFrameworkCoverage(result.frameworkCoverage);
    } catch (error) {
      console.error("Nudge analysis error:", error);
      // Graceful failure - continue interview
    }
  },
  [sessionId, interviewType, session]
);
```

---

## Testing Guide

### Manual Testing (curl)

```bash
# 1. Get auth token
export SUPABASE_TOKEN="your-jwt-token"
export SESSION_ID="550e8400-e29b-41d4-a716-446655440000"

# 2. Test basic request
curl -X POST http://localhost:3000/api/nudges/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -d '{
    "sessionId": "'$SESSION_ID'",
    "interviewType": "product_sense",
    "currentTurn": {
      "speaker": "user",
      "text": "I think this would be useful...",
      "timestamp": 1699999999000
    },
    "timeElapsed": 95
  }'

# 3. Test rate limiting (run twice rapidly)
for i in {1..2}; do
  curl -X POST http://localhost:3000/api/nudges/analyze \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $SUPABASE_TOKEN" \
    -d '...' &
done
wait
# Second request should return 429

# 4. Test health check
curl http://localhost:3000/api/nudges/analyze
# Should return: { "status": "ok", "service": "nudges-analysis", "version": "1.0.0" }
```

### Integration Testing

Once FrameworkTracker is built, test end-to-end:

```typescript
// Test product sense nudge
const response = await fetch("/api/nudges/analyze", {
  method: "POST",
  body: JSON.stringify({
    sessionId: "test-session",
    interviewType: "product_sense",
    currentTurn: {
      speaker: "user",
      text: "I think users would like this because it's convenient and easy to use and would save them time...",
      timestamp: Date.now(),
    },
    timeElapsed: 95, // >90s without metrics
  }),
});

const result = await response.json();
expect(result.shouldNudge).toBe(true);
expect(result.nudgeType).toBe("metric_missing");
```

---

## Next Steps

### For FrameworkTracker Implementation

The `framework-tracker.ts` should implement:

1. **Singleton Pattern**:

   ```typescript
   private static instances = new Map<string, FrameworkTracker>();

   static getInstance(sessionId: string, interviewType: string): FrameworkTracker {
     const key = `${sessionId}:${interviewType}`;
     if (!this.instances.has(key)) {
       this.instances.set(key, new FrameworkTracker(sessionId, interviewType));
     }
     return this.instances.get(key)!;
   }
   ```

2. **Framework Definitions**:

   ```typescript
   const FRAMEWORKS = {
     product_sense: ["Clarify", "Context", "Users", "Problem", "Solution"],
     analytical: ["Goal", "Metric", "Tradeoffs", "Recommendation"],
     leadership: ["Situation", "Task", "Action", "Result"],
     strategy: ["Market", "Competition", "Value Prop", "Growth"],
   };
   ```

3. **Turn Processing**:
   - Extract keywords from turn text (NLP or simple keyword matching)
   - Update framework coverage state
   - Track time spent on each element

4. **Nudge Logic**:
   - Check if user speaking >90s without metrics → `metric_missing`
   - Check if element discussed >2 min → `move_on`
   - Check if missing critical framework elements → `framework_element`
   - Check if user starts without clarifying → `clarify_first`

---

## File Ownership

| File                                      | Owner | Status      |
| ----------------------------------------- | ----- | ----------- |
| `/app/api/nudges/analyze/route.ts`        | WS #7 | ✅ Complete |
| `/app/api/nudges/README.md`               | WS #7 | ✅ Complete |
| `/lib/nudges/framework-tracker.ts`        | WS #7 | ⏳ Pending  |
| `/lib/nudges/prompt-builder.ts`           | WS #7 | 🔲 Future   |
| `/components/interview/nudge-overlay.tsx` | WS #7 | 🔲 Future   |

**Conflict Prevention**:

- WS #7 owns entire `/app/api/nudges/` directory
- No conflicts with other workstreams (isolated directory)

---

## Success Criteria

- ✅ API endpoint path: `POST /api/nudges/analyze`
- ✅ Request/response types defined and documented
- ✅ Authentication: Supabase Auth JWT (consistent with codebase)
- ✅ Rate limiting: 1 req/sec per session (in-memory Map)
- ✅ Error handling: Graceful degradation on analysis errors
- ✅ Performance: Designed for <200ms response time
- ✅ Documentation: Comprehensive README with examples
- ✅ Testing: curl commands and integration examples provided
- ⏳ Dependency: Waiting for FrameworkTracker implementation

---

## Architecture Highlights

### 1. **Graceful Degradation Design**

```typescript
catch (error) {
  console.error("Error analyzing nudges:", error);
  return NextResponse.json(
    {
      shouldNudge: false,
      error: "Analysis temporarily unavailable",
      frameworkCoverage: [],
    },
    { status: 200 } // 200 to avoid breaking interview flow
  );
}
```

**Impact**: Interview never breaks due to nudge analysis failures

---

### 2. **Rate Limiting with Automatic Cleanup**

```typescript
sessionRateLimits.forEach((timestamp, sid) => {
  if (now - timestamp > CLEANUP_THRESHOLD) {
    sessionRateLimits.delete(sid);
  }
});
```

**Impact**: Prevents memory leaks, scales to thousands of sessions

---

### 3. **Type-Safe Interview Type Validation**

```typescript
function isValidInterviewType(
  type: string
): type is "product_sense" | "analytical" | "leadership" | "strategy" {
  return ["product_sense", "analytical", "leadership", "strategy"].includes(
    type
  );
}
```

**Impact**: Compile-time type safety + runtime validation

---

## Related Documentation

- `/app/api/nudges/README.md` - Full API documentation
- `PARALLEL_IMPLEMENTATION_PLAN.md` - WS #7 workstream details
- `/lib/nudges/framework-tracker.ts` (future) - Framework tracking logic
- `/app/interview/page.tsx` (future) - Frontend integration

---

## Handoff Checklist

- ✅ API endpoint implemented and documented
- ✅ Authentication pattern consistent with codebase
- ✅ Error handling with graceful degradation
- ✅ Rate limiting with automatic cleanup
- ✅ Performance optimized for <200ms target
- ✅ Testing guide with curl examples
- ✅ Integration example for frontend team
- ✅ Comprehensive README with ADRs
- ⏳ Waiting for: FrameworkTracker implementation
- ⏳ Next step: Frontend integration in `/app/interview/page.tsx`

---

**Implementation Complete**: 2025-11-06
**Next Agent**: Will implement `FrameworkTracker` and frontend integration
**Status**: ✅ Ready for integration testing once FrameworkTracker is built

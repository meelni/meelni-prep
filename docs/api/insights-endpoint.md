# Insights API Endpoint

## Overview

The `/api/insights` endpoint provides aggregated analytics for authenticated users, including session stats, performance trends, and competency breakdowns.

**Base URL**: `https://www.meelni.com/api/insights`
**Method**: `GET`
**Authentication**: Required (Supabase session cookie)
**Rate Limit**: None (cached 1 hour)

---

## Request

### Headers

```http
GET /api/insights HTTP/1.1
Host: meelni.com
Cookie: sb-access-token=<session-token>
```

**Required Headers**:
- `Cookie`: Supabase authentication session (set automatically by browser)

**Optional Headers**:
- None

---

## Response

### Success Response (200 OK)

```json
{
  "overall": {
    "totalSessions": 15,
    "completedSessions": 15,
    "totalMinutes": 320,
    "avgScore": 7.5,
    "medianScore": 7.6,
    "percentile25": 7.0,
    "percentile75": 8.2,
    "percentile90": 8.7,
    "currentStreak": 3,
    "longestStreak": 7
  },
  "byType": {
    "product_sense": {
      "count": 5,
      "avgScore": 7.8,
      "last5Avg": 8.0
    },
    "analytical": {
      "count": 5,
      "avgScore": 7.4,
      "last5Avg": 7.5
    },
    "leadership": {
      "count": 3,
      "avgScore": 7.2,
      "last5Avg": 7.3
    },
    "strategy": {
      "count": 2,
      "avgScore": 7.6,
      "last5Avg": 7.7
    }
  },
  "byDifficulty": {
    "junior": {
      "count": 3,
      "avgScore": 6.8
    },
    "intermediate": {
      "count": 10,
      "avgScore": 7.5
    },
    "senior": {
      "count": 2,
      "avgScore": 8.2
    }
  },
  "trends": {
    "last5SessionsAvg": 7.8,
    "allTimeAvg": 7.5,
    "improvementTrend": "improving",
    "velocity": 0.15
  },
  "competencies": {
    "structure": 75,
    "clarity": 78,
    "insight": 72,
    "communication": 80,
    "leadership": 68
  },
  "lastUpdated": "2025-11-08T12:34:56.789Z"
}
```

**Response Headers**:
```http
HTTP/1.1 200 OK
Content-Type: application/json
Cache-Control: public, max-age=3600, stale-while-revalidate=7200
X-Response-Time: 145ms
```

### Empty State (200 OK)

For users with zero completed sessions:

```json
{
  "overall": {
    "totalSessions": 0,
    "completedSessions": 0,
    "totalMinutes": 0,
    "avgScore": 0,
    "medianScore": 0,
    "percentile25": 0,
    "percentile75": 0,
    "percentile90": 0,
    "currentStreak": 0,
    "longestStreak": 0
  },
  "byType": {
    "product_sense": { "count": 0, "avgScore": 0, "last5Avg": 0 },
    "analytical": { "count": 0, "avgScore": 0, "last5Avg": 0 },
    "leadership": { "count": 0, "avgScore": 0, "last5Avg": 0 },
    "strategy": { "count": 0, "avgScore": 0, "last5Avg": 0 }
  },
  "byDifficulty": {
    "junior": { "count": 0, "avgScore": 0 },
    "intermediate": { "count": 0, "avgScore": 0 },
    "senior": { "count": 0, "avgScore": 0 }
  },
  "trends": {
    "last5SessionsAvg": 0,
    "allTimeAvg": 0,
    "improvementTrend": "stable",
    "velocity": 0
  },
  "competencies": {
    "structure": 0,
    "clarity": 0,
    "insight": 0,
    "communication": 0,
    "leadership": 0
  },
  "lastUpdated": "2025-11-08T12:34:56.789Z"
}
```

### Error Responses

#### 401 Unauthorized

```json
{
  "error": "Unauthorized"
}
```

**Cause**: No valid session found (user not logged in)

#### 500 Internal Server Error

```json
{
  "error": "Failed to fetch insights",
  "ref": "8k3jd92"
}
```

**Cause**: Database error or unexpected failure. Use `ref` for support inquiries.

---

## Caching

### HTTP Cache Behavior

- **Max-Age**: 3600 seconds (1 hour)
- **Stale-While-Revalidate**: 7200 seconds (2 hours)
- **Cache-Control**: `public` (CDN cacheable)

**Implications**:
- First request: Fresh calculation (~150-200ms)
- Subsequent requests (within 1 hour): Cached (<10ms)
- Requests after 1 hour: Stale response served while revalidating in background

### Cache Invalidation

Currently, there is no automatic cache invalidation. Insights refresh:
1. After 1 hour (natural cache expiry)
2. On manual refresh (Ctrl+Shift+R / Cmd+Shift+R)

**Future Enhancement** (P2-003): Real-time invalidation via Inngest worker after session completion.

---

## Examples

### curl

#### Basic Request

```bash
curl -X GET \
  'https://www.meelni.com/api/insights' \
  -H 'Cookie: sb-access-token=your-session-token'
```

#### With Response Inspection

```bash
curl -X GET \
  'https://www.meelni.com/api/insights' \
  -H 'Cookie: sb-access-token=your-session-token' \
  -i  # Show headers
```

#### Test Empty State (Dev)

```bash
# For a user with no sessions
curl -X GET \
  'http://localhost:3000/api/insights' \
  -H 'Cookie: sb-access-token=test-user-token'
```

### JavaScript (Fetch)

```javascript
async function fetchInsights() {
  const response = await fetch('/api/insights', {
    method: 'GET',
    credentials: 'include', // Include cookies
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Redirect to login
      window.location.href = '/auth/signin';
      return;
    }
    throw new Error(`Error: ${response.status}`);
  }

  const insights = await response.json();
  console.log('Total sessions:', insights.overall.totalSessions);
  console.log('Current streak:', insights.overall.currentStreak, 'days');
  console.log('Improvement trend:', insights.trends.improvementTrend);

  return insights;
}
```

### React Hook

```typescript
import { useEffect, useState } from 'react';

interface Insights {
  overall: {
    totalSessions: number;
    avgScore: number;
    currentStreak: number;
    // ... other fields
  };
  // ... other sections
}

export function useInsights() {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/insights', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setInsights)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return { insights, loading, error };
}
```

---

## Performance

### Target Metrics

- **P50 (Median)**: <150ms
- **P95**: <250ms
- **P99**: <500ms

### Actual Performance

**Cold Request** (no cache):
- Database query: ~120ms (50 sessions)
- Aggregation: ~30ms (in-memory)
- JSON serialization: ~5ms
- **Total**: ~155ms

**Cached Request**:
- CDN/Browser cache: <10ms

### Optimization Notes

1. **Database**: Uses Drizzle relational queries with `with: { feedback: true }` for single-query joins
2. **Aggregation**: All grouping/sorting done in-memory (no heavy SQL operations)
3. **Caching**: 1-hour HTTP cache reduces database load by ~95%

**Monitoring**: Slow queries (>500ms) trigger warnings in logs with user ID for debugging.

---

## Data Flow

```
User Request
    ↓
[Authentication Check] → (401 if no session)
    ↓
[Fetch Sessions + Feedback] (Drizzle relational query)
    ↓
[Aggregate Insights] (in-memory calculations)
    ↓
[Return JSON + Cache Headers]
    ↓
[Client Cache] (1 hour)
```

---

## Future Enhancements

### Phase 2 (Planned)

1. **Pre-Aggregation** (P2-003):
   - Store insights in `user_insights` table
   - Update via Inngest worker after each session
   - API reads from cache table instead of re-calculating

2. **Real-Time Updates**:
   - WebSocket push when new session completes
   - Invalidate stale cache automatically

3. **Filters** (P2-005):
   - Date range: `?from=2024-01-01&to=2024-12-31`
   - Interview type: `?type=product_sense`
   - Difficulty: `?difficulty=senior`

---

## Troubleshooting

### "Unauthorized" Error

**Symptom**: 401 response
**Cause**: No valid session cookie
**Fix**: Ensure user is logged in via `/auth/signin`

### Slow Response (>500ms)

**Symptom**: Warning in logs: `[insights] Slow query: 600ms for user abc123`
**Cause**: Large number of sessions (>100) or database latency
**Fix**: Check database connection pool, add indexes if needed

### Empty Insights for Active User

**Symptom**: `totalSessions: 0` despite completed interviews
**Cause**: Sessions don't have `feedback` records (status != 'completed')
**Fix**: Verify feedback generation (check Inngest job status)

---

## Support

- **Documentation**: See `/docs/api/README.md`
- **Issues**: GitHub Issues with `ref` error ID
- **Logs**: Check Vercel logs with correlation ID from error response


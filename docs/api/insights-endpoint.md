# Insights API

`GET /api/insights` returns evidence-backed practice analytics for the
server-authenticated user. The route is dynamic and requires a valid Supabase
session.

## Response

HTTP `200` returns:

```json
{
  "overall": {
    "totalSessions": 8,
    "completedSessions": 6,
    "totalMinutes": 214,
    "avgScore": 7.4,
    "medianScore": 7.5,
    "percentile25": 6.8,
    "percentile75": 8.1,
    "percentile90": 8.6
  },
  "byType": {
    "product_sense": { "count": 3, "avgScore": 7.6, "last5Avg": 7.6 },
    "analytical": { "count": 1, "avgScore": 7.1, "last5Avg": 7.1 },
    "leadership": { "count": 1, "avgScore": 7.2, "last5Avg": 7.2 },
    "strategy": { "count": 1, "avgScore": 7.5, "last5Avg": 7.5 }
  },
  "byDifficulty": {
    "junior": { "count": 1, "avgScore": 7.9 },
    "intermediate": { "count": 4, "avgScore": 7.4 },
    "senior": { "count": 1, "avgScore": 6.8 }
  },
  "trends": {
    "last5SessionsAvg": 7.6,
    "allTimeAvg": 7.4,
    "improvementTrend": "stable",
    "velocity": 0.1
  },
  "competencies": {
    "structure": 76,
    "clarity": 72,
    "insight": 74,
    "communication": 78,
    "leadership": 70
  },
  "lastUpdated": "2026-07-15T18:00:00.000Z"
}
```

Only completed feedback with a valid rubric score contributes to score,
percentile, trend, difficulty, type, and competency claims. Session counts and
durations remain factual context. The response intentionally excludes streaks,
achievements, badges, hiring-outcome predictions, and other reward mechanics.

Users with no eligible completed feedback receive the same shape with zeroed
metrics and a `stable` trend. HTTP `401` returns `{ "error": "Unauthorized" }`.
HTTP `500` returns a stable message and a correlation reference; raw database
or provider errors are not returned.

## Privacy and caching

Every response uses:

```http
Cache-Control: private, no-store, max-age=0
```

The data is user-specific and must never be stored in a shared CDN cache. The
dashboard also requests the endpoint with `cache: "no-store"`. Slow-query logs
record duration without the user's raw identifier.

## Example

```bash
curl -i \
  -H 'Cookie: <authenticated session cookie>' \
  https://www.meelni.com/api/insights
```

The endpoint aggregates the authenticated user's interview sessions and
feedback through `lib/evaluation/insights-aggregator.ts`. The Inngest insights
worker uses the same grounded aggregate contract when persisting summary data.

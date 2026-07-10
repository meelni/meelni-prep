# Feedback Polling API Examples

`GET /api/feedback/[sessionId]` is authenticated and owner-scoped. Every
response uses `Cache-Control: private`; pending, processing, missing, and failed
states are `no-store`.

Clients use the top-level `retryable` field as the only recovery authority. They
must not infer retry behavior from dispatch details.

## Non-terminal states

```json
{ "status": "pending", "retryable": false }
```

```json
{ "status": "processing", "retryable": false }
```

Poll these states within the shared bounded client budget. The API may include
an estimated duration for compatibility, but the UI uses indeterminate progress
because elapsed time is not workflow-stage truth.

## Completed v2

```json
{
  "status": "completed",
  "retryable": false,
  "feedback": {
    "kind": "v2",
    "id": "feedback-abc123",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "scores": {
      "structure": 8,
      "clarity": 7,
      "insight": 9,
      "communication": 8,
      "leadership": 7,
      "overall": 7.9
    },
    "evaluationState": "full",
    "strengths": [
      {
        "dimension": "insight",
        "observation": "The answer selected a concrete segment.",
        "transcriptRefs": ["writer:1"],
        "evidence": [{ "turnRef": "writer:1", "quote": "working parents" }],
        "nextStep": "Carry the segment through prioritization.",
        "rubricVersion": "pm-feedback-rubric.v2",
        "confidence": 0.9
      }
    ],
    "improvements": [
      {
        "dimension": "structure",
        "observation": "The prioritization logic arrived before the approach was stated.",
        "transcriptRefs": ["writer:2"],
        "evidence": [
          { "turnRef": "writer:2", "quote": "I would start with reach" }
        ],
        "nextStep": "State the prioritization criteria before applying them.",
        "rubricVersion": "pm-feedback-rubric.v2",
        "confidence": 0.8
      }
    ],
    "suggestedExercises": [],
    "summary": "A grounded summary.",
    "schemaVersion": "feedback.v2",
    "promptVersion": "feedback.prompt.v2",
    "rubricVersion": "pm-feedback-rubric.v2",
    "modelVersion": "configured-model",
    "createdAt": "2026-07-10T12:00:00.000Z",
    "nextPracticeRecommendation": null
  }
}
```

`evaluationState` is `full` or `partial`. Partial feedback must retain its
recorded-portion disclaimer.

## Legacy and invalid completed feedback

Validated historical rows use `feedback.kind = "legacy"` and are presented as
historical notes without transcript-evidence or personalization claims.

Malformed, unsupported, incomplete, or score-inconsistent v2 rows return:

```json
{
  "status": "completed",
  "retryable": false,
  "feedback": {
    "kind": "invalid",
    "reason": "incompatible_or_corrupt"
  }
}
```

Clients must not infer zero scores or render raw persisted values for this state.

## Skipped states

```json
{
  "status": "skipped",
  "retryable": false,
  "details": {
    "tier": "insufficient",
    "reasons": ["Not enough recorded conversation"],
    "recommendations": ["Complete another mock interview"]
  }
}
```

`details.tier` is `insufficient` or `abandoned`; clients preserve that
distinction.

## Failed, missing, and active-session states

```json
{
  "status": "failed",
  "retryable": true,
  "message": "Feedback could not be completed."
}
```

Provider errors and prompt internals are never returned.

```json
{
  "status": "missing",
  "retryable": true,
  "message": "Feedback has not been queued yet."
}
```

```json
{
  "status": "session_not_ended",
  "retryable": false,
  "message": "This interview has not ended yet."
}
```

## Recovery

Each mounted feedback client may automatically call authenticated `POST
/api/feedback/[sessionId]` once when top-level `retryable` is true. Concurrent
polls share that attempt. A failed automatic attempt becomes an explicit user
action rather than an unbounded POST loop.

Both `/feedback/[sessionId]` and `/feedback/[sessionId]/loading` render the same
`FeedbackReview` controller and lifecycle state machine.

# Feedback Lifecycle API

`GET /api/feedback/[sessionId]` is an authenticated, owner-scoped feedback
lifecycle endpoint. Cross-user and unknown session IDs return the same `404`
shape so session existence is not disclosed.

Clients must runtime-decode the complete response variant. The top-level
`retryable` field is the only recovery authority; nested dispatch metadata is
diagnostic and must not independently trigger recovery. All authenticated
responses use private caching.

## In-progress variants

```json
{
  "status": "missing",
  "retryable": true,
  "message": "Feedback has not been queued yet."
}
```

```json
{
  "status": "settling",
  "retryable": false,
  "delayed": false,
  "message": "The interview is saved and its room is still being closed safely."
}
```

```json
{
  "status": "session_not_ended",
  "retryable": false,
  "message": "This interview has not ended yet."
}
```

```json
{
  "status": "pending",
  "retryable": false,
  "delayed": false,
  "estimatedTimeRemaining": 45
}
```

```json
{
  "status": "processing",
  "retryable": false,
  "delayed": false,
  "estimatedTimeRemaining": 25
}
```

`missing`, `settling`, `pending`, and `processing` can be retryable only when
the server has proved that recovery is safe. A user-ended `settling` session is
retryable after the 30-second terminalization upper bound; deadline room
cleanup remains non-retryable. `pending + sent` becomes retryable after its
90-second queue claim lease expires. `processing` becomes visibly delayed at
45 seconds but retains its five-minute execution lease to prevent duplicate
model calls. Polling uses a three-second interval and a 30-request budget.

Recovery uses the same owner-scoped endpoint:

```http
POST /api/feedback/[sessionId]
```

For stale user-end settlement, POST redelivers durable finalization and returns
`settling`. For feedback states, POST repairs or redispatches the stored work.
The client continues polling every returned `settling`, `pending`, or
`processing` state, including after a successful recovery request.

## Completed v2

```json
{
  "status": "completed",
  "retryable": false,
  "feedback": {
    "kind": "v2",
    "id": "feedback-id",
    "sessionId": "session-id",
    "scores": {
      "structure": 8,
      "clarity": 7,
      "insight": 9,
      "communication": 8,
      "leadership": 7,
      "overall": 7.9
    },
    "strengths": [
      {
        "dimension": "insight",
        "observation": "The answer selected a concrete segment.",
        "transcriptRefs": ["writer:1"],
        "evidence": [{ "turnRef": "writer:1", "quote": "working parents" }],
        "nextStep": "Carry that segment through prioritization.",
        "rubricVersion": "pm-feedback-rubric.v2",
        "confidence": 0.9
      }
    ],
    "improvements": [
      {
        "dimension": "structure",
        "observation": "The answer delayed its decision criteria.",
        "transcriptRefs": ["writer:2"],
        "evidence": [
          { "turnRef": "writer:2", "quote": "then I would compare options" }
        ],
        "nextStep": "State the decision criteria before comparing options.",
        "rubricVersion": "pm-feedback-rubric.v2",
        "confidence": 0.8
      }
    ],
    "summary": "A concise, evidence-grounded summary.",
    "schemaVersion": "feedback.v2",
    "promptVersion": "feedback.prompt.v2",
    "modelVersion": "stored-model-version",
    "rubricVersion": "pm-feedback-rubric.v2",
    "evaluationState": "full",
    "createdAt": "2026-07-15T21:00:00.000Z",
    "nextPracticeRecommendation": null
  }
}
```

Supported historical rows return `feedback.kind = "legacy"` and are explicitly
labeled as historical in the UI. Malformed or unsupported completed rows return
only this fail-closed variant; they expose no score or finding:

```json
{
  "status": "completed",
  "retryable": false,
  "feedback": { "kind": "invalid", "reason": "incompatible_or_corrupt" }
}
```

Valid completed rows use `Cache-Control: private, max-age=3600`; invalid rows
use `private, no-store`.

## Skipped and failed

```json
{
  "status": "skipped",
  "retryable": false,
  "details": {
    "tier": "insufficient",
    "reasons": [],
    "recommendations": ["Start another mock interview when ready."]
  }
}
```

```json
{
  "status": "failed",
  "retryable": true,
  "message": "Feedback could not be completed."
}
```

Provider errors and raw stored failure details are never returned to the
customer. Unknown or malformed lifecycle variants must render an explicit
unavailable state rather than an indefinite loader.

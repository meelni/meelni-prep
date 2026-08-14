# Meelni API Documentation

> Internal application-route reference. Meelni does not offer a public
> developer API. Provider, model, and voice tuning are operator-owned and are
> never accepted by the session-start route.

**Version**: 1.0.0
**Base URL**: `https://mockmate.vercel.app` (production) | `http://localhost:3000` (development)
**Authentication**: Supabase Auth (JWT bearer tokens)
**Response Format**: JSON
**Date Format**: ISO 8601 timestamps

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Error Handling](#error-handling)
4. [Rate Limiting](#rate-limiting)
5. [API Endpoints](#api-endpoints)
   - [Session Management](#session-management)
   - [Transcript Management](#transcript-management)
   - [Feedback & Evaluation](#feedback--evaluation)
   - [LiveKit Integration](#livekit-integration)
   - [Legacy Voice Catalog](#legacy-voice-catalog)
6. [Code Examples](#code-examples)
7. [Webhooks](#webhooks)
8. [Changelog](#changelog)

---

## Overview

The Meelni API provides programmatic access to real-time AI-powered mock interviews for product managers. The API enables you to:

- **Start and manage mock interview sessions** with a realistic PM interviewer
- **Save and retrieve conversation transcripts** turn-by-turn
- **Generate AI feedback** with dimension scores and improvement recommendations
- **Choose bounded interview preferences** such as difficulty and duration
- **Integrate LiveKit** for real-time audio/video communication

### Key Features

- **Real-time voice interviews** via LiveKit Cloud infrastructure
- **AI-powered feedback** using GPT-4 Turbo evaluation engine
- **Multiple interview types**: Product Sense, Behavioral, Execution, Strategy
- **Server-owned voice runtime**: provider and voice settings are operator-controlled
- **Session persistence**: Full transcript and metadata storage
- **User-scoped data**: Row-level security for multi-tenant isolation

### Tech Stack

- **Backend**: Next.js 14+ API Routes (Node.js)
- **Database**: PostgreSQL via Supabase
- **Authentication**: Supabase Auth (Google OAuth)
- **Real-time**: LiveKit Cloud (WebRTC)
- **AI Models**:
  - Speech-to-Text: Deepgram Nova-3
  - Language Model: OpenAI GPT-4.1-mini (dialogue), GPT-4 Turbo (evaluation)
  - Text-to-Speech: Cartesia Sonic 3.0

---

## Authentication

All protected endpoints require authentication via Supabase Auth JWT tokens.

### Getting Started

1. **Sign in with Google OAuth**:

   ```typescript
   import { createClient } from "@supabase/supabase-js";

   const supabase = createClient(
     process.env.NEXT_PUBLIC_SUPABASE_URL!,
     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
   );

   const { data, error } = await supabase.auth.signInWithOAuth({
     provider: "google",
     options: {
       redirectTo: `${window.location.origin}/auth/callback`,
     },
   });
   ```

2. **Retrieve access token**:

   ```typescript
   const {
     data: { session },
   } = await supabase.auth.getSession();
   const accessToken = session?.access_token;
   ```

3. **Include token in API requests**:
   ```typescript
   const response = await fetch("/api/session/start", {
     method: "POST",
     headers: {
       Authorization: `Bearer ${accessToken}`,
       "Content-Type": "application/json",
     },
     body: JSON.stringify({ roundType: "product_sense" }),
   });
   ```

### Token Lifecycle

- **Token TTL**: 1 hour (default Supabase configuration)
- **Automatic refresh**: Handled by Supabase client
- **Manual refresh**: Call `supabase.auth.refreshSession()`

### Public Endpoints

These endpoints do **not** require authentication:

- `POST /api/livekit/demo-token` - Demo token generation
- `GET /api/cartesia/voices` - Legacy informational voice catalog; not a session-start control

---

## Error Handling

### Standard Error Response Format

All errors return a JSON object with the following structure:

```json
{
  "error": "Error message string",
  "details": "Optional detailed error information"
}
```

### HTTP Status Codes

| Status Code | Meaning               | Common Causes                                        |
| ----------- | --------------------- | ---------------------------------------------------- |
| `200`       | OK                    | Request succeeded                                    |
| `400`       | Bad Request           | Missing required fields, invalid parameters          |
| `401`       | Unauthorized          | Missing or invalid authentication token              |
| `403`       | Forbidden             | User doesn't own requested resource                  |
| `404`       | Not Found             | Resource doesn't exist                               |
| `429`       | Too Many Requests     | Rate limit exceeded                                  |
| `500`       | Internal Server Error | Database error, AI service failure, unexpected error |

### Error Examples

#### 400 Bad Request

```json
{
  "error": "roundType is required"
}
```

#### 401 Unauthorized

```json
{
  "error": "Unauthorized"
}
```

#### 403 Forbidden

```json
{
  "error": "Session not found or access denied"
}
```

#### 500 Internal Server Error

```json
{
  "error": "Failed to generate feedback",
  "details": "OpenAI API rate limit exceeded"
}
```

### Error Handling Best Practices

```typescript
try {
  const response = await fetch("/api/session/start", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ roundType: "product_sense" }),
  });

  if (!response.ok) {
    const error = await response.json();

    if (response.status === 401) {
      // Refresh token or redirect to login
      await refreshAuthToken();
    } else if (response.status === 403) {
      // User doesn't own this resource
      console.error("Access denied:", error.error);
    } else if (response.status === 500) {
      // Server error - retry with exponential backoff
      console.error("Server error:", error.details);
    }

    throw new Error(error.error);
  }

  const data = await response.json();
  return data;
} catch (error) {
  console.error("API request failed:", error);
  throw error;
}
```

---

## Rate Limiting

### Current Limits (MVP Phase)

- **Authenticated requests**: 100 requests per minute per user
- **Demo requests**: 10 requests per minute per IP address
- **Session creation**: 1 session start per 5 seconds per user
- **Concurrent sessions**: 10 active sessions per user
- **Feedback generation**: 5 requests per minute per user (GPT-4 Turbo rate limit)

### Rate Limit Headers

When rate limited, responses include:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1699999999
```

### Rate Limit Response

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 60
}
```

**Status Code**: `429 Too Many Requests`

### Best Practices

- **Implement exponential backoff** for retries
- **Cache responses** where applicable (e.g., voice list, session details)
- **Batch transcript saves** instead of saving each turn individually
- **Queue feedback generation** for end-of-session processing

---

## API Endpoints

## Session Management

### POST /api/session/start

Creates a new interview session, sets up a LiveKit room, dispatches an AI agent, and returns credentials for the user to join the interview.

**Authentication**: Required (Supabase Auth JWT)

**Request Body**:

```json
{
  "roundType": "product_sense",
  "mode": "voice_video",
  "role": "pm",
  "config": {
    "difficulty": "intermediate",
    "duration": 45,
    "hintMode": "off",
    "questionPreference": {
      "recency": "very_recent",
      "recentDays": 365
    }
  }
}
```

**Request Parameters**:

| Field       | Type   | Required | Default       | Description                                                                    |
| ----------- | ------ | -------- | ------------- | ------------------------------------------------------------------------------ |
| `roundType` | string | ✅ Yes   | -             | Interview type. One of: `behavioral`, `product_sense`, `execution`, `strategy` |
| `mode`      | string | No       | `voice_video` | Interview mode. One of: `voice_video`, `text`                                  |
| `role`      | string | No       | `pm`          | Canonical candidate role; only `pm` is accepted                                |
| `config`    | object | No       | `{}`          | Client-safe interview preferences (see below)                                  |

**Config Object**:

| Field                | Type   | Required | Default         | Description                                                              |
| -------------------- | ------ | -------- | --------------- | ------------------------------------------------------------------------ |
| `difficulty`         | string | No       | `intermediate`  | `beginner`, `intermediate`, or `advanced`                                |
| `duration`           | number | No       | `30`            | 15, 30, or 45 minutes                                                    |
| `hintMode`           | string | No       | `off`           | Compatibility field; full mock interviews normalize every value to `off` |
| `questionPreference` | object | No       | recent defaults | Bounded recency choice and optional `recentDays`                         |

Provider, model, voice, persona, and voice-tuning fields are not public
controls. They are stripped or rejected before persistence and room creation.

**Response** (200 OK):

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "roomName": "interview-1699999999999-abc123",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "url": "wss://meelni-ek4vaisp.livekit.cloud",
  "deadlineAt": "2026-07-11T20:30:00.000Z",
  "config": {
    "difficulty": "intermediate",
    "duration": 45,
    "hintMode": "off",
    "questionPreference": {
      "recency": "very_recent",
      "recentDays": 365
    }
  },
  "question": null
}
```

`deadlineAt` is the server-owned absolute cutoff used by the browser,
reconnect authorization, LiveKit room metadata, the voice runtime, and the
durable completion workflow. Clients must not recompute or extend it.

**Errors**:

- `401 Unauthorized` - Missing or invalid authentication token
- `400 Bad Request` - Missing `roundType` or invalid `roundType` value
- `500 Internal Server Error` - Database error or LiveKit configuration error

---

### POST /api/interview/end

Atomically claims terminal session truth, creates or repairs the feedback row,
and reports whether feedback dispatch is queued, retryable, or unnecessary.
Equivalent replays return the stored terminal result; they do not overwrite the
first terminal reason.

**Authentication**: Required (Supabase Auth JWT)

**Request Body**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Request Parameters**:

| Field       | Type   | Required | Description                |
| ----------- | ------ | -------- | -------------------------- |
| `sessionId` | string | ✅ Yes   | UUID of the session to end |

**Response** (200 OK):

```json
{
  "status": "queued",
  "session": {
    "lifecycleState": "completed",
    "terminalReason": "user_end",
    "endedAt": "2025-11-05T11:15:00Z",
    "disposition": "applied"
  },
  "feedback": {
    "id": "650e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "dispatchStatus": "sent",
    "retryable": false
  },
  "feedbackId": "650e8400-e29b-41d4-a716-446655440000",
  "tier": "full",
  "stats": {
    "totalTurns": 20,
    "userTurns": 10,
    "totalWords": 800,
    "durationSeconds": 1200,
    "substantiveResponses": 8
  },
  "recommendations": [],
  "nextHref": "/feedback/550e8400-e29b-41d4-a716-446655440000/loading"
}
```

**Errors**:

- `401 Unauthorized` - Missing or invalid authentication token
- `400 Bad Request` - Missing or malformed `sessionId`
- `404 Not Found` - Session is absent or belongs to another user
- `429 Too Many Requests` - End-attempt budget exceeded
- `500 Internal Server Error` - Terminal truth was not confirmed

---

### GET /api/session/:sessionId

Retrieves complete information about a specific interview session including configuration, timing, metadata, and room details. User must own the session to access it.

**Authentication**: Required (Supabase Auth JWT)

**URL Parameters**:

| Parameter   | Type   | Description                     |
| ----------- | ------ | ------------------------------- |
| `sessionId` | string | UUID of the session to retrieve |

**Response** (200 OK):

```json
{
  "session": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "user-123",
    "roundType": "product_sense",
    "mode": "voice_video",
    "role": "pm",
    "startedAt": "2025-11-05T10:30:00Z",
    "deadlineAt": "2025-11-05T11:15:00Z",
    "feedbackReady": true,
    "endedAt": "2025-11-05T11:15:00Z",
    "livekitRoomName": "interview-1699999999-abc123",
    "config": {
      "difficulty": "intermediate",
      "duration": 45,
      "hintMode": "off",
      "questionPreference": {
        "recency": "very_recent",
        "recentDays": 365
      }
    }
  }
}
```

`feedbackReady` is server-owned handoff truth. The hard-deadline interview UI
does not navigate to feedback until the session is terminal and this value is
`true`, which requires any persisted hard-deadline room-cleanup claim to be
acknowledged, followed by feedback dispatch (`sent`) or a finalized skipped
result (`not_required`). Cleanup provenance is persisted independently of the
refined terminal reason, so `not_required` cannot make a still-live room visible
as ready.

**Errors**:

- `401 Unauthorized` - Missing or invalid authentication token
- `403 Forbidden` - User does not own this session
- `404 Not Found` - Session does not exist
- `409 Conflict` - Session has no valid server-owned deadline and cannot resume safely
- `500 Internal Server Error` - Database query failed

---

### GET /api/sessions

Retrieves a list of the authenticated user's interview sessions, with optional filtering by round type. Results are ordered by most recent first.

**Authentication**: Required (Supabase Auth JWT)

**Query Parameters**:

| Parameter   | Type   | Required | Default | Description                                                                       |
| ----------- | ------ | -------- | ------- | --------------------------------------------------------------------------------- |
| `roundType` | string | No       | -       | Filter by interview type (`behavioral`, `product_sense`, `execution`, `strategy`) |
| `limit`     | number | No       | `50`    | Maximum number of results (1-100)                                                 |

**Response** (200 OK):

```json
{
  "sessions": [
    {
      "id": "session-1",
      "userId": "user-123",
      "roundType": "product_sense",
      "mode": "voice_video",
      "startedAt": "2025-11-05T10:30:00Z",
      "endedAt": "2025-11-05T11:15:00Z",
      "livekitRoomName": "interview-1699999999-abc123",
      "config": { ... }
    },
    {
      "id": "session-2",
      "roundType": "behavioral",
      "startedAt": "2025-11-04T14:20:00Z",
      "endedAt": null,
      ...
    }
  ],
  "count": 2
}
```

**Errors**:

- `401 Unauthorized` - Missing or invalid authentication token
- `400 Bad Request` - Invalid `roundType` or `limit` out of range
- `500 Internal Server Error` - Database query failed

---

## Transcript Management

### Runtime transcript writes

Transcript writes are not a public client API. The voice runtime uses the
signed, timestamped `POST /api/internal/transcript` service endpoint and
publishes an event to the browser only after persistence succeeds. Candidate
clients can read only their owned transcript through the endpoint below. See
[Runtime Transcript Ingest](../operations/runtime-transcript-ingest.md).

---

### GET /api/session/:sessionId/transcript

Retrieves the complete conversation transcript for an interview session, including all turns from both user and interviewer in chronological order. User must own the session to access the transcript.

**Authentication**: Required (Supabase Auth JWT)

**URL Parameters**:

| Parameter   | Type   | Description         |
| ----------- | ------ | ------------------- |
| `sessionId` | string | UUID of the session |

**Response** (200 OK):

```json
{
  "turns": [
    {
      "id": "turn-1",
      "sessionId": "550e8400-e29b-41d4-a716-446655440000",
      "speaker": "interviewer",
      "startedAt": "2025-11-05T10:30:05Z",
      "endedAt": "2025-11-05T10:30:12Z",
      "text": "Tell me about a product you recently launched.",
      "audioMs": 7000,
      "latencyMs": 850,
      "section": "opening"
    },
    {
      "id": "turn-2",
      "sessionId": "550e8400-e29b-41d4-a716-446655440000",
      "speaker": "user",
      "startedAt": "2025-11-05T10:30:13Z",
      "endedAt": "2025-11-05T10:31:45Z",
      "text": "I worked on a mobile checkout feature that increased conversion by 15%...",
      "audioMs": 92000,
      "latencyMs": null,
      "section": "response"
    }
  ]
}
```

**Errors**:

- `401 Unauthorized` - Missing or invalid authentication token
- `403 Forbidden` - User does not own this session
- `500 Internal Server Error` - Database query failed

---

## Feedback & Evaluation

Feedback generation has no client write endpoint. Terminal interview
completion atomically commits transcript eligibility and schedules evaluation
only when the evidence is valid.

---

### GET /api/feedback/:sessionId

Retrieves the feedback state or completed feedback for an owned terminal
interview session. A hard-deadline session returns `settling` until room
cleanup is acknowledged. After acknowledgement it returns the durable feedback
and dispatch state, including retryable pending or failed dispatch. The user
must own the session to access feedback.

**Authentication**: Required (Supabase Auth JWT)

**URL Parameters**:

| Parameter   | Type   | Description         |
| ----------- | ------ | ------------------- |
| `sessionId` | string | UUID of the session |

**Response** (200 OK - completed):

```json
{
  "feedback": {
    "id": "feedback-abc123",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "structureScore": 8,
    "clarityScore": 7,
    "insightScore": 9,
    "communicationScore": 8,
    "leadershipScore": 7,
    "overallScore": 7.8,
    "strengths": [
      "Strong use of STAR framework in behavioral responses",
      "Clear articulation of product metrics"
    ],
    "improvements": [
      "Could dig deeper into trade-offs",
      "Add more quantitative data"
    ],
    "drills": [
      "Practice 5-10 product sense questions with timer",
      "Record yourself and review for filler words"
    ],
    "summary": "Solid product sense interview with clear structure...",
    "createdAt": "2025-11-05T11:20:00Z"
  }
}
```

**Response** (200 OK - hard deadline settling):

```json
{
  "status": "settling",
  "retryable": false,
  "message": "The interview is saved and its room is still being closed safely."
}
```

Authenticated `POST /api/feedback/:sessionId` cannot bypass this boundary. It
returns `409 deadline_settlement_pending` until the deadline consumer has
acknowledged room cleanup. Feedback starts automatically after cleanup; later
generation retries and direct retry preserve the existing idempotent dispatch
behavior.

**Errors**:

- `401 Unauthorized` - Missing or invalid authentication token
- `403 Forbidden` - User does not own this session
- `404 Not Found` - Feedback not found for this session (hasn't been generated yet)
- `409 Conflict` - Direct retry attempted while hard-deadline cleanup is pending
- `500 Internal Server Error` - Database query failed

---

## LiveKit Integration

### POST /api/livekit/token

Issues a short-lived JWT access token for reconnecting to an existing, active interview session. Room creation and agent dispatch happen only through `/api/session/start`.

**Authentication**: Required (Supabase Auth)
**Authorization**: The authenticated user must own an active, unexpired `voice_video` session. The session created by the credit-gated start workflow is the entitlement; remaining credit balance is not rechecked for reconnects.

**Request Body**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Request Parameters**:

| Field       | Type | Required | Description                             |
| ----------- | ---- | -------- | --------------------------------------- |
| `sessionId` | UUID | ✅ Yes   | Owned interview session to reconnect to |

**Response** (200 OK):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "url": "wss://meelni.livekit.cloud",
  "roomName": "interview-1699999999-abc123"
}
```

**Errors**:

- `400 Bad Request` - Missing or malformed `sessionId`
- `401 Unauthorized` - Authentication required
- `404 Not Found` - Session absent or not owned by the authenticated user
- `409 Conflict` - Session completed, failed, ended, expired, text-only, or has no room
- `429 Too Many Requests` - More than 10 reconnect-token requests for the authenticated user in one minute; response includes `Retry-After`
- `503 Service Unavailable` - Shared reconnect authorization or LiveKit token service is temporarily unavailable
- `500 Internal Server Error` - LiveKit credentials not configured or token generation failed

---

### POST /api/livekit/demo-token

Authorizes a server-bounded two-minute voice preview on the landing page. A first accepted request creates an ephemeral LiveKit room and dispatches the dedicated demo agent; one server-authorized recovery request may issue a second token for that same room without redispatching the agent.

A signed device may start up to 10 previews in a rolling 24-hour window, with
only one preview active at a time. The web route rotates the signed session
identity after an active preview expires; this internal handshake performs no
provider work. A server-confirmed provider startup failure restores the device,
IP, and deployment allowances for that reservation.

**Authentication**: Public, with signed HttpOnly device/session cookies and shared server-side abuse limits

**Request Body**:

```json
{}
```

**Request Parameters**:

No caller-supplied identity, room name, or dispatch identifier is accepted. The request must be same-origin JSON and its body must be exactly `{}`.

**Response** (200 OK):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "url": "wss://example.livekit.cloud",
  "durationSeconds": 120
}
```

**Implementation Details**:

- Room identity: Random, opaque, and server-derived for every new preview; never returned to the browser
- Browser identity: A first zero-cost `409 demo_identity_initialized` handshake commits signed cookies before any database reservation or provider call; the client then repeats the empty request once
- Session deadline: Absolute server-authored deadline, 2 minutes after authorization
- Empty/departure cleanup: 30 seconds empty; 5 seconds after participant departure
- Max participants: 2 (user + demo agent only)
- Agent: Dedicated Cloud-hosted demo agent, explicitly dispatched once
- Agent behavior: One PM practice question with brief feedback, bounded by the server deadline
- Token TTL: Every initial or recovery token expires at the same persisted absolute session deadline; recovery receives only the remaining time, and issuance/finalization fails closed unless at least five seconds remain for delivery

**Errors**:

- `403 Forbidden` - Cross-site request rejected
- `404 Not Found` - Public voice preview disabled by the relaunch gate
- `400 Bad Request` - Body is malformed JSON or is not exactly `{}`
- `409 Conflict` - Signed identity was initialized or rotated without provider work, start is already in progress, or the device already has an active preview
- `415 Unsupported Media Type` - Request is not `application/json`
- `429 Too Many Requests` - The 10-preview rolling device allowance or a shared safety limit was reached; response includes `Retry-After`
- `503 Service Unavailable` - Authorization, configuration, or LiveKit is unavailable

---

## Legacy Voice Catalog

### GET /api/cartesia/voices

Returns a legacy informational catalog. It is retained for compatibility and
operator diagnostics; candidates cannot submit these IDs to
`POST /api/session/start`, and the current product exposes no voice selector.

**Authentication**: Public (no authentication required)

**Response** (200 OK):

```json
[
  {
    "id": "79a125e8-cd45-4c13-8a67-188112f4dd22",
    "name": "British Lady",
    "description": "Mature British English voice",
    "gender": "female",
    "language": "en"
  },
  {
    "id": "f114a467-c40a-4db5-8ca8-53b8f1509406",
    "name": "Reflective Man",
    "description": "Calm and thoughtful male voice",
    "gender": "male",
    "language": "en"
  },
  {
    "id": "f9836c6e-a0bd-460e-9d3c-f7299fa60f94",
    "name": "Confident Lady",
    "description": "Professional and confident female voice",
    "gender": "female",
    "language": "en"
  },
  ...
]
```

**Response Schema**:

| Field         | Type   | Description                                           |
| ------------- | ------ | ----------------------------------------------------- |
| `id`          | string | Legacy voice UUID                                     |
| `name`        | string | Display name (e.g., "British Lady", "Confident Lady") |
| `description` | string | Voice characteristics description                     |
| `gender`      | string | Voice gender (`male` \| `female`)                     |
| `language`    | string | Language code (e.g., `en`)                            |

**Implementation Notes**:

- No Cartesia API key required when using LiveKit Inference
- LiveKit handles authentication with Cartesia on backend
- Voices are hardcoded for consistent UX (no external API dependency)
- Runtime voice selection is configured through server-only
  `MEELNI_INTERVIEW_*` environment variables.
- Catalog entries are not accepted session-start preferences.

---

## Code Examples

### Starting an Interview Session

```typescript
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function startInterview() {
  // Get auth token
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error("Not authenticated");
  }

  // Start session
  const response = await fetch("/api/session/start", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      roundType: "product_sense",
      role: "pm",
      config: {
        difficulty: "intermediate",
        duration: 45,
        hintMode: "off",
        questionPreference: { recency: "very_recent", recentDays: 365 },
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  const data = await response.json();
  console.log("Session started:", data.sessionId);
  console.log("LiveKit token:", data.token);
  console.log("LiveKit URL:", data.url);

  return data;
}
```

### Transcript persistence

Interview transcripts are persisted by the trusted voice runtime before they
are published to the room for display. Browser clients cannot create or update
transcript turns. An authenticated owner can read the durable transcript with
`GET /api/session/:sessionId/transcript`.

### Feedback generation

Clients end the interview and poll the owner-only feedback read endpoint.
Generation is scheduled by committed terminal eligibility, never by a browser
request.

### Listing Sessions with Filtering

```typescript
async function getProductSenseSessions(limit = 10) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const response = await fetch(
    `/api/sessions?roundType=product_sense&limit=${limit}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  const data = await response.json();
  console.log(`Found ${data.count} product sense sessions`);

  return data.sessions;
}
```

### Full Interview Flow Example

```typescript
async function runFullInterviewFlow() {
  // 1. Start session
  const sessionData = await startInterview();
  const { sessionId, token, url } = sessionData;

  // 2. Connect to LiveKit room (using @livekit/components-react)
  // ... LiveKit connection code ...

  // 3. Save transcript turns during conversation
  await saveTranscript(sessionId, [
    {
      speaker: "interviewer",
      text: "Tell me about a product you launched.",
      startedAt: new Date().toISOString(),
      endedAt: new Date(Date.now() + 8000).toISOString(),
      audioMs: 8000,
    },
    {
      speaker: "user",
      text: "I launched a mobile checkout feature...",
      startedAt: new Date(Date.now() + 10000).toISOString(),
      endedAt: new Date(Date.now() + 75000).toISOString(),
      audioMs: 65000,
    },
  ]);

  // 4. End session
  await fetch("/api/interview/end", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId }),
  });

  // 5. Generate feedback
  const feedback = await generateFeedback(sessionId);

  // 6. Display feedback to user
  console.log("Interview complete! Your score:", feedback.overallScore);
  console.log("Strengths:", feedback.strengths);
  console.log("Areas to improve:", feedback.improvements);
  console.log("Practice exercises:", feedback.drills);
}
```

---

## Webhooks

**Status**: Not yet implemented (planned for Phase 2)

Planned webhook events:

- `session.started` - Interview session started
- `session.ended` - Interview session ended
- `feedback.generated` - AI feedback generated
- `transcript.saved` - Transcript turns saved

---

## Changelog

### Version 1.0.0 (2025-11-05)

**Added**:

- Initial API release
- Session management endpoints (`POST /api/session/start`, `POST /api/interview/end`, `GET /api/session/:sessionId`, `GET /api/sessions`)
- Runtime-owned transcript persistence and owner-only transcript reads (`GET /api/session/:sessionId/transcript`)
- Terminally scheduled feedback and owner-only reads (`GET /api/feedback/:sessionId`)
- LiveKit token generation (`POST /api/livekit/token`, `POST /api/livekit/demo-token`)
- Legacy informational Cartesia voice catalog (`GET /api/cartesia/voices`)
- Supabase Auth integration (Google OAuth)
- TypeScript type definitions (`/types/api.ts`)

**Changed**:

- N/A

**Deprecated**:

- N/A

**Removed**:

- N/A

**Fixed**:

- N/A

**Security**:

- Implemented Row Level Security (RLS) policies for user-scoped data
- JWT bearer token authentication via Supabase Auth
- Rate limiting for feedback generation (GPT-4 Turbo API)

---

## Support

For questions or issues with the API:

- **Email**: [humans@conductor.build](mailto:humans@conductor.build)
- **GitHub Issues**: [github.com/your-repo/issues](https://github.com/your-repo/issues)
- **Documentation**: [docs.mockmate.app](https://docs.mockmate.app)

---

**Last Updated**: 2025-11-05
**API Version**: 1.0.0
**Document Version**: 1.0.0

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

- **Start and manage interview sessions** with AI coaches
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

| Field                | Type   | Required | Default         | Description                                      |
| -------------------- | ------ | -------- | --------------- | ------------------------------------------------ |
| `difficulty`         | string | No       | `intermediate`  | `beginner`, `intermediate`, or `advanced`        |
| `duration`           | number | No       | `30`            | 15, 30, or 45 minutes                            |
| `hintMode`           | string | No       | `off`           | `off`, `gentle`, or `coach`                      |
| `questionPreference` | object | No       | recent defaults | Bounded recency choice and optional `recentDays` |

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

### POST /api/session/end

Marks an interview session as completed by setting the `endedAt` timestamp. User must own the session to end it.

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
  "success": true,
  "session": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "user-123",
    "roundType": "product_sense",
    "mode": "voice_video",
    "role": "pm",
    "startedAt": "2025-11-05T10:30:00Z",
    "endedAt": "2025-11-05T11:15:00Z",
    "livekitRoomName": "interview-1699999999-abc123",
    "config": { ... }
  }
}
```

**Response (Already Ended)**:

```json
{
  "success": true,
  "session": { ... },
  "message": "Session was already ended"
}
```

**Errors**:

- `401 Unauthorized` - Missing or invalid authentication token
- `400 Bad Request` - Missing `sessionId`
- `403 Forbidden` - User does not own this session
- `500 Internal Server Error` - Database error

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

**Errors**:

- `401 Unauthorized` - Missing or invalid authentication token
- `403 Forbidden` - User does not own this session
- `404 Not Found` - Session does not exist
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

### POST /api/session/transcript

Saves conversation transcript turns to the database. Supports both single turn and batch insertion for efficient storage during and after interview sessions. User must own the session to save transcripts.

**Authentication**: Required (Supabase Auth JWT)

**Request Body (Single Turn)**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "speaker": "user",
  "startedAt": "2025-11-05T10:30:15Z",
  "endedAt": "2025-11-05T10:31:20Z",
  "text": "I worked on a mobile checkout feature that increased conversion by 15%...",
  "audioMs": 65000,
  "latencyMs": null,
  "section": "response"
}
```

**Request Body (Batch Mode)**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "turns": [
    {
      "speaker": "interviewer",
      "text": "Tell me about a product you launched.",
      "startedAt": "2025-11-05T10:30:00Z",
      "endedAt": "2025-11-05T10:30:08Z",
      "audioMs": 8000,
      "latencyMs": 850
    },
    {
      "speaker": "user",
      "text": "I launched a mobile checkout feature...",
      "startedAt": "2025-11-05T10:30:10Z",
      "endedAt": "2025-11-05T10:31:15Z",
      "audioMs": 65000
    }
  ]
}
```

**Request Parameters**:

| Field       | Type   | Required     | Description                                                         |
| ----------- | ------ | ------------ | ------------------------------------------------------------------- |
| `sessionId` | string | ✅ Yes       | UUID of the session                                                 |
| `speaker`   | string | Yes (single) | Speaker identifier: `user` or `interviewer`                         |
| `turns`     | array  | Yes (batch)  | Array of turn objects                                               |
| `startedAt` | string | No           | ISO 8601 timestamp when turn started                                |
| `endedAt`   | string | No           | ISO 8601 timestamp when turn ended                                  |
| `text`      | string | No           | Transcribed or generated text                                       |
| `audioMs`   | number | No           | Duration of audio in milliseconds                                   |
| `latencyMs` | number | No           | Turn-around latency in milliseconds                                 |
| `section`   | string | No           | Section/phase of interview (e.g., `opening`, `response`, `closing`) |

**Response** (200 OK - Single Turn):

```json
{
  "success": true,
  "turn": {
    "id": "turn-abc123",
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "speaker": "user",
    "text": "I worked on a mobile checkout feature...",
    "startedAt": "2025-11-05T10:30:15Z",
    "endedAt": "2025-11-05T10:31:20Z",
    "audioMs": 65000,
    "latencyMs": null,
    "section": "response"
  }
}
```

**Response** (200 OK - Batch Mode):

```json
{
  "success": true,
  "turns": [
    { "id": "turn-1", ... },
    { "id": "turn-2", ... }
  ]
}
```

**Errors**:

- `401 Unauthorized` - Missing or invalid authentication token
- `400 Bad Request` - Missing `sessionId` or invalid `speaker` value
- `403 Forbidden` - User does not own this session
- `500 Internal Server Error` - Database error

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

### POST /api/feedback/generate

Analyzes an interview session transcript and generates comprehensive feedback. Includes dimension scores, strengths, improvements, and suggested focused practice. This endpoint is idempotent - if feedback already exists for the session, it returns success without regenerating.

**Authentication**: Required (Supabase Auth JWT)

**Request Body**:

```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Request Parameters**:

| Field       | Type   | Required | Description                     |
| ----------- | ------ | -------- | ------------------------------- |
| `sessionId` | string | ✅ Yes   | UUID of the session to evaluate |

**Response** (200 OK - New Feedback):

```json
{
  "success": true,
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
      "Clear articulation of product metrics and success criteria",
      "Well-structured answer with clear problem definition"
    ],
    "improvements": [
      "Could dig deeper into trade-offs when discussing prioritization",
      "Add more quantitative data to support claims",
      "Explore alternative solutions before settling on final approach"
    ],
    "drills": [
      "Practice 5-10 product sense questions with timer",
      "Record yourself and review for filler words",
      "Mock interview with peer focusing on metrics discussion"
    ],
    "summary": "Solid product sense interview with clear structure and good use of frameworks. Strong analytical thinking evident in discussion of metrics. Could improve by exploring trade-offs more deeply and using more quantitative data.",
    "createdAt": "2025-11-05T11:20:00Z"
  }
}
```

**Response** (200 OK - Already Exists):

```json
{
  "success": true,
  "message": "Feedback already exists for this session",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Scoring Dimensions** (all on 0-10 scale):

| Dimension            | Description                                                            |
| -------------------- | ---------------------------------------------------------------------- |
| `structureScore`     | Use of frameworks (STAR, product sense, etc.) and logical organization |
| `clarityScore`       | Clarity of communication and articulation                              |
| `insightScore`       | Depth of analysis and unique insights                                  |
| `communicationScore` | Overall communication effectiveness                                    |
| `leadershipScore`    | Leadership principles and influence (for behavioral/leadership rounds) |
| `overallScore`       | Weighted average of all dimensions                                     |

**Errors**:

- `401 Unauthorized` - Missing or invalid authentication token
- `400 Bad Request` - Missing `sessionId` or empty transcript
- `403 Forbidden` - User does not own this session
- `404 Not Found` - Session does not exist
- `500 Internal Server Error` - GPT-4 API error or database error

---

### GET /api/feedback/:sessionId

Retrieves the AI-generated feedback for a completed interview session. User must own the session to access feedback. Feedback must have been previously generated via `POST /api/feedback/generate`.

**Authentication**: Required (Supabase Auth JWT)

**URL Parameters**:

| Parameter   | Type   | Description         |
| ----------- | ------ | ------------------- |
| `sessionId` | string | UUID of the session |

**Response** (200 OK):

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

**Errors**:

- `401 Unauthorized` - Missing or invalid authentication token
- `403 Forbidden` - User does not own this session
- `404 Not Found` - Feedback not found for this session (hasn't been generated yet)
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

Generates LiveKit access tokens specifically for 60-second demo conversations on the landing page. Creates ephemeral rooms that auto-delete after 2 minutes and dispatches a Cloud-hosted demo agent to conduct a brief product demo.

**Authentication**: Public (no authentication required - for landing page demo)

**Request Body**:

```json
{
  "participantName": "Guest"
}
```

**Request Parameters**:

| Field             | Type   | Required | Default | Description                                      |
| ----------------- | ------ | -------- | ------- | ------------------------------------------------ |
| `participantName` | string | ✅ Yes   | -       | Display name for the participant (e.g., "Guest") |

**Response** (200 OK):

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "url": "wss://meelni-ek4vaisp.livekit.cloud",
  "roomName": "demo-1699999999999-abc123"
}
```

**Implementation Details**:

- Room naming format: `demo-{timestamp}-{random}` for tracking and analytics
- Room lifetime: Auto-deletes 2 minutes after last participant leaves
- Max participants: 2 (user + demo agent only)
- Agent: Cloud-hosted demo agent (CA_Wp8bi3bRroE2) explicitly dispatched via AgentDispatchClient
- Agent behavior: 60-second product demo with one quick question and feedback
- Token TTL: 2 minutes (matches demo duration)

**Errors**:

- `400 Bad Request` - Missing `participantName`
- `500 Internal Server Error` - LiveKit credentials not configured, room creation failed, or agent dispatch failed

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

### Saving Transcript Turns (Batch Mode)

```typescript
async function saveTranscript(sessionId: string, turns: any[]) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const response = await fetch("/api/session/transcript", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId,
      turns: turns.map((turn) => ({
        speaker: turn.speaker,
        text: turn.text,
        startedAt: turn.startedAt,
        endedAt: turn.endedAt,
        audioMs: turn.audioMs,
        latencyMs: turn.latencyMs,
        section: turn.section,
      })),
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  const data = await response.json();
  console.log(`Saved ${data.turns.length} transcript turns`);

  return data;
}
```

### Generating Feedback

```typescript
async function generateFeedback(sessionId: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const response = await fetch("/api/feedback/generate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  const data = await response.json();

  if (data.message) {
    console.log(data.message); // "Feedback already exists"
  } else {
    console.log("Overall score:", data.feedback.overallScore);
    console.log("Strengths:", data.feedback.strengths);
    console.log("Improvements:", data.feedback.improvements);
  }

  return data.feedback;
}
```

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
  await fetch("/api/session/end", {
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
  console.log("Suggested exercises:", feedback.drills);
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
- Session management endpoints (`POST /api/session/start`, `POST /api/session/end`, `GET /api/session/:sessionId`, `GET /api/sessions`)
- Transcript storage endpoints (`POST /api/session/transcript`, `GET /api/session/:sessionId/transcript`)
- Feedback generation endpoints (`POST /api/feedback/generate`, `GET /api/feedback/:sessionId`)
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

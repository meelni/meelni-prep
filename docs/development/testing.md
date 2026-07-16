# API Testing Guide

**Meelni API Testing Examples and Best Practices**

---

## Table of Contents

1. [Overview](#overview)
2. [cURL Examples](#curl-examples)
3. [JavaScript/TypeScript Examples](#javascripttypescript-examples)
4. [Python Examples](#python-examples)
5. [Postman Collection](#postman-collection)
6. [Automated Testing](#automated-testing)
7. [Testing Best Practices](#testing-best-practices)

---

## Overview

This guide provides practical examples for testing the Meelni API using various tools and programming languages.

### Prerequisites

- Meelni account (for authenticated endpoints)
- Valid authentication token (see [Authentication Guide](./AUTHENTICATION.md))
- API base URL:
  - **Production**: `https://mockmate.vercel.app`
  - **Development**: `http://localhost:3000`

---

## cURL Examples

### Authentication

```bash
# Get your token from Supabase Auth (browser console)
# const { data: { session } } = await supabase.auth.getSession();
# console.log(session.access_token);

export TOKEN="your_jwt_token_here"
export BASE_URL="http://localhost:3000"
```

### Session Management

#### Start Interview Session

```bash
curl -X POST ${BASE_URL}/api/session/start \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "roundType": "product_sense",
    "role": "pm",
    "config": {
      "difficulty": "intermediate",
      "duration": 45,
      "hintMode": "off",
      "questionPreference": {"recency": "very_recent", "recentDays": 365}
    }
  }'
```

#### End Interview Session

```bash
curl -X POST ${BASE_URL}/api/interview/end \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

#### Get Session Details

```bash
curl -X GET ${BASE_URL}/api/session/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer ${TOKEN}"
```

#### List User Sessions

```bash
# All sessions
curl -X GET "${BASE_URL}/api/sessions?limit=10" \
  -H "Authorization: Bearer ${TOKEN}"

# Filter by round type
curl -X GET "${BASE_URL}/api/sessions?roundType=product_sense&limit=20" \
  -H "Authorization: Bearer ${TOKEN}"
```

### Transcript Management

Transcript writes are runtime-only and HMAC-signed. Do not simulate them with
an end-user JWT or place raw transcript text in browser storage. Exercise the
Python outbox and internal route through the contract and migration suites in
[Runtime Transcript Ingest](../operations/runtime-transcript-ingest.md).

#### Get Session Transcript

```bash
curl -X GET ${BASE_URL}/api/session/550e8400-e29b-41d4-a716-446655440000/transcript \
  -H "Authorization: Bearer ${TOKEN}"
```

### Feedback & Evaluation

Feedback is scheduled by terminal interview completion after durable
eligibility is committed. Tests must not invoke a client generation route.

#### Get Session Feedback

```bash
curl -X GET ${BASE_URL}/api/feedback/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer ${TOKEN}"
```

### LiveKit & Voice

#### Generate LiveKit Token

```bash
curl -X POST ${BASE_URL}/api/livekit/token \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

#### Generate Demo Token

```bash
curl -X POST ${BASE_URL}/api/livekit/demo-token \
  -H "Content-Type: application/json" \
  -d '{
    "participantName": "Guest"
  }'
```

#### List Cartesia Voices

```bash
curl -X GET ${BASE_URL}/api/cartesia/voices
```

---

## JavaScript/TypeScript Examples

### Setup

```typescript
const BASE_URL = "http://localhost:3000";

// Get token from Supabase
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function getToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token;
}
```

### Full Interview Flow Test

```typescript
async function testFullInterviewFlow() {
  const token = await getToken();

  if (!token) {
    console.error("Not authenticated");
    return;
  }

  try {
    // 1. Start session
    console.log("Starting session...");
    const startResponse = await fetch(`${BASE_URL}/api/session/start`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roundType: "product_sense",
        config: {
          difficulty: "intermediate",
          duration: 45,
          hintMode: "off",
          questionPreference: { recency: "very_recent", recentDays: 365 },
        },
      }),
    });

    const sessionData = await startResponse.json();
    console.log("Session started:", sessionData.sessionId);

    const { sessionId } = sessionData;

    // 2. Run the LiveKit runtime contract fixture. The runtime owns signed
    // persistence; browser-authored transcript writes are intentionally unavailable.

    // 3. End session
    console.log("Ending session...");
    await fetch(`${BASE_URL}/api/interview/end`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    });
    console.log("Session ended");

    // 4. Poll the feedback state scheduled by terminal completion
    console.log("Retrieving feedback...");
    const getFeedbackResponse = await fetch(
      `${BASE_URL}/api/feedback/${sessionId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const feedback = await getFeedbackResponse.json();
    console.log("Strengths:", feedback.feedback.strengths);
    console.log("Improvements:", feedback.feedback.improvements);

    console.log("✅ Full interview flow test complete");
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

testFullInterviewFlow();
```

### Error Handling Example

```typescript
async function makeAPIRequest(endpoint: string, options: RequestInit) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);

    if (!response.ok) {
      const error = await response.json();

      switch (response.status) {
        case 401:
          console.error("Unauthorized - refresh token or sign in again");
          // Redirect to sign-in
          break;
        case 403:
          console.error("Forbidden - user does not own this resource");
          break;
        case 404:
          console.error("Not found:", error.error);
          break;
        case 500:
          console.error("Server error:", error.details);
          // Retry with exponential backoff
          break;
        default:
          console.error("API error:", error.error);
      }

      throw new Error(error.error);
    }

    return response.json();
  } catch (error) {
    console.error("Request failed:", error);
    throw error;
  }
}
```

---

## Python Examples

### Setup

```python
import requests
import os
from typing import Dict, Any

BASE_URL = os.getenv('API_BASE_URL', 'http://localhost:3000')
TOKEN = os.getenv('API_TOKEN')  # Get from Supabase Auth

def get_headers() -> Dict[str, str]:
    """Return headers with authentication token"""
    return {
        'Authorization': f'Bearer {TOKEN}',
        'Content-Type': 'application/json'
    }
```

### Start Interview Session

```python
def start_interview_session(round_type: str) -> Dict[str, Any]:
    """Start a new interview session"""
    url = f'{BASE_URL}/api/session/start'
    payload = {
        'roundType': round_type,
        'config': {
            'difficulty': 'intermediate',
            'duration': 45,
            'hintMode': 'off',
            'questionPreference': {'recency': 'very_recent', 'recentDays': 365}
        }
    }

    response = requests.post(url, json=payload, headers=get_headers())
    response.raise_for_status()

    return response.json()
```

### Runtime Transcript Persistence

Use `agent/test_runtime_contracts.py` and the signed internal-route tests.
Application clients cannot submit transcript turns.

### Retrieve Terminally Scheduled Feedback

```python
def get_feedback(session_id: str) -> Dict[str, Any]:
    """Retrieve feedback for a session"""
    url = f'{BASE_URL}/api/feedback/{session_id}'

    response = requests.get(url, headers=get_headers())
    response.raise_for_status()

    return response.json()
```

### Full Test Script

```python
#!/usr/bin/env python3
"""
Meelni API Test Script
Runs a full interview flow test
"""

import time
from datetime import datetime, timedelta

def test_full_interview_flow():
    """Test complete interview flow"""
    print('🧪 Starting full interview flow test...\n')

    # 1. Start session
    print('1️⃣ Starting session...')
    session = start_interview_session('product_sense')
    session_id = session['sessionId']
    print(f'   ✅ Session started: {session_id}\n')

    # 2. Save transcript turns
    print('2️⃣ Saving transcript turns...')
    now = datetime.utcnow()
    turns = [
        {
            'speaker': 'interviewer',
            'text': 'Tell me about a product you launched.',
            'startedAt': now.isoformat() + 'Z',
            'endedAt': (now + timedelta(seconds=8)).isoformat() + 'Z',
            'audioMs': 8000
        },
        {
            'speaker': 'user',
            'text': 'I launched a mobile checkout feature...',
            'startedAt': (now + timedelta(seconds=10)).isoformat() + 'Z',
            'endedAt': (now + timedelta(seconds=75)).isoformat() + 'Z',
            'audioMs': 65000
        }
    ]
    save_transcript_batch(session_id, turns)
    print(f'   ✅ Saved {len(turns)} transcript turns\n')

    # 3. End session
    print('3️⃣ Ending session...')
    url = f'{BASE_URL}/api/interview/end'
    payload = {'sessionId': session_id}
    response = requests.post(url, json=payload, headers=get_headers())
    response.raise_for_status()
    print('   ✅ Session ended\n')

    # 4. Generate feedback
    print('4️⃣ Generating feedback...')
    feedback_result = generate_feedback(session_id)
    print(f'   ✅ Overall score: {feedback_result["feedback"]["overallScore"]}\n')

    # 5. Retrieve feedback
    print('5️⃣ Retrieving feedback...')
    feedback = get_feedback(session_id)
    print(f'   ✅ Strengths: {len(feedback["feedback"]["strengths"])}')
    print(f'   ✅ Improvements: {len(feedback["feedback"]["improvements"])}\n')

    print('✅ Full interview flow test complete!')

if __name__ == '__main__':
    test_full_interview_flow()
```

---

## Postman Collection

### Import Instructions

1. Open Postman
2. Click "Import" button
3. Select "Raw text" tab
4. Paste the JSON below
5. Click "Import"

### Collection JSON

```json
{
  "info": {
    "name": "Meelni API",
    "description": "Real-time AI mock interview platform API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "auth": {
    "type": "bearer",
    "bearer": [
      {
        "key": "token",
        "value": "{{AUTH_TOKEN}}",
        "type": "string"
      }
    ]
  },
  "variable": [
    {
      "key": "BASE_URL",
      "value": "http://localhost:3000",
      "type": "string"
    },
    {
      "key": "AUTH_TOKEN",
      "value": "",
      "type": "string"
    },
    {
      "key": "SESSION_ID",
      "value": "",
      "type": "string"
    }
  ],
  "item": [
    {
      "name": "Sessions",
      "item": [
        {
          "name": "Start Interview Session",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "if (pm.response.code === 200) {",
                  "  const response = pm.response.json();",
                  "  pm.collectionVariables.set('SESSION_ID', response.sessionId);",
                  "  console.log('Session ID saved:', response.sessionId);",
                  "}"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"roundType\": \"product_sense\",\n  \"config\": {\n    \"difficulty\": \"intermediate\",\n    \"duration\": 45,\n    \"hintMode\": \"off\",\n    \"questionPreference\": {\"recency\": \"very_recent\", \"recentDays\": 365}\n  }\n}"
            },
            "url": {
              "raw": "{{BASE_URL}}/api/session/start",
              "host": ["{{BASE_URL}}"],
              "path": ["api", "session", "start"]
            }
          }
        },
        {
          "name": "End Interview Session",
          "request": {
            "method": "POST",
            "header": [
              {
                "key": "Content-Type",
                "value": "application/json"
              }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"sessionId\": \"{{SESSION_ID}}\"\n}"
            },
            "url": {
              "raw": "{{BASE_URL}}/api/interview/end",
              "host": ["{{BASE_URL}}"],
              "path": ["api", "interview", "end"]
            }
          }
        },
        {
          "name": "Get Session Details",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{BASE_URL}}/api/session/{{SESSION_ID}}",
              "host": ["{{BASE_URL}}"],
              "path": ["api", "session", "{{SESSION_ID}}"]
            }
          }
        },
        {
          "name": "List User Sessions",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{BASE_URL}}/api/sessions?limit=10",
              "host": ["{{BASE_URL}}"],
              "path": ["api", "sessions"],
              "query": [
                {
                  "key": "limit",
                  "value": "10"
                }
              ]
            }
          }
        }
      ]
    },
    {
      "name": "Feedback",
      "item": [
        {
          "name": "Get Feedback",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{BASE_URL}}/api/feedback/{{SESSION_ID}}",
              "host": ["{{BASE_URL}}"],
              "path": ["api", "feedback", "{{SESSION_ID}}"]
            }
          }
        }
      ]
    }
  ]
}
```

### Environment Setup

1. Create new environment in Postman
2. Add variables:
   - `BASE_URL`: `http://localhost:3000`
   - `AUTH_TOKEN`: Your Supabase JWT token

---

## Automated Testing

### Test Framework Setup (Vitest)

```bash
npm install -D vitest @vitest/ui
```

### Example Test Suite

```typescript
// tests/api/sessions.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = "http://localhost:3000";

let authToken: string;

beforeAll(async () => {
  // Setup: Get auth token
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();
  authToken = session!.access_token;
});

describe("Session API", () => {
  let sessionId: string;

  it("should start a new session", async () => {
    const response = await fetch(`${BASE_URL}/api/session/start`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roundType: "product_sense",
      }),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.sessionId).toBeDefined();
    expect(data.token).toBeDefined();
    expect(data.url).toBeDefined();

    sessionId = data.sessionId;
  });

  it("should end a session", async () => {
    const response = await fetch(`${BASE_URL}/api/interview/end`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.session.endedAt).toBeDefined();
  });

  it("should retrieve session details", async () => {
    const response = await fetch(`${BASE_URL}/api/session/${sessionId}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.session.id).toBe(sessionId);
    expect(data.session.roundType).toBe("product_sense");
  });
});
```

---

## Testing Best Practices

### 1. Use Environment Variables

```bash
# .env.test
API_BASE_URL=http://localhost:3000
API_TOKEN=your_test_token
TEST_SESSION_ID=test-session-id
```

### 2. Test Error Handling

```typescript
it("should return 401 for unauthenticated request", async () => {
  const response = await fetch(`${BASE_URL}/api/sessions`);
  expect(response.status).toBe(401);
  const data = await response.json();
  expect(data.error).toBe("Unauthorized");
});
```

### 3. Clean Up Test Data

```typescript
afterAll(async () => {
  // Delete test sessions
  await deleteSession(testSessionId);
});
```

### 4. Use Mock Data

```typescript
const mockTranscriptTurns = [
  {
    speaker: "interviewer",
    text: "Tell me about yourself.",
    startedAt: new Date().toISOString(),
    endedAt: new Date(Date.now() + 5000).toISOString(),
    audioMs: 5000,
  },
  // ... more turns
];
```

### 5. Test Rate Limiting

```typescript
it("should respect rate limits", async () => {
  const requests = Array.from({ length: 110 }, (_, i) =>
    fetch(`${BASE_URL}/api/sessions`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
  );

  const responses = await Promise.all(requests);
  const rateLimited = responses.filter((r) => r.status === 429);

  expect(rateLimited.length).toBeGreaterThan(0);
});
```

---

**Last Updated**: 2025-11-05
**Version**: 1.0.0

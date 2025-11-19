# VERIFICATION PLAN: System-Wide Testing & Quality Assurance

**Project**: Meelni - Real-Time AI Mock Interviews
**Date**: 2025-11-06
**Purpose**: Comprehensive testing strategy to verify all agent work integrates correctly
**Status**: Ready for execution

---

## Executive Summary

**Problem**: 6 AI agents built features in parallel. We need to verify:
1. Each component works in isolation
2. Components integrate correctly
3. End-to-end user flows work seamlessly
4. No regressions or broken functionality
5. Performance meets requirements

**Solution**: Multi-layered testing approach with automated tests + manual QA + agent-based verification

**Timeline**: 2-3 days for comprehensive verification

---

## Testing Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Unit Tests (Component Isolation)                  │
│  - API routes                                               │
│  - Database operations                                      │
│  - Utility functions                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Integration Tests (API Contracts)                 │
│  - Session lifecycle                                        │
│  - Transcript saving                                        │
│  - Feedback generation                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: End-to-End Tests (User Flows)                    │
│  - Setup → Interview → Feedback flow                        │
│  - Dashboard → Session details → New interview              │
│  - Authentication flows                                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: Agent-Based Verification (AI QA)                  │
│  - Exploratory testing                                      │
│  - Edge case discovery                                      │
│  - UX evaluation                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## PHASE 1: Component Verification (Agent Isolation Testing)

### Agent 1: Setup & Configuration Flow

**Files to Test**:
- `app/setup/page.tsx`
- `app/setup/components/*.tsx`
- `lib/interview-config.ts`

**Test Scenarios**:

#### 1.1 Round Type Selection
- [ ] All 4 round types render (Behavioral, Product Sense, Execution, Strategy)
- [ ] Icons display correctly
- [ ] Click selects round type (visual feedback)
- [ ] Can change selection
- [ ] Selected state persists when navigating steps

#### 1.2 Difficulty Selection
- [ ] 3 difficulty levels render (Beginner, Intermediate, Advanced)
- [ ] Selection updates UI state
- [ ] Default is Intermediate

#### 1.3 Voice Selection
- [ ] Voice selector fetches voices from Cartesia
- [ ] Preview button plays audio sample
- [ ] Default voice is Tessa (6ccbfb76-1fc6-48f7-b71d-91ac6298247b)
- [ ] Selection updates config state

#### 1.4 Advanced Settings
- [ ] Collapsible panel toggles open/closed
- [ ] Speed slider (0.6 - 1.5) updates state
- [ ] Volume slider (0.5 - 2.0) updates state
- [ ] Emotion dropdown shows options
- [ ] Feedback mode radio buttons work

#### 1.5 Session Start
- [ ] "Start Interview" button is enabled when round type selected
- [ ] POST /api/session/start called with correct payload
- [ ] Receives sessionId, token, url, roomName
- [ ] Navigates to /interview with query params
- [ ] Loading state shows during API call
- [ ] Error handling for failed API calls

**Manual Test Checklist**:
```
1. Navigate to /setup
2. Select "Product Sense"
3. Select "Intermediate" difficulty
4. Click "Advanced Settings"
5. Adjust speed to 0.8x
6. Click "Start Interview"
7. Verify redirect to /interview with sessionId in URL
```

---

### Agent 2: Interview Room UI

**Files to Test**:
- `app/interview/page.tsx`
- `app/interview/components/*.tsx`
- `components/interview/livekit-room.tsx`

**Test Scenarios**:

#### 2.1 LiveKit Connection
- [ ] Page requires sessionId query param (redirects to /setup if missing)
- [ ] Fetches session details from /api/session/:sessionId
- [ ] LiveKitRoom component receives correct token and URL
- [ ] Successfully connects to LiveKit room
- [ ] Agent joins room (visible in participant list)
- [ ] Audio tracks are active

#### 2.2 Agent Status Indicator
- [ ] Shows "idle" initially
- [ ] Updates to "listening" when user speaks
- [ ] Updates to "thinking" when agent processes
- [ ] Updates to "speaking" when agent talks
- [ ] Smooth color transitions
- [ ] Icons change appropriately

#### 2.3 Transcript Panel
- [ ] Displays user messages (right-aligned)
- [ ] Displays agent messages (left-aligned)
- [ ] Auto-scrolls to bottom on new message
- [ ] Timestamps show for each turn
- [ ] Fade-in animation for new messages
- [ ] Scrollable when transcript grows long

#### 2.4 Audio Visualizer
- [ ] Canvas renders
- [ ] Shows waveform for user audio (bottom)
- [ ] Shows waveform for agent audio (top)
- [ ] 60fps animation loop
- [ ] Responsive to audio levels

#### 2.5 Interview Controls
- [ ] Mute button toggles microphone
- [ ] Mute icon changes when toggled
- [ ] End Session button shows confirmation modal
- [ ] Cancel in modal dismisses it
- [ ] Confirm in modal calls /api/session/end
- [ ] Navigates to /feedback/:sessionId after ending

#### 2.6 Timer Display
- [ ] Shows elapsed time (MM:SS format)
- [ ] Updates every second
- [ ] Progress bar shows % complete
- [ ] Estimated duration matches config

**Manual Test Checklist**:
```
1. Complete setup flow to reach /interview
2. Wait for agent to join room
3. Speak: "Hey, what's up?"
4. Observe agent status changes
5. Check transcript updates
6. Toggle mute button
7. Click "End Session"
8. Confirm modal
9. Verify navigation to feedback page
```

---

### Agent 3: Session Persistence & Database

**Files to Test**:
- `app/api/session/start/route.ts`
- `app/api/session/end/route.ts`
- `app/api/session/[sessionId]/route.ts`
- `app/api/session/transcript/route.ts`
- `app/api/sessions/route.ts`
- `lib/db/sessions.ts`
- `lib/db/transcripts.ts`

**Test Scenarios**:

#### 3.1 Database Migration
- [ ] livekit_room_name column exists in interview_session
- [ ] config column exists (JSONB type)
- [ ] Indexes created successfully
- [ ] No migration errors in logs

#### 3.2 POST /api/session/start
**Request**:
```json
{
  "roundType": "product_sense",
  "mode": "voice_video",
  "persona": "Senior PM Interviewer",
  "config": {
    "difficulty": "intermediate",
    "duration": 30,
    "voice": "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
    "speed": 1.0,
    "emotion": "professional",
    "volume": 1.0,
    "feedback_mode": "end_only",
    "stt_model": "deepgram/nova-3",
    "llm_model": "openai/gpt-4.1-mini",
    "tts_model": "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b"
  }
}
```
**Expected Response**:
```json
{
  "sessionId": "uuid",
  "token": "jwt-token",
  "url": "wss://meelni-ek4vaisp.livekit.cloud",
  "roomName": "interview-1234567890-abc123"
}
```
**Checks**:
- [ ] 200 status code
- [ ] Session created in database
- [ ] livekit_room_name matches response
- [ ] config JSON stored correctly
- [ ] started_at timestamp set
- [ ] ended_at is null
- [ ] user_id matches authenticated user

#### 3.3 GET /api/session/:sessionId
- [ ] Returns session details for valid sessionId
- [ ] 404 for invalid sessionId
- [ ] 403 if user doesn't own session
- [ ] 401 if not authenticated
- [ ] Response includes config, room name, timestamps

#### 3.4 POST /api/session/end
**Request**:
```json
{
  "sessionId": "uuid"
}
```
**Expected Response**:
```json
{
  "success": true,
  "sessionId": "uuid"
}
```
**Checks**:
- [ ] 200 status code
- [ ] ended_at timestamp updated in database
- [ ] Session still exists (not deleted)
- [ ] Can be called multiple times (idempotent)

#### 3.5 POST /api/session/transcript
**Request**:
```json
{
  "sessionId": "uuid",
  "speaker": "user",
  "text": "How would you design Instagram Stories?",
  "startedAt": "2025-11-06T12:00:00Z",
  "endedAt": "2025-11-06T12:00:05Z",
  "audioMs": 5000,
  "latencyMs": 250,
  "section": "opening"
}
```
**Checks**:
- [ ] 201 status code
- [ ] Transcript turn saved to database
- [ ] All fields match request
- [ ] Multiple turns can be saved sequentially
- [ ] Timestamps are preserved

#### 3.6 GET /api/sessions
**Query**: `?limit=20`
**Checks**:
- [ ] Returns array of user's sessions
- [ ] Ordered by started_at DESC (newest first)
- [ ] Limit parameter respected
- [ ] Includes feedback relation (if available)
- [ ] Only returns authenticated user's sessions

**Integration Test Script**:
```typescript
// test/integration/session-lifecycle.test.ts
describe("Session Lifecycle", () => {
  it("should complete full session flow", async () => {
    // 1. Start session
    const startResponse = await POST("/api/session/start", { ... });
    expect(startResponse.status).toBe(200);
    const { sessionId } = startResponse.body;

    // 2. Fetch session
    const getResponse = await GET(`/api/session/${sessionId}`);
    expect(getResponse.status).toBe(200);

    // 3. Save transcript turns
    const turn1 = await POST("/api/session/transcript", { sessionId, ... });
    const turn2 = await POST("/api/session/transcript", { sessionId, ... });
    expect(turn1.status).toBe(201);
    expect(turn2.status).toBe(201);

    // 4. End session
    const endResponse = await POST("/api/session/end", { sessionId });
    expect(endResponse.status).toBe(200);

    // 5. Verify ended_at set
    const finalSession = await GET(`/api/session/${sessionId}`);
    expect(finalSession.body.ended_at).not.toBeNull();
  });
});
```

---

### Agent 4: AI Agent Enhancements (Python)

**Files to Test**:
- `agent/agent.py`
- `agent/prompts/*.py`
- `agent/config.py`
- `agent/utils/prompt_builder.py`

**Test Scenarios**:

#### 4.1 Prompt Templates
- [ ] Behavioral prompt exists and is well-structured
- [ ] Product Sense prompt exists with 5-step framework
- [ ] Execution prompt exists with metrics focus
- [ ] Strategy prompt exists with business focus
- [ ] Each prompt has difficulty variants (beginner, intermediate, advanced)

#### 4.2 Room Metadata Parsing
**Input Metadata**:
```json
{
  "sessionId": "uuid",
  "roundType": "product_sense",
  "mode": "voice_video",
  "config": {
    "difficulty": "intermediate",
    "voice": "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
    "speed": 1.0,
    "emotion": "professional",
    "feedback_mode": "end_only",
    "duration": 30
  }
}
```
**Checks**:
- [ ] parse_room_metadata returns correct round_type
- [ ] config dictionary extracted correctly
- [ ] Fallback to defaults if metadata invalid
- [ ] No crashes on malformed JSON

#### 4.3 Dynamic Prompt Building
```python
prompt = build_agent_prompt("product_sense", {
  "difficulty": "advanced",
  "feedback_mode": "silent",
})
```
**Checks**:
- [ ] Returns Product Sense prompt
- [ ] Advanced difficulty modifier applied
- [ ] Silent feedback mode instruction added
- [ ] ValueError raised for unknown round_type

#### 4.4 Agent Session Start
- [ ] Agent connects to LiveKit room
- [ ] Correct STT model used (deepgram/nova-3)
- [ ] Correct LLM model used (openai/gpt-4.1-mini)
- [ ] Correct TTS model used (cartesia/sonic-3:voice-id)
- [ ] Voice settings applied (speed, emotion, volume)
- [ ] VAD model loaded in prewarm
- [ ] Session starts successfully
- [ ] Logs show round type and config

**Manual Test Checklist**:
```bash
# Test local agent startup
cd agent
source venv/bin/activate
python agent.py dev

# Verify:
# - No import errors
# - VAD model loads
# - Agent connects to LiveKit
# - Can join test room
# - Responds to voice input
```

**Cloud Agent Test**:
```bash
# Verify Cloud deployment
lk agent logs --log-type=runtime

# Check for:
# - Successful deployment
# - Agent receives dispatch
# - Room metadata parsed correctly
# - Session starts with correct config
# - No runtime errors
```

---

### Agent 5: Feedback & Evaluation Engine

**Files to Test**:
- `app/api/feedback/[sessionId]/route.ts`
- `app/api/feedback/generate/route.ts`
- `lib/evaluation/evaluator.ts`
- `lib/evaluation/scoring.ts`
- `lib/db/feedback.ts`

**Test Scenarios**:

#### 5.1 Evaluation Prompts
- [ ] Product Sense evaluation prompt exists
- [ ] Behavioral evaluation prompt exists
- [ ] Execution evaluation prompt exists
- [ ] Strategy evaluation prompt exists
- [ ] Each prompt defines rubric (1-5 scale)
- [ ] Each prompt requests JSON response format

#### 5.2 Score Calculation
```typescript
const scores = {
  structure: 4,
  clarity: 3,
  insight: 5,
  communication: 4,
  leadership: 3,
};
const overall = calculateOverallScore(scores);
expect(overall).toBe(3.8);
```
**Checks**:
- [ ] Calculates correct average
- [ ] Rounds to 1 decimal place
- [ ] validateScores returns true for valid scores (1-5)
- [ ] validateScores returns false for out-of-range scores

#### 5.3 POST /api/feedback/generate
**Request**:
```json
{
  "sessionId": "uuid"
}
```
**Expected Response**:
```json
{
  "id": "uuid",
  "session_id": "uuid",
  "structure_score": 4,
  "clarity_score": 3,
  "insight_score": 5,
  "communication_score": 4,
  "leadership_score": 3,
  "overall_score": 3.8,
  "strengths": ["...", "...", "..."],
  "improvements": ["...", "...", "..."],
  "drills": [
    { "title": "...", "description": "..." },
    { "title": "...", "description": "..." },
    { "title": "...", "description": "..." }
  ],
  "summary": "...",
  "created_at": "2025-11-06T12:00:00Z"
}
```
**Checks**:
- [ ] 200 status code
- [ ] Feedback created in database
- [ ] All scores in 1-5 range
- [ ] Strengths array has 3 items
- [ ] Improvements array has 3 items
- [ ] Drills array has 3 items with title + description
- [ ] Summary is 2-3 sentences
- [ ] Idempotent (second call returns existing feedback)

#### 5.4 GET /api/feedback/:sessionId
**Checks**:
- [ ] Returns feedback + transcript
- [ ] 404 if no feedback exists
- [ ] 401 if not authenticated
- [ ] 403 if user doesn't own session

**Integration Test Script**:
```typescript
// test/integration/feedback-generation.test.ts
describe("Feedback Generation", () => {
  it("should generate feedback from transcript", async () => {
    // Setup: Create session with transcript
    const session = await createTestSession();
    await saveTestTranscript(session.id);

    // Generate feedback
    const response = await POST("/api/feedback/generate", {
      sessionId: session.id,
    });

    expect(response.status).toBe(200);
    expect(response.body.overall_score).toBeGreaterThan(0);
    expect(response.body.strengths).toHaveLength(3);
    expect(response.body.improvements).toHaveLength(3);
    expect(response.body.drills).toHaveLength(3);

    // Verify idempotency
    const response2 = await POST("/api/feedback/generate", {
      sessionId: session.id,
    });
    expect(response2.body.id).toBe(response.body.id);
  });
});
```

---

### Agent 6: Progress Dashboard

**Files to Test**:
- `app/dashboard/page.tsx`
- `app/dashboard/components/*.tsx`
- `app/feedback/[sessionId]/page.tsx`
- `components/dashboard/*.tsx`

**Test Scenarios**:

#### 6.1 Dashboard Layout
- [ ] Header shows user name
- [ ] "Start Mock Interview" button links to /setup
- [ ] Sign Out button works
- [ ] Stats cards display correctly
- [ ] Charts section exists
- [ ] Session history section exists

#### 6.2 Stats Cards
**Assumptions**: User has 5 sessions, 3 with feedback
- [ ] Total Sessions: 5
- [ ] Average Score: Correct average of 3 feedback scores
- [ ] Practice Time: Sum of session durations
- [ ] Completed: Count of sessions with ended_at

#### 6.3 Score Trends Chart
- [ ] Chart.js renders line chart
- [ ] X-axis shows session numbers
- [ ] Y-axis shows scores (1-5 scale)
- [ ] Data points match session scores
- [ ] Line has smooth curve (tension: 0.3)

#### 6.4 Competency Radar Chart
- [ ] Chart.js renders radar chart
- [ ] 5 dimensions: Structure, Clarity, Insight, Communication, Leadership
- [ ] Data matches latest session feedback
- [ ] Scale is 1-5

#### 6.5 Session History List
- [ ] Shows most recent 20 sessions
- [ ] Ordered by started_at DESC
- [ ] Each session card shows:
  - Round type label
  - Time ago (e.g., "2 hours ago")
  - Overall score (if feedback exists)
  - "In Progress" badge (if not ended)
  - "View Details" button

#### 6.6 Session Card Click
- [ ] Clicking card navigates to /feedback/:sessionId
- [ ] Session ID matches

#### 6.7 Empty State
- [ ] Shows when user has 0 sessions
- [ ] Displays mic icon
- [ ] "Start Your First Mock Interview" button links to /setup

#### 6.8 Feedback Detail Page
- [ ] Large overall score displayed
- [ ] Score breakdown table (5 dimensions)
- [ ] Strengths list with checkmarks
- [ ] Improvements list with arrows
- [ ] Recommended drills with titles + descriptions
- [ ] Summary text
- [ ] "Back to Dashboard" button works

**Manual Test Checklist**:
```
1. Navigate to /dashboard
2. Verify stats cards show correct numbers
3. Check charts render
4. Click a session card
5. Verify feedback detail page loads
6. Check all sections display
7. Click "Back to Dashboard"
8. Verify navigation works
```

---

## PHASE 2: Integration Testing (Cross-Agent Verification)

### Integration Test 1: Setup → Session Start → Interview

**Flow**:
1. User navigates to /setup
2. Selects Product Sense, Intermediate
3. Clicks "Start Interview"
4. Setup page calls POST /api/session/start
5. Backend creates session in DB
6. Backend generates LiveKit token
7. Backend returns sessionId, token, url, roomName
8. Setup page navigates to /interview with query params
9. Interview page fetches session details
10. Interview page connects to LiveKit room

**Verification Points**:
- [ ] Session created in database (Agent 3)
- [ ] Config stored correctly (Agent 3)
- [ ] LiveKit token valid (Agent 3)
- [ ] Room created in LiveKit (Agent 3)
- [ ] Interview page loads (Agent 2)
- [ ] LiveKit connection succeeds (Agent 2)

---

### Integration Test 2: Interview → Transcript → Session End

**Flow**:
1. User in interview room
2. User speaks: "Hey, what's up?"
3. Agent responds
4. Interview page saves transcript turn (POST /api/session/transcript)
5. User clicks "End Session"
6. Modal confirms
7. Interview page calls POST /api/session/end
8. Backend updates ended_at
9. Interview page navigates to /feedback/:sessionId

**Verification Points**:
- [ ] Transcript turns saved (Agent 3)
- [ ] Speaker field correct (user vs interviewer)
- [ ] Timestamps preserved (Agent 3)
- [ ] ended_at updated (Agent 3)
- [ ] Navigation to feedback page (Agent 2)

---

### Integration Test 3: Session End → Feedback Generation → Dashboard

**Flow**:
1. User on /feedback/:sessionId
2. Page calls GET /api/feedback/:sessionId
3. If no feedback, calls POST /api/feedback/generate
4. Backend fetches session + transcript (Agent 3)
5. Backend calls GPT-4 for evaluation (Agent 5)
6. Backend saves feedback to DB (Agent 5)
7. Frontend displays feedback (Agent 6)
8. User navigates to /dashboard
9. Dashboard fetches sessions (Agent 3)
10. Dashboard displays stats + charts (Agent 6)

**Verification Points**:
- [ ] Feedback generation triggers (Agent 5)
- [ ] GPT-4 API called (Agent 5)
- [ ] Feedback saved to DB (Agent 5)
- [ ] Feedback displays correctly (Agent 6)
- [ ] Dashboard shows updated stats (Agent 6)
- [ ] Charts include new session (Agent 6)

---

### Integration Test 4: Agent Configuration → Python Agent

**Flow**:
1. User selects Advanced difficulty + Real-time feedback
2. Setup page creates session with config
3. Config includes difficulty: "advanced", feedback_mode: "real_time"
4. Session starts, LiveKit room created with metadata
5. Python agent receives dispatch
6. Agent parses room metadata (Agent 4)
7. Agent builds prompt with advanced difficulty (Agent 4)
8. Agent provides real-time feedback during interview (Agent 4)

**Verification Points**:
- [ ] Room metadata includes config (Agent 3)
- [ ] Agent parses metadata correctly (Agent 4)
- [ ] Correct prompt template loaded (Agent 4)
- [ ] Difficulty modifier applied (Agent 4)
- [ ] Feedback mode instruction applied (Agent 4)
- [ ] Agent behavior matches config (Agent 4)

---

## PHASE 3: End-to-End User Flows

### E2E Flow 1: First-Time User Journey

**Scenario**: New user completes their first interview

**Steps**:
1. User visits /
2. Clicks "Talk to Meelni" (Demo Modal)
3. Has 60-second demo conversation
4. Clicks "Sign In" → Google OAuth
5. Redirected to /dashboard (empty state)
6. Clicks "Start Mock Interview"
7. Selects Product Sense, Intermediate
8. Clicks "Start Interview"
9. Has 10-minute interview conversation
10. Clicks "End Session"
11. Views feedback page
12. Returns to dashboard
13. Sees 1 session in history

**Expected Outcomes**:
- [ ] Demo modal works
- [ ] Google OAuth succeeds
- [ ] User record created in app_user
- [ ] Dashboard shows empty state initially
- [ ] Setup flow completes
- [ ] Interview works (voice + transcript)
- [ ] Session ends successfully
- [ ] Feedback generated and displayed
- [ ] Dashboard shows 1 completed session
- [ ] Stats cards update

---

### E2E Flow 2: Returning User Journey

**Scenario**: User with 3 previous sessions starts a new one

**Steps**:
1. User signs in
2. Lands on /dashboard
3. Sees 3 sessions in history
4. Sees stats: 3 sessions, avg 3.5 score, 90 min practice
5. Sees score trend chart
6. Clicks session card → views old feedback
7. Returns to dashboard
8. Clicks "Start Mock Interview"
9. Selects different round type (Strategy)
10. Completes interview
11. Views new feedback
12. Returns to dashboard
13. Sees 4 sessions, updated charts

**Expected Outcomes**:
- [ ] Dashboard loads previous sessions
- [ ] Stats calculated correctly
- [ ] Charts render historical data
- [ ] Can view old feedback
- [ ] New session adds to history
- [ ] Charts update with new data point
- [ ] Average score recalculated

---

### E2E Flow 3: Configuration Variations

**Scenario**: User tests different configurations

**Test Cases**:
1. **Beginner + Real-time Feedback**
   - [ ] Agent provides helpful prompts
   - [ ] Agent gives brief feedback after responses

2. **Advanced + Silent Feedback**
   - [ ] Agent asks challenging questions
   - [ ] No feedback during interview
   - [ ] Feedback only at end

3. **Different Voices**
   - [ ] Can select different Cartesia voices
   - [ ] Voice change reflected in interview

4. **Speed Variations**
   - [ ] 0.6x speed works (slow)
   - [ ] 1.5x speed works (fast)
   - [ ] Default 1.0x works

5. **All Round Types**
   - [ ] Behavioral interview (STAR method)
   - [ ] Product Sense (5-step framework)
   - [ ] Execution (metrics focus)
   - [ ] Strategy (business focus)

---

## PHASE 4: Agent-Based Verification (AI QA)

### Verification Agent 1: API Contract Validator

**Objective**: Verify all API endpoints match specs

**Agent Instructions**:
```
You are an API testing agent. Your job is to:

1. Read VERIFICATION_PLAN.md to understand API contracts
2. For each API endpoint listed:
   a. Send test requests with valid payloads
   b. Verify response structure matches spec
   c. Verify status codes are correct
   d. Test error cases (401, 403, 404, 500)
   e. Test edge cases (missing fields, invalid types)
3. Report any mismatches or errors
4. Create test report in /test-reports/api-validation.md

Focus on:
- POST /api/session/start
- GET /api/session/:sessionId
- POST /api/session/end
- POST /api/session/transcript
- GET /api/sessions
- POST /api/feedback/generate
- GET /api/feedback/:sessionId
```

**Expected Outputs**:
- `/test-reports/api-validation.md` with results
- List of passing endpoints
- List of failing endpoints with details
- Recommendations for fixes

---

### Verification Agent 2: UX Flow Tester

**Objective**: Simulate real user behavior and identify UX issues

**Agent Instructions**:
```
You are a UX testing agent. Your job is to:

1. Simulate new user journey:
   - Sign up flow
   - First interview setup
   - Complete interview
   - View feedback
   - Return to dashboard

2. Look for UX issues:
   - Confusing copy
   - Missing loading states
   - Broken navigation
   - Poor error messages
   - Accessibility problems

3. Test edge cases:
   - Refresh during interview (does session persist?)
   - Back button navigation
   - Browser back/forward
   - Session timeout
   - Network errors

4. Create UX report in /test-reports/ux-analysis.md
```

**Expected Outputs**:
- `/test-reports/ux-analysis.md`
- List of UX issues with severity (critical, major, minor)
- Screenshots or descriptions of problems
- Recommendations for improvements

---

### Verification Agent 3: Database Integrity Checker

**Objective**: Verify database operations and data consistency

**Agent Instructions**:
```
You are a database testing agent. Your job is to:

1. Verify schema migrations:
   - Check all columns exist
   - Check indexes created
   - Check constraints enforced

2. Test CRUD operations:
   - Create session → verify in DB
   - Read session → verify correct data
   - Update session (end) → verify ended_at
   - Transcript saving → verify all fields

3. Test data integrity:
   - Foreign keys enforced (user_id, session_id)
   - Timestamps correct
   - JSON config preserved
   - No orphaned records

4. Test edge cases:
   - Concurrent session creation
   - Duplicate feedback generation
   - Missing user records

5. Create DB report in /test-reports/database-integrity.md
```

**Expected Outputs**:
- `/test-reports/database-integrity.md`
- List of schema issues
- List of data integrity issues
- SQL queries for debugging

---

### Verification Agent 4: Performance Tester

**Objective**: Measure system performance and identify bottlenecks

**Agent Instructions**:
```
You are a performance testing agent. Your job is to:

1. Measure API response times:
   - POST /api/session/start (should be <500ms)
   - GET /api/session/:sessionId (should be <200ms)
   - POST /api/feedback/generate (should be <10s)
   - GET /api/sessions (should be <500ms)

2. Measure page load times:
   - /setup (should be <1s)
   - /interview (should be <2s)
   - /dashboard (should be <2s)
   - /feedback/:sessionId (should be <1.5s)

3. Test concurrent usage:
   - 10 simultaneous sessions
   - 50 simultaneous sessions
   - Identify breaking point

4. Measure LiveKit performance:
   - Time to agent join (should be <3s)
   - Audio latency (should be <1s)
   - Transcript update delay (should be <500ms)

5. Create performance report in /test-reports/performance.md
```

**Expected Outputs**:
- `/test-reports/performance.md`
- Response time benchmarks
- Page load benchmarks
- Concurrency limits
- Recommendations for optimization

---

## PHASE 5: Automated Test Suite Creation

### Test Suite Structure

```
/test
├── unit/
│   ├── api/
│   │   ├── session-start.test.ts
│   │   ├── session-end.test.ts
│   │   ├── feedback-generate.test.ts
│   │   └── sessions-list.test.ts
│   ├── lib/
│   │   ├── scoring.test.ts
│   │   ├── sessions.test.ts
│   │   └── transcripts.test.ts
│   └── utils/
│       └── interview-config.test.ts
├── integration/
│   ├── session-lifecycle.test.ts
│   ├── feedback-generation.test.ts
│   └── dashboard-data.test.ts
└── e2e/
    ├── first-time-user.spec.ts
    ├── returning-user.spec.ts
    └── config-variations.spec.ts
```

### Test Agent Instructions: Unit Tests

**Agent: Unit Test Writer**

```
Create unit tests for all backend functions:

1. Test /lib/db/sessions.ts:
   - createSession with valid params
   - createSession with missing fields
   - getSession with valid ID
   - getSession with invalid ID
   - endSession updates timestamp
   - getUserSessions filters by user

2. Test /lib/db/transcripts.ts:
   - saveTranscriptTurn with valid data
   - saveTranscriptTurn with missing fields
   - getSessionTranscript returns ordered list

3. Test /lib/db/feedback.ts:
   - createFeedback with valid scores
   - createFeedback with invalid scores
   - getFeedback returns null if not found

4. Test /lib/evaluation/scoring.ts:
   - calculateOverallScore averages correctly
   - validateScores returns true/false correctly

Use Vitest framework. Place tests in /test/unit/.
```

---

### Test Agent Instructions: Integration Tests

**Agent: Integration Test Writer**

```
Create integration tests for API flows:

1. Session Lifecycle Test:
   - Start session → Get session → Save transcript → End session
   - Verify each step succeeds
   - Verify data persists correctly

2. Feedback Generation Test:
   - Create session with transcript
   - Generate feedback
   - Verify scores in valid range
   - Verify idempotency

3. Dashboard Data Test:
   - Create 5 sessions with feedback
   - Fetch sessions list
   - Verify stats calculation
   - Verify chart data

Use Vitest + Supertest for API testing. Place tests in /test/integration/.
```

---

### Test Agent Instructions: E2E Tests

**Agent: E2E Test Writer**

```
Create Playwright E2E tests for user flows:

1. First-Time User Test:
   - Navigate to /
   - Sign in with Google (use test account)
   - Complete setup flow
   - Start interview
   - End interview
   - View feedback
   - Check dashboard

2. Returning User Test:
   - Sign in
   - Verify dashboard shows history
   - Start new interview
   - Verify dashboard updates

3. Configuration Variations Test:
   - Test each round type
   - Test each difficulty level
   - Test different voice settings

Use Playwright. Place tests in /test/e2e/.
```

---

## Test Execution Plan

### Day 1: Component Verification
**Tasks**:
- [ ] Run manual tests for Agent 1 (Setup)
- [ ] Run manual tests for Agent 2 (Interview UI)
- [ ] Run manual tests for Agent 3 (Session Persistence)
- [ ] Run manual tests for Agent 4 (AI Agent)
- [ ] Document any failures

**Deliverables**:
- `/test-reports/agent-1-setup.md`
- `/test-reports/agent-2-interview.md`
- `/test-reports/agent-3-persistence.md`
- `/test-reports/agent-4-ai-agent.md`

---

### Day 2: Integration + Agent-Based Testing
**Tasks**:
- [ ] Run Integration Test 1 (Setup → Session Start)
- [ ] Run Integration Test 2 (Interview → Transcript)
- [ ] Run Integration Test 3 (Feedback Generation)
- [ ] Run Integration Test 4 (Agent Configuration)
- [ ] Launch Verification Agent 1 (API Validator)
- [ ] Launch Verification Agent 2 (UX Tester)
- [ ] Launch Verification Agent 3 (DB Checker)
- [ ] Document any failures

**Deliverables**:
- `/test-reports/integration-tests.md`
- `/test-reports/api-validation.md` (from Agent 1)
- `/test-reports/ux-analysis.md` (from Agent 2)
- `/test-reports/database-integrity.md` (from Agent 3)

---

### Day 3: E2E + Performance Testing
**Tasks**:
- [ ] Run E2E Flow 1 (First-Time User)
- [ ] Run E2E Flow 2 (Returning User)
- [ ] Run E2E Flow 3 (Config Variations)
- [ ] Launch Verification Agent 4 (Performance Tester)
- [ ] Create automated test suite (Unit + Integration + E2E)
- [ ] Document any failures
- [ ] Prioritize bug fixes

**Deliverables**:
- `/test-reports/e2e-tests.md`
- `/test-reports/performance.md` (from Agent 4)
- `/test/` directory with automated tests
- `/test-reports/FINAL_SUMMARY.md` with all findings

---

## Bug Tracking & Prioritization

### Bug Severity Levels

**P0 - Critical (Blocker)**:
- System crashes
- Data loss
- Authentication broken
- Interview completely unusable

**P1 - High (Must Fix Before Launch)**:
- Feedback generation fails
- Transcript not saving
- Dashboard broken
- Major UX issues

**P2 - Medium (Should Fix Soon)**:
- Minor UI glitches
- Slow performance
- Missing loading states
- Confusing copy

**P3 - Low (Nice to Have)**:
- Visual polish
- Animation tweaks
- Edge case handling

### Bug Report Template

```markdown
# Bug Report: [Short Title]

**Severity**: P0/P1/P2/P3
**Agent**: Agent 1/2/3/4/5/6
**Component**: Setup/Interview/Dashboard/API/Agent
**Status**: Open/In Progress/Fixed/Won't Fix

## Description
[What's broken?]

## Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Expected Behavior
[What should happen?]

## Actual Behavior
[What actually happens?]

## Screenshots/Logs
[If applicable]

## Root Cause
[If known]

## Recommended Fix
[If known]
```

---

## Success Criteria

### Must-Have (Launch Blockers)
- [ ] All P0 bugs fixed
- [ ] All P1 bugs fixed
- [ ] All 6 agents' features functional
- [ ] End-to-end flow works (Setup → Interview → Feedback → Dashboard)
- [ ] No data loss
- [ ] Authentication works
- [ ] LiveKit connection stable
- [ ] Feedback generation succeeds

### Should-Have (Quality Bar)
- [ ] 80% of P2 bugs fixed
- [ ] Automated test suite created
- [ ] Performance benchmarks met
- [ ] Mobile responsive
- [ ] Error handling graceful
- [ ] Loading states everywhere

### Nice-to-Have (Polish)
- [ ] All P3 bugs fixed
- [ ] Animations smooth
- [ ] Copy refined
- [ ] Accessibility improved

---

## Final Verification Checklist

Before declaring system ready:

### Functional Testing
- [ ] Can sign in with Google
- [ ] Can complete setup flow
- [ ] Can start interview
- [ ] Can have voice conversation with agent
- [ ] Agent responds appropriately
- [ ] Transcript updates in real-time
- [ ] Can end session
- [ ] Feedback generates automatically
- [ ] Feedback displays correctly
- [ ] Dashboard shows session history
- [ ] Charts render correctly
- [ ] Can start new session from dashboard

### Data Integrity
- [ ] Sessions saved to database
- [ ] Transcripts saved to database
- [ ] Feedback saved to database
- [ ] User records created
- [ ] No orphaned records
- [ ] Foreign keys enforced

### Performance
- [ ] API responses <500ms (except feedback gen)
- [ ] Pages load <2s
- [ ] Agent joins <3s
- [ ] No memory leaks
- [ ] No connection drops

### UX/UI
- [ ] All pages mobile responsive
- [ ] All buttons work
- [ ] All links work
- [ ] Loading states show
- [ ] Error messages clear
- [ ] Navigation intuitive

### Security
- [ ] Authentication required for protected routes
- [ ] Users can't access other users' sessions
- [ ] API keys not exposed
- [ ] HTTPS enabled

---

## Appendix: Test Data Setup

### Create Test User
```sql
INSERT INTO app_user (id, email, name, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'test@meelni.com',
  'Test User',
  NOW()
);
```

### Create Test Session
```sql
INSERT INTO interview_session (
  id, user_id, role, round_type, mode, persona,
  livekit_room_name, config, started_at
)
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'pm',
  'product_sense',
  'voice_video',
  'Senior PM Interviewer',
  'test-room-123',
  '{"difficulty": "intermediate", "duration": 30}',
  NOW()
);
```

### Create Test Transcript
```sql
INSERT INTO transcript_turn (
  id, session_id, speaker, started_at, ended_at,
  text, audio_ms, latency_ms, section
)
VALUES (
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000002',
  'interviewer',
  NOW(),
  NOW() + INTERVAL '5 seconds',
  'Design a product for seniors to find parking.',
  5000,
  250,
  'opening'
);
```

---

**End of Verification Plan**

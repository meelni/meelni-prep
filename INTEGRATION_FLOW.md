# Setup Modal Integration Flow

## Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                             DASHBOARD                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [Toolbar]  → "New Interview" button                                   │
│  [FTUE]     → "Start Your First Mock Interview" button                 │
│  [Overview] → "Start Mock Interview" card button                       │
│                                                                          │
│  All buttons call: setupModal.open()                                   │
│                                                                          │
└──────────────────────────────┬──────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SETUP MODAL                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Step 1: Select Interview Type                                         │
│    ○ Product Sense  ○ Analytical  ○ Leadership  ○ Strategy            │
│                                                                          │
│  Step 2: Select Mode                                                    │
│    ○ Mock Interview  ○ Practice  ○ Learning                            │
│                                                                          │
│  Step 3: Voice Settings                                                 │
│    Voice: [Tessa ▼]  Speed: [1.0]  Emotion: [Confident ▼]            │
│                                                                          │
│  [Start Interview Button]  ←─ Calls submitConfig()                    │
│                                                                          │
└──────────────────────────────┬──────────────────────────────────────────┘
                                │
                                │ submitConfig() navigates to:
                                │ /interview?roundType=product_sense
                                │           &mode=mock_interview
                                │           &voice=6ccbfb76...
                                │           &speed=1.0
                                │           &emotion=confident
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       INTERVIEW PAGE                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Read URL params (roundType, mode, voice, speed, emotion)          │
│  2. Call POST /api/session/start                                       │
│     Body: { roundType, mode, config: { voice, speed, emotion } }      │
│                                                                          │
│     Response:                                                           │
│     {                                                                   │
│       sessionId: "550e8400-...",                                       │
│       roomName: "interview-1699999999999-abc123",                      │
│       token: "eyJhbGciOiJIUzI1NiIs...",                                │
│       url: "wss://mockmate.livekit.cloud",                             │
│       config: { voice, stt_model, llm_model, tts_model, ... }         │
│     }                                                                   │
│                                                                          │
│  3. Update URL to /interview?sessionId=X&token=Y&url=Z                 │
│  4. Connect to LiveKit room                                             │
│  5. Display config in header: "Product Sense • Mock Interview"         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Interaction Diagram

```
┌──────────────┐
│   Toolbar    │  useSetupModal()
│              │────────┐
└──────────────┘        │
                        │
┌──────────────┐        │    ┌─────────────────────┐
│     FTUE     │        ├───►│  use-setup-modal.ts │
│              │────────┤    │                     │
└──────────────┘        │    │  State:             │
                        │    │  - isOpen           │
┌──────────────┐        │    │  - config           │
│   Overview   │        │    │                     │
│   Section    │────────┘    │  Methods:           │
└──────────────┘             │  - open()           │
                             │  - close()          │
                             │  - submitConfig()   │
                             │                     │
                             └──────────┬──────────┘
                                        │
                                        │ submitConfig()
                                        ▼
                             ┌──────────────────────┐
                             │   Next.js Router     │
                             │   router.push()      │
                             └──────────┬───────────┘
                                        │
                                        ▼
                             ┌──────────────────────┐
                             │  Interview Page      │
                             │                      │
                             │  useSearchParams()   │
                             │  ↓                   │
                             │  createSession()     │
                             │  ↓                   │
                             │  fetch('/api/        │
                             │    session/start')   │
                             └──────────────────────┘
```

## Data Flow

```
┌────────────────┐
│ Setup Modal    │
│ (User Input)   │
└────────┬───────┘
         │
         │ User selects:
         │ - roundType: "product_sense"
         │ - mode: "mock_interview"
         │ - voice: "6ccbfb76-1fc6-48f7-b71d-91ac6298247b"
         │ - speed: 1.0
         │ - emotion: "confident"
         │
         ▼
┌────────────────────────────────────────┐
│ localStorage                           │
│ Key: "meelni:setup-modal:last-config" │
│ Value: { roundType, mode, voice... }  │
└────────────────────────────────────────┘
         │
         │ (Saved for next time)
         │
         ▼
┌────────────────────────────────────────┐
│ URL Query Params                       │
│ /interview?roundType=product_sense     │
│           &mode=mock_interview         │
│           &voice=6ccbfb76...           │
│           &speed=1.0                   │
│           &emotion=confident           │
└────────┬───────────────────────────────┘
         │
         │ Interview page reads params
         │
         ▼
┌────────────────────────────────────────┐
│ POST /api/session/start                │
│ Body: {                                │
│   roundType: "product_sense",          │
│   mode: "mock_interview",              │
│   config: {                            │
│     voice: "6ccbfb76...",              │
│     speed: 1.0,                        │
│     emotion: "confident"               │
│   }                                    │
│ }                                      │
└────────┬───────────────────────────────┘
         │
         │ API creates session
         │
         ▼
┌────────────────────────────────────────┐
│ Database (Supabase)                    │
│                                        │
│ interview_session table:               │
│ {                                      │
│   id: "550e8400-...",                 │
│   user_id: "user-uuid",               │
│   role: "pm",                         │
│   round_type: "product_sense",        │
│   mode: "voice_video",                │
│   livekit_room_name: "interview-...", │
│   config: {                           │
│     voice: "6ccbfb76...",            │
│     speed: 1.0,                       │
│     emotion: "confident",             │
│     stt_model: "deepgram/nova-3",    │
│     llm_model: "openai/gpt-4.1-mini",│
│     tts_model: "cartesia/sonic-3:..." │
│   },                                  │
│   started_at: "2025-11-06T..."       │
│ }                                     │
└────────┬───────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│ LiveKit Room Metadata                  │
│ {                                      │
│   sessionId: "550e8400-...",          │
│   roundType: "product_sense",         │
│   mode: "voice_video",                │
│   config: { voice, speed, emotion }   │
│ }                                      │
└────────┬───────────────────────────────┘
         │
         │ Agent reads metadata
         │
         ▼
┌────────────────────────────────────────┐
│ AI Agent (LiveKit Cloud)               │
│ - Uses config to personalize interview │
│ - Voice: Tessa (6ccbfb76...)          │
│ - Speed: 1.0x                          │
│ - Emotion: Confident                   │
│ - Interview Type: Product Sense        │
└────────────────────────────────────────┘
```

## State Management

```
┌─────────────────────────────────────────┐
│ useSetupModal Hook                      │
├─────────────────────────────────────────┤
│                                         │
│ State:                                  │
│ ├─ isOpen: boolean                     │
│ ├─ config: InterviewConfig             │
│ │   ├─ roundType: "product_sense" | .. │
│ │   ├─ mode: "mock_interview" | ...    │
│ │   └─ voiceSettings: {                │
│ │       ├─ voice: string               │
│ │       ├─ speed: number               │
│ │       └─ emotion: string             │
│ │     }                                 │
│ │                                       │
│ Computed:                               │
│ ├─ canProceedToNextStep(step): boolean │
│ └─ isConfigComplete: boolean           │
│                                         │
│ Actions:                                │
│ ├─ open()                              │
│ ├─ close()                             │
│ ├─ updateConfig(partial)               │
│ ├─ resetConfig()                       │
│ ├─ submitConfig()  ← Navigates         │
│ └─ useSmartDefaults()                  │
│                                         │
│ Side Effects:                           │
│ ├─ localStorage.getItem() on mount     │
│ └─ localStorage.setItem() on change    │
│                                         │
└─────────────────────────────────────────┘
```

## URL Transition

```
Timeline of URL changes during interview flow:

1. User on dashboard
   URL: /dashboard

2. User clicks "New Interview" → Modal opens
   URL: /dashboard (unchanged)

3. User fills modal and submits
   URL: /dashboard (still unchanged)

4. submitConfig() called
   URL: /interview?roundType=product_sense&mode=mock_interview&voice=6ccbfb76...&speed=1.0&emotion=confident

5. Interview page calls createSession()
   URL: /interview?roundType=... (loading state)

6. API returns session credentials
   URL: /interview?sessionId=550e8400-...&token=eyJhbG...&url=wss://mockmate.livekit.cloud
   (router.replace() removes config params)

7. LiveKit room connected
   URL: /interview?sessionId=...&token=...&url=... (connected state)

8. User ends interview
   URL: /feedback/550e8400-... (redirected)

9. User navigates back to dashboard
   URL: /dashboard
   (queries invalidated, stats refreshed)
```

## Error Handling Flow

```
┌─────────────────────────┐
│ User submits modal      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Navigate to /interview  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ Call /api/session/start │
└────────┬────────────────┘
         │
         │ Success?
         ├─────────────────┐
         │                 │
    ✅ YES            ❌ NO
         │                 │
         ▼                 ▼
┌─────────────────┐  ┌─────────────────────┐
│ Connect to room │  │ Show error message  │
│ Display config  │  │ "Failed to create   │
│ Start interview │  │  interview session" │
└─────────────────┘  └────────┬────────────┘
                              │
                              ▼
                     ┌─────────────────────┐
                     │ "Back to Dashboard" │
                     │ button              │
                     └────────┬────────────┘
                              │
                              ▼
                     ┌─────────────────────┐
                     │ Redirect /dashboard │
                     │ User can try again  │
                     └─────────────────────┘
```

## Key Integration Points

1. **Modal → URL**: `submitConfig()` creates query string
2. **URL → API**: Interview page reads params, calls `/api/session/start`
3. **API → Database**: Session record created
4. **API → LiveKit**: Room created with metadata
5. **LiveKit → Agent**: Agent dispatched with config
6. **Interview → Display**: Config shown in header
7. **End → Dashboard**: Queries invalidated, stats refreshed

## Testing Points

| Component | Test Case | Expected Result |
|-----------|-----------|-----------------|
| Toolbar | Click "New Interview" | Modal opens |
| FTUE | Click "Start First Interview" | Modal opens |
| Overview | Click "Start Mock Interview" | Modal opens |
| Modal | Submit config | Navigate to /interview with params |
| Interview | Load with config params | Call /api/session/start |
| Interview | API success | URL updates with sessionId |
| Interview | Room connected | Display config in header |
| Interview | End session | Navigate to /feedback |
| Dashboard | Return after interview | Stats refreshed |


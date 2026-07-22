# Interview Agent

Full-featured interview agent for authenticated user sessions.

## Overview

This is the main interview agent that powers authenticated full mock interview sessions. It supports multiple interview types, difficulty levels, realistic adaptive follow-ups, and real-time transcript saving.

## Features

- **4 Interview Types**: Product Sense, Execution, Leadership & Drive, Strategy
- **3 Difficulty Levels**: Junior, Mid, Senior
- **Realistic Mock Mode**: Interviewer behavior without mid-session teaching, hints, or evaluation
- **Dynamic Prompts**: Question bank integration with 2,879+ real PM questions
- **Durable Transcripts**: Persists signed runtime-owned turns before publishing them to the browser
- **Configurable Duration**: 15, 30, or 45-minute sessions
- **Advanced VAD**: Silero VAD with tuned thresholds for natural conversation

## Configuration

- **STT Model**: Deepgram Nova-3 (operator-controlled)
- **LLM Model**: GPT-4.1-mini (operator-controlled)
- **TTS Model**: Cartesia Sonic 3 / legacy ElevenLabs voice defaults (operator-controlled)
- **VAD**: Silero VAD with custom thresholds:
  - `min_speech_duration`: 0.2s
  - `min_silence_duration`: 0.6s
  - `activation_threshold`: 0.5
- **Turn Detection**: English model (context-aware)
- **Provider Recording**: Disabled explicitly; Meelni stores only its own durable transcript records

## Files

- `agent.py` - Main interview agent entrypoint
- `Dockerfile` - Docker configuration for Cloud deployment
- `.dockerignore` - Files to exclude from Docker build
- `livekit.toml` - LiveKit agent configuration
- `deploy.sh` - Deployment script for LiveKit Cloud

## Local Development

```bash
# From agent root directory
cd interview

# Activate virtual environment (from parent directory)
source ../venv/bin/activate

# Run agent in dev mode
python agent.py dev
```

The agent reads accepted interview preferences from room metadata and resolves
provider, model, and voice tuning from server environment.
`LIVEKIT_INTERVIEW_AGENT_NAME` is required locally as well as in Cloud so the
worker accepts only explicit dispatches.

## Deployment

Deploy to LiveKit Cloud:

```bash
cd interview
./deploy.sh
```

**Dispatch name**: `LIVEKIT_INTERVIEW_AGENT_NAME`

## Dependencies

Uses shared modules from `../shared/`:

- `shared.config` - Configuration parsing (`parse_room_metadata`)
- `shared.utils.prompt_builder` - Dynamic prompt generation (`build_agent_prompt`)

## How It Works

1. User completes the New Mock Interview flow (`/dashboard/new-interview`) and navigates to `/interview`
2. Frontend generates room with metadata containing:
   - `round_type`: interview type (e.g., "product_sense")
   - `config`: accepted preferences plus the web server's runtime snapshot
   - `question`: optional question from question bank
   - `session_id`: Supabase session ID for transcript saving
   - `deadline_at`: absolute server-owned UTC hard deadline
3. Agent receives `JobContext` with room metadata
4. Agent parses metadata with `parse_room_metadata()`
5. Agent builds dynamic prompt with `build_agent_prompt()` using:
   - Interview type (determines the round-specific areas to probe)
   - Difficulty level (adjusts the interview bar and follow-up depth)
   - Canonical feedback and hint defaults (`end_only` and `off`)
   - Question from bank (or generates own questions)
6. Agent starts AgentSession with configured models
7. Agent speaks the canonical mock-interview opening and conducts the interview;
   when a selected question is present, that exact question is part of the first
   audible turn and the model continues with response-grounded follow-ups
8. Final transcript events are signed and persisted by the runtime, then published to the room for browser display
9. The web session workflow owns the terminal outcome; provider disconnect and runtime shutdown are normalized inputs, not terminal truth

During step 7 the agent remains a PM interviewer. It does not teach a framework,
offer suggested answers, or evaluate response quality. Those outputs belong to
the post-interview feedback workflow. The public demo agent is separate and
retains its short feedback-preview behavior.

The runtime uses `deadline_at` to close `AgentSession` immediately without
draining queued speech and to terminate the room. Missing deadlines remain
readable only for rolling compatibility; new sessions require the server-side
SAV-189 writer and durable deadline workflow before relaunch.

## Room Metadata Schema

```json
{
  "contract_version": 1,
  "round_type": "product_sense",
  "session_id": "uuid-from-supabase",
  "deadline_at": "2026-07-09T20:30:00.000Z",
  "question": {
    "id": "question-uuid",
    "text": "How would you improve Spotify?",
    "company": "Spotify",
    "type": "Product Sense"
  },
  "config": {
    "difficulty": "intermediate",
    "hintMode": "off",
    "questionPreference": { "recency": "very_recent", "recentDays": 365 },
    "feedback_mode": "end_only",
    "duration": 30,
    "stt_model": "deepgram/nova-3",
    "llm_model": "openai/gpt-4.1-mini",
    "tts_model": "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
    "voice": "cgSgspJ2msm6clMCkdW9",
    "speed": 1.0,
    "emotion": "professional",
    "volume": 1.0
  }
}
```

## Customization

### Change Interview Prompts

Edit prompts in `../shared/prompts.py`:

- `MOCK_INTERVIEWER_SYSTEM` - Core full-interview behavior
- `MOCK_INTERVIEW_TYPE_GUIDES` - Round-specific interviewer focus areas
- `get_mock_interview_prompt()` - Composition of the system contract and selected guide

### Adjust VAD Sensitivity

Modify VAD parameters in `prewarm()` function in `agent.py`:

```python
proc.userdata["vad"] = silero.VAD.load(
    min_speech_duration=0.2,      # Shorter = more sensitive
    min_silence_duration=0.6,     # Longer = waits more before cutting off
    activation_threshold=0.5,      # 0-1 scale, lower = more sensitive
)
```

### Change Runtime Models

Set the server-only `MEELNI_INTERVIEW_STT_MODEL`,
`MEELNI_INTERVIEW_LLM_MODEL`, and `MEELNI_INTERVIEW_TTS_MODEL` variables on
both web and voice-agent deployments. See
`docs/operations/interview-runtime-configuration.md`.

## Event Handlers

The agent normalizes committed user and interviewer
`ConversationItemAddedEvent` messages with runtime-measured timing. Completed
speech is `delivered`; LiveKit's TTS-synchronized heard prefix for interrupted
interviewer speech is `partially_delivered`. An interruption with no confirmed
prefix becomes a separate textless integrity marker.

The runtime dependencies in `agent/requirements.txt` are pinned as one tested
LiveKit Agents 1.6.5 family so message metrics and handler APIs cannot drift
independently during deployment.

These handlers do not write Supabase directly. A bounded in-memory runtime
outbox signs the exact event for `/api/internal/transcript`; only a durable 2xx
acknowledgement allows the event to be published to the browser for display.
See
`docs/contracts/livekit-room-metadata.md` and
`docs/contracts/interview-session-lifecycle.md`.

## Troubleshooting

**Agent doesn't join room**:

- Check agent is deployed and active: `lk agent status`
- Verify agent_name matches in WorkerOptions
- Check metadata is properly formatted JSON

**Import errors**:

- Verify shared modules are copied in Dockerfile
- Check sys.path manipulation in agent.py
- Ensure `../shared/` directory structure is correct

**Transcript not saving**:

- Verify `contract_version`, `session_id`, and `transcript_ingest_url` in room metadata
- Check signed runtime-ingest status and safe event-ID logs
- Check that the browser receives valid post-persistence events on the transcript topic
- Check runtime outbox status, room correlation, database permissions, and schema

**Voice cuts off user**:

- Increase `min_silence_duration` in VAD config
- Adjust `activation_threshold` (higher = less sensitive)
- Check turn detection model settings

**Poor question quality**:

- Verify question bank integration in prompt builder
- Check question filtering logic (recency, difficulty)
- Ensure metadata includes valid question object

## Related Documentation

- Demo agent: `../demo/README.md`
- Shared prompts: `../shared/prompts.py`
- Deployment guide: `../docs/DEPLOYMENT.md`
- Question bank integration: `../docs/QUESTION_BANK_INTEGRATION.md`
- Prompt builder documentation: `../shared/utils/prompt_builder.py`

# Interview Agent

Full-featured interview agent for authenticated user sessions.

## Overview

This is the main interview agent that powers full mock interview sessions. It supports multiple interview types, difficulty levels, coaching modes, and real-time transcript saving.

## Features

- **4 Interview Types**: Product Sense, Execution, Leadership & Drive, Strategy
- **3 Difficulty Levels**: Junior, Mid, Senior
- **3 Coaching Modes**: Mock Interview, Practice, Learning
- **Dynamic Prompts**: Question bank integration with 2,879+ real PM questions
- **Real-time Transcripts**: Saves conversation turns to Supabase during session
- **Configurable Duration**: 15, 30, or 45-minute sessions
- **Advanced VAD**: Silero VAD with tuned thresholds for natural conversation

## Configuration

- **STT Model**: Deepgram Nova-3 (configurable via room metadata)
- **LLM Model**: GPT-4.1-mini (default, configurable)
- **TTS Model**: ElevenLabs Eleven Turbo v2.5 (default voice ID: cgSgspJ2msm6clMCkdW9)
- **VAD**: Silero VAD with custom thresholds:
  - `min_speech_duration`: 0.2s
  - `min_silence_duration`: 0.6s
  - `activation_threshold`: 0.5
- **Turn Detection**: English model (context-aware)

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

The agent will listen for room connections and read configuration from room metadata.

## Deployment

Deploy to LiveKit Cloud:

```bash
cd interview
./deploy.sh
```

**Agent ID**: `CA_yawKG67rCMG4`

## Dependencies

Uses shared modules from `../shared/`:
- `shared.config` - Configuration parsing (`parse_room_metadata`)
- `shared.utils.prompt_builder` - Dynamic prompt generation (`build_agent_prompt`)

## How It Works

1. User completes setup flow (`/setup`) and navigates to `/interview`
2. Frontend generates room with metadata containing:
   - `round_type`: interview type (e.g., "product_sense")
   - `config`: settings (difficulty, mode, duration, models, voice)
   - `question`: optional question from question bank
   - `session_id`: Supabase session ID for transcript saving
3. Agent receives `JobContext` with room metadata
4. Agent parses metadata with `parse_room_metadata()`
5. Agent builds dynamic prompt with `build_agent_prompt()` using:
   - Interview type (determines framework and evaluation criteria)
   - Difficulty level (adjusts coaching intensity)
   - Coaching mode (mock vs practice vs learning)
   - Question from bank (or generates own questions)
6. Agent starts AgentSession with configured models
7. Agent greets user and conducts interview
8. Transcript turns saved in real-time to Supabase
9. Session ends when user disconnects or time limit reached

## Room Metadata Schema

```json
{
  "round_type": "product_sense",
  "session_id": "uuid-from-supabase",
  "question": {
    "question_text": "How would you improve Spotify?",
    "company": "Spotify",
    "question_type": "Product design/strategy"
  },
  "config": {
    "role": "interviewee",
    "mode": "mock_interview",
    "difficulty": "intermediate",
    "feedback_mode": "end",
    "duration": 30,
    "stt_model": "deepgram/nova-3",
    "llm_model": "openai/gpt-4.1-mini",
    "tts_model": "elevenlabs/eleven_turbo_v2_5:cgSgspJ2msm6clMCkdW9",
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
- `BASE_INTERVIEWER_SYSTEM` - Core interviewer behavior
- `PRODUCT_SENSE_PROMPT` - Product Sense framework
- `EXECUTION_PROMPT` - Execution framework
- `LEADERSHIP_DRIVE_PROMPT` - Leadership & Drive framework
- `STRATEGY_PROMPT` - Strategy framework

### Adjust VAD Sensitivity
Modify VAD parameters in `prewarm()` function in `agent.py`:
```python
proc.userdata["vad"] = silero.VAD.load(
    min_speech_duration=0.2,      # Shorter = more sensitive
    min_silence_duration=0.6,     # Longer = waits more before cutting off
    activation_threshold=0.5,      # 0-1 scale, lower = more sensitive
)
```

### Change Default Models
Update defaults in `entrypoint()` function in `agent.py`:
```python
stt_model = config.get("stt_model", "deepgram/nova-3")
llm_model = config.get("llm_model", "openai/gpt-4.1-mini")
tts_model = config.get("tts_model", "elevenlabs/eleven_turbo_v2_5:...")
```

## Event Handlers

The agent registers event handlers for:
- `UserInputTranscribedEvent` - Saves user's speech to transcript
- `SpeechCreatedEvent` - Saves agent's responses to transcript

These handlers use the Supabase client to insert records into the `transcript_turn` table in real-time.

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
- Check Supabase connection in event handlers
- Verify `session_id` is in room metadata
- Check database permissions and schema

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

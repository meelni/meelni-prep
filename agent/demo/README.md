# Demo Agent

Retained, dormant voice-demo agent implementation.

## Relaunch Status

The public voice demo is de-scoped from the current relaunch and is not linked
from the landing page. This worker is not a launch prerequisite, and core
LiveKit health does not assert that it is deployed or usable. Do not deploy or
advertise it without a separate product and operational decision.

## Overview

If separately reintroduced, this agent provides a short demo experience for
prospective users. It asks one PM interview question and provides immediate
feedback within a five-minute window.

## Features

- 5-minute time-boxed demo sessions
- Single question from question bank (or fallback questions)
- Energetic, conversational tone
- Quick feedback (2-3 observations)
- Automatic time warnings and session termination

## Configuration

- **STT Model**: Deepgram Nova-3
- **LLM Model**: GPT-4o
- **TTS Model**: ElevenLabs Eleven Turbo v2.5 (voice ID: cgSgspJ2msm6clMCkdW9)
- **VAD**: Silero VAD (prewarmed)
- **Turn Detection**: English model (context-aware)

## Files

- `agent.py` - Main demo agent entrypoint
- `Dockerfile` - Docker configuration for Cloud deployment
- `.dockerignore` - Files to exclude from Docker build
- `livekit.toml` - tracked safety stub; deployment config stays external
- `deploy.sh` - Deployment script for LiveKit Cloud

## Local Development

```bash
# From agent root directory
cd demo

# Activate virtual environment (from parent directory)
source ../venv/bin/activate

# Run agent in dev mode
python agent.py dev
```

## Deployment

Deploy to LiveKit Cloud:

```bash
cd demo
./deploy.sh preview # or production
```

The selected external config must match the corresponding Preview/Production
project anchor and `MEELNI_LIVEKIT_{PREVIEW,PRODUCTION}_DEMO_AGENT_ID`.

**Dispatch name**: `LIVEKIT_DEMO_AGENT_NAME`

## Dependencies

Uses shared modules from `../shared/`:

- (Demo agent is self-contained, no shared dependencies currently)

## How It Works

1. User clicks "Try Demo" on landing page
2. Frontend calls `/api/livekit/demo-token` to create room + dispatch agent
3. Agent joins room and starts 5-minute timer
4. Agent greets user and asks one question
5. User responds (max 25 seconds encouraged)
6. Agent provides quick feedback (2-3 points)
7. At 4:45 mark, agent sends time warning
8. At 5:00 mark, agent delivers closing CTA and disconnects
9. Room auto-deletes 2 minutes after last participant leaves

## Customization

To change demo behavior:

- **Question selection**: Modify `build_demo_instructions()` in `agent.py`
- **Time limits**: Adjust `WARNING_TIME` and `END_TIME` in `monitor_session_time()`
- **Personality**: Edit base instructions in `build_demo_instructions()`
- **Models**: Update model strings in `entrypoint()` function

## Troubleshooting

**Agent doesn't join room**:

- Check agent is deployed and active: `lk agent status`
- Verify `LIVEKIT_DEMO_AGENT_NAME` matches the deployed agent dispatch name
- Check LiveKit Cloud dashboard for agent logs

**No audio from agent**:

- Verify voice ID is valid for ElevenLabs
- Check runtime logs: `lk agent logs`
- Ensure greeting is being sent in entrypoint

**Session cuts off early**:

- Check time monitoring logic in `monitor_session_time()`
- Verify timer starts correctly when `demo_agent.start_time` is set

## Related Documentation

- Main agent: `../interview/README.md`
- Deployment guide: `../docs/DEPLOYMENT.md`
- Question bank integration: `../docs/QUESTION_BANK_INTEGRATION.md`

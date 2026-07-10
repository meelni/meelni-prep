# Demo Agent

Two-minute voice preview agent for landing page visitors.

## Overview

This agent provides a short, engaging preview for prospective users on the landing page. It asks one PM-style practice question and provides an immediate takeaway within a two-minute window.

## Features

- Two-minute time-boxed voice previews
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
- `livekit.toml` - LiveKit agent configuration
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
./deploy.sh
```

**Dispatch name**: `LIVEKIT_DEMO_AGENT_NAME`

## Dependencies

Uses shared modules from `../shared/`:

- (Demo agent is self-contained, no shared dependencies currently)

## How It Works

1. User clicks "Try a 2-minute voice preview" on the landing page
2. Frontend calls `/api/livekit/demo-token` to create room + dispatch agent
3. Agent joins the room; an independent monotonic deadline already bounds the room
4. Agent greets user and asks one question
5. User responds (max 25 seconds encouraged)
6. Agent provides quick feedback (2-3 points)
7. At 1:30, the agent audibly transitions to its final takeaway
8. At 2:00, the agent closes and forcibly deletes the room
9. The room deletion disconnects every participant, even if a client stays connected

## Customization

To change demo behavior:

- **Question selection**: Modify `build_demo_instructions()` in `agent.py`
- **Time limits**: Update the bounded timing constants in `runtime.py`
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
- Verify the `demo_ready` control event arrives and inspect the monotonic
  deadline/hard-stop logs

## Related Documentation

- Main agent: `../interview/README.md`
- Deployment guide: `../docs/DEPLOYMENT.md`
- Question bank integration: `../docs/QUESTION_BANK_INTEGRATION.md`

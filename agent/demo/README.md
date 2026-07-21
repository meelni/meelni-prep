# Demo Agent

Two-minute voice preview agent for landing-page visitors.

## Overview

This agent provides a short preview of live PM interview practice. It asks one
PM-style question, asks one grounded follow-up based on the participant's
answer, and gives one evidence-based takeaway inside a server-authored
two-minute deadline.

## Features

- Two-minute server-authored hard deadline
- Single question from question bank (or fallback questions)
- One grounded follow-up with no early coaching or evaluation
- Energetic, conversational tone
- One concise, evidence-based takeaway
- Local inference shutdown is awaited within a hard bound before LiveKit room deletion

## Configuration

- **STT Model**: Deepgram Nova-3
- **LLM Model**: GPT-4o
- **TTS Model**: ElevenLabs Eleven Turbo v2.5 (voice ID: cgSgspJ2msm6clMCkdW9)
- **VAD**: Silero VAD (prewarmed)
- **Turn Detection**: English model (context-aware)

## Files

- `agent.py` - Main demo agent entrypoint
- `runtime.py` - Pure timing and bounded-operation contract
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

- `shared/candidate_presence.py` for exact participant gating
- `shared/safe_logging.py` for content-safe exception reporting

## How It Works

1. The default-off relaunch gate resolves before any limiter or provider work.
2. Postgres atomically authorizes one signed session, one room, one dispatch,
   and at most one server-finalized recovery token.
3. The room metadata carries the opaque participant identity and absolute
   deadline.
4. The worker arms cleanup before connecting, waits for that exact participant,
   and starts the voice pipeline only while time remains.
5. The prompt allows one answer-grounded follow-up and forbids feedback before
   the system-authored takeaway window.
6. At 90 seconds the worker requests one concise takeaway.
7. Just before the absolute two-minute deadline it initiates immediate local
   shutdown and awaits bounded model/audio closure; at the deadline it deletes
   the room with a bounded provider call and shuts down.

## Customization

To change demo behavior:

- **Question selection**: Modify `build_demo_instructions()` in `agent.py`
- **Time limits**: Change only the shared web/runtime contract and its tests;
  the hard maximum remains 120 seconds.
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

**Session ends immediately**:

- Verify room metadata includes a valid `deadline_at` and
  `participant_identity`. Missing or expired authority fails closed.

## Related Documentation

- Main agent: `../interview/README.md`
- Deployment guide: `../docs/DEPLOYMENT.md`
- Question bank integration: `../docs/QUESTION_BANK_INTEGRATION.md`

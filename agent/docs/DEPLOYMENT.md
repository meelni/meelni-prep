# Agent Deployment Guide

This directory contains two separate LiveKit agents:

1. **Voice Preview Agent** - Bounded two-minute practice previews on the landing page
2. **Main Interview Agent** - Full interview sessions

## Quick Deployment

### Deploy Demo Agent

```bash
cd agent
./demo/deploy.sh
```

### Deploy Main Interview Agent

```bash
cd agent
./interview/deploy.sh
```

## How It Works

Each agent has its own checked-in Dockerfile and deployment helper:

- Voice preview: `demo/Dockerfile` and `demo/deploy.sh`
- Full interview: `interview/Dockerfile` and `interview/deploy.sh`

The deployment scripts:

1. Preserve the root `agent/Dockerfile` in a temporary file.
2. Copy the selected agent Dockerfile into the LiveKit build context.
3. Deploy with the agent-specific `livekit.toml` configuration.
4. Restore the original root Dockerfile on success or failure.

## Dispatch Names

- **Demo Agent**: `LIVEKIT_DEMO_AGENT_NAME`
- **Main Interview Agent**: `LIVEKIT_INTERVIEW_AGENT_NAME`

The historical `CA_*` IDs from the previous account should not be reused for
the reboot. Create/deploy agents in the new LiveKit account and set the matching
dispatch names in app and agent environments.

Do not manually rename Dockerfiles or invent alternate `.dockerignore` files;
the helpers are the reproducible deployment entrypoints.

## Troubleshooting

### Issue: Files not found during build

- Build the exact image locally: `docker build -f demo/Dockerfile .`
- Confirm `demo/agent.py` and `demo/runtime.py` are both in the image context

### Issue: Wrong agent deployed

- Verify you're using the correct deployment script
- Check the agent name in the output matches your expectations

### Issue: Build fails

```bash
# View build logs
lk agent logs --log-type=build

# View runtime logs
lk agent logs

# Check agent status
lk agent status
```

## Monitoring

```bash
# View runtime logs (agent activity)
lk agent logs

# View deployment logs
lk agent logs --log-type=deploy

# View build logs
lk agent logs --log-type=build

# Check agent status
lk agent status
```

## Rollback

```bash
lk agent rollback
```

## Environment Variables

Set via LiveKit Cloud secrets:

- `LIVEKIT_INTERVIEW_AGENT_NAME` - Required by the interview worker
- `LIVEKIT_DEMO_AGENT_NAME` - Required by the demo worker
- `OPENAI_API_KEY` - Required for GPT models
- `DEEPGRAM_API_KEY` - Required for STT

Automatically provided by LiveKit Cloud:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
